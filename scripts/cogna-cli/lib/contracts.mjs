/**
 * Contract constants for CLI scenarios.
 * Source of truth: packages/shared/src/contracts/enums.ts
 * Prefer importing from @cogna/shared dist when built; these mirror that file exactly.
 */
export const UI_ACTIONS = [
  "SHOW_QUESTION",
  "SHOW_EXPLANATION",
  "SHOW_HINT",
  "END_SESSION",
  "SUGGEST_BREAK",
];

export const LEARNING_INTENTS = [
  "STANDARD_PRACTICE",
  "INCREASE_DIFFICULTY",
  "DECREASE_DIFFICULTY",
  "TARGET_MISCONCEPTION",
  "REVIEW_PREREQUISITE",
  "EXECUTE_DUE_REVISION",
  "RETEST_AFTER_EXPLANATION",
  "CONCEPT_REINFORCEMENT",
  "BASELINE_ASSESSMENT",
  "RETENTION_REVIEW",
  "TRANSFER_CHECK",
  "BREAK_FOR_FATIGUE",
];

/** Baseline bank IDs — docs/mvp-1.0/content/question-bank/questions.json */
export const BASELINE_QUESTION_IDS = {
  q1TwelvePlusNine: "Q_P1_D1_001",
  q3Variable: "Q_P3_D1_001",
};
