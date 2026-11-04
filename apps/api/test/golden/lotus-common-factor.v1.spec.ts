import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readCommonFactor } from "../../src/lotus/lotus-algebra";
import { isBareArithmeticFact } from "../../src/lotus/lotus-question-factory";

describe("readCommonFactor — what a wrong 'take out the common factor' answer shows", () => {
  const read = (answer: string, expression: string) => readCommonFactor(answer, expression);

  it("names dividing only some terms, with the right factor outside", () => {
    assert.deepEqual(read("7(x + 28)", "7x + 28"), { numberPart: true, letterPart: false, mistake: "DIVIDED_FIRST_TERM_ONLY" });
    assert.equal(read("3(2x+9)", "6x + 9")?.mistake, "DIVIDED_FIRST_TERM_ONLY");
    assert.equal(read("-4(x + 8)", "-4x - 8")?.mistake, "DIVIDED_FIRST_TERM_ONLY");
  });

  it("names powers left unreduced and a dropped 1", () => {
    assert.equal(read("3x^2(x^3 + 2x^2)", "3x^3 + 6x^2")?.mistake, "INDEX_NOT_REDUCED");
    assert.deepEqual(read("3x(x^2 + x)", "3x^3 + 3x^2 + 3x"), { numberPart: true, letterPart: true, mistake: "DROPPED_THE_ONE" });
  });

  it("credits the right factor but names nothing when the bracket is wrong some other way", () => {
    assert.deepEqual(read("7(x + 5)", "7x + 28"), { numberPart: true, letterPart: false });
    assert.deepEqual(read("4(x + 7)", "8x + 28"), { numberPart: true, letterPart: false });
    assert.deepEqual(read("7(7x + 28)", "7x + 28"), { numberPart: true, letterPart: false }, "no term divided is not 'only the first'");
  });

  it("says nothing when the factor outside isn't the highest, there's nothing common, or it isn't one factor and one bracket", () => {
    assert.equal(read("2(3x + 9)", "6x + 18"), null);
    assert.equal(read("(x + 2)(x + 4)", "x^2 + 5x + 6"), null);
    assert.equal(read("7x(1 + 4)", "7x + 28"), null);
    assert.equal(read("7(x+", "7x + 28"), null);
  });
});

describe("isBareArithmeticFact — the question writer never asks a Grade 8 student 28 ÷ 7", () => {
  it("catches one operation on two unsigned whole numbers, however it's worded", () => {
    for (const prompt of ["What is 28 ÷ 7?", "28/7 = ?", "Find 28 divided by 7.", "Calculate (28) ÷ (7)", "6 × 7 = □", "what's 12 + 9"]) {
      assert.ok(isBareArithmeticFact(prompt), prompt);
    }
  });

  it("lets through signed facts, algebra and real questions", () => {
    for (const prompt of ["−15 ÷ −3 = ?", "28 ÷ −4 = ?", "Factorise 7x + 28", "What is the highest number that divides every term of 28x + 42?", "Find the HCF of 24, 36."]) {
      assert.ok(!isBareArithmeticFact(prompt), prompt);
    }
  });
});
