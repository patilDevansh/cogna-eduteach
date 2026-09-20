import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@cogna/database";
import type { LotusSessionView } from "@cogna/shared";
import {
  appendLotusEvidence,
  loadLotusSession,
  persistLotusSession,
} from "../../src/lotus/lotus-persistence";

function configuredLocalDatabaseUrl(): string {
  const candidatePaths = [
    resolve(process.cwd(), "packages/database/.env"),
    resolve(process.cwd(), "../../packages/database/.env"),
  ];
  const path = candidatePaths.find((candidate) => {
    try {
      return readFileSync(candidate, "utf8").includes("DATABASE_URL=");
    } catch {
      return false;
    }
  });
  if (!path) throw new Error("No local database configuration was found for the Lotus persistence gate.");
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  const value = line?.slice("DATABASE_URL=".length).trim().replace(/^['\"]|['\"]$/g, "");
  if (!value) throw new Error("DATABASE_URL is blank in the local Lotus persistence configuration.");
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error("The Lotus persistence gate only runs against a local development database.");
  }
  return value;
}

const sessionId = `lotus_phase0_${randomUUID()}`;
const prisma = new PrismaClient({ datasourceUrl: configuredLocalDatabaseUrl() });

const session = {
  sessionId,
  studentId: "phase0_persistence_test",
  grade: 8,
  board: "CBSE",
  status: "ACTIVE",
  experimental: true,
  phase: "EXPLORE",
  startedAt: new Date().toISOString(),
  currentQuestion: null,
  openingAudit: {
    question: {
      id: "phase0_q1",
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
    questionSelection: { selectedFrom: "PRIMARY", reason: "opening", informationGain: { passed: true, explanation: "first item" } },
    analysisStatus: "COMPLETE",
    analysisSource: "DETERMINISTIC",
    createdAt: new Date().toISOString(),
  },
  audits: [],
  finalReport: null,
  modelConfiguration: { primary: "test-primary", challenger: "test-challenger" },
} satisfies LotusSessionView;

after(async () => {
  await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: `${sessionId}:` } } });
  await prisma.lotusSessionRecord.deleteMany({ where: { sessionId } });
  await prisma.$disconnect();
});

describe("Lotus Phase 0 local database recovery", () => {
  it("persists a recoverable snapshot and append-only state and answer events", async () => {
    const acceptedAnswer = {
      ...session.openingAudit,
      response: { answer: "-2y-10", working: "I lost the sign.", confidence: 60, responseTimeMs: 2_000, didNotKnow: false, submissionId: "sub-atomic" },
      verification: { status: "VERIFIED_INCORRECT" as const, correctAnswer: "-2y+10", method: "DETERMINISTIC_ARITHMETIC" as const, explanation: "Sign lost." },
    };
    await persistLotusSession(prisma, session, [{
      jobType: "LOTUS_DEFERRED_ANALYSIS",
      idempotencyKey: `${sessionId}:0`,
      payload: { sessionId, turnIndex: 0 },
    }], acceptedAnswer);
    const loaded = await loadLotusSession(prisma, sessionId);
    assert.equal(loaded?.sessionId, sessionId);

    const record = await prisma.lotusSessionRecord.findUniqueOrThrow({ where: { sessionId } });
    const events = await prisma.lotusEvidenceRecord.findMany({
      where: { sessionRecordId: record.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(events.map((event) => event.eventType), ["SESSION_STATE", "ANSWER"]);
    assert.equal((events[0]?.metadata as { snapshot?: { sessionId?: string } }).snapshot?.sessionId, sessionId);
    assert.equal(events[1]?.outcome, "VERIFIED_INCORRECT");
    assert.equal(record.pseudonymId?.length, 22, "every persisted session gets a deterministic pseudonymous id");
    const jobs = await prisma.job.findMany({ where: { idempotencyKey: `${sessionId}:0` } });
    assert.equal(jobs.length, 1, "the background analysis was queued in the same durable write as the answer");

    await persistLotusSession(prisma, session, [{
      jobType: "LOTUS_DEFERRED_ANALYSIS",
      idempotencyKey: `${sessionId}:0`,
      payload: { sessionId, turnIndex: 0 },
    }], acceptedAnswer);
    const answerRows = await prisma.lotusEvidenceRecord.findMany({
      where: { sessionRecordId: record.id, eventType: "ANSWER", submissionId: "sub-atomic" },
    });
    assert.equal(answerRows.length, 1, "retrying a durable answer cannot create a second answer event");
  });

  it("a duplicate (question, submission) write updates the same durable ANSWER row instead of creating a second one — the DB-level duplicate-submit guard", async () => {
    // Simulates two racing writers (a retry, or a second API instance that
    // never shared the first instance's in-memory idempotency check) both
    // trying to durably record the same submission.
    const first = {
      ...session.openingAudit,
      response: { answer: "-2y-10", working: "attempt one", confidence: 40, responseTimeMs: 1_000, didNotKnow: false, submissionId: "race-sub" },
      verification: { status: "VERIFIED_INCORRECT" as const, correctAnswer: "-2y+10", method: "DETERMINISTIC_ARITHMETIC" as const, explanation: "Sign lost." },
    };
    const second = {
      ...session.openingAudit,
      response: { answer: "-2y-10 (retried write)", working: "attempt two, same submission", confidence: 40, responseTimeMs: 1_000, didNotKnow: false, submissionId: "race-sub" },
      verification: { status: "VERIFIED_INCORRECT" as const, correctAnswer: "-2y+10", method: "DETERMINISTIC_ARITHMETIC" as const, explanation: "Sign lost." },
      analysisStatus: "COMPLETE" as const,
    };
    await appendLotusEvidence(prisma, session, first);
    await appendLotusEvidence(prisma, session, second);

    const record = await prisma.lotusSessionRecord.findUniqueOrThrow({ where: { sessionId } });
    const answerEvents = await prisma.lotusEvidenceRecord.findMany({
      where: { sessionRecordId: record.id, eventType: "ANSWER", submissionId: "race-sub" },
    });
    assert.equal(answerEvents.length, 1, "the unique (session, question, submission) index must collapse both writes into one row");
    assert.equal(answerEvents[0]!.submittedText, "-2y-10 (retried write)", "the later write updates the row rather than being silently dropped or duplicated");
  });
});
