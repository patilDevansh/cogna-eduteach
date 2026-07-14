export * from "./contracts/enums";
export * from "./contracts/versions";
export * from "./contracts/learning-decision";
export * from "./contracts/events";
export * from "./contracts/baseline-blueprint";
// MVP 3.0
export * from "./contracts/experiments";
export * from "./contracts/content-drafts";
export * from "./contracts/candidate-scores";
// MVP 4.0
export * from "./contracts/curriculum";
// MVP 5.0
export * from "./contracts/modality";
export * from "./contracts/policy";
export * from "./contracts/safety-eval";

export interface AttemptSignals {
  isCorrect: boolean | null;
  attemptNumber: number;
  questionDifficulty: number;
  conceptId: string;
  questionSkipped: boolean;
  timeToFirstResponseMs: number | null;
  totalTimeMs: number | null;
  idleTimeMs: number | null;
  sessionLengthMs: number | null;
  hintRequested: boolean;
  hintLevel: number | null;
  explanationRequested: boolean;
  hintCount: number;
  selfRatedConfidence: number | null;
  answerChangedBeforeSubmit: boolean;
}

export interface DiagnosticInference {
  factorType: string;
  conceptId?: string;
  factorKey?: string;
  value: unknown;
  confidence: number;
  reasoning: string;
  evidenceAttemptIds?: string[];
  evidenceEventIds?: string[];
  alternativeExplanations?: string[];
  validUntil?: string;
  modelVersion?: string;
}

/** MVP 2.0 diagnostic factor shape (additive; see README_SHARED_CONTRACTS). */
export interface DiagnosticFactorV2 {
  factorType: import("./contracts/enums").DiagnosticFactorType;
  conceptId?: string;
  factorKey?: string;
  value: unknown;
  confidence: number;
  reasoning: string;
  evidenceAttemptIds?: string[];
  evidenceEventIds?: string[];
  alternativeExplanations?: string[];
  validUntil?: string;
  modelVersion: string;
}

export interface MasteryUpdate {
  conceptId: string;
  previousValue: number;
  newValue: number;
  confidence: number;
  formulaVersion: string;
}

export interface DiagnosticOutput {
  masteryUpdates: MasteryUpdate[];
  diagnosticFactors: DiagnosticInference[];
  profilePatch: Record<string, unknown>;
  diagnosticVersion: string;
}

export interface LearningLoopContext {
  studentId: string;
  sessionId: string;
  sessionMode: import("./contracts/enums").SessionMode;
  lastAttemptId?: string;
  currentConceptId?: string;
  currentDifficulty?: number;
}
