import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleTileAnswer, formatAllowedAt, type LotusQuestion, type LotusStudentResponse } from "@cogna/shared";
import { buildLotusPuzzle } from "../../src/lotus/lotus-puzzles";
import { withLotusInteraction, resolveLotusResponse, TileAnswerError } from "../../src/lotus/lotus-interactions";
import { instantVerdict } from "../../src/lotus/lotus-factorisation";
import { assertFixedItemIsValid } from "../../src/lotus/lotus-factorisation-catalogue";

function question(studio = false, seed = "puzzle"): LotusQuestion {
  const expression = studio ? "x^2 - 16" : "x^2 - 7x + 12";
  const skillId = studio ? "FAC_DIFF_SQUARES" : "FAC_MONIC_TRINOMIAL";
  return { id: seed, phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    prompt: `Factorise completely: ${expression}`, purpose: "", answerKey: { kind: "OPEN_RESPONSE",
      canonicalAnswer: studio ? "(x + 4)(x - 4)" : "(x - 3)(x - 4)", workedSolution: ["Factor into brackets"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId, taggedSkills: [], stepSkills: [skillId], level: "medium", origin: "AI",
        predictedMistakes: [{ answer: studio ? "(x - 4)^2" : "(x + 3)(x + 4)", mistake: studio ? "WROTE_PERFECT_SQUARE" : "SIGNS_SWAPPED" }] } } };
}
const context = { turn: 3, repurposed: false };
const response = (answer = ""): LotusStudentResponse => ({ answer, working: "", confidence: 60, responseTimeMs: 20000, didNotKnow: false });
function installed(studio = false) { return withLotusInteraction(question(studio), context, {}); }
function correctPicks(q: LotusQuestion): number[] {
  const interaction = q.interaction!;
  if (interaction.format === "CUT_BUILD_STUDIO") return ["x + 4", "x - 4"].map((part) => interaction.tiles.indexOf(part));
  // Find the four slot choices using the server-only keyed products, never display-order assumptions.
  const products = q.answerKey.crosswordAnswers!;
  return [products[0]!.split(")(")[0]!.slice(1), products[2]!.split(")(")[0]!.slice(1),
    products[0]!.split(")(")[1]!.slice(0, -1), products[1]!.split(")(")[1]!.slice(0, -1)].map((part) => interaction.tiles.indexOf(part));
}

describe("Lotus diagnostic crossword and cut-and-build", () => {
  it("installs both on compatible coverage even on odd turns", () => {
    assert.equal(installed().interaction?.format, "FACTOR_CROSSWORD");
    assert.equal(installed(true).interaction?.format, "CUT_BUILD_STUDIO");
    assert.equal(installed().asksForWorking, false);
    assert.equal(installed().answerKey.diagnostics?.provenance, "CODE_BUILT_GAME");
    assertFixedItemIsValid(installed(), "crossword");
    assertFixedItemIsValid(installed(true), "studio");
  });
  it("preserves targeted checks, easy Garden, written hard items, and the kill switch", () => {
    for (const studio of [false, true]) {
      assert.notEqual(withLotusInteraction(question(studio), { ...context, repurposed: true }, {}).interaction?.format, studio ? "CUT_BUILD_STUDIO" : "FACTOR_CROSSWORD");
      assert.equal(withLotusInteraction(question(studio), context, { COGNA_GAME_FORMATS: "off" }).interaction, undefined);
    }
    for (const level of ["easy", "hard"] as const) { const q = question(); q.answerKey.diagnostics!.level = level; assert.equal(buildLotusPuzzle(q), undefined); }
  });
  it("is deterministic and carries no ordered solution in public interaction data", () => {
    for (let seed = 0; seed < 40; seed++) {
      const q = withLotusInteraction(question(false, `seed-${seed}`), context, {});
      assert.deepEqual(buildLotusPuzzle(question(false, `seed-${seed}`)), buildLotusPuzzle(question(false, `seed-${seed}`)));
      assert.equal(instantVerdict(q, resolveLotusResponse(q, { ...response("forged answer"), interaction: { format: "FACTOR_CROSSWORD", picks: correctPicks(q) } })).verification.status, "VERIFIED_CORRECT");
      assert.doesNotMatch(JSON.stringify(q.interaction), /canonical|answer|solution|correct|mistake/i);
    }
  });
  it("checks all four crossings but records just one skill observation", () => {
    const q = installed();
    const result = instantVerdict(q, resolveLotusResponse(q, { ...response(), interaction: { format: "FACTOR_CROSSWORD", picks: correctPicks(q) } }));
    assert.equal(result.verification.status, "VERIFIED_CORRECT");
    assert.equal(result.evidence.length, 1);
    assert.equal(result.needsAnalysis, false);
    const picks = correctPicks(q); [picks[1], picks[3]] = [picks[3]!, picks[1]!];
    const wrong = instantVerdict(q, resolveLotusResponse(q, { ...response(q.answerKey.crosswordAnswers!.join(" | ")), interaction: { format: "FACTOR_CROSSWORD", picks } }));
    assert.equal(wrong.verification.status, "VERIFIED_INCORRECT", "the unchanged correct first crossing cannot pass the puzzle");
    assert.deepEqual(wrong.evidence, [], "don't guess a misconception or award partial mastery");
    assert.equal(wrong.needsAnalysis, true);
  });
  it("typed/demo fallback must solve every crossing, not just the original expression", () => {
    const q = installed();
    assert.equal(instantVerdict(q, response(q.answerKey.canonicalAnswer)).verification.status, "VERIFIED_INCORRECT");
    assert.equal(instantVerdict(q, response(q.answerKey.crosswordAnswers!.join(" | "))).verification.status, "VERIFIED_CORRECT");
  });
  it("keeps did-not-know as one support signal and discards any unfinished picks", () => {
    const q = installed();
    const result = instantVerdict(q, resolveLotusResponse(q, { ...response(), didNotKnow: true, interaction: { format: "FACTOR_CROSSWORD", picks: [null] } }));
    assert.equal(result.verification.status, "NO_ANSWER"); assert.equal(result.evidence.length, 1);
  });
  it("rejects malformed, duplicated, incomplete, out-of-bounds and wrong-format picks", () => {
    for (const studio of [false, true]) {
      const q = installed(studio); const good = correctPicks(q);
      for (const picks of [[], good.slice(1), good.map(() => null), good.map(() => 0), [...good.slice(0, -1), 999], [...good.slice(0, -1), -1], [...good.slice(0, -1), 1.5]]) {
        assert.throws(() => resolveLotusResponse(q, { ...response(), interaction: { format: q.interaction!.format, picks } }), TileAnswerError);
      }
      assert.throws(() => resolveLotusResponse(q, { ...response(), interaction: { format: "TERM_BUILDER", picks: good } }), TileAnswerError);
    }
  });
  it("grades Studio sides through the unchanged algebra checker in either order", () => {
    const q = installed(true);
    for (const picks of [correctPicks(q), correctPicks(q).reverse()]) {
      const resolved = resolveLotusResponse(q, { ...response("wrong"), interaction: { format: "CUT_BUILD_STUDIO", picks } });
      assert.equal(instantVerdict(q, resolved).verification.status, "VERIFIED_CORRECT");
    }
    assert.equal(instantVerdict(q, response("(x - 4)^2")).verification.status, "VERIFIED_INCORRECT");
  });
  it("falls back for invalid keys and incompatible geometry", () => {
    const q = question(true); q.answerKey.canonicalAnswer = "(x + 4)(x - 5)";
    assert.equal(buildLotusPuzzle(q), undefined);
    q.answerKey.canonicalAnswer = "(2x + 4)(2x - 4)"; q.answerKey.diagnostics!.expression = "4x^2 - 16";
    assert.equal(buildLotusPuzzle(q), undefined);
    q.answerKey.canonicalAnswer = "(x + y)(x - y)"; q.answerKey.diagnostics!.expression = "x^2 - y^2";
    assert.equal(buildLotusPuzzle(q), undefined);
  });
  it("guards malformed crossword metadata and stays out of practice/exit", () => {
    const q = installed(); const interaction = structuredClone(q.interaction!);
    interaction.crossword![0]!.row = 99;
    assert.equal(assembleTileAnswer(interaction, correctPicks(q)), null);
    for (const format of ["FACTOR_CROSSWORD", "CUT_BUILD_STUDIO"] as const) {
      assert.equal(formatAllowedAt(format, "DIAGNOSTIC"), true);
      assert.equal(formatAllowedAt(format, "EXIT"), false);
      assert.equal(formatAllowedAt(format, "PRACTICE"), false);
    }
  });
});
