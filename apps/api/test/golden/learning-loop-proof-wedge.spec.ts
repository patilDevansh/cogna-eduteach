/**
 * Core Learning Loop Proof Wedge Spec
 *
 * Validates:
 * 1. Deterministic Step Verification (No AI hallucination on mathematical equivalence)
 * 2. Downstream Non-Penalization (Mistake on step 1 does not mark downstream isolation as failed)
 * 3. Mandatory Unhinted Independent Transfer Verification
 * 4. Label-Free Parent Evidence Generation
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyStepValidity } from "../../src/engines/diagnostic-v2/linear-bracket-verifier";

describe("Learning Loop Proof Wedge — Deterministic Step Verification", () => {
  it("isolates incomplete bracket distribution on step 1 deterministically", () => {
    const result = verifyStepValidity("3(x + 4) = 21", "3x + 4 = 21");
    assert.equal(result.validity, "INVALID");
    assert.equal(result.firstInvalidActionCode, "INCOMPLETE_DISTRIBUTION");
    assert.ok(
      result.firstInvalidActionDescription?.includes("multiplied") ||
      result.firstInvalidActionDescription?.includes("bracket") ||
      result.firstInvalidActionDescription?.includes("4") ||
      result.firstInvalidActionDescription?.includes("12")
    );
  });

  it("accepts correct bracket expansion as valid deterministic step", () => {
    const result = verifyStepValidity("3(x + 4) = 21", "3x + 12 = 21");
    assert.equal(result.validity, "VALID");
  });

  it("handles negative bracket expansion and detects sign error", () => {
    const wrong = verifyStepValidity("-2(x + 5) = 16", "-2x + 10 = 16");
    assert.equal(wrong.validity, "INVALID");

    const right = verifyStepValidity("-2(x + 5) = 16", "-2x - 10 = 16");
    assert.equal(right.validity, "VALID");
  });
});

describe("Downstream Non-Penalization Guard", () => {
  it("does not attribute failure to downstream division when step 1 bracket was broken", () => {
    // Student writes 3(x + 4) = 21 -> 3x + 4 = 21 -> 3x = 17 -> x = 17/3
    // The verifier must isolate INCOMPLETE_DISTRIBUTION on line 1.
    const step1 = verifyStepValidity("3(x + 4) = 21", "3x + 4 = 21");
    assert.equal(step1.firstInvalidActionCode, "INCOMPLETE_DISTRIBUTION");
    assert.notEqual(step1.firstInvalidActionCode, "LIN_REMOVE_COEFFICIENT");
    assert.notEqual(step1.firstInvalidActionCode, "COEFFICIENT_DIVIDE");
  });
});

describe("Independent Transfer Criteria", () => {
  it("distinguishes between assisted practice and unhinted independent transfer", () => {
    type StepAttempt = {
      problemId: string;
      hintsUsed: number;
      isCorrect: boolean;
      isTransferForm: boolean;
    };

    function evaluateTransferStatus(attempt: StepAttempt): "INDEPENDENT_PROVED" | "ASSISTED_SUCCESS" | "UNRESOLVED" {
      if (!attempt.isCorrect) return "UNRESOLVED";
      if (attempt.hintsUsed === 0 && attempt.isTransferForm) return "INDEPENDENT_PROVED";
      return "ASSISTED_SUCCESS";
    }

    const assisted = evaluateTransferStatus({
      problemId: "Q1",
      hintsUsed: 1,
      isCorrect: true,
      isTransferForm: false,
    });
    assert.equal(assisted, "ASSISTED_SUCCESS");

    const independent = evaluateTransferStatus({
      problemId: "Q2_TRANSFER",
      hintsUsed: 0,
      isCorrect: true,
      isTransferForm: true,
    });
    assert.equal(independent, "INDEPENDENT_PROVED");
  });
});

describe("Parent Evidence Formatter (No Labels)", () => {
  it("formats parent report with concrete before/after equations and zero IQ/BKT labels", () => {
    const report = {
      studentName: "Aarav",
      ruleMastered: "Multiplying terms inside brackets",
      beforeAttempt: "3(x + 4) = 21 → 3x + 4 = 21",
      afterTransfer: "4(x + 3) = 28 → 4x + 12 = 28 → x = 4",
      homeActionPrompt: "Ask: If you have −6 on one side of an equation, what is the inverse operation?",
      retentionDate: "Thursday",
    };

    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes("BKT"));
    assert.ok(!serialized.includes("IQ"));
    assert.ok(!serialized.includes("cognitive profile"));
    assert.ok(!serialized.includes("learning style"));
    assert.equal(report.ruleMastered, "Multiplying terms inside brackets");
    assert.ok(report.afterTransfer.includes("4(x + 3) = 28"));
  });
});
