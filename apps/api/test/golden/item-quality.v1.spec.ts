import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeIndependentCorrectRate,
  computePointBiserialDiscrimination,
  deriveItemQualityWeight,
  qualityRankAdjustment,
  MIN_ATTEMPTS_FOR_DISCRIMINATION,
  MIN_ATTEMPTS_FOR_QUALITY,
  QUALITY_WEIGHT_MIN,
  QUALITY_WEIGHT_MAX,
  type DiscriminationSample,
} from "../../src/jobs/item-quality.formulas";

// All fixtures are synthetic and hand-computed — they prove the arithmetic of
// item-quality-v1, not any real pilot outcome. Real values are earned by the
// refresh job from Attempt + MasteryHistory data.

function samples(
  correctMasteries: number[],
  incorrectMasteries: number[],
): DiscriminationSample[] {
  return [
    ...correctMasteries.map((m) => ({ correct: true, masteryAtAttempt: m })),
    ...incorrectMasteries.map((m) => ({ correct: false, masteryAtAttempt: m })),
  ];
}

describe("computeIndependentCorrectRate", () => {
  it("all independently correct (0 or 1 hints) -> 1.0", () => {
    const rate = computeIndependentCorrectRate([
      { grade: "CORRECT", highestHintLevel: 0 },
      { grade: "CORRECT", highestHintLevel: 1 },
      { grade: "CORRECT", highestHintLevel: 0 },
    ]);
    assert.equal(rate, 1);
  });

  it("hint-heavy correct answers do NOT count as correct — the exact bug this fixes", () => {
    // 5 attempts all graded CORRECT, but every one only after 2+ hints.
    // A raw "graded CORRECT" rate would report 1.0 (looks perfectly easy);
    // independent-correct rate must report 0 (nobody solved it unaided).
    const rate = computeIndependentCorrectRate([
      { grade: "CORRECT", highestHintLevel: 2 },
      { grade: "CORRECT", highestHintLevel: 2 },
      { grade: "CORRECT", highestHintLevel: 3 },
      { grade: "CORRECT", highestHintLevel: 2 },
      { grade: "CORRECT", highestHintLevel: 3 },
    ]);
    assert.equal(rate, 0);
  });

  it("mixed independent-correct, hint-assisted-correct, and incorrect", () => {
    // 2 independent-correct out of 5 total -> 0.4
    const rate = computeIndependentCorrectRate([
      { grade: "CORRECT", highestHintLevel: 0 }, // counts
      { grade: "CORRECT", highestHintLevel: 1 }, // counts
      { grade: "CORRECT", highestHintLevel: 2 }, // hint-heavy, does not count
      { grade: "INCORRECT", highestHintLevel: 0 }, // wrong, does not count
      { grade: "INCORRECT", highestHintLevel: 2 }, // wrong, does not count
    ]);
    assert.equal(rate, 0.4);
  });

  it("empty attempts -> 0", () => {
    assert.equal(computeIndependentCorrectRate([]), 0);
  });
});

describe("computePointBiserialDiscrimination", () => {
  it("typical case — hand-computed r_pb", () => {
    // correct group (6): [0.8,0.8,0.8,0.6,0.6,0.6] → M1 = 0.7
    // incorrect group (4): [0.5,0.5,0.3,0.3]       → M0 = 0.4
    // n=10, p=0.6, q=0.4, overall mean = 0.58
    // population variance = 0.0316, s = sqrt(0.0316)
    // r = ((0.7-0.4)/sqrt(0.0316)) * sqrt(0.24) = 0.826767… → 0.8268 (4dp)
    const r = computePointBiserialDiscrimination(
      samples([0.8, 0.8, 0.8, 0.6, 0.6, 0.6], [0.5, 0.5, 0.3, 0.3]),
    );
    assert.equal(r, 0.8268);
  });

  it("perfectly discriminating item → 1.0", () => {
    // correct group all at mastery 0.8, incorrect all at 0.2, p=0.5:
    // r = ((0.8-0.2)/0.3) * sqrt(0.25) = 2 * 0.5 = 1
    const r = computePointBiserialDiscrimination(
      samples([0.8, 0.8, 0.8, 0.8, 0.8], [0.2, 0.2, 0.2, 0.2, 0.2]),
    );
    assert.equal(r, 1);
  });

  it("inverted item (weak students outperform strong) → -1.0", () => {
    const r = computePointBiserialDiscrimination(
      samples([0.2, 0.2, 0.2, 0.2, 0.2], [0.8, 0.8, 0.8, 0.8, 0.8]),
    );
    assert.equal(r, -1);
  });

  it("group means equal → 0", () => {
    const r = computePointBiserialDiscrimination(
      samples([0.2, 0.8, 0.5, 0.5, 0.5], [0.8, 0.2, 0.5, 0.5, 0.5]),
    );
    assert.equal(r, 0);
  });

  it("degenerate: all correct → null", () => {
    const r = computePointBiserialDiscrimination(
      samples([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.5, 0.5], []),
    );
    assert.equal(r, null);
  });

  it("degenerate: all wrong → null", () => {
    const r = computePointBiserialDiscrimination(
      samples([], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
    );
    assert.equal(r, null);
  });

  it("degenerate: zero mastery variance → null", () => {
    const r = computePointBiserialDiscrimination(
      samples([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    assert.equal(r, null);
  });

  it(`insufficient sample (< ${MIN_ATTEMPTS_FOR_DISCRIMINATION}) → null even with clean separation`, () => {
    const r = computePointBiserialDiscrimination(
      samples([0.8, 0.8, 0.8, 0.8, 0.8], [0.2, 0.2, 0.2, 0.2]), // n = 9
    );
    assert.equal(r, null);
  });
});

describe("deriveItemQualityWeight", () => {
  it("good item with enough data stays at 1.0", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.6,
      discriminationScore: 0.4,
      hintRate: 0,
    });
    assert.equal(w, 1.0);
  });

  it("near-zero discrimination → 0.75", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.6,
      discriminationScore: 0.05,
      hintRate: 0,
    });
    assert.equal(w, 0.75);
  });

  it("negative discrimination → 0.5", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.5,
      discriminationScore: -0.3,
      hintRate: 0,
    });
    assert.equal(w, 0.5);
  });

  it("extreme correctRate (too easy, discrimination null) → 0.75", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.97,
      discriminationScore: null,
      hintRate: 0,
    });
    assert.equal(w, 0.75);
  });

  it("extreme correctRate (too hard) → 0.75", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.03,
      discriminationScore: 0.2,
      hintRate: 0,
    });
    assert.equal(w, 0.75);
  });

  it("stacked penalties clamp at the spec floor: negative discrimination + extreme rate → 0.5", () => {
    // 1.0 − 0.5 − 0.25 = 0.25, clamped up to the README_RULES band floor 0.5.
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.97,
      discriminationScore: -0.2,
      hintRate: 0,
    });
    assert.equal(w, QUALITY_WEIGHT_MIN);
    assert.equal(w, 0.5);
  });

  it(`low-attempt item (< ${MIN_ATTEMPTS_FOR_QUALITY}) → null (stored weight left untouched) even if it looks terrible`, () => {
    const w = deriveItemQualityWeight({
      attemptCount: MIN_ATTEMPTS_FOR_QUALITY - 1,
      correctRate: 0.97,
      discriminationScore: -0.5,
      hintRate: 0,
    });
    assert.equal(w, null);
  });

  it(`penalties begin exactly at the ${MIN_ATTEMPTS_FOR_QUALITY}-attempt threshold`, () => {
    const w = deriveItemQualityWeight({
      attemptCount: MIN_ATTEMPTS_FOR_QUALITY,
      correctRate: 0.97,
      discriminationScore: null,
      hintRate: 0,
    });
    assert.equal(w, 0.75);
  });

  it("excessive hint reliance (>= 0.6) penalizes even a well-discriminating, mid-correctRate item → 0.85", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.5,
      discriminationScore: 0.4,
      hintRate: 0.65,
    });
    assert.equal(w, 0.85);
  });

  it("hint rate just below the threshold does not penalize", () => {
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.5,
      discriminationScore: 0.4,
      hintRate: 0.59,
    });
    assert.equal(w, 1.0);
  });

  it("hint-rate penalty stacks additively with the other penalties", () => {
    // 1.0 - 0.5 (negative discrimination) - 0.15 (excessive hints) = 0.35, clamped to the floor 0.5.
    const w = deriveItemQualityWeight({
      attemptCount: 20,
      correctRate: 0.5,
      discriminationScore: -0.3,
      hintRate: 0.8,
    });
    assert.equal(w, QUALITY_WEIGHT_MIN);
  });
});

describe("qualityRankAdjustment — selector integration", () => {
  it("neutral item (weight 1.0) contributes 0", () => {
    assert.equal(qualityRankAdjustment(1.0), 0);
  });

  it("worst earned item (weight 0.5) contributes -5", () => {
    assert.equal(qualityRankAdjustment(0.5), -5);
  });

  it("mid-penalty item (weight 0.75) contributes -2.5", () => {
    assert.equal(qualityRankAdjustment(0.75), -2.5);
  });

  it("curated 1.2 item gets a small +2 boost", () => {
    assert.equal(qualityRankAdjustment(1.2), 2);
  });

  it("clamps out-of-range weights to the spec band [0.5, 1.2]", () => {
    assert.equal(qualityRankAdjustment(1.7), 2);
    assert.equal(qualityRankAdjustment(0), -5);
  });

  it("quality nudges but never dominates: worst-case penalty stays below EXACT_DIFFICULTY (10) and far below EXACT_CONCEPT (40)", () => {
    const worst = Math.abs(qualityRankAdjustment(QUALITY_WEIGHT_MIN));
    assert.ok(worst < 10, `worst-case quality penalty ${worst} must stay below 10`);
  });

  it("ranking responds to quality: identical candidates differing only in weight order by quality", () => {
    // Two candidates with the same base score (same concept/difficulty/intent):
    // the weight-1.0 item outscores the weight-0.5 item by exactly 5 points.
    const base = 40 + 10 + 5; // EXACT_CONCEPT + EXACT_DIFFICULTY + APPROVED
    const good = base + qualityRankAdjustment(1.0);
    const bad = base + qualityRankAdjustment(0.5);
    assert.equal(good - bad, 5);
    assert.ok(good > bad);
  });
});
