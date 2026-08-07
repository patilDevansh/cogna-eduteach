import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectAllowedNumbers,
  numericCrossCheck,
} from "../../src/engines/report-generator/report-numeric-gate";

const sessionData = {
  sessionId: "sess-1",
  questionsAttempted: 4,
  correctAnswers: 3,
  accuracy: 0.75,
  conceptId: "C2_ONE_STEP_SUBTRACTION",
  masteryChanges: {
    C2_ONE_STEP_SUBTRACTION: { from: 0.4, to: 0.55 },
  },
  activeMisconception: null,
  remediationState: null,
  diagnosticFactors: [],
};

const weeklyData = {
  studentId: "student-1",
  sessionsCompleted: 2,
  questionsAttempted: 10,
  accuracy: 0.8,
  conceptsPracticed: ["C2_ONE_STEP_SUBTRACTION"],
  masteryChanges: [{ conceptId: "C2_ONE_STEP_SUBTRACTION", from: 0.4, to: 0.6, confidence: 0.7 }],
  activePatterns: [{ misconceptionId: "SIGN_HANDLING", confidence: 0.65, uncertainty: "ok" }],
  revisionPlan: [{ conceptId: "C2_ONE_STEP_SUBTRACTION", reason: "Retention", questionCount: 2 }],
  parentActions: ["Keep practice sessions short — about 10–15 minutes."],
  weakEvidence: false,
};

describe("report numeric cross-check — allowed set", () => {
  it("includes counts, accuracy percent, mastery from/to/delta", () => {
    const allowed = collectAllowedNumbers(sessionData);
    assert.ok(allowed.has("4"));
    assert.ok(allowed.has("3"));
    assert.ok(allowed.has("75")); // 0.75 → 75%
    assert.ok(allowed.has("0.4"));
    assert.ok(allowed.has("0.55"));
    assert.ok(allowed.has("0.15")); // |0.55-0.4|
  });

  it("includes weekly questionCount and pattern confidence", () => {
    const allowed = collectAllowedNumbers(weeklyData);
    assert.ok(allowed.has("2"));
    assert.ok(allowed.has("10"));
    assert.ok(allowed.has("80"));
    assert.ok(allowed.has("0.65"));
    assert.ok(allowed.has("65"));
  });
});

describe("report numeric cross-check — reject table", () => {
  it("accepts prose that only restates structured numbers", () => {
    const text =
      "You answered 3 of 4 questions correctly (75% accuracy). Mastery moved from 0.4 to 0.55.";
    assert.equal(numericCrossCheck(text, sessionData).ok, true);
  });

  it("rejects inventing a percentage", () => {
    const result = numericCrossCheck(
      "Great session — you hit 92% accuracy on four questions.",
      sessionData,
    );
    assert.equal(result.ok, false);
    assert.ok(result.invented?.includes("92"));
  });

  it("rejects wrong counts", () => {
    const result = numericCrossCheck(
      "You answered 2 of 4 questions correctly (75% accuracy).",
      sessionData,
    );
    assert.equal(result.ok, false);
    assert.ok(result.invented?.includes("2"));
  });

  it("rejects swapped mastery deltas", () => {
    // from/to swapped: 0.55 → 0.4 is a regression narrative with numbers that
    // individually appear, but the delta direction invents nothing new —
    // both 0.55 and 0.4 are allowed. Swap alone is not inventing.
    // Invent a mastery value that was never recorded:
    const result = numericCrossCheck(
      "Mastery jumped from 0.4 to 0.9 this session.",
      sessionData,
    );
    assert.equal(result.ok, false);
    assert.ok(result.invented?.includes("0.9"));
  });

  it("rejects weekly inventing questionCount", () => {
    const result = numericCrossCheck(
      "Next short practice: one-step subtraction (5 questions).",
      weeklyData,
    );
    assert.equal(result.ok, false);
    assert.ok(result.invented?.includes("5"));
  });

  it("rejects empty AI text", () => {
    assert.equal(numericCrossCheck("   ", sessionData).ok, false);
  });
});
