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

export interface PracticeNextResponse {
  decision: LearningDecision;
  decisionId?: string;
  payload?: QuestionPayload | ExplanationPayload | HintPayload;
  studentMessage?: string;
}
