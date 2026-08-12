import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTransformation,
  findFirstInvalidAction,
  isSolvedForm,
  normalizeLine,
  parseLinearWithBracket,
  verifyStepValidity,
  VERIFIER_VERSION,
} from "../../src/engines/diagnostic-v2/linear-bracket-verifier";

// The verifier is the ground truth the entire micro-skill diagnostic rests on:
// if it is wrong, every downstream piece of evidence is wrong, and no AI
// fallback can rescue that because AI is never consulted on a line the rules
// already decided. Every expectation below is hand-checked arithmetic.

describe("verifyStepValidity — valid transformations", () => {
  const cases: Array<[string, string]> = [
    ["3x + 5 = 20", "3x = 15"],
    ["3x = 15", "x = 5"],
    ["4x - 7 = 2x + 9", "2x - 7 = 9"],
    ["2x - 7 = 9", "2x = 16"],
    ["-2(x - 5) + 3 = 11", "-2x + 10 + 3 = 11"],
    ["-2(x - 5) + 3 = 11", "-2x + 13 = 11"],
    // Any valid route is accepted — there is no canonical sequence to mimic.
    ["-2(x - 5) + 3 = 11", "x = 1"],
    ["-3(y - 4)", "-3y + 12"],
    ["-4(z - 2) + 3 = 19", "-4z + 8 + 3 = 19"],
    ["-4z = 8", "z = -2"],
  ];

  for (const [previous, submitted] of cases) {
    it(`accepts "${previous}" -> "${submitted}"`, () => {
      assert.equal(verifyStepValidity(previous, submitted).validity, "VALID");
    });
  }
});

describe("verifyStepValidity — invalid transformations", () => {
  it("catches the canonical negative-distribution sign error", () => {
    const result = verifyStepValidity("-2(x - 5) + 3 = 11", "-2x - 10 + 3 = 11");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.transformation, "DISTRIBUTE");
    assert.equal(result.firstInvalidActionCode, "NEGATIVE_SIGN_PRODUCT");
    assert.match(result.firstInvalidActionDescription!, /10/);
  });

  it("catches the same error on a bare expression probe", () => {
    const result = verifyStepValidity("-3(y - 4)", "-3y - 12");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "NEGATIVE_SIGN_PRODUCT");
  });

  it("catches distributing to the variable but not the constant inside", () => {
    const result = verifyStepValidity("-2(x - 5) + 3 = 11", "-2x - 5 + 3 = 11");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "INCOMPLETE_DISTRIBUTION");
  });

  it("names outer-sign drop distinctly from the sign-product error", () => {
    const result = verifyStepValidity("-2(x - 5) + 3 = 11", "2x - 10 + 3 = 11");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "OUTER_SIGN_DROPPED");
    assert.notEqual(result.firstInvalidActionCode, "NEGATIVE_SIGN_PRODUCT");
    assert.match(result.firstInvalidActionDescription!, /outer factor -2/);
  });

  it("names a dropped outer constant without blaming the bracket", () => {
    const result = verifyStepValidity("-2(x - 5) + 3 = 11", "-2x + 10 = 11");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "OUTER_CONSTANT_DROPPED");
    assert.doesNotMatch(
      result.firstInvalidActionDescription!,
      /expanding the bracket did not give the same value/,
    );
    assert.match(result.firstInvalidActionDescription!, /outside the bracket was dropped/);
  });

  it("classifies a changed untouched side as a transcription slip, not distribution", () => {
    const result = verifyStepValidity("-2(x - 5) + 3 = 11", "-2x + 10 + 3 = 10");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.transformation, "OTHER");
    assert.equal(result.firstInvalidActionCode, "COPIED_UNCHANGED_SIDE");
    assert.match(result.firstInvalidActionDescription ?? "", /expanded correctly/);
    assert.match(result.firstInvalidActionDescription ?? "", /10 instead of 11/);
  });

  it("catches a coefficient dropped without dividing the other side", () => {
    const result = verifyStepValidity("3x = 15", "x = 15");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "COEFFICIENT_DROPPED");
  });

  it("catches a plain arithmetic slip that keeps the same shape", () => {
    const result = verifyStepValidity("3x + 5 = 20", "3x = 14");
    assert.equal(result.validity, "INVALID");
  });
});

describe("verifyStepValidity — abstention, not accusation", () => {
  // The single most important distinction in this file: a line the checker
  // cannot read is NOT a wrong line. Only PARSE_FAILED/AMBIGUOUS reach the AI
  // grader, and neither ever produces evidence on its own.
  const unreadable = ["x^2 + 3 = 7", "2x + 3y = 7", "3x + ", "3x = = 5", "-2(x - 5 + 3 = 11", "solve it"];

  for (const line of unreadable) {
    it(`returns PARSE_FAILED (never INVALID) for "${line}"`, () => {
      const result = verifyStepValidity("3x + 5 = 20", line);
      assert.equal(result.validity, "PARSE_FAILED");
      assert.ok(result.parseError);
    });
  }

  it("returns AMBIGUOUS when an equation turns into a bare expression", () => {
    assert.equal(verifyStepValidity("3x + 5 = 20", "3x").validity, "AMBIGUOUS");
  });

  it("returns AMBIGUOUS when the comparison degenerates on one side only", () => {
    assert.equal(verifyStepValidity("3x + 5 = 20", "5 = 5").validity, "AMBIGUOUS");
  });

  it("reports an empty submission as PARSE_FAILED rather than throwing", () => {
    assert.equal(verifyStepValidity("3x + 5 = 20", "").validity, "PARSE_FAILED");
  });
});

describe("exact rational arithmetic", () => {
  it("accepts a fractional solution exactly, with no float drift", () => {
    assert.equal(verifyStepValidity("2x + 1 = 0", "x = -1/2").validity, "VALID");
    assert.equal(verifyStepValidity("2x + 1 = 0", "x = -0").validity, "INVALID");
  });

  it("accepts a division route that produces a fraction mid-way", () => {
    assert.equal(verifyStepValidity("3x = 1", "x = 1/3").validity, "VALID");
  });
});

describe("classifyTransformation", () => {
  const classify = (previous: string, submitted: string) =>
    classifyTransformation(parseLinearWithBracket(previous), parseLinearWithBracket(submitted));

  it("reads a vanished bracket as DISTRIBUTE, right or wrong", () => {
    assert.equal(classify("-2(x - 5) + 3 = 11", "-2x + 10 + 3 = 11"), "DISTRIBUTE");
    assert.equal(classify("-2(x - 5) + 3 = 11", "-2x - 10 + 3 = 11"), "DISTRIBUTE");
  });

  it("reads a variable collected across the equals sign as SUBTRACT_BOTH_SIDES", () => {
    assert.equal(classify("4x - 7 = 2x + 9", "2x - 7 = 9"), "SUBTRACT_BOTH_SIDES");
  });

  it("reads a changed coefficient as DIVIDE_BOTH_SIDES", () => {
    assert.equal(classify("3x = 15", "x = 5"), "DIVIDE_BOTH_SIDES");
  });

  it("reads a constant moving off the variable side as ADD/SUBTRACT_BOTH_SIDES", () => {
    assert.equal(classify("2x - 7 = 9", "2x = 16"), "ADD_BOTH_SIDES");
    assert.equal(classify("3x + 5 = 20", "3x = 15"), "SUBTRACT_BOTH_SIDES");
  });
});

describe("findFirstInvalidAction", () => {
  it("names the actual numbers the student saw, not a generic 'wrong'", () => {
    const previous = "-2(x - 5) + 3 = 11";
    const result = findFirstInvalidAction(
      previous,
      parseLinearWithBracket(previous),
      parseLinearWithBracket("-2x - 10 + 3 = 11"),
    );
    assert.equal(result.firstInvalidActionCode, "NEGATIVE_SIGN_PRODUCT");
    assert.match(result.firstInvalidActionDescription!, /-2/);
    assert.match(result.firstInvalidActionDescription!, /-5/);
  });
});

describe("isSolvedForm", () => {
  it("recognises x = n as the end state, in any variable", () => {
    assert.equal(isSolvedForm(parseLinearWithBracket("x = 5")), true);
    assert.equal(isSolvedForm(parseLinearWithBracket("z = -2")), true);
    assert.equal(isSolvedForm(parseLinearWithBracket("x = -1/2")), true);
  });

  it("does not treat partial working as an end state", () => {
    assert.equal(isSolvedForm(parseLinearWithBracket("2x = 16")), false);
    assert.equal(isSolvedForm(parseLinearWithBracket("x + 1 = 5")), false);
    assert.equal(isSolvedForm(parseLinearWithBracket("-3y + 12")), false);
  });
});

describe("normalizeLine / VERIFIER_VERSION", () => {
  it("stores a canonical form so a later reader sees what was compared", () => {
    assert.equal(normalizeLine(parseLinearWithBracket("-2(x - 5) + 3 = 11")), "-2x+13=0x+11");
    assert.equal(normalizeLine(parseLinearWithBracket("3x + 5 = 20")), "3x+5=0x+20");
  });

  it("is versioned, so stored steps stay replayable", () => {
    assert.equal(VERIFIER_VERSION, "linear-bracket-verifier-v1");
  });
});
