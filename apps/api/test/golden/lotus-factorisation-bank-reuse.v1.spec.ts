/**
 * Phase 3 question-bank reuse through the real LotusService write path.
 * Uses the deterministic fake model and the in-memory durable DB double; no
 * live model calls and no production database data.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";

type PrivateSession = {
  currentQuestion: LotusQuestion | null;
  factorisation?: { preferred: Record<string, string>; versions: Record<string, LotusQuestion[]> };
};

function privateSession(service: LotusService, sessionId: string): PrivateSession {
  return (service as unknown as { sessions: Map<string, PrivateSession> }).sessions.get(sessionId)!;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 120; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function waitReady(service: LotusService, sessionId: string): Promise<LotusSessionView> {
  for (let i = 0; i < 30; i += 1) {
    await flush();
    const view = await service.get(sessionId);
    if (view.currentQuestion && view.preparation?.ready) return view;
  }
  throw new Error("factorisation preparation did not reach the 15-question gate");
}

async function answerCorrectly(service: LotusService, view: LotusSessionView, studentId: string, submissionId: string): Promise<LotusSessionView> {
  const session = privateSession(service, view.sessionId);
  const question = session.currentQuestion!;
  const next = view.upcomingQuestions?.[0];
  return service.answer(view.sessionId, studentId, {
    answer: question.answerKey.canonicalAnswer,
    working: "Checked each factor by expansion.",
    confidence: 85,
    responseTimeMs: 10_000,
    didNotKnow: false,
    submissionId,
    questionId: question.id,
    nextQuestionId: next?.id,
  });
}

describe("Lotus factorisation AI question-bank reuse", () => {
  it("reuses an answered, validated AI item for a later session and labels its provenance", async () => {
    const prisma = createPersonalizedVideoMemoryDb();
    const models = new FakeLotusModelService();
    const service = new LotusService(models as unknown as LotusModelService, prisma as never);

    const first = await service.start("demo_bank_source", "FACTORISATION");
    let firstReady = await waitReady(service, first.sessionId);
    // Answer Q1, then Q2 (FAC_GCF_VARIABLE) so the exact planned skill is
    // represented in the durable bank before the second session starts.
    firstReady = await answerCorrectly(service, firstReady, "demo_bank_source", "bank-source-q1");
    await flush();
    firstReady = await service.get(first.sessionId);
    assert.ok(firstReady.currentQuestion);
    await answerCorrectly(service, firstReady, "demo_bank_source", "bank-source-q2");
    await flush();

    const bankRows = [...prisma._store.lotusQuestionBank.values()];
    assert.ok(bankRows.some((row) => row.sourceSessionId === first.sessionId), "answered AI items should be admitted to the durable bank");
    assert.ok(bankRows.some((row) => (row.question as { answerKey?: { diagnostics?: { skillId?: string } } }).answerKey?.diagnostics?.skillId === "FAC_GCF_VARIABLE"), "the reusable skill item must be present");

    const second = await service.start("demo_bank_reuser", "FACTORISATION");
    const secondReady = await waitReady(service, second.sessionId);
    const secondPrivate = privateSession(service, second.sessionId);
    const q2 = secondPrivate.factorisation?.versions["2"]?.find((item) => item.id === secondPrivate.factorisation?.preferred["2"]);
    assert.ok(q2, "the second planned item should be installed");
    assert.equal(q2!.answerKey.diagnostics?.provenance, "AI_REUSED_FROM_BANK");
    assert.equal(secondReady.currentQuestion?.answerKey?.diagnostics, undefined, "the public student view must not expose answer-key diagnostics");

    const reusedRow = [...prisma._store.lotusQuestionBank.values()].find((row) => row.sourceSessionId === first.sessionId && (row.question as { answerKey?: { diagnostics?: { skillId?: string } } }).answerKey?.diagnostics?.skillId === "FAC_GCF_VARIABLE");
    assert.ok(reusedRow);
    assert.equal(reusedRow!.reuseCount, 1, "reuse must increment the durable bank counter exactly once");
    service.onModuleDestroy();
  });
});
