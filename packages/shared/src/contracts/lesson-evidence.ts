import type { PracticeAnswer, PracticeCheckResult } from "./authored-lessons";

/** Existing personalised lesson practice, not the new teaching-first journey. */
export interface LessonEvidenceRequest {
  schemaVersion: 1;
  eventId: string;
  contentVersion: string;
  kind: "PRESENTED" | "HINT_REQUESTED" | "ANSWER_SUBMITTED";
  itemId?: string;
  answer?: PracticeAnswer;
  supportEventId?: string;
  clientOccurredAt?: string;
}

export interface LessonEvidenceReceipt {
  schemaVersion: 1;
  eventId: string;
  contentVersion: string;
  kind: LessonEvidenceRequest["kind"];
  itemId?: string;
  studentId: string;
  assignmentId: string;
  sourceSessionId: string | null;
  flow: "PERSONALIZED_VIDEO_PRACTICE_V1";
  purpose: "PRACTICE" | "EXPOSURE";
  skillId: string | null;
  conceptId: string;
  skillMapVersion: null;
  evidencePolicyVersion: "typed-practice-v1";
  /** Assignment ledger position breaks ties between equal server timestamps. */
  sequence: number;
  itemVersion: string | null;
  receivedAt: string;
  clientOccurredAt: string | null;
  /** Not a certification of independence: all these answers are practice. */
  assistance: "NONE_RECORDED" | "ISSUED" | "UNKNOWN";
  exposureEventId: string | null;
  lessonExposureEventId: string | null;
  supportEventId?: string;
  answer?: PracticeAnswer;
  result?: PracticeCheckResult;
  hint?: string;
  verifierVersion?: "practice-algebra-v1";
}

export interface LessonPracticeProgress {
  schemaVersion: 1;
  contentVersion: string;
  resumeItemId: string | null;
  items: Record<string, {
    attempts: number;
    resolved: boolean;
    correct: boolean;
    firstTry: boolean;
    latest: LessonEvidenceReceipt | null;
    hint: string | null;
  }>;
}
