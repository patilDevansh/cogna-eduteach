import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFractionTransformation,
  findFirstInvalidFractionAction,
  FRACTION_VERIFIER_VERSION,
  lineHasFractionSyntax,
  verifyFractionStepValidity,
} from "../../src/engines/diagnostic-v2/fraction-linear-verifier";
import { parseLinearWithBracket } from "../../src/engines/diagnostic-v2/linear-bracket-verifier";
import { verifyRendered, FIXED_ITEMS, renderTemplate } from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";

describe("fraction-linear-verifier — version", () => {
  it("is versioned separately from the linear-bracket verifier", () => {
    assert.equal(FRACTION_VERIFIER_VERSION, "fraction-linear-verifier-v1");
  });
});

describe("verifyFractionStepValidity — valid clearing", () => {
  const cases: Array<[string, string]> = [
    ["(x + 1)/2 = (x - 1)/3 + 1", "3(x + 1) = 2(x - 1) + 6"],
    ["(x + 1)/2 = (x - 1)/3 + 1", "3x + 3 = 2x - 2 + 6"],
    ["(y + 2)/4 = 3", "y + 2 = 12"],
    ["x/2 + 3 = 7", "x/2 = 4"],
    ["x/2 = 4", "x = 8"],
  ];

  for (const [previous, submitted] of cases) {
    it(`accepts "${previous}" -> "${submitted}"`, () => {
      const result = verifyFractionStepValidity(previous, submitted);
      assert.equal(result.validity, "VALID");
    });
  }

  it("labels a correct clear as MULTIPLY_BOTH_SIDES", () => {
    const result = verifyFractionStepValidity(
      "(x + 1)/2 = (x - 1)/3 + 1",
      "3(x + 1) = 2(x - 1) + 6",
    );
    assert.equal(result.validity, "VALID");
    assert.equal(result.transformation, "MULTIPLY_BOTH_SIDES");
  });
});

describe("verifyFractionStepValidity — first-invalid codes", () => {
  it("names a swapped LCD as WRONG_COMMON_MULTIPLE", () => {
    const result = verifyFractionStepValidity(
      "(x + 1)/2 = (x - 1)/3 + 1",
      "2(x + 1) = 3(x - 1) + 6",
    );
    assert.equal(result.validity, "INVALID");
    assert.equal(result.transformation, "MULTIPLY_BOTH_SIDES");
    assert.equal(result.firstInvalidActionCode, "WRONG_COMMON_MULTIPLE");
    assert.match(result.firstInvalidActionDescription!, /common multiple/);
  });

  it("names a dropped constant when clearing as DROPPED_TERM_WHEN_CLEARING", () => {
    const result = verifyFractionStepValidity(
      "(x + 1)/2 = (x - 1)/3 + 1",
      "3(x + 1) = 2(x - 1)",
    );
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "DROPPED_TERM_WHEN_CLEARING");
    assert.match(result.firstInvalidActionDescription!, /dropped|lost|under-scaled/i);
  });

  it("names a sign flip after clearing as SIGN_ERROR_AFTER_CLEARING", () => {
    const result = verifyFractionStepValidity(
      "(x + 1)/2 = (x - 1)/3 + 1",
      "-3(x + 1) = 2(x - 1) + 6",
    );
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "SIGN_ERROR_AFTER_CLEARING");
    assert.match(result.firstInvalidActionDescription!, /sign/);
  });
});

describe("verifyFractionStepValidity — abstention", () => {
  const unreadable = ["x^2/2 = 1", "2x + 3y = 7", "solve it", "(x + 1)/2 = (x - 1)/3 +"];

  for (const line of unreadable) {
    it(`returns PARSE_FAILED (never INVALID) for "${line}"`, () => {
      const result = verifyFractionStepValidity("(x + 1)/2 = (x - 1)/3 + 1", line);
      assert.equal(result.validity, "PARSE_FAILED");
      assert.notEqual(result.validity, "INVALID");
    });
  }
});

describe("classifyFractionTransformation / findFirstInvalidFractionAction", () => {
  it("detects fraction syntax via shared minus-fold", () => {
    assert.equal(lineHasFractionSyntax("(x + 1)/2 = 3"), true);
    assert.equal(lineHasFractionSyntax("3x + 1 = 7"), false);
  });

  it("exports classify/find helpers consistent with verifyFractionStepValidity", () => {
    const prev = parseLinearWithBracket("(x + 1)/2 = (x - 1)/3 + 1");
    const next = parseLinearWithBracket("2(x + 1) = 3(x - 1) + 6");
    assert.equal(classifyFractionTransformation(prev, next), "MULTIPLY_BOTH_SIDES");
    const first = findFirstInvalidFractionAction("(x + 1)/2 = (x - 1)/3 + 1", prev, next);
    assert.equal(first.firstInvalidActionCode, "WRONG_COMMON_MULTIPLE");
  });
});

describe("fraction templates — verifyRendered", () => {
  for (const item of FIXED_ITEMS.filter(
    (i) =>
      i.stageId === "ENTRY_FRAC_SIMPLE" ||
      i.stageId === "FRAC_CLEAR_MAIN" ||
      i.stageId === "FRAC_CLEAR_CONTRAST" ||
      i.stageId === "TRANSFER_FRAC_CLEAR",
  )) {
    it(`fixed item ${item.itemKey} independently re-verifies`, () => {
      const result = verifyRendered(item);
      assert.equal(result.passed, true, result.failures.join("; "));
      assert.ok(result.canonicalSolution);
      assert.doesNotMatch(result.canonicalSolution!, /\//);
    });
  }

  for (const id of [
    "TPL_FRAC_SIMPLE",
    "TPL_FRAC_CLEAR",
    "TPL_FRAC_CLEAR_BARE",
    "TPL_TRANSFER_FRAC_CLEAR",
  ] as const) {
    it(`rendered ${id} independently re-verifies`, () => {
      const item = renderTemplate(id, "golden-seed-frac-1");
      const result = verifyRendered(item);
      assert.equal(result.passed, true, `${item.openingLine}: ${result.failures.join("; ")}`);
    });
  }
});
