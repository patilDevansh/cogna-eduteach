/**
 * A whole factorisation session through LotusService with the free fake model:
 * a themed game is issued by the server, played, and its answer is rebuilt and
 * marked by the same code as a typed answer. No network, no cost.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOTUS_GAME_KINDS, type LotusGameKind, type LotusGameResponse, type LotusSessionView } from "@cogna/shared";
import { buildLotusGame } from "../../src/lotus/lotus-games";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";

process.env.COGNA_GAME_FORMATS = "on";
// Every eligible monic trinomial becomes a game, so the test reaches one quickly.
process.env.COGNA_THEMED_GAMES = "all";
delete process.env.LOTUS_DISABLE_BANK_REUSE;
process.env.LOTUS_E2E_DISABLE_QUESTION_BANK = "true";

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, id: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(id);

let counter = 0;
/**
 * A real fake-model session whose open question is swapped for a checked
 * x² + 3x − 4 item, then dressed as a game exactly as the server would. (The
 * plan only reaches a monic-trinomial game on some turns; this puts one in
 * front of the whole answer path.)
 */
async function sessionWithGame(service: LotusService, studentId: string, kind: LotusGameKind) {
  const started = await service.start(studentId, "FACTORISATION");
  let view = started;
  for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
  const q = internal(service, started.sessionId).currentQuestion;
  const expression = "x^2 + 3x - 4";
  q.prompt = `Factorise completely: ${expression}`;
  q.type = "CONSTRUCTED_RESPONSE";
  delete q.options; delete q.interaction; delete q.presentation;
  q.answerKey.canonicalAnswer = "(x + 4)(x - 1)";
  q.answerKey.diagnostics = { ...q.answerKey.diagnostics, itemKind: "FACTORISE", expression, skillId: "FAC_MONIC_TRINOMIAL", level: "hard",
    predictedMistakes: [{ answer: "(x - 4)(x + 1)", mistake: "SIGNS_SWAPPED" }, { answer: "(x + 2)(x - 2)", mistake: "WRONG_FACTOR_PAIR_SUM" }] };
  q.game = buildLotusGame(q, kind);
  assert.ok(q.game, "the game is built from the checked question");
  return service.get(started.sessionId);
}

function playRight(game: NonNullable<LotusSessionView["currentQuestion"]>["game"]): LotusGameResponse {
  const canonical = "(x+4)(x-1)";
  const norm = (t: string) => t.replace(/\s/g, "");
  if (game!.kind === "TWO_NUMBERS") return { kind: "TWO_NUMBERS", tries: [{ p: 1, q: 1 }, { p: 4, q: -1 }], final: { p: 4, q: -1 } };
  if (game!.kind === "SPLIT_CONFIDENCE") return { kind: "SPLIT_CONFIDENCE", counts: game!.options.map((o) => (norm(o) === canonical ? 4 : 0)) };
  if (game!.kind === "TWO_MOVES") return { kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["+", "-"] };
  if (game!.kind === "FOUR_SIGNS") return { kind: "FOUR_SIGNS", picks: game!.cases.map((c) => ({ "x^2 + 5x + 4": ["+", "+"], "x^2 - 5x + 4": ["-", "-"], "x^2 + 3x - 4": ["-", "+"], "x^2 - 3x - 4": ["+", "-"] } as Record<string, ["+" | "-", "+" | "-"]>)[c]!) };
  if (game!.kind === "EDIT_HISTORY") return { kind: "EDIT_HISTORY", history: [{ t: 900, v: "(x - 4)(x + 1)" }, { t: 1500, v: "(x" }, { t: 3000, v: "(x + 4)(x - 1)" }] };
  if (game!.kind === "COMMIT_THEN_CHOOSE") return { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: game!.options.findIndex((o) => norm(o) === canonical) };
  return { kind: "TRUE_FALSE", verdicts: game!.claims.map((c) => (norm(c) === canonical || norm(c) === "(x-1)(x+4)" ? "true" : "false")) };
}

describe("themed games through a whole session", () => {
  for (const kind of LOTUS_GAME_KINDS) {
    it(`${kind}: issued without a key, then marked like a typed answer with the reading kept`, async () => {
      const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
      services.push(service);
      const view = await sessionWithGame(service, "demo_aarav", kind);
      const game = view.currentQuestion!.game!;
      assert.equal(game.kind, kind);
      assert.equal(view.currentQuestion!.answerKey.canonicalAnswer, "", "no answer key reaches the browser");
      assert.doesNotMatch(JSON.stringify(view.currentQuestion), /SIGNS_SWAPPED|WRONG_FACTOR_PAIR_SUM/);

      const wire = { answer: "ignored", working: "", confidence: 60, responseTimeMs: 30_000, didNotKnow: false, submissionId: `games-${kind}`,
        questionId: view.currentQuestion!.id, nextQuestionId: view.upcomingQuestions?.[0]?.id, game: playRight(game) };
      const next = await service.answer(view.sessionId, "demo_aarav", wire);
      await flush();
      const audit = internal(service, next.sessionId).audits.find((a: { question: { id: string } }) => a.question.id === view.currentQuestion!.id);
      assert.ok(audit, "the game question was recorded");
      assert.equal(audit.response.gameReading.kind, kind);
      assert.equal(audit.response.gameReading.skillId, "FAC_MONIC_TRINOMIAL");
      assert.equal(audit.verification.status, "VERIFIED_CORRECT", "the right play is marked correct by the algebra engine");
      assert.ok(["(x+4)(x-1)", "(x-1)(x+4)"].includes(audit.response.answer.replace(/\s/g, "")));

      // While the test runs, the browser's copy of that past turn carries no reading.
      const live = await service.get(next.sessionId);
      if (live.status === "ACTIVE") assert.equal(live.audits[0]!.response?.gameReading, undefined);

      // The same submission sent again is accepted and records nothing new.
      const again = await service.answer(view.sessionId, "demo_aarav", wire);
      assert.equal(again.audits.length, next.audits.length);
    });
  }

  it("a wrong play is marked wrong, and a tampered or misplaced payload is refused with the question left open", async () => {
    const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
    services.push(service);
    const view = await sessionWithGame(service, "demo_aarav", "TWO_NUMBERS");
    const base = { answer: "x", working: "", confidence: 60, responseTimeMs: 1000, didNotKnow: false, questionId: view.currentQuestion!.id };
    await assert.rejects(service.answer(view.sessionId, "demo_aarav", { ...base, submissionId: "bad-1", game: { kind: "TWO_NUMBERS", tries: [], final: { p: 0, q: 3 } } }));
    await assert.rejects(service.answer(view.sessionId, "demo_aarav", { ...base, submissionId: "bad-2", game: { kind: "TRUE_FALSE", verdicts: ["true"] } }));
    assert.equal(internal(service, view.sessionId).currentQuestion.id, view.currentQuestion!.id, "a refused play leaves the question open");
    const wrong = await service.answer(view.sessionId, "demo_aarav", { ...base, submissionId: "wrong-1", game: { kind: "TWO_NUMBERS", tries: [], final: { p: -4, q: 1 } } });
    await flush();
    const audit = internal(service, wrong.sessionId).audits[0];
    assert.equal(audit.verification.status, "VERIFIED_INCORRECT");
    assert.ok(audit.response.gameReading.signals.includes("final_flip"));
  });
});
