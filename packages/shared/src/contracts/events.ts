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

export interface RawEventRecord {
  eventId: string;
  eventType: EventType;
  studentId: string;
  sessionId?: string;
  payload: unknown;
}
