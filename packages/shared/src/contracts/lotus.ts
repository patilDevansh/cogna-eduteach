/**
 * Cogna Lotus — experimental AI-only diagnostic contracts.
 *
 * Lotus is deliberately isolated from the validated diagnostic-v2 path. The
 * models author and judge the mathematics so their behaviour can be observed;
 * every screen and payload must therefore retain the EXPERIMENTAL label.
 */

export type LotusPhase = "EXPLORE" | "DIAGNOSE" | "CONFIRM";

export type LotusQuestionType =
  | "CONSTRUCTED_RESPONSE"
  | "MULTIPLE_CHOICE"
  | "EXPLAIN"
  | "COMPARE"
  | "ERROR_ANALYSIS";

export interface LotusQuestion {
  id: string;
  phase: LotusPhase;
  subtopic: string;
  prompt: string;
  type: LotusQuestionType;
  options?: string[];
  asksForWorking: boolean;
  purpose: string;
  answerKey: LotusAnswerKey;
}

export interface LotusAnswerKey {
  kind: "NUMERIC" | "MULTIPLE_CHOICE" | "OPEN_RESPONSE";
  canonicalAnswer: string;
  /** Plain arithmetic expression for deterministic evaluation when applicable. */
  expression?: string;
  workedSolution: string[];
}

export interface LotusStudentResponse {
  answer: string;
  working: string;
  confidence: number;
  responseTimeMs: number;
  didNotKnow: boolean;
}

export interface LotusMathVerification {
  status: "VERIFIED_CORRECT" | "VERIFIED_INCORRECT" | "NO_ANSWER" | "NOT_DETERMINISTIC";
  correctAnswer: string;
  method: "DETERMINISTIC_ARITHMETIC" | "AI_AUTHORED_REFERENCE";
  explanation: string;
}

export type LotusMathJudgment =
  | "CORRECT"
  | "INCORRECT"
  | "PARTIAL"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

export type LotusProposedAction =
  | "ASK"
  | "EXIT_GAP"
  | "EXIT_ADVANCE"
  | "EXIT_UNCERTAIN";

export type LotusOverrideAction = "REPLACE_QUESTION" | "END_NOW";

export interface LotusHypothesis {
  label: string;
  evidenceState: "SUPPORTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INSUFFICIENT";
  evidence: string[];
  alternatives: string[];
}

export interface LotusModelAssessment {
  mathJudgment: LotusMathJudgment;
  observations: string[];
  hypotheses: LotusHypothesis[];
  phaseRecommendation: LotusPhase;
  proposedAction: LotusProposedAction;
  proposedQuestion?: Omit<LotusQuestion, "id">;
  conciseRationale: string;
}

export interface LotusGptDebateResponse {
  agreements: string[];
  disagreements: string[];
  disagreementExample: string;
  acceptedImprovements: string[];
  revisedConclusion: string;
  revisedAction: LotusProposedAction;
  revisedPhase: LotusPhase;
  revisedQuestion?: Omit<LotusQuestion, "id">;
}

export type LotusClosureVerdict =
  | "ACCEPTED"
  | "ACCEPTED_WITH_UNCERTAINTY"
  | "REVISED"
  | "UNRESOLVED";

export interface LotusFinalReport {
  outcome: "SOLID_GAP" | "ADVANCEMENT" | "INSUFFICIENT_OR_CONFLICTING";
  startingPoint: string;
  observedStrengths: string[];
  uncertainAreas: string[];
  evidenceSummary: string[];
  recommendedNextStep: string;
  limitations: string[];
}

export interface LotusDebateClosure {
  verdict: LotusClosureVerdict;
  acceptedFromGpt: string[];
  acceptedFromChallenger: string[];
  rejectedClaims: string[];
  conclusion: string;
  evidenceState: "SUPPORTED" | "PARTIAL" | "INSUFFICIENT";
  uncertainty: string[];
  phase: LotusPhase;
  action: LotusProposedAction;
  selectionReason: string;
  nextQuestion?: Omit<LotusQuestion, "id">;
  exitDiagnostic: boolean;
  report?: LotusFinalReport;
}

export interface LotusQuestionSelection {
  primaryProposal?: Omit<LotusQuestion, "id">;
  challengerProposal?: Omit<LotusQuestion, "id">;
  selectedQuestion?: Omit<LotusQuestion, "id">;
  selectedFrom:
    | "PRIMARY"
    | "CHALLENGER"
    | "BOTH"
    | "SYNTHESIZED"
    | "REVISED_FOR_INFORMATION_GAIN"
    | "NONE_EXIT";
  reason: string;
  informationGain: {
    passed: boolean;
    explanation: string;
  };
}

export interface LotusQuestionAudit {
  question: LotusQuestion;
  response: LotusStudentResponse | null;
  verification: LotusMathVerification | null;
  gpt: LotusModelAssessment;
  challenger: LotusModelAssessment;
  debate: LotusGptDebateResponse;
  conclusion: LotusDebateClosure;
  questionSelection: LotusQuestionSelection;
  createdAt: string;
}

export interface LotusSessionView {
  sessionId: string;
  studentId: string;
  grade: 8;
  board: "CBSE";
  status: "ACTIVE" | "COMPLETE";
  experimental: true;
  phase: LotusPhase;
  startedAt: string;
  currentQuestion: LotusQuestion | null;
  openingAudit: LotusQuestionAudit;
  audits: LotusQuestionAudit[];
  finalReport: LotusFinalReport | null;
  modelConfiguration: {
    primary: string;
    challenger: string;
  };
}

export interface LotusStatusResponse {
  enabled: boolean;
  ready: boolean;
  missingConfiguration: string[];
  models: { primary: string; challenger: string };
}
