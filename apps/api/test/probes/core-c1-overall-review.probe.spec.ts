/**
 * Core problem C1 (Cogna Project Hub): nothing read the whole test at the
 * end. Now, once a finished test has no review still running, one overall AI
 * read is attached to the report: a short view, patterns noticed but not
 * confirmed, and disagreements with the code, all shown beside the code's
 * facts, never changing them. Plays a whole pretend session (persona P05).
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { foldLedger } from "../../src/lotus/lotus-factorisation";
import { PERSONA_CATALOGUE, PersonaFakeModels, chooseResponse } from "../fixtures/lotus-factorisation-personas";

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));
const flush = async () => { for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, id: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(id);

async function playToEnd(service: LotusService, studentId: string): Promise<LotusSessionView> {
  const persona = PERSONA_CATALOGUE.find((p) => p.id === "P05_NEGATIVE_SIGN_ERROR")!;
  const started = await service.start(studentId, "FACTORISATION");
  let view = started;
  for (let i = 0; i < 20 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
  let answered = 0;
  while (view.status === "ACTIVE" && answered < 26) {
    await flush();
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    answered += 1;
    const plan = chooseResponse(persona, internal(service, view.sessionId).currentQuestion, answered);
    view = await service.answer(view.sessionId, studentId, {
      answer: plan.answer, working: plan.working, confidence: 70, responseTimeMs: 20_000, didNotKnow: plan.didNotKnow,
      submissionId: `c1-${answered}`, questionId: view.currentQuestion?.id, nextQuestionId: staged?.id,
    });
  }
  for (let i = 0; i < 200; i += 1) {
    await flush();
    view = await service.get(view.sessionId);
    if (view.finalReport?.overallReview) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return view;
}

describe("C1: one overall AI read of the whole test", () => {
  it("is attached to the report beside the code's facts, without changing them", async () => {
    const models = new PersonaFakeModels() as PersonaFakeModels & { overallReview?: unknown; overallCalls?: number };
    models.overallCalls = 0;
    models.overallReview = async (prompt: string) => {
      models.overallCalls! += 1;
      assert.match(prompt, /code's record/i, "the reviewer must be given the code's record");
      return { view: "Secure on common factors; signs go wrong when taking out a negative.", noticed: ["Signs may also be shaky in grouping (Q17)."], disagreements: [] };
    };
    const service = new LotusService(models as unknown as LotusModelService, null);
    services.push(service);
    const view = await playToEnd(service, "demo_c1_overall");
    assert.equal(view.status, "COMPLETE");
    const report = view.finalReport!;
    assert.ok(report.overallReview, "the overall review should be on the final report");
    assert.equal(models.overallCalls, 1, "it runs once per test");
    assert.ok(report.uncertainAreas.some((u) => /AI noticed \(not confirmed\)/.test(u)), "noticed patterns are shown, never as gaps");
    const ledger = foldLedger(internal(service, view.sessionId).audits);
    for (const skill of report.skills ?? []) {
      if (skill.state === "NOT_TESTED_DEPENDENCY") continue;
      assert.equal(skill.state, ledger.get(skill.skillId)?.state, `${skill.skillId}: the AI's read must not change the code's verdict`);
    }
  });
});
