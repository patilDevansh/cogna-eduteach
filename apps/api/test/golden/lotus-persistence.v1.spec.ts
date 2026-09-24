import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";
import {
  loadLotusSession,
  persistLotusSession,
} from "../../src/lotus/lotus-persistence";

const session = {
  sessionId: "lotus_persist_1",
  studentId: "demo_aarav",
  grade: 8,
  board: "CBSE",
  status: "ACTIVE",
  experimental: true,
  phase: "EXPLORE",
  startedAt: new Date().toISOString(),
  currentQuestion: null,
  openingAudit: {
    question: {
      id: "q1",
      phase: "EXPLORE",
      subtopic: "brackets",
      prompt: "Expand -2(y-5)",
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: true,
      purpose: "sign preservation",
      answerKey: { kind: "NUMERIC", canonicalAnswer: "-2y+10", workedSolution: [] },
    },
    response: null,
    verification: null,
    gpt: { mathJudgment: "UNRESOLVED", observations: [], hypotheses: [], phaseRecommendation: "EXPLORE", proposedAction: "ASK", conciseRationale: "Opening." },
    challenger: { mathJudgment: "UNRESOLVED", observations: [], hypotheses: [], phaseRecommendation: "EXPLORE", proposedAction: "ASK", conciseRationale: "Opening." },
    debate: { agreements: [], disagreements: [], disagreementExample: "", acceptedImprovements: [], revisedConclusion: "", revisedAction: "ASK", revisedPhase: "EXPLORE" },
    conclusion: {
      verdict: "ACCEPTED",
      acceptedFromGpt: [],
      acceptedFromChallenger: [],
      rejectedClaims: [],
      conclusion: "Ask first item.",
      evidenceState: "PARTIAL",
      uncertainty: [],
      phase: "EXPLORE",
      action: "ASK",
      selectionReason: "opening",
      exitDiagnostic: false,
    },
    questionSelection: {
      selectedFrom: "PRIMARY",
      reason: "opening",
      informationGain: { passed: true, explanation: "first item" },
    },
    analysisStatus: "COMPLETE",
    analysisSource: "DETERMINISTIC",
    createdAt: new Date().toISOString(),
  },
  audits: [],
  finalReport: null,
  modelConfiguration: { primary: "primary", challenger: "challenger" },
} satisfies LotusSessionView;

describe("Lotus durable persistence", () => {
  it("stores and reloads a session plus answer evidence", async () => {
    const prisma = createPersonalizedVideoMemoryDb();
    const acceptedAnswer = {
      ...session.openingAudit,
      response: {
        answer: "-2y-10",
        working: "I distributed only the first term.",
        confidence: 60,
        responseTimeMs: 20_000,
        didNotKnow: false,
        submissionId: "submission-atomic",
      },
      verification: {
        status: "VERIFIED_INCORRECT" as const,
        correctAnswer: "-2y+10",
        method: "DETERMINISTIC_ARITHMETIC" as const,
        explanation: "Sign of the second product was lost.",
      },
    };
    await persistLotusSession(prisma as never, session, [{
      jobType: "LOTUS_DEFERRED_ANALYSIS",
      idempotencyKey: `${session.sessionId}:0`,
      payload: { sessionId: session.sessionId, turnIndex: 0 },
    }], acceptedAnswer);
    const loaded = await loadLotusSession(prisma as never, session.sessionId);
    assert.equal(loaded?.sessionId, session.sessionId);
    assert.equal(loaded?.studentId, "demo_aarav");
    const stateEvent = prisma._store.lotusEvidence.at(-2);
    assert.equal(stateEvent?.eventType, "SESSION_STATE");
    assert.equal(stateEvent?.outcome, "ACTIVE");
    assert.equal(
      (stateEvent?.metadata as { snapshot?: { sessionId?: string } }).snapshot?.sessionId,
      session.sessionId,
    );

    const answerEvent = prisma._store.lotusEvidence.at(-1);
    assert.equal(answerEvent?.eventType, "ANSWER");
    assert.equal(answerEvent?.outcome, "VERIFIED_INCORRECT");
    assert.equal(prisma._store.jobs.size, 1, "the background review is durably queued with the accepted answer");

    // Retrying the same write must preserve a single answer event and a
    // single outbox job — the stable submission/job keys make stale tabs and
    // process retries harmless.
    await persistLotusSession(prisma as never, session, [{
      jobType: "LOTUS_DEFERRED_ANALYSIS",
      idempotencyKey: `${session.sessionId}:0`,
      payload: { sessionId: session.sessionId, turnIndex: 0 },
    }], acceptedAnswer);
    assert.equal(
      prisma._store.lotusEvidence.filter((event) => event.eventType === "ANSWER").length,
      1,
      "the answer event is upserted, not duplicated",
    );
    assert.equal(prisma._store.jobs.size, 1, "the outbox entry is idempotent");
  });

  it("admits only answered AI factorisation items to the reusable bank and keeps admission idempotent", async () => {
    const prisma = createPersonalizedVideoMemoryDb();
    const factorSession = {
      ...session,
      sessionId: "lotus_bank_source_1",
      topic: "FACTORISATION" as const,
      openingAudit: {
        ...session.openingAudit,
        question: {
          ...session.openingAudit.question,
          answerKey: {
            ...session.openingAudit.question.answerKey,
            diagnostics: {
              itemKind: "FACTORISE" as const,
              expression: "6x + 9",
              skillId: "FAC_DIVIDE_TERMS",
              taggedSkills: [],
              stepSkills: ["FAC_DIVIDE_TERMS"],
              predictedMistakes: [],
              origin: "AI" as const,
              provenance: "AI_GENERATED_FOR_SESSION" as const,
            },
          },
        },
      },
    } satisfies LotusSessionView;
    const accepted = {
      ...factorSession.openingAudit,
      response: {
        answer: "3(2x + 3)", working: "Take out 3.", confidence: 70,
        responseTimeMs: 10_000, didNotKnow: false, submissionId: "bank-sub-1",
      },
      verification: {
        status: "VERIFIED_CORRECT" as const,
        correctAnswer: "3(2x + 3)",
        method: "DETERMINISTIC_ALGEBRA" as const,
        explanation: "Correct.",
      },
    };
    await persistLotusSession(prisma as never, factorSession, [], accepted);
    await persistLotusSession(prisma as never, factorSession, [], accepted);
    assert.equal(prisma._store.lotusQuestionBank.size, 1, "the same answered item must enter the bank once");
    const bankItem = [...prisma._store.lotusQuestionBank.values()][0];
    assert.equal(bankItem.topic, "FACTORISATION");
    assert.equal(bankItem.sourceSessionId, factorSession.sessionId);
    const storedQuestion = bankItem.question as { answerKey: { diagnostics: { provenance?: string } } };
    assert.equal(storedQuestion.answerKey.diagnostics.provenance, "AI_GENERATED_FOR_SESSION");
  });
});
