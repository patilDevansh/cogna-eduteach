import type { ExplanationStyle, LearningIntent, QuestionFormat, UiAction } from "./enums";

export interface ContentStyle {
  questionFormat?: QuestionFormat;
  explanationStyle?: ExplanationStyle;
}

export interface DecisionParameters {
  conceptId: string;
  difficulty?: number;
  targetMisconception?: string;
  revisionItemId?: string;
  explanationId?: string;
  hintLevel?: number;
  baselineSlotIndex?: number;
  preferredQuestionType?: string;
  // MVP 2.0 optional fields
  retentionEstimateId?: string;
  transferConceptId?: string;
  sessionPlanId?: string;
  maxQuestionCount?: number;
  breakMinutes?: number;
  explanationOutcomeId?: string;
  // MVP 3.0 optional fields
  experimentId?: string;
  experimentArmId?: string;
  candidateScoreId?: string;
  draftOriginId?: string; // analytics only; never student-facing
  // MVP 4.0 optional fields
  unitId?: string;
  curriculumPlanId?: string;
  horizonWeekIndex?: number; // 0-based within plan
  bridgeConceptId?: string;
}

export interface LearningDecision {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  contentStyle?: ContentStyle;
  parameters: DecisionParameters;
  confidence: number;
  reasoning: string;
  decisionVersion: string;
  fallbackGenerated?: boolean;
}

export interface QuestionPayload {
  id: string;
  version: number;
  stem: string;
  type: string;
  difficulty: number;
  conceptId: string;
  hintLadder?: string[];
}

export interface ExplanationPayload {
  content: string;
  checkForUnderstanding?: string;
  style: string;
  templateId?: string;
}

export interface HintPayload {
  level: number;
  content: string;
}

/** Payload when uiAction is SUGGEST_BREAK (e.g. BREAK_FOR_FATIGUE). */
export interface BreakPayload {
  breakMinutes: number;
  message: string;
  continueAllowed: true;
}

export interface SessionEndPayload {
  summary?: string;
  revisionProposed?: boolean;
}

export interface PracticeNextResponse {
  decision: LearningDecision;
  decisionId?: string;
  payload?:
    | QuestionPayload
    | ExplanationPayload
    | HintPayload
    | BreakPayload
    | SessionEndPayload;
  studentMessage?: string;
}
