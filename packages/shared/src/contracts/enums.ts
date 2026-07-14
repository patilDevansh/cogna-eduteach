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
  // MVP 2.0 additive intents
  "RETENTION_REVIEW",
  "TRANSFER_CHECK",
  "BREAK_FOR_FATIGUE",
  // MVP 4.0 additive intents
  "UNIT_BRIDGE_REVIEW",
  "HORIZON_FOCUS_PRACTICE",
  // MVP 5.0 additive intents
  "SHOW_TEACHING_MODULE",
  "MODALITY_RETEST",
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
  // MVP 2.0 additive events
  "REVISION_ITEM_COMPLETED",
  "WEEKLY_REPORT_REQUESTED",
  "REPORT_DELIVERY_ATTEMPTED",
  "CONTENT_REVIEWED",
  // MVP 3.0 additive events
  "EXPERIMENT_ASSIGNED",
  "CANDIDATE_SCORED",
  "CONTENT_DRAFT_CREATED",
  "CONTENT_DRAFT_VALIDATED",
  "CONTENT_DRAFT_VALIDATION_FAILED",
  "CONTENT_DRAFT_PROMOTED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const DIAGNOSTIC_FACTOR_TYPES = [
  "MASTERY",
  "MISCONCEPTION",
  "CONFIDENCE_CALIBRATION",
  "HINT_DEPENDENCE",
  "RETENTION",
  "LEARNING_VELOCITY",
  "ERROR_RECOVERY",
  "EXPLANATION_EFFECTIVENESS",
  "ENGAGEMENT_PATTERN",
  "ITEM_STATISTIC",
] as const;

export type DiagnosticFactorType = (typeof DIAGNOSTIC_FACTOR_TYPES)[number];

export const JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_PERMANENT",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const REPORT_DELIVERY_STATUSES = [
  "PENDING",
  "SENT",
  "FAILED",
  "RETRYING",
] as const;

export type ReportDeliveryStatus = (typeof REPORT_DELIVERY_STATUSES)[number];

export const REPORT_DELIVERY_CHANNELS = ["EMAIL", "IN_APP"] as const;
export type ReportDeliveryChannel = (typeof REPORT_DELIVERY_CHANNELS)[number];

export const CONTENT_REVIEW_STATUSES = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
] as const;

export type ContentReviewStatus = (typeof CONTENT_REVIEW_STATUSES)[number];

export const CONTENT_REVIEW_TYPES = ["QUESTION", "EXPLANATION"] as const;
export type ContentReviewType = (typeof CONTENT_REVIEW_TYPES)[number];

// ─── MVP 5.0 enums ─────────────────────────────────────────────────────────

export const MODALITY_KINDS = ["TEXT", "ANIMATION", "VIDEO", "VOICE"] as const;
export type ModalityKind = (typeof MODALITY_KINDS)[number];

export const POLICY_STATUSES = [
  "CANDIDATE",
  "SHADOW",
  "EXPERIMENT",
  "PROMOTED",
  "ROLLED_BACK",
] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];
