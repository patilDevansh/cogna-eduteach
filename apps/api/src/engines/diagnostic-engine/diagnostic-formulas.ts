import type { Grade } from "@cogna/shared";

export const MASTERY_ALPHA = 0.12;

export const CORRECTNESS_WEIGHT: Record<Grade, number> = {
  CORRECT: 1.0,
  PARTIALLY_CORRECT: 0.25,
  INCORRECT: -0.7,
  INVALID_FORMAT: 0,
  REQUIRES_REVIEW: 0,
};

export const DIFFICULTY_WEIGHT: Record<number, number> = {
  1: 0.7,
  2: 0.85,
  3: 1.0,
  4: 1.15,
  5: 1.3,
};

export function independenceWeight(highestHintLevel: number): number {
  if (highestHintLevel <= 0) return 1.0;
  if (highestHintLevel === 1) return 0.8;
  if (highestHintLevel === 2) return 0.6;
  return 0.4;
}

export function independencePenalty(highestHintLevel: number): number {
  if (highestHintLevel <= 0) return 0;
  if (highestHintLevel === 1) return 0.33;
  if (highestHintLevel === 2) return 0.66;
  return 1.0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeMasteryUpdate(input: {
  previousValue: number;
  grade: Grade;
  difficulty: number;
  highestHintLevel: number;
  itemQualityWeight: number;
}): { newValue: number; signedEvidence: number } {
  const signedEvidence =
    CORRECTNESS_WEIGHT[input.grade] *
    (DIFFICULTY_WEIGHT[input.difficulty] ?? 1) *
    independenceWeight(input.highestHintLevel) *
    input.itemQualityWeight;

  return {
    signedEvidence,
    newValue: clamp(input.previousValue + MASTERY_ALPHA * signedEvidence, 0, 1),
  };
}

export type CalibrationLabel =
  | "possibly_overconfident"
  | "possibly_underconfident"
  | "reasonably_calibrated"
  | "unknown";

export function computeConfidenceCalibration(
  attempts: Array<{ grade: Grade; selfRatedConfidence: number | null }>,
  windowSize = 8,
): CalibrationLabel {
  const rated = attempts
    .filter((a) => a.selfRatedConfidence !== null)
    .slice(0, windowSize);

  if (rated.length < 4) return "unknown";

  const n = rated.length;
  const overconfident =
    rated.filter((a) => a.selfRatedConfidence! >= 4 && a.grade === "INCORRECT")
      .length / n;
  const underconfident =
    rated.filter((a) => a.selfRatedConfidence! <= 2 && a.grade === "CORRECT")
      .length / n;

  if (overconfident >= 0.375) return "possibly_overconfident";
  if (underconfident >= 0.375) return "possibly_underconfident";
  return "reasonably_calibrated";
}

export function computeHintDependence(
  attempts: Array<{ highestHintLevel: number; hintsAvailable: boolean }>,
): number {
  const eligible = attempts.filter((a) => a.hintsAvailable);
  if (eligible.length === 0) return 0;

  const totalPenalty = eligible.reduce(
    (sum, a) => sum + independencePenalty(a.highestHintLevel),
    0,
  );
  return totalPenalty / eligible.length;
}

export function computeMisconceptionConfidence(
  matchingCount: number,
): number {
  return Math.min(0.95, 0.35 + 0.15 * matchingCount);
}

export function decayMisconceptionConfidence(current: number): number {
  return Math.max(0, current - 0.2);
}
