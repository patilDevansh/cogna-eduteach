import { after, it } from "node:test";
import assert from "node:assert/strict";
import { LotusService } from "../../src/lotus/lotus.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";

const oldEnv = { ...process.env };
after(() => { process.env = oldEnv; });
it("pauses a local demo on timeout and allows a finish in memory", async () => {
  process.env.LOTUS_DEV_OBSERVER_BYPASS = "true";
  process.env.LOTUS_TIME_LIMIT_MINUTES = "0.001";
  process.env.LOTUS_E2E_DISABLE_QUESTION_BANK = "true";
  const service = new LotusService(new FakeLotusModelService() as never, createPersonalizedVideoMemoryDb() as never);
  try {
    let view = await service.start("demo_exit_audit", "FACTORISATION");
    for (let i = 0; i < 100 && !(view.currentQuestion && view.preparation?.ready); i++) {
      await new Promise((resolve) => setImmediate(resolve));
      view = await service.get(view.sessionId);
    }
    assert.ok(view.currentQuestion);
    const internal = service as unknown as { sessions: Map<string, { questionsReadyAt: string }> };
    internal.sessions.get(view.sessionId)!.questionsReadyAt = new Date(Date.now() - 2000).toISOString();
    const result = await service.answer(view.sessionId, "demo_exit_audit", {
      answer: "I don't know", working: "", confidence: 60, responseTimeMs: 30000,
      didNotKnow: true, submissionId: "exit-audit-1", questionId: view.currentQuestion.id,
      nextQuestionId: view.upcomingQuestions?.[0]?.id, developerMode: true,
    });
    assert.equal(result.status, "ACTIVE");
    assert.equal(result.developerExitPrompt?.reason, "TIME_LIMIT");
    const completed = await service.chooseDeveloperExit(view.sessionId, "demo_exit_audit", result.developerExitPrompt!.decisionId, "FINISH");
    assert.equal(completed.status, "COMPLETE");
  } finally { service.onModuleDestroy(); }
});
it("continues a local demo when a checked next question is ready", async () => {
  process.env.LOTUS_DEV_OBSERVER_BYPASS = "true";
  process.env.LOTUS_TIME_LIMIT_MINUTES = "0.001";
  process.env.LOTUS_E2E_DISABLE_QUESTION_BANK = "true";
  const service = new LotusService(new FakeLotusModelService() as never, createPersonalizedVideoMemoryDb() as never);
  try {
    let view = await service.start("demo_exit_continue", "FACTORISATION");
    for (let i = 0; i < 100 && !(view.currentQuestion && view.preparation?.ready && view.upcomingQuestions?.length); i++) {
      await new Promise((resolve) => setImmediate(resolve));
      view = await service.get(view.sessionId);
    }
    assert.ok(view.currentQuestion);
    assert.ok(view.upcomingQuestions?.length);
    const internal = service as unknown as { sessions: Map<string, { questionsReadyAt: string }> };
    internal.sessions.get(view.sessionId)!.questionsReadyAt = new Date(Date.now() - 2000).toISOString();
    const result = await service.answer(view.sessionId, "demo_exit_continue", {
      answer: "I don't know", working: "", confidence: 60, responseTimeMs: 30000,
      didNotKnow: true, submissionId: "exit-audit-2", questionId: view.currentQuestion.id,
      nextQuestionId: view.upcomingQuestions[0]!.id, developerMode: true,
    });
    assert.equal(result.developerExitPrompt?.canContinue, true);
    const continued = await service.chooseDeveloperExit(view.sessionId, "demo_exit_continue", result.developerExitPrompt!.decisionId, "CONTINUE");
    assert.equal(continued.status, "ACTIVE");
    assert.ok(continued.currentQuestion);
    assert.equal(continued.developerExitPrompt, undefined);
  } finally { service.onModuleDestroy(); }
});
