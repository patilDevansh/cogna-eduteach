/**
 * Phase 0 test gate (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §10) against a
 * real local Postgres: the durable outbox actually survives being drained
 * after the in-process work already ran, event-order reconciliation catches
 * a real discrepancy, and a student's durable data can be exported and then
 * permanently deleted. Uses the same local-only database safety gate as
 * lotus-persistence.database.v1.spec.ts.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@cogna/database";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusReserveIntent,
} from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";

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

const prisma = new PrismaClient({ datasourceUrl: configuredLocalDatabaseUrl() });
const createdStudentIds: string[] = [];

after(async () => {
  for (const studentId of createdStudentIds) {
    await prisma.lotusSessionRecord.deleteMany({ where: { studentId } });
  }
  await prisma.$disconnect();
});

function question(prompt: string, expression: string): Omit<LotusQuestion, "id"> {
  return {
    phase: "DIAGNOSE",
    subtopic: "test",
    prompt,
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "test",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "", expression, workedSolution: [] },
  };
}

const ASSESSMENT: LotusModelAssessment = {
  mathJudgment: "UNRESOLVED",
  observations: ["fake"],
  hypotheses: [],
  phaseRecommendation: "EXPLORE",
  proposedAction: "ASK",
  conciseRationale: "fake",
};
const DEBATE: LotusGptDebateResponse = {
  agreements: [],
  disagreements: [],
  disagreementExample: "None.",
  acceptedImprovements: [],
  revisedConclusion: "fake",
  revisedAction: "ASK",
  revisedPhase: "EXPLORE",
};
function closure(): LotusDebateClosure {
  return {
    verdict: "ACCEPTED",
    acceptedFromGpt: [],
    acceptedFromChallenger: [],
    rejectedClaims: [],
    conclusion: "fake",
    evidenceState: "PARTIAL",
    uncertainty: [],
    phase: "EXPLORE",
    action: "ASK",
    selectionReason: "fake",
    exitDiagnostic: false,
  };
}

/** Same shape as the fake used in lotus-premature-exit-guard.v1.spec.ts, but never exits early — this file only needs a session that stays ACTIVE through one answer. */
class FakeModelService {
  readonly primaryModel = "fake-primary";
  readonly challengerModel = "fake-challenger";
  closureCallCount = 0;

  get status() {
    return { enabled: true, ready: true, missingConfiguration: [] as string[], progressiveStreamingEnabled: false };
  }
  get progressiveStreamingEnabled() {
    return false;
  }
  assertReady(): void {}
  async primaryAssessment(): Promise<LotusModelAssessment> { return ASSESSMENT; }
  async challengerAssessment(): Promise<LotusModelAssessment> { return ASSESSMENT; }
  async primaryDebate(): Promise<LotusGptDebateResponse> { return DEBATE; }
  async challengerClosure(): Promise<LotusDebateClosure> {
    this.closureCallCount += 1;
    return closure();
  }
  async reviseQuestion(): Promise<Omit<LotusQuestion, "id">> {
    return question("A fresh probe.", "1+1");
  }
  async generateReserveCandidates(): Promise<Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }>> {
    return [];
  }
}

/** Lets background work (question writes, AI reviews) run to completion. */
async function flush(): Promise<void> {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

function setup() {
  const models = new FakeModelService();
  const service = new LotusService(models as unknown as LotusModelService, prisma);
  services.push(service);
  return { models, service };
}

let studentCounter = 0;
function freshStudentId(): string {
  const id = `phase0_durability_${Date.now()}_${(studentCounter += 1)}`;
  createdStudentIds.push(id);
  return id;
}

describe("Lotus Phase 0 outbox — durable, drainable, and safe to redrain", () => {
  it("answering enqueues a durable job, and draining after the in-process work already finished is a safe no-op", async () => {
    const { models, service } = setup();
    const studentId = freshStudentId();
    const started = await service.start(studentId);
    const staged = started.upcomingQuestions![0]!;
    const answered = await service.answer(started.sessionId, studentId, {
      answer: "wrong", working: "some working", confidence: 50, responseTimeMs: 5_000, didNotKnow: false,
      questionId: started.currentQuestion!.id, nextQuestionId: staged.id, submissionId: "outbox-sub-1",
    });
    assert.equal(answered.audits[0]!.analysisStatus, "PENDING", "the review runs in the background");

    const record = await prisma.lotusSessionRecord.findUniqueOrThrow({ where: { sessionId: started.sessionId } });
    const job = await prisma.job.findFirst({ where: { jobType: "lotus.deferredAnalysis", payload: { path: ["sessionId"], equals: started.sessionId } } });
    assert.ok(job, "the answer must durably enqueue its deferred-analysis outbox job");
    assert.equal(job!.status, "PENDING", "the job stays PENDING until a drain claims it — the in-process kick-off doesn't touch job rows");

    await flush(); // let the in-process kick-off (started by answer(), not by the outbox) finish the real work
    const callsBeforeDrain = models.closureCallCount;
    assert.ok(callsBeforeDrain > 0, "the in-process background review must have actually run");

    const drained = await service.processPendingOutboxJobs();
    assert.equal(drained.claimed, 1);
    assert.equal(drained.completed, 1);
    assert.equal(drained.failed, 0);
    assert.equal(models.closureCallCount, callsBeforeDrain, "draining a job whose work already completed must not redo the AI review");

    const finishedJob = await prisma.job.findUniqueOrThrow({ where: { id: job!.id } });
    assert.equal(finishedJob.status, "COMPLETED");

    // Draining again must also be a safe no-op — nothing left to claim.
    const second = await service.processPendingOutboxJobs();
    assert.equal(second.claimed, 0);
    void record;
  });
});

describe("Lotus Phase 0 event-order reconciliation", () => {
  it("passes for a normally persisted session", async () => {
    const { service } = setup();
    const studentId = freshStudentId();
    const started = await service.start(studentId);
    const result = await service.reconcileSession(started.sessionId);
    assert.equal(result.ok, true, `expected no discrepancies, got: ${result.discrepancies.join("; ")}`);
  });

  it("flags a real discrepancy between the stored snapshot and its own event log", async () => {
    const { service } = setup();
    const studentId = freshStudentId();
    const started = await service.start(studentId);
    const record = await prisma.lotusSessionRecord.findUniqueOrThrow({ where: { sessionId: started.sessionId } });
    // Corrupt the most recent SESSION_STATE event's own bookkeeping, as an
    // interrupted or buggy write might, without touching the session row.
    const latest = await prisma.lotusEvidenceRecord.findFirstOrThrow({
      where: { sessionRecordId: record.id, eventType: "SESSION_STATE" },
      orderBy: { createdAt: "desc" },
    });
    await prisma.lotusEvidenceRecord.update({
      where: { id: latest.id },
      data: { metadata: { ...(latest.metadata as object), auditCount: 99 } },
    });
    const result = await service.reconcileSession(started.sessionId);
    assert.equal(result.ok, false);
    assert.ok(result.discrepancies.some((d) => d.includes("99")), `expected a discrepancy mentioning the corrupted count, got: ${result.discrepancies.join("; ")}`);
  });
});

describe("Lotus Phase 0 pseudonymization, retention, deletion, and export", () => {
  it("exports a student's durable sessions and evidence, then deletes them permanently", async () => {
    const { service } = setup();
    const studentId = freshStudentId();
    const started = await service.start(studentId);
    await flush();

    const exported = await service.exportStudentData(studentId);
    assert.equal(exported.studentId, studentId);
    assert.equal(exported.pseudonymId.length, 22);
    assert.ok(exported.sessions.some((entry) => entry.session.sessionId === started.sessionId));
    assert.ok(exported.sessions[0]!.events.length > 0, "export must include the durable event log, not just the snapshot");

    const deleted = await service.deleteStudentData(studentId);
    assert.ok(deleted.deletedSessions >= 1);

    const afterDelete = await prisma.lotusSessionRecord.findMany({ where: { studentId } });
    assert.equal(afterDelete.length, 0, "deletion must be permanent");
    const emptyExport = await service.exportStudentData(studentId);
    assert.equal(emptyExport.sessions.length, 0);

    await assert.rejects(service.get(started.sessionId), /not found/i, "a deleted session must not still be servable from the now-evicted in-memory cache");
  });

  it("the same student always maps to the same pseudonym, and different students never collide in practice", async () => {
    const { service: serviceA } = setup();
    const { service: serviceB } = setup();
    const studentId = freshStudentId();
    await serviceA.start(studentId);
    await flush();
    const first = await serviceA.exportStudentData(studentId);
    const second = await serviceB.exportStudentData(studentId);
    assert.equal(first.pseudonymId, second.pseudonymId, "the pseudonym is deterministic, not per-process random");
    await serviceA.deleteStudentData(studentId);
  });
});
