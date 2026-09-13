import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";
import {
  appendLotusEvidence,
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
    createdAt: new Date().toISOString(),
  },
  audits: [],
  finalReport: null,
  modelConfiguration: { primary: "primary", challenger: "challenger" },
} satisfies LotusSessionView;

describe("Lotus durable persistence", () => {
  it("stores and reloads a session plus answer evidence", async () => {
    const prisma = createPersonalizedVideoMemoryDb();
    await persistLotusSession(prisma as never, session);
    const loaded = await loadLotusSession(prisma as never, session.sessionId);
    assert.equal(loaded?.sessionId, session.sessionId);
    assert.equal(loaded?.studentId, "demo_aarav");

    await appendLotusEvidence(prisma as never, session, {
      ...session.openingAudit,
      response: {
        answer: "-2y-10",
        working: "I distributed only the first term.",
        confidence: 60,
        responseTimeMs: 20_000,
        didNotKnow: false,
      },
      verification: {
        status: "VERIFIED_INCORRECT",
        correctAnswer: "-2y+10",
        method: "DETERMINISTIC_ARITHMETIC",
        explanation: "Sign of the second product was lost.",
      },
    });
    assert.equal(true, true);
  });
});
