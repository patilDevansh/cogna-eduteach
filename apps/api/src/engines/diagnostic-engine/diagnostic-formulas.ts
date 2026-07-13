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

// ─── MVP 2.0: retention-rules-v2 ────────────────────────────────────────────

export function hasSufficientRetentionEvidence(input: {
  independentAttemptCount: number;
  independentCorrectCount: number;
}): boolean {
  return (
    input.independentAttemptCount >= 2 && input.independentCorrectCount >= 1
  );
}

/** Independent = CORRECT AND highestHintLevel <= 1 */
export function isIndependentCorrect(
  grade: Grade,
  highestHintLevel: number,
): boolean {
  return grade === "CORRECT" && highestHintLevel <= 1;
}

export function computeRetentionEstimate(input: {
  mastery: number;
  daysSinceSuccess: number;
  completedRevisionsLast14Days: number;
}): number {
  const revisionBoost = Math.min(0.2, 0.05 * input.completedRevisionsLast14Days);
  const forgettingPenalty = Math.min(0.45, 0.04 * input.daysSinceSuccess);
  // Round to 2dp for deterministic golden replay (IEEE float on 0.04×N).
  return Math.round(clamp(input.mastery + revisionBoost - forgettingPenalty, 0, 1) * 100) / 100;
}

export function isRetentionReviewEligible(retentionEstimate: number): boolean {
  return retentionEstimate < 0.55;
}

export function isHighPriorityRetention(retentionEstimate: number): boolean {
  return retentionEstimate < 0.4;
}

// ─── MVP 2.0: learning velocity ────────────────────────────────────────────

export type VelocityInterpretation = "improving" | "steady" | "needs_support" | "unknown";

export function computeLearningVelocity(input: {
  masteryNow: number;
  masterySevenDaysAgo: number;
  eligibleAttempts: number;
}): { velocity: number; interpretation: VelocityInterpretation } {
  if (input.eligibleAttempts < 3) {
    return { velocity: 0, interpretation: "unknown" };
  }

  const velocity =
    (input.masteryNow - input.masterySevenDaysAgo) /
    Math.max(1, input.eligibleAttempts);

  let interpretation: VelocityInterpretation;
  if (velocity >= 0.03) interpretation = "improving";
  else if (velocity >= -0.02) interpretation = "steady";
  else interpretation = "needs_support";

  return { velocity, interpretation };
}

// ─── MVP 2.0: error recovery ───────────────────────────────────────────────

export function computeErrorRecoveryRate(input: {
  correctAfterFeedbackAttempts: number;
  feedbackOpportunities: number;
}): number | null {
  if (input.feedbackOpportunities < 3) return null;
  return input.correctAfterFeedbackAttempts / input.feedbackOpportunities;
}

export function preferStepByStepExplanation(
  errorRecoveryRate: number | null,
  misconceptionActive: boolean,
): boolean {
  return (
    misconceptionActive &&
    errorRecoveryRate !== null &&
    errorRecoveryRate < 0.35
  );
}

export function preferShorterHintFirst(errorRecoveryRate: number | null): boolean {
  return errorRecoveryRate !== null && errorRecoveryRate >= 0.65;
}

// ─── MVP 2.0: explanation effectiveness ────────────────────────────────────

export function isExplanationEffective(input: {
  explanationViewed: boolean;
  nextAttemptCorrect: boolean;
  highestHintLevel: number;
}): boolean {
  return (
    input.explanationViewed &&
    input.nextAttemptCorrect &&
    input.highestHintLevel <= 1
  );
}

export function computeExplanationEffectivenessScore(input: {
  effectiveCount: number;
  opportunityCount: number;
}): number | null {
  if (input.opportunityCount < 5) return null;
  return input.effectiveCount / input.opportunityCount;
}

// ─── MVP 2.0: engagement / fatigue ─────────────────────────────────────────

export const IDLE_SPIKE_MS = 45_000;
export const LONG_HESITATION_MS = 30_000;
export const FATIGUE_SESSION_MINUTES = 12;
export const HARD_STOP_SESSION_MINUTES = 15;
export const DEFAULT_BREAK_MINUTES = 3;

export function isIdleSpike(idleTimeMs: number): boolean {
  return idleTimeMs > IDLE_SPIKE_MS;
}

export function isLongHesitation(timeToFirstResponseMs: number): boolean {
  return timeToFirstResponseMs > LONG_HESITATION_MS;
}

export function computeFatigueRisk(input: {
  sessionMinutes: number;
  recentIncorrectStreak?: number;
  averageTimeIncreasing50Pct?: boolean;
  idleSpikeCount?: number;
}): boolean {
  if (input.sessionMinutes >= FATIGUE_SESSION_MINUTES) return true;
  if (
    (input.recentIncorrectStreak ?? 0) >= 3 &&
    input.averageTimeIncreasing50Pct === true
  ) {
    return true;
  }
  if ((input.idleSpikeCount ?? 0) >= 2) return true;
  return false;
}

// ─── MVP 2.0: recommendation-rules-v2 priority ──────────────────────────────

export function computeRecommendationPriority(input: {
  weakness: number;
  misconceptionSeverity: number;
  retentionRisk: number;
  prereqImportance: number;
  parentGoalBoost: number;
}): number {
  return (
    0.3 * input.weakness +
    0.25 * input.misconceptionSeverity +
    0.2 * input.retentionRisk +
    0.15 * input.prereqImportance +
    0.1 * input.parentGoalBoost
  );
}

export const MAX_QUESTIONS_PER_DAY = 10;
export const MAX_CONCEPTS_PER_DAY = 3;
export const MAX_TARGETED_MISCONCEPTION_QUESTIONS = 3;
