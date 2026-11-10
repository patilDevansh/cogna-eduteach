// The fake model needs the code-built probes; production serves AI-written or bank questions only.
process.env.LOTUS_CODE_BUILT_QUESTIONS = "true";
/**
 * Remediation Phase 1 gate tests (Lotus Remediation Plan, Nov 2026).
 *
 * These drive LotusService through the real start → answer route, the same way the browser does:
 * every Submit carries the question the browser already staged (nextQuestionId), and the reply must
 * show exactly that question. They cover what the Nov 9 browser audit found broken:
 *   - a fast, accurate student was stuck after the harder-question switch (400 at Q5, then 500 at Q6);
 *   - the old STARTING_POINT_FOUND stop still ended the 15-question paper at Q8;
 *   - the stuck-student (floor) exit was reported under the wrong reason.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PERSONA_CATALOGUE, PersonaFakeModels, chooseResponse, type PersonaProfile } from "../fixtures/lotus-factorisation-personas";

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

function setup() {
  const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
  services.push(service);
  return service;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function internal(service: LotusService, sessionId: string): any {
  return (service as unknown as { sessions: Map<string, unknown> }).sessions.get(sessionId);
}

async function startReady(service: LotusService, studentId: string): Promise<LotusSessionView> {
  const started = await service.start(studentId, "FACTORISATION");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await flush();
    const view = await service.get(started.sessionId);
    if (view.currentQuestion && view.preparation?.ready) return view;
  }
  throw new Error("the 15-question paper was not prepared in time");
}

let submission = 0;
type Answer = { answer: string; working: string; didNotKnow: boolean };

/** Plays a whole test. Every Submit names the staged next question, and the reply must show exactly it. */
async function play(service: LotusService, studentId: string, choose: (q: unknown, turn: number) => Answer, paceMs: number) {
  let view = await startReady(service, studentId);
  let answered = 0;
  while (view.status === "ACTIVE" && answered < 20) {
    await flush();
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    const plan = choose(internal(service, view.sessionId).currentQuestion, answered + 1);
    answered += 1;
    view = await service.answer(view.sessionId, studentId, {
      ...plan,
      confidence: 4,
      responseTimeMs: paceMs,
      submissionId: `spine-${(submission += 1)}`,
      questionId: view.currentQuestion?.id,
      nextQuestionId: staged?.id,
    });
    if (view.status === "ACTIVE") assert.equal(view.currentQuestion?.id, staged?.id, `turn ${answered + 1}: the question already on screen must never change`);
  }
  await flush();
  return { view: await service.get(view.sessionId), answered, session: internal(service, view.sessionId) };
}

const persona = (id: string): PersonaProfile => PERSONA_CATALOGUE.find((p) => p.id === id)!;
const asPersona = (p: PersonaProfile) => (q: unknown, turn: number) => chooseResponse(p, q as never, turn);

describe("Phase 1 — a fast, accurate student finishes the paper", () => {
  for (const paceMs of [4_000, 9_000]) {
    it(`all correct at ${paceMs / 1000} s an answer: harder questions switch on, every answer saves, the report is reached`, async () => {
      const service = setup();
      const p = persona("P01_SECURE_ADVANCED");
      const { view, answered, session } = await play(service, `demo_fast_${paceMs}`, asPersona(p), paceMs);
      assert.equal(view.status, "COMPLETE");
      assert.equal(answered, 15, "the whole 15-question paper is answered");
      assert.ok(session.factorisation.state.ceilingEscalated, "the harder-question switch fired");
      const purposes = session.audits.map((a: { question: { purpose?: string } }) => a.question.purpose);
      // The switch is decided on the Q5 answer; Q6 was already on screen, so stretch questions start at Q7.
      assert.ok(purposes.slice(0, 6).every((x: string | undefined) => x !== "STRETCH"), "Q1–Q6 are spine questions");
      assert.ok(purposes.slice(6).every((x: string | undefined) => x === "STRETCH"), "Q7–Q15 are stretch questions");
      assert.ok(session.audits.every((a: { verification?: { status?: string } }) => a.verification?.status === "VERIFIED_CORRECT"), "every stretch answer is marked by code");
      assert.equal(view.finalReport?.outcome, "ADVANCEMENT");
    });
  }

  it("every stretch question shows a readable topic and notation (no raw skill codes or carets)", async () => {
    const service = setup();
    const { session } = await play(service, "demo_fast_labels", asPersona(persona("P01_SECURE_ADVANCED")), 4_000);
    for (const audit of session.audits.filter((a: { question: { purpose?: string } }) => a.question.purpose === "STRETCH")) {
      assert.doesNotMatch(audit.question.prompt, /\^/, `"${audit.question.prompt}" uses caret notation`);
      assert.doesNotMatch(audit.question.subtopic, /^[A-Z_]+$/, `"${audit.question.subtopic}" is a raw skill code`);
    }
  });
});

describe("Phase 1 — only the stuck-student exit ends the paper early", () => {
  for (const id of ["P04_DIVIDE_FIRST_TERM_ONLY", "P05_NEGATIVE_SIGN_ERROR"]) {
    it(`${id}: a repeated slip does not end the test early`, async () => {
      const service = setup();
      const p = persona(id);
      const { view, answered, session } = await play(service, `demo_${id}`, asPersona(p), p.paceMsBand[0]);
      assert.equal(view.status, "COMPLETE");
      assert.ok(answered >= 15 && answered <= 17, `${answered} answered; the paper is 15 plus at most 2 follow-ups`);
      assert.doesNotMatch(String(session.factorisation.endedEarlyNote ?? ""), /starting point/i, "the old starting-point stop must not end the paper");
    });
  }

  it("four 'I don't know' answers end the test at Q4 under its own reason", async () => {
    const service = setup();
    const { view, answered, session } = await play(service, "demo_stuck", () => ({ answer: "", working: "", didNotKnow: true }), 30_000);
    assert.equal(view.status, "COMPLETE");
    assert.equal(answered, 4);
    assert.match(String(session.factorisation.endedEarlyNote ?? ""), /foundational/i);
  });

  it("the developer stop dialog names the stuck-student exit, not 'starting point found'", async () => {
    // The developer stop dialog exists only in local development, behind this switch.
    const previous = process.env.LOTUS_DEV_OBSERVER_BYPASS;
    process.env.LOTUS_DEV_OBSERVER_BYPASS = "true";
    after(() => { if (previous === undefined) delete process.env.LOTUS_DEV_OBSERVER_BYPASS; else process.env.LOTUS_DEV_OBSERVER_BYPASS = previous; });
    const service = setup();
    let view = await startReady(service, "demo_stuck_dev");
    for (let turn = 1; turn <= 4; turn += 1) {
      const staged = view.upcomingQuestions?.[0];
      view = await service.answer(view.sessionId, "demo_stuck_dev", {
        answer: "", working: "", didNotKnow: true, confidence: 1, responseTimeMs: 30_000, developerMode: true,
        submissionId: `spine-dev-${turn}`, questionId: view.currentQuestion?.id, nextQuestionId: staged?.id,
      } as never);
      if (view.developerExitPrompt) break;
      await flush();
      view = await service.get(view.sessionId);
    }
    assert.equal(view.developerExitPrompt?.reason, "FLOOR_EXIT_PARALYSIS");
    assert.equal(view.developerExitPrompt?.answeredQuestions, 4);
  });
});
