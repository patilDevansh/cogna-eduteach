/** Canonical uiAction values — do not add aliases elsewhere. */
export const UI_ACTIONS = [
  "SHOW_QUESTION",
  "SHOW_EXPLANATION",
  "SHOW_HINT",
  "END_SESSION",
  "SUGGEST_BREAK",
] as const;

export type UiAction = (typeof UI_ACTIONS)[number];

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
] as const;

export type LearningIntent = (typeof LEARNING_INTENTS)[number];

export type QuestionFormat = "NUMERIC" | "MCQ" | "WORD_PROBLEM";
export type ExplanationStyle = "HINT" | "STEP_BY_STEP" | "ANALOGY";

export const GRADES = [
  "CORRECT",
  "INCORRECT",
  "PARTIALLY_CORRECT",
  "INVALID_FORMAT",
  "REQUIRES_REVIEW",
] as const;

export type Grade = (typeof GRADES)[number];

export const PROCESSING_STATUSES = [
  "RECEIVED",
  "VALIDATED",
  "GRADED",
  "PROFILE_UPDATED",
  "DECIDED",
  "CONTENT_RESOLVED",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_PERMANENT",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const SESSION_MODES = ["BASELINE", "ADAPTIVE_PRACTICE"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export const REVIEW_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "RETIRED",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Self-rated confidence: 1–5 or null when skipped */
export type SelfRatedConfidence = 1 | 2 | 3 | 4 | 5 | null;

export const REMEDIATION_STATES = [
  "UNCONFIRMED",
  "TARGETING",
  "EXPLANATION_REQUIRED",
  "RETESTING",
  "RESOLVED",
  "STILL_ACTIVE",
] as const;

export type RemediationState = (typeof REMEDIATION_STATES)[number];

export const EVENT_TYPES = [
  "SESSION_STARTED",
  "QUESTION_SHOWN",
  "ANSWER_SUBMITTED",
  "HINT_REQUESTED",
  "HINT_SHOWN",
  "EXPLANATION_SHOWN",
  "EXPLANATION_VIEWED",
  "QUESTION_SKIPPED",
  "SESSION_ENDED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
