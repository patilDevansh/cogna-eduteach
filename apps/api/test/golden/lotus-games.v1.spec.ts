import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOTUS_THEMES, type LotusGameResponse, type LotusQuestion, type LotusStudentResponse } from "@cogna/shared";
import { buildLotusGame, chooseLotusGame, parseMonicPair, readLotusGame } from "../../src/lotus/lotus-games";
import { resolveLotusResponse, TileAnswerError, withLotusInteraction } from "../../src/lotus/lotus-interactions";
import { instantVerdict } from "../../src/lotus/lotus-factorisation";

// x² + 3x − 4 = (x + 4)(x − 1): product −4, sum 3.
function question(id = "games-1", level: "easy" | "medium" | "hard" = "medium"): LotusQuestion {
  const expression = "x^2 + 3x - 4";
  return { id, phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "(x + 4)(x - 1)", workedSolution: ["Find two numbers"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_MONIC_TRINOMIAL", taggedSkills: [], stepSkills: ["FAC_MONIC_TRINOMIAL"], level, origin: "AI",
        predictedMistakes: [
          { answer: "(x - 4)(x + 1)", mistake: "SIGNS_FLIPPED" },
          { answer: "(x + 2)(x - 2)", mistake: "PRODUCT_ONLY" },
        ] } } };
}
function withGame(kind: "TWO_NUMBERS" | "COMMIT_THEN_CHOOSE" | "TRUE_FALSE", id = "games-1"): LotusQuestion {
  const q = question(id);
  q.game = buildLotusGame(q, kind);
  assert.ok(q.game, `${kind} should build`);
  return q;
}
const base = (): LotusStudentResponse => ({ answer: "forged", working: "", confidence: 60, responseTimeMs: 20000, didNotKnow: false });
const play = (q: LotusQuestion, game: unknown, extra: Partial<LotusStudentResponse> = {}) => resolveLotusResponse(q, { ...base(), ...extra, game: game as LotusGameResponse });
const status = (q: LotusQuestion, r: LotusStudentResponse) => instantVerdict(q, r).verification.status;

describe("Lotus themed games: issuing", () => {
  it("builds all three games from the checked question and shows no answer", () => {
    const two = buildLotusGame(question(), "TWO_NUMBERS")!;
    assert.equal(two.kind, "TWO_NUMBERS");
    assert.equal(JSON.stringify(two).includes("(x"), false, "Two numbers carries no answer");
    const commit = buildLotusGame(question(), "COMMIT_THEN_CHOOSE")!;
    assert.equal(commit.kind === "COMMIT_THEN_CHOOSE" && commit.options.length >= 3 && commit.options.length <= 4, true);
    const tf = buildLotusGame(question(), "TRUE_FALSE")!;
    assert.equal(tf.kind === "TRUE_FALSE" && tf.claims.length >= 3, true);
    for (const game of [two, commit, tf]) assert.doesNotMatch(JSON.stringify(game), /canonical|correct|mistake|truth|answer|FLIPPED|PRODUCT_ONLY/i);
  });
  it("is deterministic for a question and keeps options unique", () => {
    assert.deepEqual(buildLotusGame(question(), "COMMIT_THEN_CHOOSE"), buildLotusGame(question(), "COMMIT_THEN_CHOOSE"));
    const commit = buildLotusGame(question(), "COMMIT_THEN_CHOOSE")!;
    if (commit.kind === "COMMIT_THEN_CHOOSE") {
      const keys = commit.options.map((o) => { const p = parseMonicPair(o)!; return [p.p, p.q].sort((a, b) => a - b).join(","); });
      assert.equal(new Set(keys).size, keys.length);
      assert.ok(commit.options.includes("(x + 4)(x - 1)"), "the checked answer is one of the options");
    }
  });
  it("only applies to a monic two-bracket factorisation", () => {
    const q = question();
    q.answerKey.canonicalAnswer = "2(x + 3)";
    for (const kind of ["TWO_NUMBERS", "COMMIT_THEN_CHOOSE", "TRUE_FALSE"] as const) assert.equal(buildLotusGame(q, kind), undefined);
  });
  it("installs through the same hook as the tile games and honours the kill switches", () => {
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const q = question(`pick-${i}`, "easy");
      const game = chooseLotusGame(q, { turn: 2, repurposed: false }, {});
      if (game) seen++;
      assert.deepEqual(game, chooseLotusGame(question(`pick-${i}`, "easy"), { turn: 2, repurposed: false }, {}));
      assert.equal(chooseLotusGame(q, { turn: 3, repurposed: false }, {}), undefined, "odd coverage turns stay typed or tiles");
      assert.equal(chooseLotusGame(q, { turn: 2, repurposed: false }, { COGNA_THEMED_GAMES: "off" }), undefined);
      assert.equal(chooseLotusGame(q, { turn: 2, repurposed: false }, { COGNA_GAME_FORMATS: "off" }), undefined);
    }
    assert.ok(seen > 5 && seen < 35, `about half of the eligible items become a game (saw ${seen})`);
    const installed = Array.from({ length: 40 }, (_, i) => withLotusInteraction(question(`pick-${i}`, "easy"), { turn: 2, repurposed: false }, {})).find((q) => q.game)!;
    assert.equal(installed.asksForWorking, false);
    assert.equal(installed.interaction, undefined);
  });
});

describe("Lotus themed games: the answer is rebuilt on the server", () => {
  it("TWO_NUMBERS: marks the locked-in pair, ignoring the typed answer", () => {
    const q = withGame("TWO_NUMBERS");
    const right = play(q, { kind: "TWO_NUMBERS", tries: [{ p: 4, q: -1 }], final: { p: -1, q: 4 } });
    assert.equal(status(q, right), "VERIFIED_CORRECT");
    const wrong = play(q, { kind: "TWO_NUMBERS", tries: [], final: { p: -4, q: 1 } });
    assert.equal(status(q, wrong), "VERIFIED_INCORRECT");
    assert.equal(wrong.answer, "(x - 4)(x + 1)");
  });
  it("COMMIT_THEN_CHOOSE: marks the chosen option", () => {
    const q = withGame("COMMIT_THEN_CHOOSE");
    const options = (q.game as { options: string[] }).options;
    const right = play(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: options.indexOf("(x + 4)(x - 1)") });
    assert.equal(status(q, right), "VERIFIED_CORRECT");
    const wrong = play(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: options.indexOf("(x - 4)(x + 1)") });
    assert.equal(status(q, wrong), "VERIFIED_INCORRECT");
  });
  it("TRUE_FALSE: a false claim called true is the answer given; the true ones called true are the right answer", () => {
    const q = withGame("TRUE_FALSE");
    const claims = (q.game as { claims: string[] }).claims;
    const truth = claims.map((c) => ["(x + 4)(x - 1)", "(x - 1)(x + 4)"].includes(c));
    const verdicts = (f: (isTrue: boolean, i: number) => string) => claims.map((_, i) => f(truth[i]!, i));
    assert.equal(status(q, play(q, { kind: "TRUE_FALSE", verdicts: verdicts((t) => (t ? "true" : "false")) })), "VERIFIED_CORRECT");
    const believes = play(q, { kind: "TRUE_FALSE", verdicts: verdicts((t, i) => (t ? "true" : i === claims.findIndex((c) => c === "(x - 4)(x + 1)") ? "true" : "false")) });
    assert.equal(believes.answer, "(x - 4)(x + 1)");
    assert.equal(status(q, believes), "VERIFIED_INCORRECT");
    const none = play(q, { kind: "TRUE_FALSE", verdicts: verdicts(() => "false") });
    assert.equal(none.didNotKnow, false);
    assert.notEqual(status(q, none), "VERIFIED_CORRECT");
    const unsure = play(q, { kind: "TRUE_FALSE", verdicts: verdicts(() => "unsure") });
    assert.equal(unsure.didNotKnow, true);
  });
});

describe("Lotus themed games: the reading is the same in every theme", () => {
  const scenarios: Array<[string, "TWO_NUMBERS" | "COMMIT_THEN_CHOOSE" | "TRUE_FALSE", (q: LotusQuestion) => unknown]> = [
    ["a search that tried the sign-flipped pair then fixed it", "TWO_NUMBERS", () => ({ kind: "TWO_NUMBERS", tries: [{ p: 1, q: 1, atMs: 900 }, { p: -4, q: 1, atMs: 3000 }, { p: 4, q: -1, atMs: 6000 }], final: { p: 4, q: -1 } })],
    ["a guess then a pick", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: -4, q: 1 }, pick: (q.game as { options: string[] }).options.indexOf("(x - 4)(x + 1)"), chooseMs: 4000 })],
    ["eight verdicts", "TRUE_FALSE", (q) => ({ kind: "TRUE_FALSE", verdicts: (q.game as { claims: string[] }).claims.map((c, i) => (i % 2 ? "true" : c.includes("- 4") ? "unsure" : "false")), cardMs: (q.game as { claims: string[] }).claims.map((_, i) => 1200 + i * 700) })],
  ];
  for (const [name, kind, payload] of scenarios) {
    it(`reads ${name} identically in all four themes`, () => {
      const q = withGame(kind);
      const readings = LOTUS_THEMES.map((theme) => {
        const sent = { ...(payload(q) as object), theme } as unknown as LotusGameResponse;
        const r = resolveLotusResponse(q, { ...base(), game: sent });
        assert.equal(JSON.stringify(r).includes(theme), false, "the theme never reaches the stored response");
        return { answer: r.answer, game: r.game, reading: r.gameReading };
      });
      for (const r of readings) assert.deepEqual(r, readings[0]);
      assert.ok(readings[0]!.reading!.summary.length > 10);
      assert.equal(readings[0]!.reading!.skillId, "FAC_MONIC_TRINOMIAL");
    });
  }
});

describe("Lotus themed games: what the readers notice", () => {
  it("TWO_NUMBERS names a corrected sign slip, a systematic search and trial and error", () => {
    const q = withGame("TWO_NUMBERS");
    const slip = readLotusGame(q, { kind: "TWO_NUMBERS", tries: [{ p: -4, q: 1 }, { p: 4, q: -1 }], final: { p: 4, q: -1 } }).reading;
    assert.ok(slip.signals.includes("hit_sign_slip") && slip.signals.includes("fixed_sign_slip") && slip.signals.includes("final_right"));
    const straight = readLotusGame(q, { kind: "TWO_NUMBERS", tries: [{ p: 4, q: -1 }], final: { p: 4, q: -1 } }).reading;
    assert.ok(straight.signals.includes("straight_there"));
    assert.equal(straight.certainty, 0.95);
    const hunt = readLotusGame(q, { kind: "TWO_NUMBERS", tries: [{ p: 1, q: 1 }, { p: 2, q: 3 }, { p: 5, q: 5 }, { p: 4, q: -1 }], final: { p: 4, q: -1 } }).reading;
    assert.ok(hunt.signals.includes("trial_and_error"));
    const systematic = readLotusGame(q, { kind: "TWO_NUMBERS", tries: [{ p: 1, q: -4 }, { p: 2, q: -2 }, { p: 4, q: -1 }], final: { p: 4, q: -1 } }).reading;
    assert.ok(systematic.signals.includes("systematic_search"));
    const prod = readLotusGame(q, { kind: "TWO_NUMBERS", tries: [], final: { p: 2, q: -2 } }).reading;
    assert.ok(prod.signals.includes("final_prod"));
  });
  it("COMMIT_THEN_CHOOSE tells predicting from checking the options", () => {
    const q = withGame("COMMIT_THEN_CHOOSE");
    const options = (q.game as { options: string[] }).options;
    const at = (text: string) => options.indexOf(text);
    assert.ok(readLotusGame(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: at("(x + 4)(x - 1)") }).reading.signals.includes("predicted_then_picked"));
    assert.ok(readLotusGame(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 1, q: 1 }, pick: at("(x + 4)(x - 1)") }).reading.signals.includes("checked_options"));
    assert.ok(readLotusGame(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: -4, q: 1 }, pick: at("(x - 4)(x + 1)") }).reading.signals.includes("same_mistake_twice"));
    assert.ok(readLotusGame(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: at("(x - 4)(x + 1)") }).reading.signals.includes("changed_a_right_guess"));
    assert.ok(readLotusGame(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 2, q: 3 }, pick: at("(x - 4)(x + 1)") }).reading.signals.includes("guess_and_pick_disagree"));
  });
  it("TRUE_FALSE groups false claims by the mistake they test and flags a missed control", () => {
    const q = withGame("TRUE_FALSE");
    const claims = (q.game as { claims: string[] }).claims;
    const verdicts = claims.map((c) => (c === "(x - 4)(x + 1)" ? "true" : "false"));
    const r = readLotusGame(q, { kind: "TRUE_FALSE", verdicts: verdicts as never }).reading;
    assert.ok(r.signals.some((s) => s.includes("SIGNS_FLIPPED")), "the family is the predicted mistake");
    assert.ok(r.signals.includes("missed_control"), "calling both true claims false is flagged");
    assert.equal(r.certainty, 0.75);
  });
});

describe("Lotus themed games: tampered payloads are rejected", () => {
  const rejects = (q: LotusQuestion, game: unknown) => assert.throws(() => play(q, game), TileAnswerError);
  it("TWO_NUMBERS", () => {
    const q = withGame("TWO_NUMBERS");
    const range = (q.game as { range: number }).range;
    rejects(q, { kind: "TWO_NUMBERS", tries: [], final: { p: 0, q: 3 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: [], final: { p: range + 1, q: 3 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: [], final: { p: 1.5, q: 3 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: [], final: { p: "4", q: 3 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: [{ p: 99, q: 1 }], final: { p: 4, q: -1 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: Array.from({ length: 41 }, () => ({ p: 1, q: 1 })), final: { p: 4, q: -1 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: "lots", final: { p: 4, q: -1 } });
    rejects(q, { kind: "TWO_NUMBERS", tries: [] });
  });
  it("COMMIT_THEN_CHOOSE", () => {
    const q = withGame("COMMIT_THEN_CHOOSE");
    rejects(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: 99 });
    rejects(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: -1 });
    rejects(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: 0.5 });
    rejects(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 0, q: -1 }, pick: 0 });
    rejects(q, { kind: "COMMIT_THEN_CHOOSE", pick: 0 });
  });
  it("TRUE_FALSE", () => {
    const q = withGame("TRUE_FALSE");
    const n = (q.game as { claims: string[] }).claims.length;
    rejects(q, { kind: "TRUE_FALSE", verdicts: Array(n - 1).fill("true") });
    rejects(q, { kind: "TRUE_FALSE", verdicts: Array(n + 1).fill("true") });
    rejects(q, { kind: "TRUE_FALSE", verdicts: Array(n).fill("maybe") });
    rejects(q, { kind: "TRUE_FALSE", verdicts: Array(n).fill(true) });
    rejects(q, { kind: "TRUE_FALSE", verdicts: Array(n).fill(null) });
    rejects(q, { kind: "TRUE_FALSE", verdicts: "true" });
  });
  it("a payload for a different game, or for a question that is not a game, is rejected", () => {
    const q = withGame("TWO_NUMBERS");
    rejects(q, { kind: "TRUE_FALSE", verdicts: ["true"] });
    rejects(q, { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: 0 });
    rejects(question(), { kind: "TWO_NUMBERS", tries: [], final: { p: 4, q: -1 } });
    assert.equal(play(q, null).game, undefined, "no game payload means a typed answer, which is still marked normally");
  });
  it("a forged reading is discarded and a game payload is dropped when the student says they do not know", () => {
    const q = withGame("TWO_NUMBERS");
    const forged = { gameReading: { kind: "TWO_NUMBERS", summary: "Perfect", signals: ["final_right"], certainty: 1, skillId: "X", facts: {} } };
    const r = play(q, { kind: "TWO_NUMBERS", tries: [], final: { p: -4, q: 1 } }, forged as Partial<LotusStudentResponse>);
    assert.notEqual(r.gameReading?.summary, "Perfect");
    assert.ok(r.gameReading?.signals.includes("final_flip"));
    const dk = play(q, { kind: "TWO_NUMBERS", tries: [], final: { p: 4, q: -1 } }, { didNotKnow: true, answer: "I don't know", ...forged } as Partial<LotusStudentResponse>);
    assert.equal(dk.game, undefined);
    assert.equal(dk.gameReading, undefined);
  });
  it("a replayed submission resolves to the same stored response", () => {
    const q = withGame("COMMIT_THEN_CHOOSE");
    const game = { kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: 1, chooseMs: 1234.7 };
    assert.deepEqual(play(q, game), play(q, game));
  });
});
