import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferConfidenceFromBehavior,
  resolveConfidenceForCalibration,
  computeConfidenceCalibration,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";

describe("inferConfidenceFromBehavior", () => {
  it("infers high confidence for a fast, clean answer relative to the student's own pace", () => {
    const level = inferConfidenceFromBehavior({
      totalTimeMs: 4000,
      studentAverageTimeMs: 10000,
      hintCount: 0,
      answerChangedBeforeSubmit: false,
    });
    assert.equal(level, 5);
  });

  it("infers low confidence for a slow answer even with no hints or edits", () => {
    const level = inferConfidenceFromBehavior({
      totalTimeMs: 20000,
      studentAverageTimeMs: 10000,
      hintCount: 0,
      answerChangedBeforeSubmit: false,
    });
    assert.equal(level, 2);
  });

  it("infers low confidence when a hint was used, regardless of speed", () => {
    const level = inferConfidenceFromBehavior({
      totalTimeMs: 3000,
      studentAverageTimeMs: 10000,
      hintCount: 1,
      answerChangedBeforeSubmit: false,
    });
    assert.equal(level, 2);
  });

  it("infers low confidence when the answer was changed before submit, regardless of speed", () => {
    const level = inferConfidenceFromBehavior({
      totalTimeMs: 3000,
      studentAverageTimeMs: 10000,
      hintCount: 0,
      answerChangedBeforeSubmit: true,
    });
    assert.equal(level, 2);
  });

  it("infers neutral confidence for a middling pace with no hesitation signals", () => {
    const level = inferConfidenceFromBehavior({
      totalTimeMs: 9500,
      studentAverageTimeMs: 10000,
      hintCount: 0,
      answerChangedBeforeSubmit: false,
    });
    assert.equal(level, 3);
  });

  it("falls back to hint/edit-only signal when there's no pace baseline yet", () => {
    assert.equal(
      inferConfidenceFromBehavior({
        totalTimeMs: 1000,
        studentAverageTimeMs: null,
        hintCount: 0,
        answerChangedBeforeSubmit: false,
      }),
      3,
    );
    assert.equal(
      inferConfidenceFromBehavior({
        totalTimeMs: 1000,
        studentAverageTimeMs: null,
        hintCount: 2,
        answerChangedBeforeSubmit: false,
      }),
      2,
    );
  });
});

describe("resolveConfidenceForCalibration", () => {
  it("prefers the explicit self-rated value when present", () => {
    assert.equal(
      resolveConfidenceForCalibration({ selfRatedConfidence: 4, inferredConfidence: 2 }),
      4,
    );
  });

  it("falls back to the inferred value when self-rated is null", () => {
    assert.equal(
      resolveConfidenceForCalibration({ selfRatedConfidence: null, inferredConfidence: 5 }),
      5,
    );
  });

  it("returns null when neither is available", () => {
    assert.equal(
      resolveConfidenceForCalibration({ selfRatedConfidence: null, inferredConfidence: null }),
      null,
    );
    assert.equal(resolveConfidenceForCalibration({ selfRatedConfidence: null }), null);
  });

  it("feeds computeConfidenceCalibration unchanged — inferred values behave exactly like self-rated ones", () => {
    const attempts = [
      { grade: "INCORRECT" as const, selfRatedConfidence: null, inferredConfidence: 5 },
      { grade: "INCORRECT" as const, selfRatedConfidence: null, inferredConfidence: 4 },
      { grade: "INCORRECT" as const, selfRatedConfidence: null, inferredConfidence: 5 },
      { grade: "INCORRECT" as const, selfRatedConfidence: null, inferredConfidence: 4 },
    ];
    const resolved = attempts.map((a) => ({
      grade: a.grade,
      selfRatedConfidence: resolveConfidenceForCalibration(a),
    }));
    assert.equal(computeConfidenceCalibration(resolved), "possibly_overconfident");
  });
});
