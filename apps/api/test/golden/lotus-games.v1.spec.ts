import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findForbiddenTerm, LOTUS_GAME_KINDS, LOTUS_THEMES, type LotusGameKind, type LotusGameResponse, type LotusQuestion, type LotusQuestionAudit, type LotusStudentResponse } from "@cogna/shared";
import { buildLotusGame, chooseLotusGame, parseMonicPair, readLotusGame } from "../../src/lotus/lotus-games";
import { resolveLotusResponse, TileAnswerError, withLotusInteraction } from "../../src/lotus/lotus-interactions";
import { foldLedger, instantVerdict } from "../../src/lotus/lotus-factorisation";

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
function withGame(kind: LotusGameKind, id = "games-1"): LotusQuestion {
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
    for (const kind of LOTUS_GAME_KINDS) assert.doesNotMatch(JSON.stringify(buildLotusGame(question(), kind)), /canonical|correct|mistake|truth|answer|FLIPPED|PRODUCT_ONLY/i);
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
      assert.ok([undefined, "EDIT_HISTORY"].includes(chooseLotusGame(q, { turn: 3, repurposed: false }, {})?.kind), "a typed turn stays typed");
      assert.notEqual(game?.kind, "EDIT_HISTORY", "a typing box never takes a tile game's turn");
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
  const scenarios: Array<[string, LotusGameKind, (q: LotusQuestion) => unknown]> = [
    ["a search that tried the sign-flipped pair then fixed it", "TWO_NUMBERS", () => ({ kind: "TWO_NUMBERS", tries: [{ p: 1, q: 1, atMs: 900 }, { p: -4, q: 1, atMs: 3000 }, { p: 4, q: -1, atMs: 6000 }], final: { p: 4, q: -1 } })],
    ["a guess then a pick", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: -4, q: 1 }, pick: (q.game as { options: string[] }).options.indexOf("(x - 4)(x + 1)"), chooseMs: 4000 })],
    ["a split of four tokens", "SPLIT_CONFIDENCE", (q) => ({ kind: "SPLIT_CONFIDENCE", counts: (q.game as { options: string[] }).options.map((_, i) => (i === 0 ? 3 : i === 1 ? 1 : 0)) })],
    ["two moves", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: -4, n2: 1 }, signs: ["+", "-"] })],
    ["four sign cases", "FOUR_SIGNS", () => ({ kind: "FOUR_SIGNS", picks: [["+", "+"], ["-", "-"], ["+", "+"], ["-", "-"]] })],
    ["an edit history", "EDIT_HISTORY", () => ({ kind: "EDIT_HISTORY", history: [{ t: 500, v: "(x - 4)(x + 1)" }, { t: 4000, v: "(x - 4)" }, { t: 6000, v: "(x + 4)(x - 1)" }] })],
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

describe("Lotus themed games, second batch: issuing", () => {
  it("Four sign cases: only with two different numbers, and the question is one of the four cases", () => {
    const game = buildLotusGame(question(), "FOUR_SIGNS");
    assert.ok(game && game.kind === "FOUR_SIGNS");
    assert.deepEqual(game.numbers, [1, 4]);
    assert.equal(new Set(game.cases).size, 4);
    assert.ok(game.cases.includes("x^2 + 3x - 4"));
    const q = question();
    q.answerKey.canonicalAnswer = "(x - 4)(x + 4)";
    q.answerKey.diagnostics!.expression = "x^2 - 16";
    assert.equal(buildLotusGame(q, "FOUR_SIGNS"), undefined, "x² − 16 has no four distinct cases");
    assert.ok(buildLotusGame(q, "TWO_MOVES"), "but two moves still fits");
  });
  it("Edit history fits any checked factorising question; the two-bracket games don't", () => {
    const q = question();
    q.answerKey.canonicalAnswer = "2(x + 12)";
    q.answerKey.diagnostics!.expression = "2x + 24";
    assert.equal(buildLotusGame(q, "EDIT_HISTORY")?.kind, "EDIT_HISTORY");
    for (const kind of ["TWO_NUMBERS", "SPLIT_CONFIDENCE", "TWO_MOVES", "FOUR_SIGNS"] as const) assert.equal(buildLotusGame(q, kind), undefined);
    q.answerKey.canonicalAnswer = "wrong";
    assert.equal(buildLotusGame(q, "EDIT_HISTORY"), undefined, "an item whose key doesn't check gets no game");
  });
  it("Edit history dresses a typed turn and keeps its working; other items keep their tile game", () => {
    const typed = withLotusInteraction(question("edit-typed", "hard"), { turn: 3, repurposed: false }, { COGNA_THEMED_GAMES: "all" });
    assert.equal(typed.game?.kind, "EDIT_HISTORY");
    assert.equal(typed.asksForWorking, true);
    const other = question("edit-other", "hard");
    other.answerKey.canonicalAnswer = "2(x + 12)";
    other.answerKey.diagnostics!.expression = "2x + 24";
    const tile = withLotusInteraction(other, { turn: 2, repurposed: false }, { COGNA_THEMED_GAMES: "all" });
    assert.equal(tile.game, undefined);
    assert.ok(tile.interaction);
  });
  it("about half of the questions the crossword would take become a game; the rest keep the crossword", () => {
    const placed = Array.from({ length: 60 }, (_, i) => withLotusInteraction(question(`puzzle-${i}`, "medium"), { turn: 3, repurposed: false }, {}));
    const games = placed.filter((q) => q.game).length;
    assert.ok(games > 15 && games < 45, `saw ${games} of 60`);
    for (const q of placed) {
      assert.equal(!!q.game !== !!q.interaction, true, "one or the other, never both");
      if (q.game) { assert.notEqual(q.game.kind, "EDIT_HISTORY", "a typing box never takes a puzzle's turn"); assert.equal(q.asksForWorking, false); }
      else assert.equal(q.interaction?.format, "FACTOR_CROSSWORD");
    }
    assert.equal(withLotusInteraction(question("puzzle-off", "medium"), { turn: 3, repurposed: false }, { COGNA_THEMED_GAMES: "off" }).game, undefined);
  });
  it("sharing tokens replaces the separate how-sure question", () => {
    const pick = Array.from({ length: 200 }, (_, i) => { const q = question(`split-${i}`, "easy"); q.requiresConfidenceProbe = true; return withLotusInteraction(q, { turn: 2, repurposed: true }, {}); }).find((q) => q.game?.kind === "SPLIT_CONFIDENCE");
    assert.ok(pick, "a split game comes up");
    assert.equal(pick!.requiresConfidenceProbe, false);
  });
});

describe("Lotus themed games, second batch: what the readers notice", () => {
  const splitQ = withGame("SPLIT_CONFIDENCE");
  const options = (splitQ.game as { options: string[] }).options;
  const split = (spec: Record<string, number>) => options.map((o) => spec[o] ?? 0);
  it("Split: all on one is confident; the leader is what gets marked", () => {
    const right = play(splitQ, { kind: "SPLIT_CONFIDENCE", counts: split({ "(x + 4)(x - 1)": 4 }) });
    assert.equal(status(splitQ, right), "VERIFIED_CORRECT");
    assert.equal(right.confidence, 90);
    assert.ok(right.gameReading!.signals.includes("confident_right"));
    const wrong = play(splitQ, { kind: "SPLIT_CONFIDENCE", counts: split({ "(x - 4)(x + 1)": 4 }) });
    assert.equal(status(splitQ, wrong), "VERIFIED_INCORRECT");
    assert.ok(wrong.gameReading!.signals.includes("confident_mistake"));
    const mostly = play(splitQ, { kind: "SPLIT_CONFIDENCE", counts: split({ "(x + 4)(x - 1)": 3, "(x - 4)(x + 1)": 1 }) });
    assert.equal(status(splitQ, mostly), "VERIFIED_CORRECT");
    assert.equal(mostly.confidence, 60);
  });
  it("Split: a 2–2 tie with the right answer marks the wrong one and names the doubt", () => {
    const r = play(splitQ, { kind: "SPLIT_CONFIDENCE", counts: split({ "(x + 4)(x - 1)": 2, "(x - 4)(x + 1)": 2 }) });
    assert.equal(r.answer, "(x - 4)(x + 1)");
    assert.equal(status(splitQ, r), "VERIFIED_INCORRECT");
    assert.equal(r.confidence, 25);
    assert.match(r.gameReading!.summary, /signs inside the brackets/);
  });
  it("Split: spread evenly is 'doesn't know yet', not a mistake", () => {
    assert.equal(options.length, 4);
    const r = play(splitQ, { kind: "SPLIT_CONFIDENCE", counts: [1, 1, 1, 1] });
    assert.equal(r.didNotKnow, true);
    assert.ok(r.gameReading!.signals.includes("spread_evenly"));
  });

  const moves = withGame("TWO_MOVES");
  const move = (n1: number, n2: number, s1: string, s2: string) => play(moves, { kind: "TWO_MOVES", numbers: { n1, n2 }, signs: [s1, s2] });
  it("Two moves: tells sound work from two slips that cancel, though both are marked right", () => {
    const sound = move(4, -1, "+", "-");
    assert.ok(sound.gameReading!.signals.includes("sound"));
    assert.equal(status(moves, sound), "VERIFIED_CORRECT");
    const cancel = move(-4, 1, "+", "-");
    assert.ok(cancel.gameReading!.signals.includes("two_slips_cancel"));
    assert.equal(status(moves, cancel), "VERIFIED_CORRECT", "the answer alone is right, which is why the reading matters");
  });
  it("Two moves: names a slip in move 1, a flip in move 2, and numbers that don't fit", () => {
    const slip = move(-4, 1, "-", "+");
    assert.ok(slip.gameReading!.signals.includes("sign_slip_move_1"));
    assert.equal(status(moves, slip), "VERIFIED_INCORRECT");
    const flip = move(4, -1, "-", "+");
    assert.ok(flip.gameReading!.signals.includes("flips_into_brackets"));
    assert.equal(status(moves, flip), "VERIFIED_INCORRECT");
    assert.ok(move(2, 3, "+", "+").gameReading!.signals.includes("move_1_off"));
  });

  const four = withGame("FOUR_SIGNS");
  const cases = (four.game as { cases: string[] }).cases;
  // (x ? 1)(x ? 4): the true signs and the middle/last sign of each case, by its expression.
  const TRUE: Record<string, [string, string]> = { "x^2 + 5x + 4": ["+", "+"], "x^2 - 5x + 4": ["-", "-"], "x^2 + 3x - 4": ["-", "+"], "x^2 - 3x - 4": ["+", "-"] };
  const COPY: Record<string, [string, string]> = { "x^2 + 5x + 4": ["+", "+"], "x^2 - 5x + 4": ["-", "-"], "x^2 + 3x - 4": ["+", "+"], "x^2 - 3x - 4": ["-", "-"] };
  it("Four signs: the real rule, the question is what is marked", () => {
    const r = play(four, { kind: "FOUR_SIGNS", picks: cases.map((c) => TRUE[c]) });
    assert.ok(r.gameReading!.signals.includes("rule_real"));
    assert.equal(r.answer, "(x - 1)(x + 4)");
    assert.equal(status(four, r), "VERIFIED_CORRECT");
  });
  it("Four signs: a wrong rule shows even when some cases come out right", () => {
    const r = play(four, { kind: "FOUR_SIGNS", picks: cases.map((c) => COPY[c]) });
    assert.ok(r.gameReading!.signals.includes("rule_copy_middle"));
    assert.ok(r.gameReading!.signals.includes("rule_hides_in_right_answers"));
    assert.equal(status(four, r), "VERIFIED_INCORRECT");
    const guess = play(four, { kind: "FOUR_SIGNS", picks: cases.map((_, i) => (i % 3 === 0 ? ["-", "+"] : ["+", "-"])) });
    assert.equal(guess.gameReading!.facts.closestRule === "real" && guess.gameReading!.facts.closestScore === 4, false);
  });

  const edit = withGame("EDIT_HISTORY");
  const hist = (...v: Array<[number, string]>) => ({ kind: "EDIT_HISTORY", history: v.map(([t, x]) => ({ t, v: x })) });
  it("Edit history: marks the last text, and notices a caught mistake", () => {
    const r = play(edit, hist([500, "(x - 4)(x + 1)"], [900, "(x - 4)(x +"], [1500, "("], [4000, "(x + 4)(x - 1)"]));
    assert.equal(r.answer, "(x + 4)(x - 1)");
    assert.equal(status(edit, r), "VERIFIED_CORRECT");
    assert.ok(r.gameReading!.signals.includes("caught_own_mistake"));
    assert.ok(r.gameReading!.signals.includes("draft_mistake:SIGNS_FLIPPED"));
    assert.match(r.gameReading!.summary, /signs flipped/);
  });
  it("Edit history: straight through, a known mistake left in, and a long pause", () => {
    assert.ok(play(edit, hist([300, "(x"], [800, "(x + 4)(x - 1)"])).gameReading!.signals.includes("straight_through"));
    const left = play(edit, hist([300, "(x - 4)(x + 1)"]));
    assert.ok(left.gameReading!.signals.includes("final_mistake:SIGNS_FLIPPED"));
    assert.equal(status(edit, left), "VERIFIED_INCORRECT");
    assert.ok(play(edit, hist([9000, "(x + 4)(x - 1)"])).gameReading!.signals.includes("long_pause"));
  });
});

describe("Lotus themed games, second batch: tampered payloads are rejected", () => {
  const rejects = (q: LotusQuestion, game: unknown) => assert.throws(() => play(q, game), TileAnswerError);
  it("SPLIT_CONFIDENCE", () => {
    const q = withGame("SPLIT_CONFIDENCE");
    const n = (q.game as { options: string[] }).options.length;
    rejects(q, { kind: "SPLIT_CONFIDENCE", counts: Array(n).fill(0) });
    rejects(q, { kind: "SPLIT_CONFIDENCE", counts: [4, 4, 0, 0].slice(0, n) });
    rejects(q, { kind: "SPLIT_CONFIDENCE", counts: [5, -1, 0, 0].slice(0, n) });
    rejects(q, { kind: "SPLIT_CONFIDENCE", counts: [1.5, 2.5, 0, 0].slice(0, n) });
    rejects(q, { kind: "SPLIT_CONFIDENCE", counts: [4] });
    rejects(q, { kind: "SPLIT_CONFIDENCE" });
  });
  it("TWO_MOVES", () => {
    const q = withGame("TWO_MOVES");
    rejects(q, { kind: "TWO_MOVES", numbers: { n1: 0, n2: 1 }, signs: ["+", "+"] });
    rejects(q, { kind: "TWO_MOVES", numbers: { n1: 99, n2: 1 }, signs: ["+", "+"] });
    rejects(q, { kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["+"] });
    rejects(q, { kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["+", "x"] });
    rejects(q, { kind: "TWO_MOVES", signs: ["+", "-"] });
  });
  it("FOUR_SIGNS", () => {
    const q = withGame("FOUR_SIGNS");
    rejects(q, { kind: "FOUR_SIGNS", picks: [["+", "+"]] });
    rejects(q, { kind: "FOUR_SIGNS", picks: Array(4).fill(["+", null]) });
    rejects(q, { kind: "FOUR_SIGNS", picks: Array(4).fill(["+"]) });
    rejects(q, { kind: "FOUR_SIGNS", picks: "++" });
  });
  it("EDIT_HISTORY", () => {
    const q = withGame("EDIT_HISTORY");
    rejects(q, { kind: "EDIT_HISTORY", history: [] });
    rejects(q, { kind: "EDIT_HISTORY", history: [{ t: 1, v: "   " }] });
    rejects(q, { kind: "EDIT_HISTORY", history: [{ t: 5, v: "a" }, { t: 1, v: "b" }] });
    rejects(q, { kind: "EDIT_HISTORY", history: [{ t: 1, v: "x".repeat(121) }] });
    rejects(q, { kind: "EDIT_HISTORY", history: Array.from({ length: 401 }, (_, i) => ({ t: i, v: "x" })) });
    rejects(q, { kind: "EDIT_HISTORY", history: [{ t: -1, v: "x" }] });
    rejects(q, { kind: "EDIT_HISTORY", history: [{ t: 1, v: 5 }] });
  });
});

describe("Lotus themed games: the reading counts towards the skill", () => {
  const SKILL = "FAC_MONIC_TRINOMIAL";
  const outcome = (kind: LotusGameKind, build: (q: LotusQuestion) => unknown) => {
    const q = withGame(kind);
    const response = play(q, build(q));
    const verdict = instantVerdict(q, response);
    return { q, response, verdict, status: verdict.verification.status, kinds: verdict.evidence.map((e) => e.kind), mistake: verdict.evidence.find((e) => e.kind !== "SECURE")?.mistake, effect: response.gameReading?.diagnosis?.effect };
  };
  const optionsOf = (q: LotusQuestion) => (q.game as { options: string[] }).options;
  const claimsOf = (q: LotusQuestion) => (q.game as { claims: string[] }).claims;
  const RIGHT = ["(x + 4)(x - 1)", "(x - 1)(x + 4)"];
  const FOUR_TRUE: Record<string, [string, string]> = { "x^2 + 5x + 4": ["+", "+"], "x^2 - 5x + 4": ["-", "-"], "x^2 + 3x - 4": ["-", "+"], "x^2 - 3x - 4": ["+", "-"] };
  const FOUR_COPY: Record<string, [string, string]> = { "x^2 + 5x + 4": ["+", "+"], "x^2 - 5x + 4": ["-", "-"], "x^2 + 3x - 4": ["+", "+"], "x^2 - 3x - 4": ["-", "-"] };
  const claimVerdicts = (q: LotusQuestion, f: (c: string, isRight: boolean) => string) => claimsOf(q).map((c) => f(c, RIGHT.includes(c)));

  const cases: Array<[string, LotusGameKind, (q: LotusQuestion) => unknown, { status: string; effect: string; kinds: string[]; mistake?: string }]> = [
    ["two numbers, straight there", "TWO_NUMBERS", () => ({ kind: "TWO_NUMBERS", tries: [{ p: 4, q: -1 }], final: { p: 4, q: -1 } }), { status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] }],
    ["two numbers, a long hunt", "TWO_NUMBERS", () => ({ kind: "TWO_NUMBERS", tries: [{ p: 1, q: 1 }, { p: 2, q: 3 }, { p: 5, q: 5 }, { p: 4, q: -1 }], final: { p: 4, q: -1 } }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["two numbers, the right product only", "TWO_NUMBERS", () => ({ kind: "TWO_NUMBERS", tries: [], final: { p: 2, q: -2 } }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "PRODUCT_ONLY" }],
    ["commit, right both times", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: optionsOf(q).indexOf("(x + 4)(x - 1)") }), { status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] }],
    ["commit, found by checking", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: 1, q: 1 }, pick: optionsOf(q).indexOf("(x + 4)(x - 1)") }), { status: "VERIFIED_CORRECT", effect: "NO_EVIDENCE", kinds: [] }],
    ["commit, right guess then wrong pick", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: optionsOf(q).indexOf("(x - 4)(x + 1)") }), { status: "VERIFIED_INCORRECT", effect: "NO_EVIDENCE", kinds: [] }],
    ["commit, the same mistake twice", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: -4, q: 1 }, pick: optionsOf(q).indexOf("(x - 4)(x + 1)") }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGNS_FLIPPED" }],
    ["commit, two different wrong answers", "COMMIT_THEN_CHOOSE", (q) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: 2, q: 3 }, pick: optionsOf(q).indexOf("(x - 4)(x + 1)") }), { status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] }],
    ["true or false, every card right", "TRUE_FALSE", (q) => ({ kind: "TRUE_FALSE", verdicts: claimVerdicts(q, (_, r) => (r ? "true" : "false")) }), { status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] }],
    ["true or false, right but unsure on others", "TRUE_FALSE", (q) => ({ kind: "TRUE_FALSE", verdicts: claimVerdicts(q, (_, r) => (r ? "true" : "unsure")) }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["true or false, one form right and the other false", "TRUE_FALSE", (q) => ({ kind: "TRUE_FALSE", verdicts: claimVerdicts(q, (c) => (c === "(x + 4)(x - 1)" ? "true" : "false")) }), { status: "VERIFIED_CORRECT", effect: "NO_EVIDENCE", kinds: [] }],
    ["true or false, believes a wrong claim", "TRUE_FALSE", (q) => ({ kind: "TRUE_FALSE", verdicts: claimVerdicts(q, (c, r) => (r || c === "(x - 4)(x + 1)" ? "true" : "false")) }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGNS_FLIPPED" }],
    ["true or false, nothing called true", "TRUE_FALSE", (q) => ({ kind: "TRUE_FALSE", verdicts: claimVerdicts(q, () => "false") }), { status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] }],
    ["split, all on the right one", "SPLIT_CONFIDENCE", (q) => ({ kind: "SPLIT_CONFIDENCE", counts: optionsOf(q).map((o) => (o === "(x + 4)(x - 1)" ? 4 : 0)) }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["split, leaning to the right one", "SPLIT_CONFIDENCE", (q) => ({ kind: "SPLIT_CONFIDENCE", counts: optionsOf(q).map((o) => (o === "(x + 4)(x - 1)" ? 2 : o === "(x - 4)(x + 1)" || o === "(x + 2)(x - 2)" ? 1 : 0)) }), { status: "VERIFIED_CORRECT", effect: "NO_EVIDENCE", kinds: [] }],
    ["split, all on a wrong one", "SPLIT_CONFIDENCE", (q) => ({ kind: "SPLIT_CONFIDENCE", counts: optionsOf(q).map((o) => (o === "(x - 4)(x + 1)" ? 4 : 0)) }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGNS_FLIPPED" }],
    ["split, leaning to a wrong one", "SPLIT_CONFIDENCE", (q) => ({ kind: "SPLIT_CONFIDENCE", counts: optionsOf(q).map((o) => (o === "(x - 4)(x + 1)" ? 2 : o === "(x + 4)(x - 1)" || o === "(x + 2)(x - 2)" ? 1 : 0)) }), { status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] }],
    ["two moves, sound", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["+", "-"] }), { status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] }],
    ["two moves, two slips that cancel", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: -4, n2: 1 }, signs: ["+", "-"] }), { status: "VERIFIED_CORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_PAIR_ERROR" }],
    ["two moves, flipped into the brackets", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["-", "+"] }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGNS_FLIPPED" }],
    ["two moves, numbers that don't fit", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: 2, n2: 3 }, signs: ["+", "+"] }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "WRONG_FACTOR_PAIR_PRODUCT" }],
    ["four signs, the real rule", "FOUR_SIGNS", (q) => ({ kind: "FOUR_SIGNS", picks: (q.game as { cases: string[] }).cases.map((c) => FOUR_TRUE[c]) }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["four signs, a wrong rule", "FOUR_SIGNS", (q) => ({ kind: "FOUR_SIGNS", picks: (q.game as { cases: string[] }).cases.map((c) => FOUR_COPY[c]) }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_PAIR_ERROR" }],
    ["edit history, a caught mistake", "EDIT_HISTORY", () => ({ kind: "EDIT_HISTORY", history: [{ t: 500, v: "(x - 4)(x + 1)" }, { t: 900, v: "(" }, { t: 3000, v: "(x + 4)(x - 1)" }] }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
  ];
  for (const [name, kind, build, expected] of cases) {
    it(name, () => {
      const r = outcome(kind, build);
      assert.equal(r.status, expected.status);
      assert.equal(r.effect, expected.effect);
      assert.deepEqual([...new Set(r.kinds)], expected.kinds);
      if (expected.mistake) assert.equal(r.mistake, expected.mistake);
      assert.equal(r.verdict.needsAnalysis, false, "code settles a game; it never needs an AI review");
    });
  }

  it("a typed Edit history that adds nothing leaves the marking and any AI review as they were", () => {
    const q = withGame("EDIT_HISTORY");
    const clean = play(q, { kind: "EDIT_HISTORY", history: [{ t: 500, v: "(x + 4)(x - 1)" }] });
    assert.equal(clean.gameReading?.diagnosis, undefined);
    assert.deepEqual(instantVerdict(q, clean).evidence.map((e) => e.kind), instantVerdict(q, { ...base(), answer: "(x + 4)(x - 1)" }).evidence.map((e) => e.kind));
    const unknown = play(q, { kind: "EDIT_HISTORY", history: [{ t: 500, v: "(x + 9)(x - 9)" }] });
    assert.equal(instantVerdict(q, unknown).needsAnalysis, true, "an unexplained typed answer still goes to review");
  });
  it("a code no skill owns is not put on the wrong skill", () => {
    const q = question();
    q.answerKey.canonicalAnswer = "(x - 4)(x + 4)";
    q.answerKey.diagnostics!.expression = "x^2 - 16";
    q.answerKey.diagnostics!.skillId = "FAC_DIFF_SQUARES";
    q.answerKey.diagnostics!.predictedMistakes = [];
    q.game = buildLotusGame(q, "TWO_MOVES");
    const verdict = instantVerdict(q, play(q, { kind: "TWO_MOVES", numbers: { n1: 2, n2: 3 }, signs: ["+", "+"] }));
    assert.deepEqual(verdict.evidence.map((e) => [e.skillId, e.kind, e.mistake]), [["FAC_DIFF_SQUARES", "MISTAKE", undefined]]);
  });

  const audit = (q: LotusQuestion, r: LotusStudentResponse): LotusQuestionAudit => {
    const v = instantVerdict(q, r);
    return { question: q, response: r, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
  };
  const stateAfter = (...plays: Array<[LotusGameKind, unknown]>) => foldLedger(plays.map(([kind, game], i) => {
    const q = withGame(kind, `ledger-${i}`);
    return audit(q, play(q, typeof game === "function" ? (game as (q: LotusQuestion) => unknown)(q) : game));
  })).get(SKILL);
  const sound = { kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["+", "-"] };
  const cancels = { kind: "TWO_MOVES", numbers: { n1: -4, n2: 1 }, signs: ["+", "-"] };
  const hunt = { kind: "TWO_NUMBERS", tries: [{ p: 1, q: 1 }, { p: 2, q: 3 }, { p: 5, q: 5 }, { p: 4, q: -1 }], final: { p: 4, q: -1 } };
  const splitRight = (q: LotusQuestion) => ({ kind: "SPLIT_CONFIDENCE", counts: optionsOf(q).map((o) => (o === "(x + 4)(x - 1)" ? 4 : 0)) });
  const checked = (q: LotusQuestion) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: 1, q: 1 }, pick: optionsOf(q).indexOf("(x + 4)(x - 1)") });
  const predicted = (q: LotusQuestion) => ({ kind: "COMMIT_THEN_CHOOSE", guess: { p: 4, q: -1 }, pick: optionsOf(q).indexOf("(x + 4)(x - 1)") });

  it("the ledger: two slips that cancel raise a suspicion even though the answer was right", () => {
    assert.equal(stateAfter(["TWO_MOVES", sound])?.state, "SECURE");
    const e = stateAfter(["TWO_MOVES", cancels]);
    assert.equal(e?.state, "SUSPECTED");
    assert.deepEqual(e?.mistakes, ["SIGN_PAIR_ERROR"]);
  });
  it("the ledger: a sound answer on the next question clears that suspicion; the same slip again confirms it", () => {
    assert.equal(stateAfter(["TWO_MOVES", cancels], ["TWO_MOVES", sound])?.state, "SECURE");
    assert.equal(stateAfter(["TWO_MOVES", cancels], ["TWO_MOVES", cancels])?.state, "CONFIRMED");
  });
  it("the ledger: a right answer that needs another isn't secure until a second one", () => {
    assert.equal(stateAfter(["TWO_NUMBERS", hunt])?.state, "UNTESTED");
    assert.equal(stateAfter(["SPLIT_CONFIDENCE", splitRight])?.state, "UNTESTED");
    assert.equal(stateAfter(["TWO_NUMBERS", hunt], ["SPLIT_CONFIDENCE", splitRight])?.state, "SECURE");
  });
  it("the ledger: a pick backed by a guess made first counts at once, though it was chosen from options", () => {
    assert.equal(stateAfter(["COMMIT_THEN_CHOOSE", predicted])?.state, "SECURE");
  });
  it("the ledger: right by checking the options says nothing, and doesn't clear a suspicion", () => {
    assert.equal(stateAfter(["COMMIT_THEN_CHOOSE", checked]), undefined);
    assert.equal(stateAfter(["TWO_MOVES", cancels], ["COMMIT_THEN_CHOOSE", checked])?.state, "SUSPECTED");
  });
  it("a play with no diagnosis on an older record is treated as it was", () => {
    const q = withGame("TWO_NUMBERS");
    const r = play(q, { kind: "TWO_NUMBERS", tries: [], final: { p: 4, q: -1 } });
    delete r.gameReading!.diagnosis;
    assert.deepEqual(instantVerdict(q, r).evidence.map((e) => e.kind), ["SECURE"]);
  });
  it("every note that can reach a student's report is free of forbidden words", () => {
    for (const [, kind, build] of cases) {
      const note = outcome(kind, build).response.gameReading?.diagnosis?.note;
      if (note) assert.equal(findForbiddenTerm(note), null, note);
    }
  });
});
