import type { EventType, Grade, ProcessingStatus, SelfRatedConfidence } from "./enums";
import type { LearningDecision, PracticeNextResponse } from "./learning-decision";

export interface AnswerSubmittedEvent {
  eventId: string;
  eventType: "ANSWER_SUBMITTED";
  studentId: string;
  sessionId: string;
  questionId: string;
  questionVersion: number;
  submittedAnswer: string;
  timeToFirstResponseMs: number;
  totalTimeMs: number;
  idleTimeMs: number;
  attemptNumber: number;
  hintCount: number;
  highestHintLevel: number;
  selfRatedConfidence: SelfRatedConfidence;
  answerChangedBeforeSubmit: boolean;
  clientTimestamp: string;
}

export interface HintRequestedEvent {
  eventId: string;
  eventType: "HINT_REQUESTED";
  studentId: string;
  sessionId: string;
  questionId: string;
  requestedLevel?: number;
  clientTimestamp: string;
}

export interface ExplanationViewedEvent {
  eventId: string;
  eventType: "EXPLANATION_VIEWED";
  studentId: string;
  sessionId: string;
  explanationId?: string;
  misconceptionId?: string;
  conceptId?: string;
  clientTimestamp: string;
}

export interface QuestionSkippedEvent {
  eventId: string;
  eventType: "QUESTION_SKIPPED";
  studentId: string;
  sessionId: string;
  questionId: string;
  questionVersion: number;
  clientTimestamp: string;
}

export interface QuestionSkippedResponse {
  processingStatus: ProcessingStatus;
  decision: LearningDecision;
  decisionId: string;
  next: PracticeNextResponse;
}

export interface AnswerSubmittedResponse {
  processingStatus: ProcessingStatus;
  grade: Grade;
  isCorrect: boolean;
  decision: LearningDecision;
  decisionId: string;
  attemptId: string;
  next: PracticeNextResponse;
}

export interface ExplanationViewedResponse {
  processingStatus: ProcessingStatus;
  decision: LearningDecision;
  decisionId: string;
  next: PracticeNextResponse;
}

export interface RevisionItemCompletedEvent {
  eventId: string;
  eventType: "REVISION_ITEM_COMPLETED";
  studentId: string;
  sessionId?: string;
  revisionItemId: string;
  conceptId: string;
  outcome: "COMPLETED" | "SKIPPED" | "EXPIRED";
  clientTimestamp: string;
}

export interface WeeklyReportRequestedEvent {
  eventId: string;
  eventType: "WEEKLY_REPORT_REQUESTED";
  studentId: string;
  periodStart: string;
  periodEnd: string;
  requestId?: string;
  clientTimestamp: string;
}

export interface ReportDeliveryAttemptedEvent {
  eventId: string;
  eventType: "REPORT_DELIVERY_ATTEMPTED";
  studentId: string;
  reportId: string;
  deliveryId: string;
  channel: "EMAIL" | "IN_APP";
  status: "PENDING" | "SENT" | "FAILED" | "RETRYING";
  clientTimestamp: string;
}

export interface ContentReviewedEvent {
  eventId: string;
  eventType: "CONTENT_REVIEWED";
  contentType: "QUESTION" | "EXPLANATION";
  contentId: string;
  contentVersion: number;
  status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  reviewer: string;
  clientTimestamp: string;
}

export interface RawEventRecord {
  eventId: string;
  eventType: EventType;
  studentId: string;
  sessionId?: string;
  payload: unknown;
}
