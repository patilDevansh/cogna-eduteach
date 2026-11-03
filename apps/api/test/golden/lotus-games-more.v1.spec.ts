import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findForbiddenTerm, LOTUS_GAME_KINDS, type LotusGameKind, type LotusGameResponse, type LotusQuestion, type LotusStudentResponse } from "@cogna/shared";
import { FACTORISATION_SLOTS, assertFixedItemIsValid } from "../../src/lotus/lotus-factorisation-catalogue";
import { instantVerdict } from "../../src/lotus/lotus-factorisation";
import { buildLotusGame } from "../../src/lotus/lotus-games";
import { codeGameProbeFor } from "../../src/lotus/lotus-game-probes";
import { CANT_BE_FACTORISED, chunkData, orderStepCards, replayData, tagRapidOption, validBs } from "../../src/lotus/lotus-games-more";
import { resolveLotusResponse, TileAnswerError, withLotusInteraction } from "../../src/lotus/lotus-interactions";
import { checkWrittenItem } from "../../src/lotus/lotus-question-factory";

const ALL = { COGNA_THEMED_GAMES: "all" };
const base = (): LotusStudentResponse => ({ answer: "forged", working: "", confidence: 60, responseTimeMs: 20000, didNotKnow: false });
const play = (q: LotusQuestion, game: unknown) => resolveLotusResponse(q, { ...base(), game: game as LotusGameResponse });
const rejects = (q: LotusQuestion, game: unknown) => assert.throws(() => play(q, game), TileAnswerError);

/** A question a game probe builds, found by trying request variations. */
function probe(kind: LotusGameKind, slot: number, purpose: "BASE" | "CHECK" = "BASE", targetMistake?: string): LotusQuestion {
  const spec = FACTORISATION_SLOTS.find((s) => s.slot === slot)!;
  for (let i = 0; i < 80; i++) {
    const item = codeGameProbeFor({ spec, purpose, variation: `t${i}`, avoid: [], ...(targetMistake ? { targetMistake } : {}) }, ALL);
    if (item?.game?.kind === kind) return { ...item, id: `q-${kind}-${i}` } as LotusQuestion;
  }
  throw new Error(`no ${kind} probe built for slot ${slot}`);
}

interface Row { name: string; payload: unknown; status: string; effect: string; kinds: string[]; mistake?: string }
function check(q: LotusQuestion, rows: Row[]) {
  for (const row of rows) {
    const r = play(q, row.payload);
    const v = instantVerdict(q, r);
    assert.equal(v.verification.status, row.status, `${row.name}: status`);
    assert.equal(r.gameReading?.diagnosis?.effect, row.effect, `${row.name}: effect`);
    assert.deepEqual([...new Set(v.evidence.map((e) => e.kind))], row.kinds, `${row.name}: evidence`);
    if (row.mistake) assert.equal(v.evidence.find((e) => e.kind !== "SECURE")?.mistake, row.mistake, `${row.name}: mistake`);
    assert.equal(v.needsAnalysis, false, `${row.name}: code settles it`);
    const note = r.gameReading?.diagnosis?.note;
    if (note) assert.equal(findForbiddenTerm(note), null, note);
  }
}

describe("game questions: built and checked by code", () => {
  const where: Array<[LotusGameKind, number]> = [["TEST_CLAIM", 18], ["REPLAY", 18], ["FIND_EVERY_B", 12], ["RAPID_SET", 10], ["CHUNK_IT", 10]];
  for (const [kind, slot] of where) {
    it(`${kind} fills slot ${slot} with a question that passes the writer's own checks`, () => {
      const q = probe(kind, slot);
      const spec = FACTORISATION_SLOTS.find((s) => s.slot === slot)!;
      assert.deepEqual(checkWrittenItem({ spec, purpose: "BASE", avoid: [] }, q), []);
      assert.doesNotThrow(() => assertFixedItemIsValid(q, kind));
      assert.equal(q.answerKey.diagnostics!.origin, "CODE");
      assert.equal(q.asksForWorking, false);
      assert.doesNotMatch(JSON.stringify(q.game), /canonical|mistake|EXPAND_CHECK_FAIL|NOT_DIFF|WRONG_FACTOR/);
    });
  }
  it("the same request always gives the same question", () => {
    const spec = FACTORISATION_SLOTS.find((s) => s.slot === 12)!;
    const make = () => codeGameProbeFor({ spec, purpose: "BASE", variation: "same", avoid: [] }, ALL);
    assert.deepEqual(make(), make());
  });
  it("about half of the requests a game fits get one; the rest go to the question the plan would have asked", () => {
    const spec = FACTORISATION_SLOTS.find((s) => s.slot === 12)!;
    const got = Array.from({ length: 80 }, (_, i) => codeGameProbeFor({ spec, purpose: "BASE", variation: `half${i}`, avoid: [] }, {})).filter(Boolean).length;
    assert.ok(got > 20 && got < 60, `saw ${got} of 80`);
  });
  it("is off with the kill switches, for a required opener, and for a skill no game fits", () => {
    const spec = FACTORISATION_SLOTS.find((s) => s.slot === 12)!;
    const req = { spec, purpose: "BASE" as const, variation: "k", avoid: [] };
    assert.equal(codeGameProbeFor(req, { COGNA_THEMED_GAMES: "off" }), null);
    assert.equal(codeGameProbeFor(req, { ...ALL, COGNA_GAME_FORMATS: "off" }), null);
    assert.equal(codeGameProbeFor({ ...req, requiredExpression: "x^2 + 5x + 6" }, ALL), null);
    assert.equal(codeGameProbeFor({ ...req, spec: FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_GCF_VARIABLE")! }, ALL), null);
  });
  it("a targeted check only gets a game that covers the mistake it is checking", () => {
    const q = probe("CHUNK_IT", 10, "CHECK", "NOT_DIFF_OF_SQUARES");
    assert.ok(q.answerKey.diagnostics!.predictedMistakes.some((m) => m.mistake === "NOT_DIFF_OF_SQUARES"));
  });
  it("a preset game survives being passed through the install hook", () => {
    const q = withLotusInteraction(probe("REPLAY", 18), { turn: 3, repurposed: false }, {});
    assert.equal(q.game?.kind, "REPLAY");
    assert.equal(q.asksForWorking, false);
  });
  it("every game kind has a way to be built", () => {
    for (const kind of LOTUS_GAME_KINDS) assert.ok(typeof kind === "string");
    assert.equal(LOTUS_GAME_KINDS.length, 15, "15 student games; \"what Lotus asks next\" is not one");
  });
});

describe("Test the claim", () => {
  const q = probe("TEST_CLAIM", 18);
  const opts = (q.game as { options: string[] }).options;
  const at = (text: string) => opts.indexOf(text);
  it("reads what was tried and what was decided", () => {
    check(q, [
      { name: "sometimes, tested well", payload: { kind: "TEST_CLAIM", tested: [0, 1, 2, -3], verdict: at("Sometimes true") }, status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] },
      { name: "sometimes, tested little", payload: { kind: "TEST_CLAIM", tested: [0], verdict: at("Sometimes true") }, status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] },
      { name: "always after only x = 0", payload: { kind: "TEST_CLAIM", tested: [0], verdict: at("Always true") }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "EXPAND_CHECK_FAIL" },
      { name: "always despite seeing them differ", payload: { kind: "TEST_CLAIM", tested: [0, 2], verdict: at("Always true") }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "EXPAND_CHECK_FAIL" },
      { name: "never", payload: { kind: "TEST_CLAIM", tested: [0, 3], verdict: at("Never true") }, status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] },
      { name: "not enough to say", payload: { kind: "TEST_CLAIM", tested: [], verdict: at("Not enough to say") }, status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] },
    ]);
  });
  it("what is marked is the verdict, never what was tried", () => {
    assert.equal(play(q, { kind: "TEST_CLAIM", tested: [0, 1, 2, 3], verdict: at("Sometimes true") }).answer, "Sometimes true");
  });
  it("tampered payloads are rejected", () => {
    const span = (q.game as { min: number; max: number });
    for (const bad of [{ tested: [99], verdict: 0 }, { tested: [1, 1], verdict: 0 }, { tested: [1.5], verdict: 0 }, { tested: ["1"], verdict: 0 }, { tested: [1], verdict: 9 }, { tested: [1], verdict: -1 }, { tested: [1] }, { tested: "x", verdict: 0 }, { tested: Array.from({ length: span.max - span.min + 2 }, (_, i) => i + span.min), verdict: 0 }]) rejects(q, { kind: "TEST_CLAIM", ...bad });
  });
});

describe("Stop the replay", () => {
  const q = probe("REPLAY", 18);
  it("data is re-derived: the early lines are sound and the last two carry the slip", () => {
    assert.ok(replayData(-3, 2));
    assert.equal(replayData(3, 2), null, "no sign slip to find when both are positive");
    assert.equal(replayData(-3, 3), null, "a zero middle term makes a poor example");
  });
  it("reads where it was stopped and how fast", () => {
    check(q, [
      { name: "stopped on the slip, quickly", payload: { kind: "REPLAY", stopped: 2, lateMs: 900 }, status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] },
      { name: "stopped on the slip, after a while", payload: { kind: "REPLAY", stopped: 2, lateMs: 4000 }, status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] },
      { name: "stopped on the slip with no timing (no tape played)", payload: { kind: "REPLAY", stopped: 2 }, status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] },
      { name: "stopped after the slip", payload: { kind: "REPLAY", stopped: 3, lateMs: 800 }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "EXPAND_CHECK_FAIL" },
      { name: "false alarm", payload: { kind: "REPLAY", stopped: 1, lateMs: 600 }, status: "VERIFIED_INCORRECT", effect: "NO_EVIDENCE", kinds: [] },
    ]);
  });
  it("tampered payloads are rejected", () => {
    for (const bad of [{ stopped: 4 }, { stopped: -1 }, { stopped: 1.5 }, { stopped: "2" }, {}]) rejects(q, { kind: "REPLAY", ...bad });
    assert.equal((play(q, { kind: "REPLAY", stopped: 2, lateMs: -5 }).game as { lateMs?: number }).lateMs, undefined, "a nonsense time is dropped, not trusted");
  });
});

describe("Find every b", () => {
  const q = probe("FIND_EVERY_B", 12);
  const c = (q.game as { c: number }).c;
  const valid = validBs(c);
  it("finds the whole set both ways round", () => {
    assert.deepEqual(validBs(6), [-7, -5, 5, 7]);
    assert.equal(validBs(12).length, 6);
    assert.equal(valid.length, 4);
  });
  it("reads what was found", () => {
    const positives = valid.filter((n) => n > 0);
    check(q, [
      { name: "all of them", payload: { kind: "FIND_EVERY_B", picked: valid }, status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] },
      { name: "no negatives", payload: { kind: "FIND_EVERY_B", picked: positives }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_PAIR_ERROR" },
      { name: "mixed b with a factor", payload: { kind: "FIND_EVERY_B", picked: [...positives, c] }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "WRONG_FACTOR_PAIR_SUM" },
      { name: "only one", payload: { kind: "FIND_EVERY_B", picked: [positives[0]!] }, status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] },
    ]);
  });
  it("what is marked does not depend on the order picked", () => {
    assert.deepEqual((play(q, { kind: "FIND_EVERY_B", picked: [...valid].reverse() }).game as { picked: number[] }).picked, valid);
  });
  it("tampered payloads are rejected", () => {
    const range = (q.game as { range: number }).range;
    for (const bad of [{ picked: [] }, { picked: [0] }, { picked: [range + 1] }, { picked: [5, 5] }, { picked: [1.5] }, { picked: ["5"] }, { picked: "5" }, {}, { picked: Array.from({ length: 2 * range + 1 }, (_, i) => i + 1) }]) rejects(q, { kind: "FIND_EVERY_B", ...bad });
  });
});

describe("Rapid set", () => {
  const q = probe("RAPID_SET", 10);
  const rows = (q.game as { rows: Array<{ q: string; options: string[] }> }).rows;
  const tagIndex = (row: number, tag: string) => rows[row]!.options.findIndex((o) => tagRapidOption(rows[row]!, row === 3, o) === tag);
  const picks = (last: string, first = "right") => [0, 1, 2].map((r) => tagIndex(r, first)).concat(tagIndex(3, last));
  it("has three real factorisations then a look-alike with no factorisation", () => {
    assert.equal(rows.length, 4);
    for (const r of [0, 1, 2]) assert.equal(rows[r]!.options.filter((o) => tagRapidOption(rows[r]!, false, o) === "right").length, 1);
    assert.equal(rows[3]!.options.includes(CANT_BE_FACTORISED), true);
    assert.equal(rows[3]!.options.filter((o) => tagRapidOption(rows[3]!, true, o) === "right").length, 1);
    assert.equal(q.answerKey.canonicalAnswer, CANT_BE_FACTORISED);
  });
  it("names no row in the stem, so nothing announces the look-alike", () => {
    for (const row of rows) {
      const shown = row.q.replace("^2", "²");
      assert.equal(q.prompt.includes(row.q) || q.prompt.includes(shown), false, `the stem gives away ${row.q}`);
    }
    assert.doesNotMatch(q.prompt, /ending|last|fourth|\d/i);
  });
  it("still tells one set from another by its last row", () => {
    assert.equal(q.answerKey.diagnostics!.expression, rows[3]!.q);
    const spec = FACTORISATION_SLOTS.find((s) => s.slot === 10)!;
    const makeAll = (variation: string) => codeGameProbeFor({ spec, purpose: "BASE", variation, avoid: [] }, ALL);
    const first = Array.from({ length: 40 }, (_, i) => makeAll(`set-${i}`)).find((item) => item?.game?.kind === "RAPID_SET");
    assert.ok(first, "a rapid set comes up");
    const again = codeGameProbeFor({ spec, purpose: "BASE", variation: "set-other", avoid: [first.answerKey.diagnostics!.expression!] }, ALL);
    assert.notEqual(again?.answerKey.diagnostics?.expression, first.answerKey.diagnostics!.expression, "a set already asked isn't asked again");
  });
  it("tells the teacher which row the reading is about", () => {
    const r = play(q, { kind: "RAPID_SET", picks: picks("pattern"), times: [3000, 3000, 3000, 3200] });
    assert.ok(r.gameReading!.summary.includes(rows[3]!.q.replace("^2", "²")), r.gameReading!.summary);
  });
  it("reads whether the look-alike was noticed", () => {
    const t = (a: number, b: number, c: number, d: number) => [a, b, c, d];
    check(q, [
      { name: "noticed", payload: { kind: "RAPID_SET", picks: picks("right"), times: t(3000, 3000, 3000, 7000) }, status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] },
      { name: "noticed, but a warm-up row wrong", payload: { kind: "RAPID_SET", picks: [tagIndex(0, "square"), tagIndex(1, "right"), tagIndex(2, "right"), tagIndex(3, "right")], times: t(3000, 3000, 3000, 7000) }, status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] },
      { name: "autopilot", payload: { kind: "RAPID_SET", picks: picks("pattern"), times: t(3000, 3000, 3000, 3200) }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "NOT_DIFF_OF_SQUARES" },
      { name: "a perfect square", payload: { kind: "RAPID_SET", picks: picks("square"), times: t(3000, 3000, 3000, 6000) }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "WROTE_PERFECT_SQUARE" },
      { name: "something else", payload: { kind: "RAPID_SET", picks: picks("other"), times: t(3000, 3000, 3000, 6000) }, status: "VERIFIED_INCORRECT", effect: "DOESNT_KNOW", kinds: ["DID_NOT_KNOW"] },
    ]);
  });
  it("what is marked is the answer to the fourth, whatever was picked on the others", () => {
    assert.equal(play(q, { kind: "RAPID_SET", picks: picks("right", "other"), times: [1, 1, 1, 1] }).answer, CANT_BE_FACTORISED);
  });
  it("tampered payloads are rejected", () => {
    for (const bad of [{ picks: [0, 0, 0] }, { picks: [0, 0, 0, 9] }, { picks: [0, 0, 0, -1] }, { picks: [0, 0, 0, 1.5] }, { picks: "0000" }, {}]) rejects(q, { kind: "RAPID_SET", times: [1, 1, 1, 1], ...bad });
    assert.doesNotThrow(() => play(q, { kind: "RAPID_SET", picks: [0, 0, 0, 0], times: "nonsense" }), "a bad time is only weak evidence");
  });
});

describe("Chunk it", () => {
  const q = probe("CHUNK_IT", 10);
  const routes = (q.game as { routes: Array<{ lines: string[] }> }).routes;
  const by = (re: RegExp) => routes.findIndex((r) => r.lines.some((l) => re.test(l)));
  it("is built from the numbers and re-derived", () => {
    assert.ok(chunkData(3, 4));
    assert.equal(chunkData(3, 3), null);
    assert.equal(routes.length, 3);
  });
  it("reads the first move", () => {
    check(q, [
      { name: "treated as one chunk", payload: { kind: "CHUNK_IT", route: by(/^A\^2/) }, status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] },
      { name: "expanded first", payload: { kind: "CHUNK_IT", route: by(/^x\^2 \+ \d+x/) }, status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] },
      { name: "square-rooted each part", payload: { kind: "CHUNK_IT", route: by(/^\(x \+ \d+\) - \d+$/) }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "NOT_DIFF_OF_SQUARES" },
    ]);
  });
  it("what is marked is where the route ends, not which route", () => {
    const r = play(q, { kind: "CHUNK_IT", route: 0 });
    assert.equal(r.answer, routes[0]!.lines.at(-1));
  });
  it("tampered payloads are rejected", () => {
    for (const bad of [{ route: 3 }, { route: -1 }, { route: 0.5 }, { route: "0" }, {}]) rejects(q, { kind: "CHUNK_IT", ...bad });
  });
});

describe("Order the steps", () => {
  function grouping(id = "group-1"): LotusQuestion {
    return { id, phase: "DIAGNOSE", subtopic: "Grouping", type: "CONSTRUCTED_RESPONSE", asksForWorking: true, prompt: "Factorise completely: 6xy - 9x - 4y + 6", purpose: "",
      answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "(3x - 2)(2y - 3)", workedSolution: ["Group", "Take out", "Done"], diagnostics: { itemKind: "FACTORISE", expression: "6xy - 9x - 4y + 6", skillId: "FAC_GROUP_SIGN", taggedSkills: [], stepSkills: ["FAC_GROUP_SIGN", "FAC_GROUP_SIGN", "FAC_GROUP_SIGN"], level: "medium", origin: "AI",
        predictedMistakes: [{ answer: "(3x - 2)(2y + 3)", mistake: "SIGN_NOT_FLIPPED_IN_GROUP" }, { answer: "(6xy - 4y) - (9x - 6)", mistake: "SUM_ACCEPTED_AS_FACTORISED" }] } } };
  }
  const q = grouping();
  q.game = buildLotusGame(q, "ORDER_STEPS");
  const cards = orderStepCards(q)!;
  const idx = (role: string) => cards.roles.indexOf(role);
  it("deals six distinct cards: three sound, three with a slip, and nothing says which", () => {
    assert.equal(q.game?.kind, "ORDER_STEPS");
    assert.equal(new Set(cards.texts).size, 6);
    assert.deepEqual([...cards.roles].sort(), ["D1", "D2", "D3", "L1", "L2", "L3"]);
    assert.ok(cards.texts.includes("(6xy - 4y) - (9x - 6)"), "the cards are the ones in the working");
    assert.doesNotMatch(JSON.stringify(q.game), /\bL[123]\b|\bD[123]\b|slip|sound/);
    assert.deepEqual(orderStepCards(grouping())!.texts, cards.texts, "the same question deals the same cards");
  });
  it("only dresses a grouping whose second pair starts with a minus", () => {
    const sum = grouping("g2");
    sum.answerKey.canonicalAnswer = "(x + 2)(x + 3)";
    sum.answerKey.diagnostics!.expression = "x^2 + 5x + 6";
    assert.equal(buildLotusGame(sum, "ORDER_STEPS"), undefined);
    const plus = grouping("g3");
    plus.answerKey.canonicalAnswer = "(3x + 2)(2y + 3)";
    plus.answerKey.diagnostics!.expression = "6xy + 9x + 4y + 6";
    assert.equal(buildLotusGame(plus, "ORDER_STEPS"), undefined);
  });
  it("reads the order and the slips; the last card placed is what is marked", () => {
    const right = [idx("L1"), idx("L2"), idx("L3")];
    check(q, [
      { name: "all right in order", payload: { kind: "ORDER_STEPS", placed: right, ever: right }, status: "VERIFIED_CORRECT", effect: "SECURE", kinds: ["SECURE"] },
      { name: "caught a slip", payload: { kind: "ORDER_STEPS", placed: right, ever: [...right, idx("D2")] }, status: "VERIFIED_CORRECT", effect: "NEEDS_ANOTHER", kinds: ["SECURE"] },
      { name: "a slip in the last step", payload: { kind: "ORDER_STEPS", placed: [idx("L1"), idx("L2"), idx("D3")], ever: [idx("L1"), idx("L2"), idx("D3")] }, status: "VERIFIED_INCORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_NOT_FLIPPED_IN_GROUP" },
      { name: "a slip in the middle, ending right", payload: { kind: "ORDER_STEPS", placed: [idx("L1"), idx("D2"), idx("L3")], ever: [idx("L1"), idx("D2"), idx("L3")] }, status: "VERIFIED_CORRECT", effect: "MISTAKE", kinds: ["MISTAKE"], mistake: "SIGN_NOT_FLIPPED_IN_GROUP" },
      { name: "right steps, wrong order", payload: { kind: "ORDER_STEPS", placed: [idx("L2"), idx("L1"), idx("L3")], ever: [idx("L2"), idx("L1"), idx("L3")] }, status: "VERIFIED_CORRECT", effect: "NO_EVIDENCE", kinds: [] },
    ]);
  });
  it("tampered payloads are rejected", () => {
    for (const bad of [{ placed: [0, 1] }, { placed: [0, 0, 1] }, { placed: [0, 1, 6] }, { placed: [0, 1, -1] }, { placed: [0, 1, 2.5] }, { placed: "012" }, { placed: [0, 1, 2], ever: [9] }, { placed: [0, 1, 2], ever: [1, 1] }, {}]) rejects(q, { kind: "ORDER_STEPS", ...bad });
  });
});
