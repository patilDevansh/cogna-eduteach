/**
 * A whole factorisation session through LotusService with the free fake model:
 * a themed game is issued by the server, played, and its answer is rebuilt and
 * marked by the same code as a typed answer. No network, no cost.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOTUS_GAME_KINDS, type LotusGameKind, type LotusGameResponse, type LotusSessionView } from "@cogna/shared";
import { buildLotusGame, parseMonicPair } from "../../src/lotus/lotus-games";
import { codeGameProbeFor } from "../../src/lotus/lotus-game-probes";
import { tagRapidOption, validBs } from "../../src/lotus/lotus-games-more";
import { FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";
import { foldLedger } from "../../src/lotus/lotus-factorisation";
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
  if (game!.kind === "READBACK") return { kind: "READBACK", history: [{ t: 900, v: "x+4(x-1)" }, { t: 2500, v: "(x + 4)(x - 1)" }], tookSuggestion: true };
  if (game!.kind === "RECTANGLE") throw new Error("tiles are played on a positive trinomial");
  if (game!.kind === "EDIT_HISTORY") return { kind: "EDIT_HISTORY", history: [{ t: 900, v: "(x - 4)(x + 1)" }, { t: 1500, v: "(x" }, { t: 3000, v: "(x + 4)(x - 1)" }] };
  if (game!.kind === "COMMIT_THEN_CHOOSE") return { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: game!.options.findIndex((o) => norm(o) === canonical) };
  return { kind: "TRUE_FALSE", verdicts: game!.claims.map((c) => (norm(c) === canonical || norm(c) === "(x-1)(x+4)" ? "true" : "false")) };
}

describe("themed games through a whole session", () => {
  for (const kind of LOTUS_GAME_KINDS.filter((k) => ["TWO_NUMBERS", "COMMIT_THEN_CHOOSE", "TRUE_FALSE", "SPLIT_CONFIDENCE", "TWO_MOVES", "FOUR_SIGNS", "EDIT_HISTORY", "READBACK"].includes(k))) {
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

  it("two slips that cancel: marked right, but a later question checks the skill", async () => {
    const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
    services.push(service);
    const view = await sessionWithGame(service, "demo_aarav", "TWO_MOVES");
    const next = await service.answer(view.sessionId, "demo_aarav", {
      answer: "ignored", working: "", confidence: 60, responseTimeMs: 30_000, didNotKnow: false, submissionId: "cancels", questionId: view.currentQuestion!.id,
      nextQuestionId: view.upcomingQuestions?.[0]?.id, game: { kind: "TWO_MOVES", numbers: { n1: -4, n2: 1 }, signs: ["+", "-"] },
    });
    await flush();
    const state = internal(service, next.sessionId);
    const audit = state.audits[0];
    assert.equal(audit.verification.status, "VERIFIED_CORRECT");
    assert.deepEqual(audit.skillEvidence.map((e: { kind: string; mistake?: string }) => [e.kind, e.mistake]), [["MISTAKE", "SIGN_PAIR_ERROR"]]);
    assert.equal(audit.analysisStatus, "NOT_REQUIRED", "code settled it; no AI review");
    assert.equal(audit.reasonCheck, undefined);
    assert.equal(foldLedger(state.audits).get("FAC_MONIC_TRINOMIAL")?.state, "SUSPECTED");
    // Either a turn repurposed to check it, or a planned question on the skill that the plan now keeps for that.
    const f = state.factorisation;
    const check = f.state.turns.find((t: { turn: number; forSkill?: string; status: string }) => t.turn > f.state.planTurn && t.status !== "SKIPPED"
      && (t.forSkill === "FAC_MONIC_TRINOMIAL" || f.versions[String(t.turn)]?.some((v: { answerKey: { diagnostics?: { skillId?: string } } }) => v.answerKey.diagnostics?.skillId === "FAC_MONIC_TRINOMIAL")));
    assert.ok(check, "a later turn checks the skill");
  });

  it("the same answers, played soundly or with slips that cancel, end in different diagnoses", async () => {
    process.env.LOTUS_E2E_FAKE_MODEL = "true";
    const runWhole = async (studentId: string, slips: boolean) => {
      const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
      services.push(service);
      const started = await service.start(studentId, "FACTORISATION");
      let view = started;
      for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
      let plays = 0;
      for (let turn = 0; turn < 30 && view.status === "ACTIVE"; turn += 1) {
        await flush();
        view = await service.get(started.sessionId);
        if (view.status !== "ACTIVE" || !view.currentQuestion) continue;
        const q = internal(service, started.sessionId).currentQuestion;
        const pair = q.answerKey.diagnostics?.skillId === "FAC_MONIC_TRINOMIAL" && q.answerKey.diagnostics.itemKind === "FACTORISE" ? parseMonicPair(q.answerKey.canonicalAnswer) : null;
        const base = { working: "", confidence: 60, responseTimeMs: 40_000, didNotKnow: false, submissionId: `whole-${studentId}-${turn}`, questionId: view.currentQuestion.id, nextQuestionId: view.upcomingQuestions?.[0]?.id };
        if (pair) {
          // Play every trinomial as two moves: the numbers either way round in sign, the brackets always right.
          delete q.interaction; delete q.presentation;
          q.game = buildLotusGame(q, "TWO_MOVES");
          plays += 1;
          const sign = (n: number) => (n < 0 ? "-" : "+") as "+" | "-";
          const numbers = slips ? { n1: -pair.p, n2: -pair.q } : { n1: pair.p, n2: pair.q };
          view = await service.answer(started.sessionId, studentId, { ...base, answer: "ignored", game: { kind: "TWO_MOVES", numbers, signs: [sign(pair.p), sign(pair.q)] } });
        } else {
          const fill = await service.demoFill(started.sessionId, studentId);
          view = await service.answer(started.sessionId, studentId, { ...base, answer: fill.answer, working: fill.working });
        }
      }
      await flush();
      const final = internal(service, started.sessionId);
      return { plays, status: final.status, marks: final.audits.filter((a: { response?: { game?: { kind: string } } }) => a.response?.game?.kind === "TWO_MOVES").map((a: { verification: { status: string } }) => a.verification.status), skill: foldLedger(final.audits).get("FAC_MONIC_TRINOMIAL"), report: final.finalReport };
    };
    const sound = await runWhole("demo_e2esound", false);
    const slips = await runWhole("demo_e2eslips", true);
    assert.ok(sound.plays >= 2 && slips.plays >= 2, `the plan reaches trinomials more than once (${sound.plays}, ${slips.plays})`);
    for (const run of [sound, slips]) assert.ok(run.marks.every((m: string) => m === "VERIFIED_CORRECT"), "the marks are the same: every answer is right");
    assert.equal(sound.skill?.state, "SECURE");
    assert.equal(slips.skill?.state, "CONFIRMED");
    assert.ok(slips.skill?.mistakes.includes("SIGN_PAIR_ERROR"));
    const inReport = (run: typeof sound) => run.report?.skills?.find((s: { skillId: string }) => s.skillId === "FAC_MONIC_TRINOMIAL")?.state;
    assert.equal(inReport(slips), "CONFIRMED", "the report shows the gap though every answer was right");
    assert.notEqual(inReport(sound), "CONFIRMED");
    delete process.env.LOTUS_E2E_FAKE_MODEL;
  });

  it("the plan asks the game questions itself, and each plays through the whole path", async () => {
    const start = async (studentId: string) => {
      const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
      services.push(service);
      const started = await service.start(studentId, "FACTORISATION");
      let view = started;
      for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
      return { service, id: started.sessionId };
    };
    // 1. The plan itself: with every game on, the slots those games fill hold them.
    const planned = await start("demo_aarav");
    const f = internal(planned.service, planned.id).factorisation;
    const kinds = new Set<string>((Object.values(f.versions).flat() as Array<{ game?: { kind: string } }>).map((q) => q.game?.kind ?? ""));
    assert.ok(kinds.has("FIND_EVERY_B"), "the pair-product-sum slot holds Find every b");
    assert.ok(kinds.has("TEST_CLAIM") || kinds.has("REPLAY"), "the checking-by-expanding slot holds a game");
    assert.ok(kinds.has("RAPID_SET") || kinds.has("CHUNK_IT"), "the difference-of-squares slot holds a game");

    // 2. Each game question, played to its right answer through service.answer.
    const spec = (slot: number) => FACTORISATION_SLOTS.find((s) => s.slot === slot)!;
    const make = (kind: string, slot: number) => {
      for (let i = 0; i < 80; i++) { const item = codeGameProbeFor({ spec: spec(slot), purpose: "BASE", variation: `svc${i}`, avoid: [] }, { COGNA_THEMED_GAMES: "all" }); if (item?.game?.kind === kind) return item; }
      throw new Error(`no ${kind}`);
    };
    const tagIndex = (g: { rows: Array<{ q: string; options: string[] }> }, row: number, tag: string) => g.rows[row]!.options.findIndex((o) => tagRapidOption(g.rows[row]!, row === 3, o) === tag);
    const plays: Array<[string, number, (g: any) => unknown]> = [
      ["TEST_CLAIM", 18, (g) => ({ kind: "TEST_CLAIM", tested: [0, 1, 2, 3], verdict: g.options.indexOf("Sometimes true") })],
      ["REPLAY", 18, () => ({ kind: "REPLAY", stopped: 2, lateMs: 800 })],
      ["FIND_EVERY_B", 12, (g) => ({ kind: "FIND_EVERY_B", picked: validBs(g.c) })],
      ["RAPID_SET", 10, (g) => ({ kind: "RAPID_SET", picks: [0, 1, 2].map((r) => tagIndex(g, r, "right")).concat(tagIndex(g, 3, "right")), times: [3000, 3000, 3000, 6000] })],
      ["CHUNK_IT", 10, (g) => ({ kind: "CHUNK_IT", route: g.routes.findIndex((r: { lines: string[] }) => /^A\^2/.test(r.lines[1]!)) })],
    ];
    for (const [kind, slot, right] of plays) {
      const { service, id } = await start("demo_aarav");
      const item = make(kind, slot);
      const q = internal(service, id).currentQuestion;
      for (const key of Object.keys(q)) if (key !== "id") delete q[key];
      Object.assign(q, structuredClone(item));
      const shown = await service.get(id);
      assert.equal(shown.currentQuestion!.game!.kind, kind);
      assert.equal(shown.currentQuestion!.answerKey.canonicalAnswer, "", "no answer key reaches the browser");
      const next = await service.answer(id, "demo_aarav", { answer: "ignored", working: "", confidence: 60, responseTimeMs: 30_000, didNotKnow: false, submissionId: `more-${kind}`,
        questionId: shown.currentQuestion!.id, nextQuestionId: shown.upcomingQuestions?.[0]?.id, game: right(item.game) as never });
      await flush();
      const audit = internal(service, next.sessionId).audits[0];
      assert.equal(audit.verification.status, "VERIFIED_CORRECT", kind);
      assert.equal(audit.response.gameReading.kind, kind);
      assert.equal(audit.analysisStatus, "NOT_REQUIRED", `${kind}: code settles it`);
      assert.equal((await service.get(next.sessionId)).audits[0]?.response?.gameReading, undefined, "the student's copy hides the reading");
    }
  });

  it("Read it to me doesn't read out a rapid set's last row", async () => {
    const spec = FACTORISATION_SLOTS.find((s) => s.slot === 10)!;
    const item = Array.from({ length: 60 }, (_, i) => codeGameProbeFor({ spec, purpose: "BASE", variation: `aloud-${i}`, avoid: [] }, { COGNA_THEMED_GAMES: "all" })).find((c) => c?.game?.kind === "RAPID_SET")!;
    const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
    services.push(service);
    const started = await service.start("demo_aarav", "FACTORISATION");
    const id = started.sessionId;
    let view = started;
    for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(id); }
    const q = internal(service, id).currentQuestion;
    for (const key of Object.keys(q)) if (key !== "id") delete q[key];
    Object.assign(q, structuredClone(item));
    const text = await service.readAloudText(id, "demo_aarav");
    assert.equal(text, item.prompt);
  });

  it("Tiles: a positive trinomial played through the whole path", async () => {
    const service = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, createPersonalizedVideoMemoryDb() as never);
    services.push(service);
    const started = await service.start("demo_aarav", "FACTORISATION");
    let view = started;
    for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
    const q = internal(service, started.sessionId).currentQuestion;
    q.prompt = "Factorise completely: x^2 + 5x + 6"; q.type = "CONSTRUCTED_RESPONSE";
    delete q.options; delete q.interaction; delete q.presentation;
    q.answerKey.canonicalAnswer = "(x + 2)(x + 3)";
    q.answerKey.diagnostics = { ...q.answerKey.diagnostics, itemKind: "FACTORISE", expression: "x^2 + 5x + 6", skillId: "FAC_MONIC_TRINOMIAL", level: "easy",
      predictedMistakes: [{ answer: "(x + 1)(x + 6)", mistake: "WRONG_FACTOR_PAIR_SUM" }] };
    q.game = buildLotusGame(q, "RECTANGLE");
    const shown = await service.get(started.sessionId);
    assert.deepEqual(shown.currentQuestion!.game, { version: 1, kind: "RECTANGLE", expression: "x^2 + 5x + 6", strips: 5, units: 6 });
    const next = await service.answer(started.sessionId, "demo_aarav", { answer: "ignored", working: "", confidence: 60, responseTimeMs: 30_000, didNotKnow: false, submissionId: "tiles-1",
      questionId: shown.currentQuestion!.id, nextQuestionId: shown.upcomingQuestions?.[0]?.id, game: { kind: "RECTANGLE", tries: [1, 2], final: 2 } });
    await flush();
    const audit = internal(service, next.sessionId).audits[0];
    assert.equal(audit.verification.status, "VERIFIED_CORRECT");
    assert.equal(audit.response.gameReading.diagnosis.effect, "NEEDS_ANOTHER");
    assert.ok(["(x + 2)(x + 3)", "(x + 3)(x + 2)"].includes(audit.response.answer));
  });

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
