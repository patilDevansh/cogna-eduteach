import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  algebraicallyEqual,
  classifyFactorisation,
  classifyReducedForm,
  classifySimplification,
  isFullyFactorisedForm,
  sameFactorisation,
} from "../../src/lotus/lotus-algebra";

describe("Lotus exact algebra — equality", () => {
  it("expands and compares exactly, including implicit multiplication and unicode", () => {
    assert.equal(algebraicallyEqual("2x²(5 − 9x + 7x²)", "10x^2 - 18x^3 + 14x^4"), true);
    assert.equal(algebraicallyEqual("(x + 1)(2y + 3)", "2xy + 2y + 3x + 3"), true);
    assert.equal(algebraicallyEqual("(x − 2)(x + 2)(x² + 4)", "x^4 - 16"), true);
    assert.equal(algebraicallyEqual("(3x - 2)(2y - 3)", "6xy - 4y - 9x + 6"), true);
  });

  it("catches answers that are not equal", () => {
    assert.equal(algebraicallyEqual("3(2x + 9)", "6x + 9"), false);
    assert.equal(algebraicallyEqual("(x + 3)(x + 4)", "x^2 - 7x + 12"), false);
    assert.equal(algebraicallyEqual("-4(-x - 2)", "-4x - 8"), false);
  });

  it("compares fractions by cross-multiplying, not by sampling", () => {
    assert.equal(algebraicallyEqual("(x + 3)/(x - 3)", "(x^2 - 9)/(x^2 - 6x + 9)"), true);
    assert.equal(algebraicallyEqual("x/(x - 22)", "(x^2 - 121)/(x^2 - 22x + 121)"), false);
  });
});

describe("Lotus exact algebra — correct, unfinished, or wrong", () => {
  const cases: Array<[string, string, string]> = [
    // [student answer, expression, expected]
    ["6(2x + 3)", "12x + 18", "CORRECT"],
    ["3(4x + 6)", "12x + 18", "UNFINISHED"],          // common factor not the highest
    ["6(2x + 18)", "12x + 18", "INCORRECT"],          // divided the first term only
    ["7y(y + 1)", "7y^2 + 7y", "CORRECT"],
    ["7y(y)", "7y^2 + 7y", "INCORRECT"],              // dropped the 1
    ["12x^3(2 - 3x + 5x^2)", "24x^3 - 36x^4 + 60x^5", "CORRECT"],
    ["6x^3(4 - 6x + 10x^2)", "24x^3 - 36x^4 + 60x^5", "UNFINISHED"],
    ["-6(x + 3)", "-6x - 18", "CORRECT"],
    ["-6(x - 3)", "-6x - 18", "INCORRECT"],
    ["(x + 4)(5 + y)", "5(x + 4) + y(x + 4)", "CORRECT"],
    ["5x + 20 + xy + 4y", "5(x + 4) + y(x + 4)", "UNFINISHED"], // expanded instead of factorising
    ["(x + 1)(4y + 7)", "4xy + 4y + 7x + 7", "CORRECT"],
    ["4y(x + 1) + 7(x + 1)", "4xy + 4y + 7x + 7", "UNFINISHED"], // stopped at a sum
    ["(8p - 9q)(8p + 9q)", "64p^2 - 81q^2", "CORRECT"],
    ["(x - 4)(x - 5)", "x^2 - 9x + 20", "CORRECT"],
    ["(x - 5)(x - 4)", "x^2 - 9x + 20", "CORRECT"],   // order doesn't matter
    ["(x + 5)^2", "x^2 + 10x + 25", "CORRECT"],
    ["(x + 5)(x + 5)", "x^2 + 10x + 25", "CORRECT"],
    ["5(x - 3)(x + 3)", "5x^2 - 45", "CORRECT"],
    ["5(x^2 - 9)", "5x^2 - 45", "UNFINISHED"],
    ["3(x + 2)(x + 3)", "3x^2 + 15x + 18", "CORRECT"],
    ["3(x^2 + 5x + 6)", "3x^2 + 15x + 18", "UNFINISHED"],
    ["(3x + 6)(x + 3)", "3x^2 + 15x + 18", "UNFINISHED"],
    ["(x - 3)(x + 3)(x^2 + 9)", "x^4 - 81", "CORRECT"],
    ["(x^2 - 9)(x^2 + 9)", "x^4 - 81", "UNFINISHED"],
    ["(4y - 5)(2x - 3)", "8xy - 12y - 10x + 15", "CORRECT"],
    ["x + 5", "x^2 + 5x", "INCORRECT"],
    ["banana", "x^2 + 5x", "UNREADABLE"],
  ];
  for (const [answer, expression, expected] of cases) {
    it(`${answer}  for  ${expression}  →  ${expected}`, () => {
      assert.equal(classifyFactorisation(answer, expression), expected);
    });
  }

  it("never treats a sum as a finished factorisation", () => {
    assert.equal(isFullyFactorisedForm("2y(x + 1) + 3(x + 1)"), false);
    assert.equal(isFullyFactorisedForm("x^2 + 5x"), false);
  });
});

describe("Lotus exact algebra — simplifying a division", () => {
  it("accepts the fully cancelled form and flags an uncancelled one", () => {
    const expr = "(x^2 - 9)/(x^2 - 6x + 9)";
    assert.equal(classifySimplification("(x + 3)/(x - 3)", expr, "(x + 3)/(x - 3)"), "CORRECT");
    assert.equal(classifySimplification("(x^2 - 9)/(x^2 - 6x + 9)", expr, "(x + 3)/(x - 3)"), "UNFINISHED");
    assert.equal(classifySimplification("x/(x - 6)", expr, "(x + 3)/(x - 3)"), "INCORRECT");
  });
});

describe("Lotus exact algebra — validating a claimed-reduced answer with no separate key", () => {
  // Authoring time has no independently verified "key" to compare a candidate
  // SIMPLIFY canonical answer against — the candidate IS the key being
  // validated. classifyReducedForm exists for exactly this case: it compares
  // the candidate against the ORIGINAL unreduced expression instead, and
  // requires STRICTLY lower total numerator+denominator degree. Regression
  // coverage for the bug where assertFixedItemIsValid used to call
  // classifySimplification(answer, expression, answer) — comparing the
  // candidate against itself, which made the UNFINISHED branch unreachable
  // by construction (degree(s) <= degree(s) is always true) and let an
  // unreduced canonical answer validate as CORRECT.
  const expr = "(x^2 - 9)/(x^2 - 6x + 9)";
  it("a genuinely reduced answer is CORRECT", () => {
    assert.equal(classifyReducedForm("(x + 3)/(x - 3)", expr), "CORRECT");
  });
  it("the literal unreduced original restated as its own answer is UNFINISHED, not CORRECT", () => {
    assert.equal(classifyReducedForm(expr, expr), "UNFINISHED");
  });
  it("a factored-but-uncancelled form is UNFINISHED even though it's algebraically equal", () => {
    assert.equal(classifyReducedForm("(x-3)(x+3)/((x-3)(x-3))", expr), "UNFINISHED");
  });
  it("a wrong answer is INCORRECT", () => {
    assert.equal(classifyReducedForm("x/(x - 6)", expr), "INCORRECT");
  });
});

describe("Lotus exact algebra — matching a student's answer to a predicted mistake", () => {
  it("matches the same factors in any order and spacing", () => {
    assert.equal(sameFactorisation("(x+4)(x+3)", "(x + 3)(x + 4)"), true);
    assert.equal(sameFactorisation("5y(x + 4)", "(x + 4)(5y)"), true);
    assert.equal(sameFactorisation("3(6 + 4x)", "3(4x + 6)"), true);
  });

  it("does not match different factorisations that happen to be equal", () => {
    assert.equal(sameFactorisation("3(4x + 6)", "6(2x + 3)"), false);
    assert.equal(sameFactorisation("(x^2 - 9)(x^2 + 9)", "(x - 3)(x + 3)(x^2 + 9)"), false);
  });
});
