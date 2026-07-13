export * from "./contracts/enums";
export * from "./contracts/versions";
export * from "./contracts/learning-decision";
export * from "./contracts/events";
export * from "./contracts/baseline-blueprint";

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
  alternativeExplanations?: string[];
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
