/**
 * How students really type answers on phones and laptops. A right answer must never be marked wrong, or
 * sent to the AI review as "unreadable", because of capitals, brackets, keyboards or what they wrap round it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyFactorisation, finalAnswerText, readNumberAnswer, sameNumber } from "../../src/lotus/lotus-algebra";

const marked = (answer: string, expression: string) => classifyFactorisation(finalAnswerText(answer) || answer, expression);

describe("typed algebra answers", () => {
  it("reads capitals, other brackets and keyboard variants as the same answer", () => {
    for (const answer of ["7(X+4)", "7[x+4]", "7{x+4}", "7(x＋4)", "７(x+4)", "7 × (x + 4)", "(x+4)7", "7(4+x)"]) {
      assert.equal(marked(answer, "7x + 28"), "CORRECT", answer);
    }
    assert.equal(marked("(x+3)**2", "x^2 + 6x + 9"), "CORRECT");
    assert.equal(marked("(x−2)(x–3)", "x^2 - 5x + 6"), "CORRECT");
  });

  it("takes the answer out of what students write round it", () => {
    for (const answer of ["7(x+4).", "= 7(x+4)", "7x+28 = 7(x+4)", "Ans: 7(x+4)", "Answer is 7(x+4)", "so 7(x + 4)", "7(x+4)\n"]) {
      assert.equal(marked(answer, "7x + 28"), "CORRECT", answer);
    }
  });

  it("still marks a wrong or unfinished answer as such, and leaves a broken one unreadable", () => {
    assert.equal(marked("7(x+28)", "7x + 28"), "INCORRECT");
    assert.equal(marked("Ans: 7(x + 28).", "7x + 28"), "INCORRECT");
    assert.equal(marked("(3x-6)(x+2)", "3x^2 - 12"), "UNFINISHED");
    assert.equal(marked("7(x+4", "7x + 28"), "UNREADABLE", "a missing bracket is checked with the student, not guessed");
  });
});

describe("typed number answers", () => {
  it("reads a final full stop, mixed numbers and fraction characters", () => {
    assert.ok(sameNumber("14.", "14"));
    assert.ok(sameNumber("1 1/2", "3/2"));
    assert.ok(sameNumber("-1 1/2", "-3/2"));
    assert.ok(sameNumber("½", "0.5"));
    assert.ok(sameNumber("1½", "3/2"));
    assert.ok(sameNumber("Ans: 36", "36"));
    assert.ok(sameNumber("x = −3", "-3"));
  });

  it("still refuses working and words", () => {
    assert.equal(readNumberAnswer("2*18*4"), null);
    assert.equal(readNumberAnswer("fourteen"), null);
  });
});
