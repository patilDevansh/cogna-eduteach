/**
 * Scenario map (Oct 25): a right answer written in an unusual but correct
 * form must be marked right, and a not-fully-factorised one must not be.
 * Code, not the AI, decides this, so it is tested for free.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import { instantVerdict } from "../../src/lotus/lotus-factorisation";

const q = (expression: string, canonical: string, itemKind = "FACTORISE") => ({
  id: "probe-forms",
  answerKey: { canonicalAnswer: canonical, workedSolution: [canonical], diagnostics: { itemKind, expression, skillId: "FAC_COMMON_BINOMIAL", taggedSkills: [], stepSkills: ["FAC_COMMON_BINOMIAL"], predictedMistakes: [], origin: "AI" } },
}) as unknown as LotusQuestion;
const say = (answer: string): LotusStudentResponse => ({ answer, working: "", confidence: 60, responseTimeMs: 20_000, didNotKnow: false });
const status = (question: LotusQuestion, answer: string) => instantVerdict(question, say(answer)).verification?.status;

describe("Unusual but correct forms are marked right", () => {
  const cases: Array<[string, string, string]> = [
    ["5(x - 4) + y(x - 4)", "(x - 4)(5 + y)", "(y + 5)(x - 4)"],              // factors swapped, terms reordered
    ["5(x - 4) + y(x - 4)", "(x - 4)(5 + y)", "(x-4)(y+5)"],                  // no spaces
    ["-6x - 15", "-3(2x + 5)", "3(-2x - 5)"],                                  // the minus kept inside
    ["x^2 - 9x + 20", "(x - 4)(x - 5)", "(x - 5)(x - 4)"],                    // factors swapped
    ["x^2 - 9x + 20", "(x - 4)(x - 5)", "(-x + 4)(-x + 5)"],                  // both factors negated
    ["x^2 - 16", "(x - 4)(x + 4)", "(4 + x)(x - 4)"],                         // reordered terms
    ["4y^2 - 20y + 25", "(2y - 5)^2", "(2y - 5)(2y - 5)"],                    // square written out
    ["4y^2 - 20y + 25", "(2y - 5)^2", "(5 - 2y)^2"],                          // negated inside a square
    ["2x^2 + 10x + 12", "2(x + 2)(x + 3)", "2(x + 3)(x + 2)"],                // factors swapped after a constant
    ["x^2 - 16", "(x - 4)(x + 4)", "(x − 4)(x + 4)"],                         // a real minus sign (−), as some keyboards type
  ];
  for (const [expression, canonical, answer] of cases) {
    it(`${answer} for ${expression}`, () => {
      assert.equal(status(q(expression, canonical), answer), "VERIFIED_CORRECT");
    });
  }
});

describe("Equal but not fully factorised is not marked right", () => {
  const cases: Array<[string, string, string]> = [
    ["-6x - 15", "-3(2x + 5)", "-(6x + 15)"],               // only -1 taken out: 3 is still common
    ["2x^2 + 10x + 12", "2(x + 2)(x + 3)", "(2x + 4)(x + 3)"],  // the 2 is hidden inside a bracket
    ["12x + 18", "6(2x + 3)", "3(4x + 6)"],                  // not the highest common factor
    ["x^4 - 81", "(x - 3)(x + 3)(x^2 + 9)", "(x^2 - 9)(x^2 + 9)"],
  ];
  for (const [expression, canonical, answer] of cases) {
    it(`${answer} for ${expression}`, () => {
      assert.notEqual(status(q(expression, canonical), answer), "VERIFIED_CORRECT");
    });
  }
});
