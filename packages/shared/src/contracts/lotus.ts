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

/** Which diagnostic a session runs. BRACKETS is the original Grade 8 signed-bracket unit. */
export type LotusTopic = "BRACKETS" | "FACTORISATION";

/** What a student making one specific mistake writes — used to recognise that mistake instantly, with no AI call. */
export interface LotusPredictedMistake {
  answer: string;
  mistake: string;
}

/**
 * Server-only facts about an item. Lives inside answerKey on purpose: every
 * active-session response replaces answerKey wholesale, so none of this —
 * the skill being tested, the predicted wrong answers — can reach the
 * browser before the student answers.
 */
export interface LotusItemDiagnostics {
  itemKind: "FACTORISE" | "SIMPLIFY" | "CHOICE";
  /** The expression the student works on (for FACTORISE and SIMPLIFY items). */
  expression?: string;
  skillId: string;
  /** Other skills this item genuinely uses, from the skill map. */
  taggedSkills: string[];
  /** Parallel to workedSolution: the skill each step uses. */
  stepSkills: string[];
  predictedMistakes: LotusPredictedMistake[];
  slot?: number;
  level?: "easy" | "medium" | "hard";
  origin: "FALLBACK" | "AI";
  /** AI-only source shown to observers; omitted on older session records. */
  provenance?: "AI_GENERATED_FOR_SESSION" | "AI_REUSED_FROM_BANK";
}

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
  /**
   * Intermediate values produced while evaluating `expression`, in
   * evaluation order, ending with the final result. Derived by re-running
   * the same deterministic parser used to check the student's answer — never
   * authored or trusted from the model — so a student's working can be
   * checked against a real step-by-step reference instantly, with no AI call.
   * Present only when `expression` is set.
   */
  checkpoints?: number[];
  diagnostics?: LotusItemDiagnostics;
}

export interface LotusStudentResponse {
  answer: string;
  working: string;
  confidence: number;
  responseTimeMs: number;
  didNotKnow: boolean;
  /** Idempotent submit of the question visible when the student pressed Submit. */
  submissionId?: string;
  questionId?: string;
  /** The prompt-only item that the browser painted immediately on Submit. */
  nextQuestionId?: string;
}

export interface LotusMathVerification {
  /** VERIFIED_UNFINISHED: equal to the original but not fully factorised or simplified. */
  status: "VERIFIED_CORRECT" | "VERIFIED_INCORRECT" | "VERIFIED_UNFINISHED" | "NO_ANSWER" | "NOT_DETERMINISTIC";
  correctAnswer: string;
  method: "DETERMINISTIC_ARITHMETIC" | "DETERMINISTIC_ALGEBRA" | "AI_AUTHORED_REFERENCE";
  explanation: string;
}

export type LotusMathJudgment =
  | "CORRECT"
  | "INCORRECT"
  | "PARTIAL"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

/**
 * Instant, deterministic read of where a student's written working first
 * stops matching the reference checkpoint chain. No AI, no network — pure
 * arithmetic comparison, computed the moment an answer is submitted. This is
 * *where* the student diverged, never *why* — that stays the slow AI
 * analysis's job. Used only to pick a next question quickly; never written
 * into the durable evidence record on its own.
 */
export type LotusBreakpointStatus =
  | "NO_WORKING"
  | "NOT_DETERMINISTIC"
  | "MATCHED_THROUGH_ALL_STEPS"
  | "DIVERGED";

export interface LotusBreakpointDiagnosis {
  status: LotusBreakpointStatus;
  /** 1-based index into answerKey.checkpoints where the mismatch first appears. */
  divergedAtStep?: number;
  expectedValue?: number;
  studentValue?: number;
}

/**
 * The four "next move" intents a selection policy ever needs, regardless of
 * how many literal wrong answers are possible. Bounds the reserve to one
 * candidate per intent instead of one per hypothetical response.
 */
export type LotusReserveIntent =
  | "ADVANCE"
  | "RETRY_REPRESENTATION"
  | "DESCEND_PREREQUISITE"
  | "DISCRIMINATE";

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
  /** Skills removed from the test because something they depend on was a confirmed gap — never reported as failed. */
  notTested?: string[];
  /** Per-skill outcome, for the teacher and observer. */
  skills?: LotusSkillSummary[];
}

export type LotusSkillState = "UNTESTED" | "SECURE" | "SUSPECTED" | "CONFIRMED" | "NOT_TESTED_DEPENDENCY";

export interface LotusSkillSummary {
  skillId: string;
  name: string;
  state: LotusSkillState;
  evidence: string[];
}

export interface LotusSkillEvidence {
  skillId: string;
  kind: "SECURE" | "MISTAKE" | "UNFINISHED" | "DID_NOT_KNOW";
  mistake?: string;
  description?: string;
  source: "INSTANT" | "ANALYSIS";
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
  /** 1-based index into the item's workedSolution where the student's work first goes wrong; null if nothing went wrong. */
  firstWrongStep?: number | null;
  /** The mistake in plain words, as the analyser sees it. Not limited to any list of codes. */
  mistakeDescription?: string;
}

/**
 * Whether a candidate's answerKey.expression was cross-checked against an
 * expression independently re-extracted from the prompt's own text —
 * a different derivation of the same question, not the same value read
 * twice. MISMATCHED means the two disagree and the candidate must not be
 * shown. UNVERIFIABLE means the prompt wasn't in a form this deterministic
 * extractor could parse (e.g. a word problem) — an honest "couldn't check",
 * not a pass.
 */
export type LotusMathCrossCheckStatus = "MATCHED" | "MISMATCHED" | "UNVERIFIABLE";

export interface LotusMathCrossCheck {
  status: LotusMathCrossCheckStatus;
  explanation: string;
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
    | "RESERVE"
    | "CURRICULUM_DECK"
    | "ADAPTIVE_STAGED"
    | "OPENER_BANK"
    | "NONE_EXIT";
  reason: string;
  /**
   * Safe, observer-facing explanation of a plan change. Unlike `reason`, this
   * never contains answer keys or hidden hypotheses and may be shown while the
   * diagnostic is active.
   */
  planningNote?: string;
  /** Safe provenance shown in the observer's AI Lab; never inferred from the prompt. */
  provenance?:
    | "AI_GENERATED_FOR_SESSION"
    | "AI_REUSED_FROM_BANK"
    | "HARDCODED_SYSTEM";
  /**
   * Present only when THIS specific item was installed by an adaptive
   * decision — never merely because an AI recommended a change elsewhere,
   * and never for an unchanged, originally-planned coverage item. Mirrors
   * the plain-language labels in COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md
   * §10 Phase 3 for the tags the current decision set actually produces.
   */
  adaptationTag?: LotusAdaptationTag;
  informationGain: {
    passed: boolean;
    explanation: string;
  };
  mathVerification?: LotusMathCrossCheck;
}

/**
 * Which of the four sequential AI stages actually changed the outcome on
 * this turn, plus how long each took. Logged on every turn — fast-path and
 * slow-path alike, since the deep analysis always eventually runs — so we
 * can later answer "did the debate/closure stages ever change the verdict
 * often enough to justify their latency and cost, or would one assessment
 * have been enough?" from real data instead of guessing.
 */
export interface LotusStageAgreement {
  assessmentsAgreed: boolean;
  debateChangedVerdict: boolean;
  closureChangedVerdict: boolean;
}

export interface LotusStageTimingMs {
  assessment: number;
  debate: number;
  closure: number;
  total: number;
}

/**
 * PENDING is a real review that has not completed. FAILED means the review
 * exhausted its retry policy and carries no model interpretation.
 * NOT_REQUIRED means Lotus intentionally did not ask a model to interpret
 * this turn (for example, an explicit support request); it is never a
 * disguised completed review.
 */
export type LotusAnalysisStatus = "PENDING" | "COMPLETE" | "FAILED" | "NOT_REQUIRED";

/** The source of the turn's interpretation, separate from its maths verdict. */
export type LotusAnalysisSource = "DETERMINISTIC" | "SUPPORT_SIGNAL" | "AI_REVIEW";

/**
 * The plain-language adaptation tag shown beside a question's provenance
 * badge when — and only when — this specific item was installed by an
 * adaptive decision (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §10 Phase 3,
 * §11 "Plan and question transparency"). `CHALLENGE_EXTENSION` from the doc
 * has no corresponding decision in this codebase yet and is deliberately
 * not offered here — the tag vocabulary only covers actions that can
 * actually be installed today.
 */
export type LotusAdaptationTag =
  | { kind: "TARGETED_CHECK"; skill: string }
  | { kind: "EASIER_PREREQUISITE"; skill: string }
  | { kind: "BROADENED_EVIDENCE"; skill: string }
  | { kind: "COVERAGE_REPLACEMENT"; reason: string };

/**
 * A concrete, auditable planning move. This is deliberately separate from a
 * prose conclusion: the server must validate and install it before the UI
 * can claim that a question path changed.
 */
export type LotusAdaptiveAction =
  | "KEEP"
  | "TARGETED_PROBE"
  | "EASIER_PREREQUISITE"
  | "BROADEN"
  | "REMOVE_OR_DEFER"
  | "STOP";

export interface LotusAdaptiveDecision {
  action: LotusAdaptiveAction;
  observedError: string;
  alternatives: string[];
  rationale: string;
  expectedInformationGain: string;
  targetSkill?: string;
  /** The requested earliest safe slot, never a claim that it has been shown. */
  requestedPlacement?: string;
  /** Internal-safe turn reference used to reconcile planned action to generated item. */
  targetTurn?: number;
  /** Whether the validated plan change is already usable, waiting for a checked AI item, or could not be installed. */
  implementation: "APPLIED" | "QUEUED_FOR_GENERATION" | "NOT_APPLIED";
  /** Plain-language explanation of the implementation state, without answer keys. */
  implementationDetail: string;
  source: "RULE_VALIDATED_PLAN" | "AI_RECOMMENDATION";
}

export interface LotusQuestionAudit {
  question: LotusQuestion;
  response: LotusStudentResponse | null;
  verification: LotusMathVerification | null;
  /** Instant deterministic read computed at submit time, independent of any AI call. */
  breakpoint?: LotusBreakpointDiagnosis | null;
  /** Present only after an actual AI review has produced this stage. */
  gpt?: LotusModelAssessment;
  /** Present only after an actual AI review has produced this stage. */
  challenger?: LotusModelAssessment;
  /** Present only after an actual AI review has produced this stage. */
  debate?: LotusGptDebateResponse;
  conclusion: LotusDebateClosure;
  questionSelection: LotusQuestionSelection;
  /**
   * PENDING means the next question shown for this turn came from the fast
   * path (the reserve) and gpt/challenger/debate/conclusion above are still
   * placeholders — the real deep analysis is running in the background and
   * will overwrite this same turn's record in place once it lands. Never a
   * new turn, never a later turn's evidence.
   */
  analysisStatus: LotusAnalysisStatus;
  /** Lets the observer separate a mathematical fact, a support request, and a completed model interpretation. */
  analysisSource: LotusAnalysisSource;
  /** Durable review timing, used to distinguish queued work from model time. */
  analysisQueuedAt?: string;
  /** Snapshot of the in-process queue when the review was accepted; zero means running. */
  analysisQueuePosition?: number;
  analysisStartedAt?: string;
  analysisCompletedAt?: string;
  analysisDeadlineAt?: string;
  /** A late review remains evidence for the report but was not allowed to replan unseen questions. */
  analysisLate?: boolean;
  /** Present only for a terminal review failure; it is never fabricated model reasoning. */
  analysisFailureReason?: string;
  /** The validated planning decision made from this turn, if one was needed. */
  adaptiveDecision?: LotusAdaptiveDecision;
  /** What this turn told us about each skill. Hidden from the student while the diagnostic is active. */
  skillEvidence?: LotusSkillEvidence[];
  stageAgreement?: LotusStageAgreement | null;
  timingMs?: LotusStageTimingMs | null;
  createdAt: string;
}

/**
 * Behind LOTUS_PROGRESSIVE_STREAMING_ENABLED. Mutated in place on the
 * in-memory session as each of the four model calls for the *current*
 * in-flight answer resolves, so a concurrent GET of the session (polled
 * while the POST /answers request is still running) can show the observer
 * the debate arriving stage by stage instead of one blocking wait. Cleared
 * once the answer's audit is finalized — it never reflects a completed turn.
 */
export interface LotusLiveProgress {
  /** Matches the audits.length this progress belongs to, so a poll from a stale answeredCount can be ignored. */
  forAnsweredCount: number;
  stage: "ASSESSING" | "DEBATING" | "CLOSING";
  gpt?: LotusModelAssessment;
  challenger?: LotusModelAssessment;
  debate?: LotusGptDebateResponse;
  /**
   * A short, static, non-scored reflection line shown while the slow
   * analysis of the student's *previous* answer is still running, so the
   * wait carries a small prompt instead of a bare spinner. Never AI-authored
   * (must be instant) and never itself evidence — nothing reads a response
   * to it back into the learner model in this version.
   */
  reflectionPrompt?: string;
  updatedAt: string;
}

export interface LotusSessionView {
  sessionId: string;
  studentId: string;
  grade: 8;
  board: "CBSE";
  topic?: LotusTopic;
  status: "ACTIVE" | "COMPLETE";
  experimental: true;
  phase: LotusPhase;
  startedAt: string;
  currentQuestion: LotusQuestion | null;
  /** Prompt-only authorized future items. Answer keys are always redacted from active-session API responses. */
  upcomingQuestions?: LotusQuestion[];
  openingAudit: LotusQuestionAudit;
  audits: LotusQuestionAudit[];
  finalReport: LotusFinalReport | null;
  modelConfiguration: {
    primary: string;
    challenger: string;
  };
  liveProgress?: LotusLiveProgress | null;
  /** Factorisation preparation is intentionally prompt-free while the student waits. */
  preparation?: {
    readyQuestions: number;
    targetQuestions: number;
    totalQuestions: number;
    ready: boolean;
  };
}

/**
 * One unseen, unshown future slot's plain-language plan (COGNA 10.0/
 * LOTUS_CONTINUOUS_DIAGNOSTIC.md §11 "Unseen Plan"). Observer/staff only —
 * never answer keys, never the actual question text. `readiness` is honest:
 * a slot the student hasn't reached yet may still be in preparation, and
 * this says so rather than implying every future slot is already set.
 */
export interface LotusUnseenPlanEntry {
  turnsAhead: number;
  skill: string;
  purpose: "COVERAGE" | "TARGETED_CHECK" | "EASIER_PREREQUISITE" | "BROADENED_EVIDENCE" | "COVERAGE_REPLACEMENT";
  readiness: "READY" | "AWAITING_GENERATION";
  provenance?: "AI_GENERATED_FOR_SESSION" | "AI_REUSED_FROM_BANK";
}

export interface LotusStatusResponse {
  enabled: boolean;
  ready: boolean;
  missingConfiguration: string[];
  models: { primary: string; challenger: string };
  /** When false, liveProgress is never populated — clients should not poll. */
  progressiveStreamingEnabled: boolean;
}
