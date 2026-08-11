import type { Grade } from "@cogna/shared";
import { isIndependentCorrect } from "../engines/diagnostic-engine/diagnostic-formulas";

/**
 * Item-quality calibration formulas (item-quality-v1).
 *
 * Pure functions only — no NestJS, no Prisma — so they can be golden-tested
 * exactly like diagnostic-formulas.ts. Consumed by the item-statistics
 * refresh job (off the student hot path) and, for ranking, by the question
 * selector.
 *
 * "Correct" here always means isIndependentCorrect (CORRECT with at most one
 * hint viewed) — the same bar diagnostic-engine uses for retention evidence,
 * reused deliberately so a hint-heavy correct answer isn't miscounted as
 * evidence an item is easy or well-discriminating. A student who only got
 * there via hints hasn't demonstrated the same thing as one who solved it
 * unaided, and treating them the same would make hint-dependent items look
 * artificially easy and artificially well-behaved.
 */

/** Below this many graded attempts, discrimination is statistically meaningless → null. */
export const MIN_ATTEMPTS_FOR_DISCRIMINATION = 10;

/**
 * Below this many attempts an item keeps the neutral default weight of 1.0.
 * Chosen (15, within the 10–20 sensible band) so a single student's bad day
 * cannot condemn an item, but a genuinely broken item gets penalized within
 * roughly two students' worth of practice exposure.
 */
export const MIN_ATTEMPTS_FOR_QUALITY = 15;

/**
 * Legal band for stored itemQualityWeight per docs/mvp-2.0/README_RULES.md
 * ("Range clamp [0.5, 1.2]") — the weight feeds computeMasteryUpdate, so we
 * never write outside this band. Curated banks seed some items at 1.2.
 */
export const QUALITY_WEIGHT_MIN = 0.5;
export const QUALITY_WEIGHT_MAX = 1.2;

/** Earned weights start from the neutral default and can only penalize (data replaces the curated prior once it exists). */
export const EARNED_WEIGHT_BASELINE = 1.0;

/** Discrimination below this (but >= 0) is "near zero" — the item doesn't separate strong from weak students. */
export const LOW_DISCRIMINATION_THRESHOLD = 0.1;
/** Penalty for near-zero (0 <= d < threshold) discrimination. */
export const LOW_DISCRIMINATION_PENALTY = 0.25;
/** Penalty for negative discrimination (weak students outperform strong ones — item is likely miskeyed or misleading). */
export const NEGATIVE_DISCRIMINATION_PENALTY = 0.5;

/** correctRate at or beyond these bounds means the item measures almost nothing. */
export const EXTREME_CORRECT_RATE_HIGH = 0.95;
export const EXTREME_CORRECT_RATE_LOW = 0.05;
export const EXTREME_CORRECT_RATE_PENALTY = 0.25;

/**
 * hintRate (fraction of attempts using >=1 hint) at or beyond this means most
 * students needed help to even attempt the item — a signal about the item's
 * own clarity/wording, distinct from correctRate (which only tells you the
 * outcome, not whether it was reached unaided). Smaller penalty than the
 * others: this is a softer, more speculative signal than a mis-keyed or
 * non-discriminating item, so it should nudge, not dominate.
 */
export const EXCESSIVE_HINT_RATE_THRESHOLD = 0.6;
export const EXCESSIVE_HINT_RATE_PENALTY = 0.15;

export type DiscriminationSample = {
  /** Whether the attempt was isIndependentCorrect — CORRECT with at most one hint, not just graded CORRECT. */
  correct: boolean;
  /** The student's mastery on the item's concept at the time of the attempt (0..1). */
  masteryAtAttempt: number;
};

/**
 * Fraction of attempts that were independently correct (CORRECT with at most
 * one hint viewed). Used in place of a raw "graded CORRECT" rate everywhere
 * item quality is assessed, so an item that everyone only solves after heavy
 * hinting shows its true (lower) independent-success rate instead of looking
 * deceptively easy.
 */
export function computeIndependentCorrectRate(
  attempts: Array<{ grade: Grade; highestHintLevel: number }>,
): number {
  if (attempts.length === 0) return 0;
  const correct = attempts.filter((a) => isIndependentCorrect(a.grade, a.highestHintLevel)).length;
  return correct / attempts.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to 4dp for deterministic storage/golden replay (IEEE float noise). */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Point-biserial correlation between "answered this item correctly" and
 * "mastery on the item's concept at the time of the attempt":
 *
 *   r_pb = ((M1 − M0) / s) · sqrt(p·q)
 *
 * where M1/M0 are the mean masteries of the correct/incorrect groups, s is
 * the population standard deviation of mastery across all samples, p is the
 * proportion correct and q = 1 − p.
 *
 * Returns null for degenerate cases where the statistic is undefined or
 * meaningless: fewer than MIN_ATTEMPTS_FOR_DISCRIMINATION samples, all
 * correct, all wrong, or zero mastery variance.
 */
export function computePointBiserialDiscrimination(
  samples: DiscriminationSample[],
): number | null {
  const n = samples.length;
  if (n < MIN_ATTEMPTS_FOR_DISCRIMINATION) return null;

  const correct = samples.filter((s) => s.correct);
  const incorrect = samples.filter((s) => !s.correct);
  if (correct.length === 0 || incorrect.length === 0) return null;

  const p = correct.length / n;
  const q = 1 - p;

  const mean = samples.reduce((sum, s) => sum + s.masteryAtAttempt, 0) / n;
  const variance =
    samples.reduce((sum, s) => sum + (s.masteryAtAttempt - mean) ** 2, 0) / n;
  if (variance === 0) return null;

  const meanCorrect =
    correct.reduce((sum, s) => sum + s.masteryAtAttempt, 0) / correct.length;
  const meanIncorrect =
    incorrect.reduce((sum, s) => sum + s.masteryAtAttempt, 0) /
    incorrect.length;

  const r = ((meanCorrect - meanIncorrect) / Math.sqrt(variance)) * Math.sqrt(p * q);
  return round4(r);
}

/**
 * IRT-lite quality weight (deliberately NOT a full 3PL fit).
 *
 * Returns null when attemptCount < MIN_ATTEMPTS_FOR_QUALITY — meaning "not
 * enough evidence, leave the stored weight alone" (curated banks seed some
 * items at 1.2; the schema default is 1.0; neither may be stomped by a lack
 * of data). Once there is enough evidence, the earned weight REPLACES any
 * curated prior: it starts from the neutral EARNED_WEIGHT_BASELINE (1.0) and
 * subtracts penalties:
 *  - negative discrimination           → −NEGATIVE_DISCRIMINATION_PENALTY
 *  - near-zero discrimination          → −LOW_DISCRIMINATION_PENALTY
 *  - extreme correctRate (≥0.95/≤0.05) → −EXTREME_CORRECT_RATE_PENALTY
 *  - excessive hint reliance (≥0.6)    → −EXCESSIVE_HINT_RATE_PENALTY
 *
 * Penalties are independent and additive (clamping handles the floor) — an
 * item can be both non-discriminating AND hint-heavy, and should be penalized
 * for both, not whichever is "worse."
 *
 * avgTimeMs is deliberately NOT a factor here, on purpose rather than by
 * oversight: raw completion time has no absolute "good" value — a genuinely
 * hard, well-designed item should take longer, and penalizing that would
 * punish good items, not bad ones. It stays a stored diagnostic stat for
 * human reviewers; using it automatically would need a relative baseline
 * (e.g. time vs. sibling items of the same concept/difficulty), which is a
 * distinct, larger feature, not a one-line fix.
 *
 * Clamped to the spec-legal band [QUALITY_WEIGHT_MIN, QUALITY_WEIGHT_MAX]
 * = [0.5, 1.2]; since penalties only subtract from 1.0, earned weights land
 * in [0.5, 1.0].
 */
export function deriveItemQualityWeight(input: {
  attemptCount: number;
  correctRate: number;
  discriminationScore: number | null;
  hintRate: number;
}): number | null {
  if (input.attemptCount < MIN_ATTEMPTS_FOR_QUALITY) return null;

  let weight = EARNED_WEIGHT_BASELINE;

  if (input.discriminationScore !== null) {
    if (input.discriminationScore < 0) {
      weight -= NEGATIVE_DISCRIMINATION_PENALTY;
    } else if (input.discriminationScore < LOW_DISCRIMINATION_THRESHOLD) {
      weight -= LOW_DISCRIMINATION_PENALTY;
    }
  }

  if (
    input.correctRate >= EXTREME_CORRECT_RATE_HIGH ||
    input.correctRate <= EXTREME_CORRECT_RATE_LOW
  ) {
    weight -= EXTREME_CORRECT_RATE_PENALTY;
  }

  if (input.hintRate >= EXCESSIVE_HINT_RATE_THRESHOLD) {
    weight -= EXCESSIVE_HINT_RATE_PENALTY;
  }

  return clamp(weight, QUALITY_WEIGHT_MIN, QUALITY_WEIGHT_MAX);
}

/**
 * Scale factor that maps itemQualityWeight into the question selector's RANK
 * point space. A neutral item (weight 1.0) contributes 0; the worst earned
 * weight (0.5) contributes −5; a curated 1.2 item gets a small +2 boost —
 * enough to break ties and demote known-bad items, but strictly smaller than
 * EXACT_DIFFICULTY (10) and far below EXACT_CONCEPT (40), so quality nudges
 * ranking without dominating matching.
 */
export const QUALITY_RANK_SCALE = 10;

/** Rank adjustment for the question selector: −5 (weight 0.5) … 0 (weight 1.0) … +2 (weight 1.2). */
export function qualityRankAdjustment(itemQualityWeight: number): number {
  const weight = clamp(itemQualityWeight, QUALITY_WEIGHT_MIN, QUALITY_WEIGHT_MAX);
  // round4 keeps golden replay deterministic ((1.2 − 1.0) × 10 is 1.99… in IEEE floats)
  return round4((weight - EARNED_WEIGHT_BASELINE) * QUALITY_RANK_SCALE);
}
