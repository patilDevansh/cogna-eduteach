import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextStepHint } from "../../src/engines/diagnostic-v2/diagnostic-v2-next-step-hint";
import { verifyDiagnosticV2Step } from "../../src/engines/diagnostic-v2/diagnostic-v2-verifier-router";
import type { DiagnosticV2Track } from "@cogna/shared";

// The hint is a demo affordance, so the bar is not "is it the step a teacher
// would write" — it is "can the grader never contradict it". Every non-null
// hint is therefore re-checked against the real verifier here, exactly as the
// generator does internally, because a hint the student types verbatim and is
// then marked wrong for is worse than no hint at all.

const NEG: DiagnosticV2Track = "NEGATIVE_DISTRIBUTION";
const FRAC: DiagnosticV2Track = "FRACTION_LINEAR";

describe("nextStepHint — conventional route on the linear/bracket grammar", () => {
  const cases: Array<[string, string]> = [
    // Distribution is offered before combining, which is what a student writes.
    ["-2(x - 5) + 3 = 11", "-2x + 10 + 3 = 11"],
    ["-4(z - 2) + 3 = 19", "-4z + 8 + 3 = 19"],
    ["-3(y - 4)", "-3y + 12"],
    ["3x + 5 = 20", "3x = 15"],
    ["4x - 7 = 2x + 9", "2x - 7 = 9"],
    ["2x - 7 = 9", "2x = 16"],
    ["2x = 16", "x = 8"],
  ];

  for (const [line, expected] of cases) {
    it(`"${line}" -> "${expected}"`, () => {
      assert.equal(nextStepHint(line, NEG), expected);
    });
  }
});

describe("nextStepHint — fraction grammar clears denominators by the LCD", () => {
  it("scales a single denominator", () => {
    assert.equal(nextStepHint("x/2 + 3 = 7", FRAC, "ENTRY_FRAC_SIMPLE"), "x + 6 = 14");
  });

  it("uses the common multiple when the two sides differ", () => {
    assert.equal(
      nextStepHint("(x+1)/2 = (x-1)/3 + 1", FRAC, "FRAC_CLEAR_MAIN"),
      "3x + 3 = 2x + 4",
    );
  });
});

describe("nextStepHint — abstains rather than guessing", () => {
  it("returns null once the line is already solved", () => {
    assert.equal(nextStepHint("x = 5", NEG), null);
  });

  it("returns null for a bare expression with nothing left to expand", () => {
    assert.equal(nextStepHint("-3y + 12", NEG), null);
  });

  it("returns null when the line cannot be parsed", () => {
    assert.equal(nextStepHint("umm i dunno", NEG), null);
  });

  it("returns null on grammars outside this slice", () => {
    assert.equal(nextStepHint("z^2 - 16", "IDENTITY_DIFF_SQUARES", "ID_DIFF_MAIN"), null);
    assert.equal(nextStepHint("x^2 + 5x + 6", "FACTOR_MONIC_TRINOMIAL", "FAC_MONIC_MAIN"), null);
    assert.equal(nextStepHint("(x+2)(x-3) = 0", "QUAD_ZERO_PRODUCT", "QUAD_ZP_MAIN"), null);
  });

  it("resolves COMBINED_ALGEBRA through the stage's own grammar", () => {
    // Bracket stage of the combined track still gets a hint...
    assert.equal(
      nextStepHint("-2(x - 5) + 3 = 11", "COMBINED_ALGEBRA", "NEG_DIST_MAIN"),
      "-2x + 10 + 3 = 11",
    );
    // ...while a later topic in the same session does not.
    assert.equal(
      nextStepHint("z^2 - 16", "COMBINED_ALGEBRA", "ID_DIFF_MAIN"),
      null,
    );
  });
});

describe("nextStepHint — safety property", () => {
  // The whole reason the generator self-checks: a hint must be a step the
  // grader accepts, on every grammar, for every line we are willing to hint on.
  const lines: Array<[string, DiagnosticV2Track, string | null]> = [
    ["-2(x - 5) + 3 = 11", NEG, null],
    ["-4(z - 2) + 3 = 19", NEG, null],
    ["-3(y - 4)", NEG, null],
    ["3x + 5 = 20", NEG, null],
    ["4x - 7 = 2x + 9", NEG, null],
    ["2x - 7 = 9", NEG, null],
    ["2x = 16", NEG, null],
    ["x/2 + 3 = 7", FRAC, "ENTRY_FRAC_SIMPLE"],
    ["(x+1)/2 = (x-1)/3 + 1", FRAC, "FRAC_CLEAR_MAIN"],
    ["-2(x - 5) + 3 = 11", "COMBINED_ALGEBRA", "NEG_DIST_MAIN"],
  ];

  for (const [line, track, stage] of lines) {
    it(`the hint after "${line}" is VALID to the grader`, () => {
      const hint = nextStepHint(line, track, stage);
      assert.notEqual(hint, null, "expected a hint for this line");
      assert.equal(
        verifyDiagnosticV2Step(line, hint!, track, stage).validity,
        "VALID",
      );
    });
  }

  it("never returns the line it was given", () => {
    for (const [line, track, stage] of lines) {
      assert.notEqual(
        nextStepHint(line, track, stage)?.replace(/\s+/g, ""),
        line.replace(/\s+/g, ""),
      );
    }
  });
});

describe("nextStepHint — walking a whole item to the answer", () => {
  it("chains hint-to-hint until the equation is solved", () => {
    let line = "-2(x - 5) + 3 = 11";
    const route: string[] = [line];

    for (let guard = 0; guard < 10; guard++) {
      const hint = nextStepHint(line, NEG);
      if (hint === null) break;
      // Each hop must itself be a legal step from the previous line.
      assert.equal(verifyDiagnosticV2Step(line, hint, NEG).validity, "VALID");
      line = hint;
      route.push(line);
    }

    // -2(x - 5) + 3 = 11 solves to x = 1, and following the hints must land there.
    assert.equal(line, "x = 1", `route was: ${route.join(" -> ")}`);
  });
});
