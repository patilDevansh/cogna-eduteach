import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeConfidenceCalibration,
  computeHintDependence,
  computeMasteryUpdate,
  computeMisconceptionConfidence,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";

describe("G04 — Mastery increase on independent correct", () => {
  it("applies Δ mastery = 0.12 for CORRECT, no hints, difficulty 3", () => {
    const { newValue, signedEvidence } = computeMasteryUpdate({
      previousValue: 0.5,
      grade: "CORRECT",
      difficulty: 3,
      highestHintLevel: 0,
      itemQualityWeight: 1.0,
    });

    assert.equal(signedEvidence, 1.0);
    assert.ok(Math.abs(newValue - 0.62) < 0.001);
  });
});

describe("G05 — Correct with hint level 3", () => {
  it("applies smaller positive Δ with independenceWeight 0.4", () => {
    const { newValue, signedEvidence } = computeMasteryUpdate({
      previousValue: 0.5,
      grade: "CORRECT",
      difficulty: 3,
      highestHintLevel: 3,
      itemQualityWeight: 1.0,
    });

    assert.equal(signedEvidence, 0.4);
    assert.ok(Math.abs(newValue - 0.548) < 0.001);
  });
});

describe("G06 — Invalid format", () => {
  it("leaves mastery unchanged with signedEvidence 0", () => {
    const { newValue, signedEvidence } = computeMasteryUpdate({
      previousValue: 0.5,
      grade: "INVALID_FORMAT",
      difficulty: 3,
      highestHintLevel: 0,
      itemQualityWeight: 1.0,
    });

    assert.equal(signedEvidence, 0);
    assert.equal(newValue, 0.5);
  });
});

describe("G01 — Sign-handling errors, high confidence", () => {
  it("computes misconception confidence ≈ 0.65 after 2 matches", () => {
    const confidence = computeMisconceptionConfidence(2);
    assert.ok(Math.abs(confidence - 0.65) < 0.001);
  });

  it("flags possibly_overconfident when window has enough high-confidence incorrect", () => {
    const attempts = [
      { grade: "INCORRECT" as const, selfRatedConfidence: 5 },
      { grade: "INCORRECT" as const, selfRatedConfidence: 5 },
      { grade: "INCORRECT" as const, selfRatedConfidence: 4 },
      { grade: "CORRECT" as const, selfRatedConfidence: 3 },
    ];
    assert.equal(computeConfidenceCalibration(attempts), "possibly_overconfident");
  });

  it("does not flag overconfident from a single attempt", () => {
    const attempts = [
      { grade: "INCORRECT" as const, selfRatedConfidence: 5 },
    ];
    assert.equal(computeConfidenceCalibration(attempts), "unknown");
  });
});

describe("Hint dependence", () => {
  it("computes average independence penalty over eligible questions", () => {
    const score = computeHintDependence([
      { highestHintLevel: 0, hintsAvailable: true },
      { highestHintLevel: 3, hintsAvailable: true },
      { highestHintLevel: 1, hintsAvailable: true },
    ]);
    assert.ok(Math.abs(score - (0 + 1.0 + 0.33) / 3) < 0.01);
  });
});
