/**
 * Production personalized-video contracts.
 *
 * Assignments are evidence-first: insufficient or conflicting evidence
 * produces no remediation. A watched video is not learning evidence, and an
 * independent exit is stored separately from completion.
 */

export const PERSONALIZED_VIDEO_ASSIGNMENT_STATUSES = [
  "PREPARING",
  "UNDER_REVIEW",
  "READY",
  "FALLBACK",
  "TEMPORARILY_UNAVAILABLE",
  "ABSTAINED",
] as const;

export type PersonalizedVideoAssignmentStatus =
  (typeof PERSONALIZED_VIDEO_ASSIGNMENT_STATUSES)[number];

export const PERSONALIZED_VIDEO_DELIVERIES = [
  "PREPARING",
  "UNDER_REVIEW",
  "VIDEO",
  "HTML_FALLBACK",
  "UNAVAILABLE",
  "ABSTAINED",
] as const;

export type PersonalizedVideoDelivery = (typeof PERSONALIZED_VIDEO_DELIVERIES)[number];

export const PERSONALIZED_VIDEO_SCRIPT_SOURCES = [
  "APPROVED_TEMPLATE",
  "CONSTRAINED_AI",
] as const;

export type PersonalizedVideoScriptSource =
  (typeof PERSONALIZED_VIDEO_SCRIPT_SOURCES)[number];

export type PilotStudentKey = "aarav" | "meena" | "rohan" | "divya" | "kabir";

export type VideoSceneAccent = "green" | "amber" | "violet";

export type VideoMathClaim =
  | { kind: "ARITHMETIC"; expression: string; expected: number }
  | { kind: "ALGEBRA_EQUIVALENCE"; left: string; right: string }
  | { kind: "EQUATION_TRANSFORMATION"; from: string; to: string };

export interface PersonalizedVideoLessonScene {
  eyebrow: string;
  headline: string;
  equation: string;
  narration: string;
  durationSeconds: number;
  accent: VideoSceneAccent;
  claims?: VideoMathClaim[];
}

export interface PersonalizedVideoLesson {
  title: string;
  duration: string;
  objective: string;
  generationReason: string;
  verification: string;
  scenes: PersonalizedVideoLessonScene[];
}

export interface PersonalizedVideoExitItem {
  prompt: string;
  expected: string;
  evidencePurpose: string;
}

export interface PersonalizedVideoEvidenceObservation {
  questionText: string;
  submittedText: string;
  verificationStatus: string;
  independent: boolean;
}

export type PersonalizedVideoEvidenceSource = "LOTUS_SESSION" | "DEMO_SEED";

export interface PersonalizedVideoEvidenceSnapshot {
  diagnosticState: string;
  observedEvidence: string[];
  verifiedObservations: PersonalizedVideoEvidenceObservation[];
  lotusOutcome?: "SOLID_GAP" | "ADVANCEMENT" | "INSUFFICIENT_OR_CONFLICTING";
  lotusSessionId?: string;
  evidenceSource?: PersonalizedVideoEvidenceSource;
}

export interface PersonalizedVideoAssetView {
  assetId: string;
  reviewStatus: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "RETIRED";
  storageRef: string;
  transcriptRef?: string;
  durationMs?: number;
  integrity?: Record<string, unknown>;
}

export interface PersonalizedVideoJobView {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_PERMANENT";
  lastError?: string | null;
}

export interface PersonalizedVideoExitAttemptView {
  prompt: string;
  answer?: string;
  working?: string;
  correct?: boolean;
  createdAt: string;
}

export interface PersonalizedVideoAssignmentView {
  id: string;
  studentId: string;
  studentKey?: PilotStudentKey | null;
  name: string;
  roll?: string;
  status: PersonalizedVideoAssignmentStatus;
  delivery: PersonalizedVideoDelivery;
  diagnosticState: string;
  conceptId: string;
  learningObjective: string;
  learnerDecision: string;
  teacherDecision: string;
  uncertainty: "Low" | "Moderate" | "High";
  statusLabel: string;
  evidenceSnapshot: PersonalizedVideoEvidenceSnapshot;
  lesson: PersonalizedVideoLesson | null;
  exit: PersonalizedVideoExitItem | null;
  asset: PersonalizedVideoAssetView | null;
  job: PersonalizedVideoJobView | null;
  fallbackReason?: string | null;
  abstainReason?: string | null;
  watched: boolean;
  completed: boolean;
  dwellMs: number;
  exitAttempt: PersonalizedVideoExitAttemptView | null;
  limitations: string[];
}

export interface PersonalizedVideoTeacherStudentRow {
  studentId: string;
  studentKey?: PilotStudentKey | null;
  name: string;
  roll?: string;
  diagnosticState: string;
  statusLabel: string;
  learnerDecision: string;
  teacherDecision: string;
  uncertainty: string;
  observedEvidence: string[];
  assignmentStatus: PersonalizedVideoAssignmentStatus;
  delivery: PersonalizedVideoDelivery;
  videoTitle?: string;
  watched: boolean;
  completed: boolean;
  exitAttempt: PersonalizedVideoExitAttemptView | null;
  limitations: string[];
}

export interface PersonalizedVideoTeacherReport {
  generatedAt: string;
  demo: boolean;
  students: PersonalizedVideoTeacherStudentRow[];
  totals: {
    assignments: number;
    readyOrFallback: number;
    abstained: number;
    exitAttempted: number;
    exitVerified: number;
  };
}

export const PERSONALIZED_VIDEO_LIMITATIONS = [
  "A watched video is not learning evidence.",
  "Guided success is not independent success.",
  "One exit item is not broad mastery, transfer, or retention.",
] as const;
