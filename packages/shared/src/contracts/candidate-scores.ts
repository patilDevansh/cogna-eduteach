/** MVP 3.0 — Candidate action scoring contracts */

import type { ContentStyle, DecisionParameters } from "./learning-decision";
import type { LearningIntent, UiAction } from "./enums";

export interface CandidateAction {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  contentStyle?: ContentStyle;
  parameters: DecisionParameters;
  legalityReason: string; // which rule made this candidate legal
}

export interface ScoredCandidate {
  candidate: CandidateAction;
  score: number; // higher = preferred
  scoreVersion: string; // candidate-score-rules-v1
  features: Record<string, number | string | boolean>;
}

export interface CandidateActionScore {
  id: string;
  studentId: string;
  sessionId: string;
  eventId: string; // decision trigger event
  candidates: ScoredCandidate[];
  selectedIndex: number;
  experimentId?: string;
  experimentArmId?: string;
  shadow?: boolean; // if true, score was computed but not applied
  createdAt: string; // ISO
}
