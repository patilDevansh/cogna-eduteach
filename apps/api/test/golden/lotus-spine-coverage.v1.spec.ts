// The fake model needs the code-built probes; production serves AI-written or bank questions only.
process.env.LOTUS_CODE_BUILT_QUESTIONS = "true";
/**
 * Remediation Phase 2 gate test (Lotus Remediation Plan, Nov 2026): a true 15-question paper.
 *
 * Each persona is driven through the real start → answer route. The rule it checks: spine slots 1–15
 * are each asked exactly once, in tier order; follow-ups are extra, labelled with their parent's slot
 * plus .5, and there are at most two. The Nov 9 audit saw spine topics overwritten by re-checks
 * (3x² + 3x, the multi-term common factor, what factorised means, 4-term grouping, x² + 5x + 6,
 * 2x² − 18 never asked) and an old 25-slot bank item (slot 21) served.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PERSONA_CATALOGUE, PersonaFakeModels, chooseResponse } from "../fixtures/lotus-factorisation-personas";

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, id: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(id);

let submission = 0;
async function playThrough(personaId: string) {
  const persona = PERSONA_CATALOGUE.find((p) => p.id === personaId)!;
  const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
  services.push(service);
  const studentId = `demo_cov_${personaId}`;
  const started = await service.start(studentId, "FACTORISATION");
  let view: LotusSessionView = started;
  for (let attempt = 0; attempt < 30 && !(view.currentQuestion && view.preparation?.ready); attempt += 1) {
    await flush();
    view = await service.get(started.sessionId);
  }
  let answered = 0;
  while (view.status === "ACTIVE" && answered < 20) {
    await flush();
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    const plan = chooseResponse(persona, internal(service, view.sessionId).currentQuestion, answered + 1);
    answered += 1;
    view = await service.answer(view.sessionId, studentId, {
      ...plan, confidence: 4, responseTimeMs: persona.paceMsBand[1], submissionId: `cov-${(submission += 1)}`,
      questionId: view.currentQuestion?.id, nextQuestionId: staged?.id,
    });
  }
  const session = internal(service, view.sessionId);
  return { questions: session.audits.map((a: { question: LotusQuestion }) => a.question) as LotusQuestion[], session };
}

const slotOf = (q: LotusQuestion) => q.answerKey.diagnostics?.slot ?? -1;
const isFollowUp = (q: LotusQuestion) => (q.answerKey.diagnostics as { isElasticProbe?: boolean } | undefined)?.isElasticProbe === true;

describe("Phase 2 — every persona sees the whole 15-question paper", () => {
  for (const persona of PERSONA_CATALOGUE) {
    it(`${persona.id}: spine slots 1–15 once each, in order, plus at most two .5 follow-ups`, async () => {
      const { questions, session } = await playThrough(persona.id);
      const escalated = session.factorisation.state.ceilingEscalated === true;
      const spine = questions.filter((q) => !isFollowUp(q) && q.purpose !== "STRETCH").map(slotOf);
      const followUps = questions.filter(isFollowUp);
      const expected = Array.from({ length: escalated ? spine.length : 15 }, (_, i) => i + 1);
      assert.deepEqual(spine, expected, `spine slots asked: ${spine.join(", ")}`);
      if (escalated) assert.ok(spine.length >= 5 && questions.length === 15, "after the harder-question switch the rest of the 15 are stretch questions");
      assert.ok(followUps.length <= 2, `${followUps.length} follow-ups`);
      for (const q of followUps) assert.ok(Math.abs(slotOf(q) % 1) === 0.5, `follow-up slot ${slotOf(q)} is a parent slot + .5`);
      for (const q of questions) assert.ok((slotOf(q) >= 1 && slotOf(q) <= 15) || isFollowUp(q), `served slot ${slotOf(q)} is on the 15-question paper`);
      assert.ok(questions.length <= 17, `${questions.length} questions`);
    });
  }
});
