/** Shared internal types for the quadratics diagnostic prototype. None of these labels are ever shown to the student. */

export type StageId =
  | "WELCOME"
  | "CONFIDENCE"
  | "WARMUP_1"
  | "WARMUP_2"
  | "MAIN_EXPANSION"
  | "PROBE"
  | "AREA_MODEL"
  | "FACTORISATION"
  | "TRANSFER"
  | "SUMMARY";

/** Student-facing phase labels (section 8) — never "Diagnostic Phase". */
export type StudentPhaseLabel = "Warm up" | "Explore" | "Build" | "Try independently";

export function studentPhaseFor(stage: StageId): StudentPhaseLabel {
  switch (stage) {
    case "WELCOME":
    case "CONFIDENCE":
    case "WARMUP_1":
    case "WARMUP_2":
      return "Warm up";
    case "MAIN_EXPANSION":
    case "PROBE":
      return "Explore";
    case "AREA_MODEL":
    case "FACTORISATION":
      return "Build";
    case "TRANSFER":
    case "SUMMARY":
      return "Try independently";
  }
}

export type EvidenceState =
  | "OBSERVED"
  | "SUSPECTED"
  | "REPEATED_EVIDENCE"
  | "INTERVENTION_READY"
  | "UNCERTAIN"
  | "UNKNOWN";

/** Internal-only hypothesis labels — see section 4 of the prototype spec. */
export type Hypothesis =
  | "MISSING_CROSS_PRODUCTS"
  | "COMBINING_LIKE_TERMS_GAP"
  | "UNRELIABLE_X_SQUARED"
  | "INCOMPLETE_DOUBLE_DISTRIBUTION"
  | "ONE_DIRECTIONAL_PROCEDURAL"
  | "STRATEGY_SELECTION_DIFFICULTY"
  | "NONE";

export type FactorHypothesis =
  | "SUM_CONDITION_MISSED"
  | "SYMBOLIC_CONSTRUCTION_UNRELIABLE"
  | "FACTOR_FLUENCY_DIFFICULTY"
  | "SUPPORTED_SUCCESS"
  | "INDEPENDENT_SUCCESS";

export type RepresentationType = "SYMBOLIC" | "AREA_MODEL" | "PRODUCT_SUM";

/** Section 13: these must stay distinct, never collapsed into one "success" flag. */
export type CompletionMode = "INDEPENDENT" | "SUPPORTED" | "NEEDS_FUTURE_CHECK";
export type TransferOutcome = "SUCCESS" | "PARTIAL" | "DIFFICULTY" | "NOT_ATTEMPTED";

/** Placeholder only — this session never measures retention. See session-log.ts. */
export type RetentionStatus = "NOT_MEASURED_THIS_SESSION";

export type ConfidenceLevel = "NOT_SURE" | "A_LITTLE" | "CONFIDENT" | "VERY_CONFIDENT";

export type StepValidity = "VALID" | "INVALID" | "UNPARSEABLE";

/** A monic-quadratic problem descriptor: (x+p)(x+q). Both our worked examples and the transfer example fit this shape (q or p may be negative). */
export interface LinearBinomial {
  p: number;
  q: number;
}

export interface QuadraticProblem {
  id: string;
  presented: string;
  factors: LinearBinomial;
}

export interface DiagnosisTracker {
  hypothesis: Hypothesis | null;
  evidenceState: EvidenceState;
  observations: number;
  probesUsed: number;
}

export function initialTracker(): DiagnosisTracker {
  return { hypothesis: null, evidenceState: "UNKNOWN", observations: 0, probesUsed: 0 };
}

/** Section 12 event schema, verbatim field list. */
export interface SessionEvent {
  anonymousSessionId: string;
  timestamp: string;
  questionId: string;
  questionStage: StageId;
  presentedExpression: string;
  representationType: RepresentationType;
  rawStudentInput: string;
  normalizedInput: string | null;
  stepValidity: StepValidity | "N/A";
  responseTimeMs: number;
  helpUsed: boolean;
  probeShown: boolean;
  /** A Hypothesis/FactorHypothesis value, or a lightweight research-only qualifier (e.g. "sign-issue") not promoted to a first-class enum. */
  internalHypothesis: Hypothesis | FactorHypothesis | string | null;
  evidenceState: EvidenceState | null;
  interventionShown: boolean;
  supportedOrIndependent: CompletionMode | null;
  transferOutcome: TransferOutcome | null;
}
