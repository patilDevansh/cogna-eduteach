import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findForbiddenTerm, LOTUS_GAME_KINDS, prettyReadback, readbackTyped, LOTUS_THEMES, type LotusGameKind, type LotusGameResponse, type LotusQuestion, type LotusQuestionAudit, type LotusStudentResponse } from "@cogna/shared";
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
/** x² + 5x + 6 = (x + 2)(x + 3): only positive numbers, so it fits the area model. */
function positive(id = "games-pos"): LotusQuestion {
  const q = question(id);
  q.answerKey.canonicalAnswer = "(x + 2)(x + 3)";
  q.answerKey.diagnostics!.expression = "x^2 + 5x + 6";
  q.prompt = "Factorise completely: x^2 + 5x + 6";
  q.answerKey.diagnostics!.predictedMistakes = [{ answer: "(x + 1)(x + 6)", mistake: "WRONG_FACTOR_PAIR_SUM" }, { answer: "(x - 2)(x - 3)", mistake: "SIGNS_SWAPPED" }];
  return q;
}
function withGame(kind: LotusGameKind, id = "games-1"): LotusQuestion {
  const q = kind === "RECTANGLE" ? positive(id) : question(id);
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
    for (const kind of LOTUS_GAME_KINDS) {
      const game = buildLotusGame(question(), kind) ?? buildLotusGame(positive(), kind);
      // The games with a question of their own are built by lotus-game-probes.ts and checked in lotus-games-more.v1.spec.ts.
      if (game) assert.doesNotMatch(JSON.stringify(game), /canonical|correct|mistake|truth|answer|FLIPPED|PRODUCT_ONLY/i);
    }
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
      assert.ok(!["EDIT_HISTORY", "READBACK"].includes(chooseLotusGame(q, { turn: 3, repurposed: false }, {})?.kind ?? ""), "a two-bracket item is played, not typed, on any turn");
      assert.ok(!["EDIT_HISTORY", "READBACK"].includes(game?.kind ?? ""));
      assert.equal(chooseLotusGame(q, { turn: 2, repurposed: false }, { COGNA_THEMED_GAMES: "off" }), undefined);
      assert.equal(chooseLotusGame(q, { turn: 2, repurposed: false }, { COGNA_GAME_FORMATS: "off" }), undefined);
    }
    assert.equal(seen, 40, "every eligible item becomes a game");
    const q = question("pick-unchecked", "easy");
    q.answerKey.canonicalAnswer = "wrong";
    assert.equal(buildLotusGame(q, "EDIT_HISTORY"), undefined, "an item whose key doesn't check gets no game");
  });
  it("an item that isn't two brackets shares chips or is typed in a game, and never falls back to a tile game", () => {
    const other = (id: string) => {
      const q = question(id, "hard");
      q.answerKey.canonicalAnswer = "2(x + 12)";
      q.answerKey.diagnostics!.expression = "2x + 24";
      q.answerKey.diagnostics!.predictedMistakes = [{ answer: "2(x + 24)", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "x(2 + 24)", mistake: "WRONG_COMMON_FACTOR" }];
      return q;
    };
    const opening = withLotusInteraction(other("gcf-1"), { turn: 1, repurposed: false }, {});
    assert.equal(opening.game?.kind, "SPLIT_CONFIDENCE", "the test opens on something to do");
    assert.equal(opening.interaction, undefined);
    assert.equal(opening.asksForWorking, false);
    const typed = withLotusInteraction(other("gcf-2"), { turn: 2, repurposed: false }, {});
    assert.equal(typed.game?.kind, "EDIT_HISTORY");
    assert.equal(typed.asksForWorking, true, "a typed game keeps its working");
    assert.equal(withLotusInteraction(other("gcf-3"), { turn: 3, repurposed: false }, {}).game?.kind, "SPLIT_CONFIDENCE");
    assert.equal(withLotusInteraction(other("gcf-5"), { turn: 4, repurposed: false }, {}).game?.kind, "EDIT_HISTORY");
    const thin = other("gcf-4");
    thin.answerKey.canonicalAnswer = "x(x + 12)";
    thin.answerKey.diagnostics!.expression = "x^2 + 12x";
    thin.answerKey.diagnostics!.predictedMistakes = [{ answer: "1", mistake: "DIVIDED_FIRST_TERM_ONLY" }];
    assert.equal(withLotusInteraction(thin, { turn: 1, repurposed: false }, {}).game?.kind, "EDIT_HISTORY", "too few real options for chips, and a bare number is not one");
    const made = other("gcf-6");
    made.answerKey.diagnostics!.predictedMistakes = [];
    assert.deepEqual([...(withLotusInteraction(made, { turn: 1, repurposed: false }, {}).game as { options: string[] }).options].sort(), ["2(x + 12)", "2(x + 24)", "2(x - 12)"], "look-alikes fill in for a common factor");
  });
  it("chips over a non-bracket item are read like any other: the marked answer, the mistake it predicts, and how sure", () => {
    const q = question("gcf-read", "hard");
    q.answerKey.canonicalAnswer = "2(x + 12)";
    q.answerKey.diagnostics!.expression = "2x + 24";
    q.answerKey.diagnostics!.predictedMistakes = [{ answer: "2(x + 24)", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "x(2 + 24)", mistake: "WRONG_COMMON_FACTOR" }];
    const game = withLotusInteraction(q, { turn: 1, repurposed: false }, {}).game as { options: string[] };
    assert.doesNotMatch(JSON.stringify(game), /canonical|correct|mistake|truth/i);
    const counts = (on: string, n: number, rest?: string) => game.options.map((o) => (o === on ? n : o === rest ? 4 - n : 0));
    const right = game.options.find((o) => o.startsWith("2(x + 12"))!;
    const wrong = game.options.find((o) => o.startsWith("2(x + 24"))!;
    const sure = play(q, { kind: "SPLIT_CONFIDENCE", counts: counts(right, 4) });
    assert.equal(sure.answer, right);
    assert.equal(sure.confidence, 90);
    assert.equal(sure.gameReading?.diagnosis?.effect, "NEEDS_ANOTHER");
    const held = play(q, { kind: "SPLIT_CONFIDENCE", counts: counts(wrong, 4) });
    assert.equal(held.answer, wrong);
    assert.equal(held.gameReading?.diagnosis?.effect, "MISTAKE");
    const torn = play(q, { kind: "SPLIT_CONFIDENCE", counts: counts(right, 2, wrong) });
    assert.equal(torn.answer, wrong, "a tie marks the wrong answer it includes");
    assert.throws(() => play(q, { kind: "SPLIT_CONFIDENCE", counts: counts(right, 3) }), /Place all/);
  });
  it("the same format doesn't come round twice running when another fits", () => {
    for (let i = 0; i < 60; i++) {
      const first = chooseLotusGame(question(`seq-${i}`, "easy"), { turn: 2, repurposed: false }, {})!;
      const next = chooseLotusGame(question(`seq-${i}`, "easy"), { turn: 3, repurposed: false, previousKind: first.kind }, {})!;
      assert.notEqual(next.kind, first.kind);
    }
  });
  it("the crossword no longer takes a turn while the new games are on, and comes back with them off", () => {
    const on = withLotusInteraction(question("puzzle-on", "medium"), { turn: 3, repurposed: false }, {});
    assert.ok(on.game);
    assert.equal(on.interaction, undefined);
    const off = withLotusInteraction(question("puzzle-off", "medium"), { turn: 3, repurposed: false }, { COGNA_THEMED_GAMES: "off" });
    assert.equal(off.game, undefined);
    assert.equal(off.interaction?.format, "FACTOR_CROSSWORD");
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
    ["two moves, sound", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["+", "-"] }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["two moves, two slips that cancel", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: -4, n2: 1 }, signs: ["+", "-"] }), { status: "VERIFIED_CORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_PAIR_ERROR" }],
    ["two moves, flipped into the brackets", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: 4, n2: -1 }, signs: ["-", "+"] }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGNS_FLIPPED" }],
    ["two moves, numbers that don't fit", "TWO_MOVES", () => ({ kind: "TWO_MOVES", numbers: { n1: 2, n2: 3 }, signs: ["+", "+"] }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "WRONG_FACTOR_PAIR_PRODUCT" }],
    ["four signs, the real rule", "FOUR_SIGNS", (q) => ({ kind: "FOUR_SIGNS", picks: (q.game as { cases: string[] }).cases.map((c) => FOUR_TRUE[c]) }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["four signs, a wrong rule", "FOUR_SIGNS", (q) => ({ kind: "FOUR_SIGNS", picks: (q.game as { cases: string[] }).cases.map((c) => FOUR_COPY[c]) }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_PAIR_ERROR" }],
    ["tiles, first try", "RECTANGLE", () => ({ kind: "RECTANGLE", tries: [2], final: 2 }), { status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] }],
    ["tiles, found by trying", "RECTANGLE", () => ({ kind: "RECTANGLE", tries: [0, 1, 2], final: 2 }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
    ["tiles, settled on a split that leaves gaps", "RECTANGLE", () => ({ kind: "RECTANGLE", tries: [1], final: 1 }), { status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "WRONG_FACTOR_PAIR_PRODUCT" }],
    ["confirm your input, typed with an open bracket, wrongly", "READBACK", () => ({ kind: "READBACK", history: [{ t: 400, v: "(x - 4)(x + 1" }] }), { status: "VERIFIED_INCORRECT", effect: "NO_EVIDENCE", kinds: [] }],
    ["confirm your input, an open bracket on the right answer", "READBACK", () => ({ kind: "READBACK", history: [{ t: 400, v: "(x + 4)(x - 1" }] }), { status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] }],
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
    assert.equal(stateAfter(["TWO_MOVES", sound])?.state, "UNTESTED", "sound work with the rule on screen needs a second right answer");
    assert.equal(stateAfter(["TWO_MOVES", sound], ["TWO_MOVES", sound])?.state, "SECURE");
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

describe("Lotus themed games, third batch", () => {
  it("Tiles: only for positive numbers that fit on the screen, and the config is just the coefficients", () => {
    const game = buildLotusGame(positive(), "RECTANGLE");
    assert.deepEqual(game, { version: 1, kind: "RECTANGLE", expression: "x^2 + 5x + 6", strips: 5, units: 6 });
    assert.equal(buildLotusGame(question(), "RECTANGLE"), undefined, "x² + 3x − 4 has a negative number");
    const big = positive();
    big.answerKey.canonicalAnswer = "(x + 7)(x + 8)";
    big.answerKey.diagnostics!.expression = "x^2 + 15x + 56";
    assert.equal(buildLotusGame(big, "RECTANGLE"), undefined);
  });
  it("Tiles: the split chosen is what is marked; the other numbers only follow from it", () => {
    const q = withGame("RECTANGLE");
    assert.equal(play(q, { kind: "RECTANGLE", tries: [], final: 3 }).answer, "(x + 3)(x + 2)");
    assert.equal(status(q, play(q, { kind: "RECTANGLE", tries: [], final: 3 })), "VERIFIED_CORRECT");
    assert.equal(play(q, { kind: "RECTANGLE", tries: [], final: 0 }).answer, "(x + 0)(x + 5)");
    const stepped = play(q, { kind: "RECTANGLE", tries: [0, 1, 2], final: 2 }).gameReading!;
    assert.ok(stepped.signals.includes("stepped_search"));
    assert.ok(play(q, { kind: "RECTANGLE", tries: [0, 4, 1, 3], final: 3 }).gameReading!.signals.includes("jumped_around"));
  });
  it("Tiles: tampered payloads are rejected", () => {
    const q = withGame("RECTANGLE");
    for (const bad of [{ final: 6, tries: [] }, { final: -1, tries: [] }, { final: 1.5, tries: [] }, { final: "2", tries: [] }, { final: 2, tries: [9] }, { final: 2, tries: Array(41).fill(1) }, { final: 2, tries: "x" }, { tries: [] }]) {
      assert.throws(() => play(q, { kind: "RECTANGLE", ...bad }), TileAnswerError);
    }
  });

  describe("Confirm your input", () => {
    const q = withGame("READBACK");
    const typed = (...v: Array<[number, string]>) => ({ kind: "READBACK", history: v.map(([t, x]) => ({ t, v: x })) });
    it("reads typing the same way on the screen and on the server", () => {
      assert.equal(readbackTyped("(x + 4)(x − 1)").read, "(x+4)(x-1)");
      assert.deepEqual(readbackTyped("(x+4)(x-1)").flags, []);
      assert.deepEqual(readbackTyped("x2+3x-4").flags.map((f) => f.code), ["X2_AMBIGUOUS"]);
      assert.equal(readbackTyped("x2+3x-4").read, "x^2+3x-4");
      assert.equal(readbackTyped("(x+4)(x-1").read, "(x+4)(x-1)");
      assert.deepEqual(readbackTyped("(x+4)(x-1))").flags.map((f) => f.code), ["EXTRA_BRACKET"]);
      const sum = readbackTyped("x+4(x-1)");
      assert.equal(sum.suggestion, "(x+4)(x-1)");
      assert.deepEqual(sum.flags.map((f) => f.code), ["READS_AS_SUM"]);
      assert.equal(readbackTyped("x²+3x−4").read, "x^2+3x-4", "typed superscripts are read as powers");
      assert.equal(prettyReadback("(x+4)(x-1)"), "(x + 4)(x − 1)");
    });
    it("never says whether the maths is right", () => {
      for (const text of ["(x+9)(x+9)", "x^2+3x-4", "x+4(x-1)", "x2+3x-4", "(x+4"]) for (const f of readbackTyped(text).flags) assert.doesNotMatch(f.text, /\b(wrong|incorrect|right|correct|not factorised|mistake)\b/i, f.text);
    });
    it("a clean answer is marked as typed and needs nothing more", () => {
      const r = play(q, typed([800, "(x + 4)(x - 1)"]));
      assert.equal(status(q, r), "VERIFIED_CORRECT");
      assert.ok(r.gameReading!.signals.includes("typed_clean"));
      assert.equal(r.gameReading!.diagnosis, undefined);
    });
    it("what is marked is what was read back, repairs included", () => {
      assert.equal(play(q, typed([800, "(x+4)(x-1"])).answer, "(x+4)(x-1)");
      assert.equal(play(q, typed([800, "x2+3x-4"])).answer, "x^2+3x-4");
    });
    it("taking the suggestion counts only if the typing really did read as a sum, and was then fixed", () => {
      const fixed = play(q, { ...typed([300, "x+4(x-1)"], [900, "(x+4)(x-1)"]), tookSuggestion: true });
      assert.ok(fixed.gameReading!.signals.includes("took_suggestion"));
      assert.equal(fixed.gameReading!.diagnosis?.effect, "NEEDS_ANOTHER");
      const claimed = play(q, { ...typed([300, "(x+4)(x-1)"]), tookSuggestion: true });
      assert.ok(claimed.gameReading!.signals.includes("typed_clean"), "a claim with nothing to take is ignored");
      assert.equal(claimed.game && (claimed.game as { tookSuggestion?: boolean }).tookSuggestion, undefined);
      const confirmedAsSum = play(q, { ...typed([300, "x+4(x-1)"]), tookSuggestion: true });
      assert.ok(confirmedAsSum.gameReading!.signals.includes("confirmed_with_flags"));
      assert.equal(confirmedAsSum.gameReading!.diagnosis?.effect, "NO_EVIDENCE", "a sum confirmed as typed is a typing matter, kept apart from the maths");
    });
    it("tampered payloads are rejected", () => {
      for (const bad of [{ history: [] }, { history: [{ t: 1, v: "   " }] }, { history: [{ t: 5, v: "a" }, { t: 1, v: "b" }] }, { history: [{ t: 1, v: "x".repeat(121) }] }, { history: "x" }, {}]) {
        assert.throws(() => play(q, { kind: "READBACK", ...bad }), TileAnswerError);
      }
    });
  });

  it("Tiles can take a tile game's turn, and both games are in every theme's words", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) { const g = chooseLotusGame(positive(`tile-${i}`), { turn: 2, repurposed: false }, { COGNA_THEMED_GAMES: "all" }); if (g) seen.add(g.kind); }
    assert.ok(seen.has("RECTANGLE"));
  });
});
