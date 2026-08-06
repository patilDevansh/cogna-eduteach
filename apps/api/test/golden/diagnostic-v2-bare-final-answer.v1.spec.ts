/**
 * Bare final answers — `5` rather than `x = 5`.
 *
 * Regression tests for a defect found by driving the real quiz: a student who
 * solved `3x + 5 = 20` in their head and typed `5` was told they were WRONG.
 * `5` is not an equation, so the deterministic verifier abstained, and the
 * line fell through to the AI grader — whose contract is VALID or INVALID and
 * nothing else. It picked INVALID. A correct answer was marked wrong, and
 * negative evidence was written against a skill the student had just
 * demonstrated, which then steered every question after it.
 *
 * The fix is not a better prompt. Deciding whether `5` solves `3x + 5 = 20` is
 * arithmetic, so arithmetic decides it, and the grader never sees it. The
 * grader is for input with genuinely nothing to compute.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBareFinalAnswer } from "../../src/engines/diagnostic-v2/linear-bracket-verifier";
import {
  evidenceWeight,
  EVIDENCE_WEIGHTS,
  FINAL_ANSWER_ONLY_WEIGHT_MULTIPLIER,
  AI_FALLBACK_WEIGHT_MULTIPLIER,
} from "../../src/engines/diagnostic-v2/diagnostic-v2.formulas";
import { contextModifiersForStep } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";

describe("checkBareFinalAnswer — recognises a naked value", () => {
  it("accepts the correct answer typed without 'x ='", () => {
    const r = checkBareFinalAnswer("3x + 5 = 20", "5");
    assert.equal(r.isBareAnswer, true);
    assert.equal(r.matchesSolution, true, "5 IS the answer to 3x + 5 = 20");
    assert.equal(r.solution, "5");
  });

  it("rejects a wrong bare answer, and says what the answer was", () => {
    const r = checkBareFinalAnswer("3x + 5 = 20", "7");
    assert.equal(r.isBareAnswer, true);
    assert.equal(r.matchesSolution, false);
    assert.equal(r.solution, "5");
  });

  it("works mid-working, not just from the opening line", () => {
    assert.equal(checkBareFinalAnswer("3x = 15", "5").matchesSolution, true);
  });

  it("works with the variable on both sides", () => {
    assert.equal(checkBareFinalAnswer("4x - 7 = 2x + 9", "8").matchesSolution, true);
    assert.equal(checkBareFinalAnswer("4x - 7 = 2x + 9", "5").matchesSolution, false);
  });

  it("works through a bracket", () => {
    assert.equal(checkBareFinalAnswer("-2(x - 5) + 3 = 11", "1").matchesSolution, true);
  });

  it("handles a negative bare answer", () => {
    assert.equal(checkBareFinalAnswer("x + 7 = 3", "-4").matchesSolution, true);
  });

  it("folds a unicode minus, so −4 is not read as a different answer", () => {
    assert.equal(checkBareFinalAnswer("x + 7 = 3", "−4").matchesSolution, true);
  });
});

describe("checkBareFinalAnswer — leaves everything else on the normal path", () => {
  const notBare = [
    ["x = 5", "already an equation — the normal verifier handles it"],
    ["x=5", "same, without spaces"],
    ["3x = 15", "a line of working, not an answer"],
    ["umm i think ?? maybe x", "gibberish — genuinely nothing to compute, belongs to the AI grader"],
    ["", "empty"],
  ];
  for (const [line, why] of notBare) {
    it(`does not claim ${JSON.stringify(line)} — ${why}`, () => {
      assert.equal(checkBareFinalAnswer("3x + 5 = 20", line!).isBareAnswer, false);
    });
  }

  it("abstains when the previous line has no unique solution", () => {
    // An identity: every x satisfies it, so a bare value cannot be checked.
    const r = checkBareFinalAnswer("2(x + 1) = 2x + 2", "5");
    assert.equal(r.isBareAnswer, true);
    assert.equal(r.matchesSolution, undefined, "must abstain, not guess");
  });

  it("abstains against a bare expression with no equals sign", () => {
    const r = checkBareFinalAnswer("-3(y - 4)", "12");
    assert.equal(r.matchesSolution, undefined);
  });
});

describe("evidence: a right answer without working counts, but counts for less", () => {
  it("tags the step FINAL_ANSWER_ONLY", () => {
    const mods = contextModifiersForStep({
      assistanceLevel: "NONE",
      isTransferCheck: false,
      finalAnswerOnly: true,
    });
    assert.ok(mods.includes("FINAL_ANSWER_ONLY"));
    assert.ok(mods.includes("INDEPENDENT"), "still independent work");
  });

  it("does not tag ordinary shown working", () => {
    const mods = contextModifiersForStep({ assistanceLevel: "NONE", isTransferCheck: false });
    assert.ok(!mods.includes("FINAL_ANSWER_ONLY"));
  });

  it("weighs a bare correct answer below shown working, and above nothing", () => {
    const shown = evidenceWeight("INDEPENDENT_CORRECT", "DETERMINISTIC", ["INDEPENDENT"]);
    const bare = evidenceWeight("INDEPENDENT_CORRECT", "DETERMINISTIC", [
      "INDEPENDENT",
      "FINAL_ANSWER_ONLY",
    ]);
    assert.ok(bare < shown, "a right answer proves the destination, not the route");
    assert.ok(bare > 0, "but it is still positive evidence — the student was right");
    assert.equal(bare, EVIDENCE_WEIGHTS.INDEPENDENT_CORRECT * FINAL_ANSWER_ONLY_WEIGHT_MULTIPLIER);
  });

  it("never stacks with the AI-fallback discount — a bare answer never reaches the grader", () => {
    const both = evidenceWeight("INDEPENDENT_CORRECT", "AI_FALLBACK", ["FINAL_ANSWER_ONLY"]);
    assert.equal(
      both,
      EVIDENCE_WEIGHTS.INDEPENDENT_CORRECT * AI_FALLBACK_WEIGHT_MULTIPLIER,
      "AI_FALLBACK wins; the two discounts must not compound",
    );
  });
});
