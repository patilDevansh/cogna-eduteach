// Production content rules: AI-written questions only (no code-built games), no bank in this closed test.
process.env.LOTUS_CODE_BUILT_QUESTIONS = "false";
process.env.LOTUS_E2E_DISABLE_QUESTION_BANK = "true";
// The last answer may wait briefly for reviews still running; shortened here (fake-model harness only).
process.env.LOTUS_E2E_FAKE_MODEL = "true";
process.env.LOTUS_E2E_FINAL_REPORT_WAIT_MS = "1500";
/**
 * Remediation 6.2: the AI fallback. The paper is prepared while the AI works; then the AI is switched
 * off (every call fails) or slowed (every call hangs) for the rest of the test. The student must keep
 * getting the question already prepared, every answer must come back at once, and the test must reach
 * its report: the answer check is done by code, and AI reviews only ever run in the background.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PERSONA_CATALOGUE, PersonaFakeModels, chooseResponse } from "../fixtures/lotus-factorisation-personas";

type Mode = "ON" | "OFF" | "SLOW";
const MODEL_CALLS = ["primaryAssessment", "challengerAssessment", "primaryDebate", "challengerClosure", "writeQuestion", "solveBlind", "generateReserveCandidates"] as const;

/** The persona fixture, with a switch that makes every model call fail (OFF) or never return (SLOW). */
function switchableModels() {
  const models = new PersonaFakeModels() as unknown as Record<string, unknown> & { mode: Mode };
  models.mode = "ON";
  for (const name of MODEL_CALLS) {
    const real = (models[name] as (...args: unknown[]) => Promise<unknown>).bind(models);
    models[name] = (...args: unknown[]) => {
      if (models.mode === "OFF") return Promise.reject(new Error("model switched off for the fallback test"));
      if (models.mode === "SLOW") return new Promise(() => undefined);
      return real(...args);
    };
  }
  return models;
}

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, id: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(id);

let submission = 0;
async function playWithAi(mode: Exclude<Mode, "ON">, personaId: string) {
  const persona = PERSONA_CATALOGUE.find((p) => p.id === personaId)!;
  const models = switchableModels();
  const service = new LotusService(models as unknown as LotusModelService, null);
  services.push(service);
  const studentId = `demo_fallback_${mode}_${personaId}`;
  let view: LotusSessionView = await service.start(studentId, "FACTORISATION");
  // Prepare the whole paper while the AI works.
  for (let i = 0; i < 600; i += 1) {
    view = await service.get(view.sessionId);
    const f = internal(service, view.sessionId).factorisation;
    const written = f.state.turns.filter((t: { turn: number }) => f.preferred[String(t.turn)]).length;
    if (view.preparation?.ready && written >= 15) break;
    await sleep(5);
  }
  models.mode = mode;
  let answered = 0;
  const times: number[] = [];
  while (view.status === "ACTIVE" && answered < 20) {
    const staged = view.upcomingQuestions?.[0];
    assert.ok(view.currentQuestion, `Q${answered + 1}: a question is on screen with the AI ${mode}`);
    const plan = chooseResponse(persona, internal(service, view.sessionId).currentQuestion, answered + 1);
    answered += 1;
    const t0 = performance.now();
    view = await service.answer(view.sessionId, studentId, {
      ...plan, confidence: 4, responseTimeMs: persona.paceMsBand[1], submissionId: `fallback-${(submission += 1)}`,
      questionId: view.currentQuestion!.id, nextQuestionId: staged?.id,
    });
    times.push(performance.now() - t0);
    if (view.status === "ACTIVE" && staged) assert.equal(view.currentQuestion?.id, staged.id, "the prepared question is shown");
  }
  return { view, answered, times };
}

describe("Phase 6.2 — the test carries on when the AI stops", () => {
  for (const mode of ["OFF", "SLOW"] as const) {
    for (const id of ["P01_SECURE_ADVANCED", "P05_NEGATIVE_SIGN_ERROR"]) {
      it(`AI ${mode === "OFF" ? "switched off" : "hanging"}, ${id}: every answer returns at once and the test reaches its report`, async () => {
        const { view, answered, times } = await playWithAi(mode, id);
        assert.equal(view.status, "COMPLETE", `still ${view.status} after ${answered} answers`);
        assert.ok(answered >= 15, `${answered} answered`);
        assert.ok(view.finalReport, "a report is produced");
        const beforeLast = Math.max(...times.slice(0, -1));
        assert.ok(beforeLast < 1_000, `slowest answer before the last took ${Math.round(beforeLast)} ms`);
        // A failing AI is not waited for at all; a slow one gets the short, capped wait before the report.
        const lastLimit = mode === "OFF" ? 1_000 : 1_500 + 1_000;
        assert.ok(times.at(-1)! < lastLimit, `the last answer took ${Math.round(times.at(-1)!)} ms`);
      });
    }
  }
});
