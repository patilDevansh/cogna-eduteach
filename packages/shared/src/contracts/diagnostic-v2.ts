/**
 * Micro-skill step diagnostic (MVP 9.0.1 Phase A) — additive, standalone from
 * every MVP 1.0-9.0 contract. See COGNA 9.0.1/BUILD_PLAN.md and
 * docs/diagnostic-microskill-slice/micro-skill-catalogue.md for the full
 * seven-layer model and 73-skill catalogue this slice draws 9 skills from.
 *
 * Hand-written runtime-guard convention (no zod), same as
 * student-analysis.ts / question-recommender.ts.
 */

// ─── Layers 1-4: what is being measured ────────────────────────────────────

export type MicroSkillId =
  | "FND_SIGN_MUL_DIV"
  | "LIN_DISTRIBUTE_NEG"
  | "LIN_DISTRIBUTE_POS"
  | "LIN_COMBINE_LIKE"
  | "LIN_REMOVE_CONSTANT"
  | "LIN_REMOVE_COEFFICIENT"
  | "LIN_SOLVE_TWO_STEP"
  | "LIN_SOLVE_VARIABLE_BOTH"
  | "LIN_CHECK_SOLUTION"
  /** Phase B1 — Topic 2 fractions vertical slice. */
  | "FND_FRACTION_EQUIV"
  | "FND_FRACTION_OPS"
  | "LIN_CLEAR_FRACTIONS"
  | "LIN_SOLVE_FRACTIONS"
  /** Phase B2 — Topic 3 difference-of-squares thin slice. */
  | "ALG_IDENTIFY_STRUCTURE"
  | "EXP_EXPAND_BINOMIALS"
  | "ID_DIFF_SQUARES"
  | "ID_VERIFY_EXPANSION"
  /** Phase B3 — Topic 4 factorisation thin slice. */
  | "FAC_READ_ABC_SIGNS"
  | "FAC_PAIR_PRODUCT_SUM"
  | "FAC_MONIC_TRINOMIAL"
  | "FAC_COMPUTE_AC"
  | "FAC_SPLIT_MIDDLE"
  | "FAC_NONMONIC_GROUP"
  | "FAC_VERIFY_EXPAND"
  /** Phase B4 — Topic 5 quadratic zero-product thin slice. */
  | "QUAD_STANDARD_FORM"
  | "QUAD_FACTOR_EXPRESSION"
  | "QUAD_ZERO_PRODUCT"
  | "QUAD_CREATE_BRANCHES"
  | "QUAD_SOLVE_UNIT_FACTOR"
  | "QUAD_VERIFY_ROOTS";

export const MICRO_SKILL_IDS: MicroSkillId[] = [
  "FND_SIGN_MUL_DIV",
  "LIN_DISTRIBUTE_NEG",
  "LIN_DISTRIBUTE_POS",
  "LIN_COMBINE_LIKE",
  "LIN_REMOVE_CONSTANT",
  "LIN_REMOVE_COEFFICIENT",
  "LIN_SOLVE_TWO_STEP",
  "LIN_SOLVE_VARIABLE_BOTH",
  "LIN_CHECK_SOLUTION",
  "FND_FRACTION_EQUIV",
  "FND_FRACTION_OPS",
  "LIN_CLEAR_FRACTIONS",
  "LIN_SOLVE_FRACTIONS",
  "ALG_IDENTIFY_STRUCTURE",
  "EXP_EXPAND_BINOMIALS",
  "ID_DIFF_SQUARES",
  "ID_VERIFY_EXPANSION",
  "FAC_READ_ABC_SIGNS",
  "FAC_PAIR_PRODUCT_SUM",
  "FAC_MONIC_TRINOMIAL",
  "FAC_COMPUTE_AC",
  "FAC_SPLIT_MIDDLE",
  "FAC_NONMONIC_GROUP",
  "FAC_VERIFY_EXPAND",
  "QUAD_STANDARD_FORM",
  "QUAD_FACTOR_EXPRESSION",
  "QUAD_ZERO_PRODUCT",
  "QUAD_CREATE_BRANCHES",
  "QUAD_SOLVE_UNIT_FACTOR",
  "QUAD_VERIFY_ROOTS",
];

export function isMicroSkillId(v: unknown): v is MicroSkillId {
  return typeof v === "string" && (MICRO_SKILL_IDS as string[]).includes(v);
}

export type MicroSkillStatus = "UNKNOWN" | "EMERGING" | "DEVELOPING" | "RELIABLE" | "LIKELY_GAP";

// ─── Layer 5: context modifiers ─────────────────────────────────────────────
// Deliberately narrow vocabulary for Phase A — grows topic-by-topic in later
// phases, same as every other versioned enum in this codebase.

export type ContextModifierId =
  | "INDEPENDENT"
  | "ASSISTED"
  | "NEAR_TRANSFER"
  /**
   * The student gave the answer without showing the working — `5` rather than
   * a line of algebra. Correct proves the destination, not the route, so this
   * marks the evidence as lower resolution rather than crediting every step
   * they never wrote.
   */
  | "FINAL_ANSWER_ONLY"
  /** Phase B1 — the step was taken on a fraction-linear item / track. */
  | "HAS_FRACTIONS";

export type DiagnosticV2Track =
  | "NEGATIVE_DISTRIBUTION"
  | "FRACTION_LINEAR"
  | "IDENTITY_DIFF_SQUARES"
  | "FACTOR_MONIC_TRINOMIAL"
  | "QUAD_ZERO_PRODUCT";

export const DIAGNOSTIC_V2_TRACKS: DiagnosticV2Track[] = [
  "NEGATIVE_DISTRIBUTION",
  "FRACTION_LINEAR",
  "IDENTITY_DIFF_SQUARES",
  "FACTOR_MONIC_TRINOMIAL",
  "QUAD_ZERO_PRODUCT",
];

export function isDiagnosticV2Track(v: unknown): v is DiagnosticV2Track {
  return typeof v === "string" && (DIAGNOSTIC_V2_TRACKS as string[]).includes(v);
}

// ─── Layer 6: step-level evidence ───────────────────────────────────────────

export type StepValidity = "VALID" | "INVALID" | "AMBIGUOUS" | "PARSE_FAILED";

export type StepTransformation =
  | "SIMPLIFY"
  | "ADD_BOTH_SIDES"
  | "SUBTRACT_BOTH_SIDES"
  | "MULTIPLY_BOTH_SIDES"
  | "DIVIDE_BOTH_SIDES"
  | "DISTRIBUTE"
  | "COMBINE_LIKE_TERMS"
  | "SUBSTITUTE_CHECK"
  | "OTHER"
  | "UNKNOWN";

/** DETERMINISTIC is the normal path. AI_FALLBACK only happens when the rule-based verifier returns AMBIGUOUS/PARSE_FAILED and the AI grader capability resolved it within its timeout. */
export type VerificationSource = "DETERMINISTIC" | "AI_FALLBACK";

// ─── Assistance ladder (Master Prompt §9 / Work Order 03 §8) ───────────────
// All 8 levels defined; this phase's teaching intervention only ever
// produces NONE / REVIEW_OPPORTUNITY / RULE_PROMPT / FULL_EXPLANATION.

export type AssistanceLevel =
  | "NONE"
  | "REVIEW_OPPORTUNITY"
  | "GENERAL_PROMPT"
  | "LOCATION_HINT"
  | "RULE_PROMPT"
  | "MICRO_QUESTION"
  | "PARTIAL_WORKED_STEP"
  | "FULL_EXPLANATION";

export type MicroSkillEvidenceKind =
  | "INDEPENDENT_CORRECT"
  | "INDEPENDENT_INCORRECT"
  | "SELF_CORRECTED"
  | "ASSISTED_CORRECT"
  | "ASSISTED_INCORRECT"
  | "TRANSFER_SUCCESS"
  | "TRANSFER_FAILURE"
  | "SKIPPED"
  | "INSUFFICIENT";

export type HypothesisSource = "RULE" | "AI";

export type DiagnosticV2SessionStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";

// ─── AI response shapes (validated before use, per AiOrchestratorService) ──

/**
 * Where the item a student is looking at came from. Recorded on the attempt
 * so a later reader never has to infer it from an item-key prefix — inferring
 * it that way is exactly how a generated transfer item was silently mistaken
 * for an ordinary one in Phase A.
 */
export type DiagnosticV2ItemOrigin = "PRE_WRITTEN" | "TEMPLATE_RENDERED" | "AI_AUTHORED";

export const DIAGNOSTIC_V2_ITEM_ORIGINS: DiagnosticV2ItemOrigin[] = [
  "PRE_WRITTEN",
  "TEMPLATE_RENDERED",
  "AI_AUTHORED",
];

export function isDiagnosticV2ItemOrigin(v: unknown): v is DiagnosticV2ItemOrigin {
  return typeof v === "string" && (DIAGNOSTIC_V2_ITEM_ORIGINS as string[]).includes(v);
}

/**
 * Selector's choice, bounded three ways:
 *  - EXISTING re-ranks within the pre-validated item list (index must be
 *    checked against the real candidate count by the caller, same as
 *    QuestionRecommendation),
 *  - GENERATE requests a freshly rendered instance of one of the slice's known
 *    templates (templateId must be checked against the known template set),
 *  - AUTHOR asks for a question no template covers. It names the skill to
 *    target and states what the available shapes are missing; the equation
 *    itself is produced by a separate authoring call and then has to survive
 *    the independent verifier gate before any student sees it.
 *
 * Never a free-form new topic/skill — that would defeat the bound entirely.
 */
export type DiagnosticV2SelectorChoice =
  | { choice: "EXISTING"; index: number; confidence: number; reasoning: string }
  | { choice: "GENERATE"; templateId: string; confidence: number; reasoning: string }
  | {
      choice: "AUTHOR";
      targetMicroSkillId: string;
      whyNoTemplateFits: string;
      confidence: number;
      reasoning: string;
    };

export function assertDiagnosticV2SelectorChoiceShape(v: unknown): DiagnosticV2SelectorChoice {
  if (!v || typeof v !== "object") {
    throw new Error("DiagnosticV2SelectorChoice: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`DiagnosticV2SelectorChoice: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("DiagnosticV2SelectorChoice: reasoning required");
  }
  if (o.choice === "EXISTING") {
    if (typeof o.index !== "number" || !Number.isInteger(o.index) || o.index < 0) {
      throw new Error(`DiagnosticV2SelectorChoice: index must be a non-negative integer, got ${String(o.index)}`);
    }
    return { choice: "EXISTING", index: o.index, confidence: o.confidence, reasoning: o.reasoning };
  }
  if (o.choice === "GENERATE") {
    if (typeof o.templateId !== "string" || !o.templateId.trim()) {
      throw new Error("DiagnosticV2SelectorChoice: templateId required for GENERATE");
    }
    return { choice: "GENERATE", templateId: o.templateId, confidence: o.confidence, reasoning: o.reasoning };
  }
  if (o.choice === "AUTHOR") {
    if (!isMicroSkillId(o.targetMicroSkillId)) {
      throw new Error(
        `DiagnosticV2SelectorChoice: targetMicroSkillId must be a known micro-skill, got ${String(o.targetMicroSkillId)}`,
      );
    }
    if (typeof o.whyNoTemplateFits !== "string" || !o.whyNoTemplateFits.trim()) {
      throw new Error("DiagnosticV2SelectorChoice: whyNoTemplateFits required for AUTHOR");
    }
    return {
      choice: "AUTHOR",
      targetMicroSkillId: o.targetMicroSkillId,
      whyNoTemplateFits: o.whyNoTemplateFits,
      confidence: o.confidence,
      reasoning: o.reasoning,
    };
  }
  throw new Error(
    `DiagnosticV2SelectorChoice: choice must be "EXISTING", "GENERATE" or "AUTHOR", got ${String(o.choice)}`,
  );
}

/**
 * A question the model wrote itself.
 *
 * `claimedSolution` is the model's own assertion and is **never** trusted: the
 * gate re-solves `equation` from the printed string and treats a mismatch as a
 * rejection, not as something to correct. It is carried at all only so that
 * disagreement is detectable — a model that cannot solve what it just wrote is
 * a model whose question should not be shown.
 */
export interface DiagnosticV2AuthoredItem {
  /** Exactly the line the student will work from, e.g. `-3(x - 4) + 5 = 17`. */
  equation: string;
  /** The model's claim, e.g. `x = 8`. Compared against an independent re-solve; never adopted. */
  claimedSolution: string;
  targetMicroSkillId: MicroSkillId;
  /** What the available template shapes could not cover. */
  whyNoTemplateFits: string;
}

export function assertDiagnosticV2AuthoredItemShape(v: unknown): DiagnosticV2AuthoredItem {
  if (!v || typeof v !== "object") {
    throw new Error("DiagnosticV2AuthoredItem: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.equation !== "string" || !o.equation.trim()) {
    throw new Error("DiagnosticV2AuthoredItem: equation required");
  }
  if (typeof o.claimedSolution !== "string" || !o.claimedSolution.trim()) {
    throw new Error("DiagnosticV2AuthoredItem: claimedSolution required");
  }
  if (!isMicroSkillId(o.targetMicroSkillId)) {
    throw new Error(
      `DiagnosticV2AuthoredItem: targetMicroSkillId must be a known micro-skill, got ${String(o.targetMicroSkillId)}`,
    );
  }
  if (typeof o.whyNoTemplateFits !== "string" || !o.whyNoTemplateFits.trim()) {
    throw new Error("DiagnosticV2AuthoredItem: whyNoTemplateFits required");
  }
  return {
    equation: o.equation,
    claimedSolution: o.claimedSolution,
    targetMicroSkillId: o.targetMicroSkillId,
    whyNoTemplateFits: o.whyNoTemplateFits,
  };
}

/** Interpreter's raw output, before it's wrapped with an id/source/createdAt for storage as a DiagnosticV2Hypothesis row. */
export interface DiagnosticV2HypothesisOutput {
  microSkillId: string;
  hypothesisLabel: string;
  confidence: number;
  reasoning: string;
  childFacingSummary: string;
}

export function assertDiagnosticV2HypothesisOutputShape(v: unknown): DiagnosticV2HypothesisOutput {
  if (!v || typeof v !== "object") {
    throw new Error("DiagnosticV2HypothesisOutput: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.microSkillId !== "string" || !o.microSkillId.trim()) {
    throw new Error("DiagnosticV2HypothesisOutput: microSkillId required");
  }
  if (typeof o.hypothesisLabel !== "string" || !o.hypothesisLabel.trim()) {
    throw new Error("DiagnosticV2HypothesisOutput: hypothesisLabel required");
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`DiagnosticV2HypothesisOutput: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("DiagnosticV2HypothesisOutput: reasoning required");
  }
  if (typeof o.childFacingSummary !== "string" || !o.childFacingSummary.trim()) {
    throw new Error("DiagnosticV2HypothesisOutput: childFacingSummary required");
  }
  return {
    microSkillId: o.microSkillId,
    hypothesisLabel: o.hypothesisLabel,
    confidence: o.confidence,
    reasoning: o.reasoning,
    childFacingSummary: o.childFacingSummary,
  };
}

/** AI grader fallback's output. Never AMBIGUOUS-by-default nor PARSE_FAILED — those are rule-only outcomes; the AI must commit to VALID/INVALID, or its call is simply not served and the step stays AMBIGUOUS/DETERMINISTIC. */
export interface DiagnosticV2GraderResult {
  validity: "VALID" | "INVALID";
  confidence: number;
  reasoning: string;
}

export function assertDiagnosticV2GraderResultShape(v: unknown): DiagnosticV2GraderResult {
  if (!v || typeof v !== "object") {
    throw new Error("DiagnosticV2GraderResult: not an object");
  }
  const o = v as Record<string, unknown>;
  if (o.validity !== "VALID" && o.validity !== "INVALID") {
    throw new Error(`DiagnosticV2GraderResult: validity must be "VALID" or "INVALID", got ${String(o.validity)}`);
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`DiagnosticV2GraderResult: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("DiagnosticV2GraderResult: reasoning required");
  }
  return { validity: o.validity, confidence: o.confidence, reasoning: o.reasoning };
}

// ─── API request/response DTOs ──────────────────────────────────────────────

export interface StartDiagnosticV2SessionRequest {
  studentId: string;
  /**
   * Which vertical slice to run. Default `NEGATIVE_DISTRIBUTION` keeps the
   * Phase A Arun path unchanged. `FRACTION_LINEAR` is Phase B1.
   */
  track?: DiagnosticV2Track;
}

export function assertStartDiagnosticV2SessionRequestShape(
  v: unknown,
): StartDiagnosticV2SessionRequest {
  if (!v || typeof v !== "object") {
    throw new Error("StartDiagnosticV2SessionRequest: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.studentId !== "string" || !o.studentId.trim()) {
    throw new Error("StartDiagnosticV2SessionRequest: studentId required");
  }
  if (o.track !== undefined && !isDiagnosticV2Track(o.track)) {
    throw new Error(
      `StartDiagnosticV2SessionRequest: track must be one of ${DIAGNOSTIC_V2_TRACKS.join(", ")}, got ${String(o.track)}`,
    );
  }
  return {
    studentId: o.studentId,
    ...(o.track ? { track: o.track } : {}),
  };
}

export interface DiagnosticV2AttemptView {
  attemptId: string;
  itemKey: string;
  /** What the student reads, e.g. `Solve for x:  3x + 5 = 20`. */
  equationPrompt: string;
  /** The bare equation or expression the first step is checked against, e.g. `3x + 5 = 20`. Distinct from equationPrompt, which carries the instruction wording — a client must send this, not the prompt, as the first `previousLine`. */
  openingLine: string;
}

export interface StartDiagnosticV2SessionResponse extends DiagnosticV2AttemptView {
  sessionId: string;
  stageId: string;
}

export interface SubmitDiagnosticV2StepRequest {
  attemptId: string;
  previousLine: string;
  submittedLine: string;
  /**
   * The student pressed "I don't know" rather than writing a line. This is a
   * distinct action, not a blank attempt: it is never parsed, never graded,
   * and never counted as getting the maths wrong. When it is set,
   * `submittedLine` is ignored and may be empty; when it is not set, an empty
   * `submittedLine` is still a bad request.
   */
  dontKnow?: boolean;
}

export function assertSubmitDiagnosticV2StepRequestShape(
  v: unknown,
): SubmitDiagnosticV2StepRequest {
  if (!v || typeof v !== "object") {
    throw new Error("SubmitDiagnosticV2StepRequest: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.attemptId !== "string" || !o.attemptId.trim()) {
    throw new Error("SubmitDiagnosticV2StepRequest: attemptId required");
  }
  if (typeof o.previousLine !== "string" || !o.previousLine.trim()) {
    throw new Error("SubmitDiagnosticV2StepRequest: previousLine required");
  }
  if (o.submittedLine !== undefined && typeof o.submittedLine !== "string") {
    throw new Error("SubmitDiagnosticV2StepRequest: submittedLine must be a string when present");
  }
  if (o.dontKnow !== undefined && typeof o.dontKnow !== "boolean") {
    throw new Error(
      `SubmitDiagnosticV2StepRequest: dontKnow must be a boolean when present, got ${String(o.dontKnow)}`,
    );
  }
  return {
    attemptId: o.attemptId,
    previousLine: o.previousLine,
    submittedLine: typeof o.submittedLine === "string" ? o.submittedLine : "",
    ...(o.dontKnow === true ? { dontKnow: true } : {}),
  };
}

export interface DiagnosticV2StepDecisionSource {
  source: "RULE" | "AI";
  reasoning?: string;
}

/** Common to both outcomes: what happens next, and what help is being offered. */
interface DiagnosticV2StepOutcomeBase {
  itemComplete: boolean;
  sessionStatus: DiagnosticV2SessionStatus;
  assistanceOffered?: AssistanceLevel;
  /**
   * The words to show alongside `assistanceOffered` — including the small
   * guiding question ("what is (-2) x (-5)?"). Always produced deterministically
   * by the engine from a fixed per-micro-skill table and the verifier's own
   * parsed values, never authored by a model: it reaches a student and it
   * contains arithmetic.
   */
  assistanceMessage?: string;
  selectorDecision?: DiagnosticV2StepDecisionSource;
  nextAttempt?: DiagnosticV2AttemptView;
}

/** The student wrote a line, and it was checked. */
export interface DiagnosticV2SubmittedStepResponse extends DiagnosticV2StepOutcomeBase {
  outcome: "SUBMITTED";
  stepId: string;
  /** Server-assigned position of this line within the attempt, zero-based. */
  stepIndex: number;
  validity: StepValidity;
  verificationSource: VerificationSource;
  attemptedTransformation: StepTransformation;
  /** Stable taxonomy code when INVALID (e.g. WRONG_COMMON_MULTIPLE). */
  firstInvalidActionCode?: string;
  firstInvalidActionDescription?: string;
}

/**
 * The student pressed "I don't know". No line exists, so there is no
 * DiagnosticV2Step row to point at, no validity, and nothing was verified —
 * every StepValidity value would be a lie about work that was never done.
 * The evidence it produces is recorded against `microSkillId` with a nullable
 * step reference instead.
 */
export interface DiagnosticV2DeclinedStepResponse extends DiagnosticV2StepOutcomeBase {
  outcome: "DECLINED";
  /** The item's target skill, which is what the student has just said they cannot do yet. */
  microSkillId: string;
}

export type SubmitDiagnosticV2StepResponse =
  | DiagnosticV2SubmittedStepResponse
  | DiagnosticV2DeclinedStepResponse;

export interface DiagnosticV2DebugStepView {
  /** Stable row id — required for React list keys; stepIndex alone resets per attempt. */
  id: string;
  attemptId: string;
  stepIndex: number;
  previousLine: string;
  submittedLine: string;
  validity: StepValidity;
  verificationSource: VerificationSource;
  attemptedTransformation: StepTransformation;
  firstInvalidActionCode?: string;
  firstInvalidActionDescription?: string;
  primaryMicroSkillId?: string;
  topicId?: string;
  competencyFamilyId?: string;
  contextModifierIds: string[];
  assistanceLevel: AssistanceLevel;
}

export interface DiagnosticV2DebugHypothesisView {
  microSkillId: string;
  hypothesisLabel: string;
  confidence: number;
  reasoning: string;
  source: HypothesisSource;
  childFacingSummary?: string;
}

export interface DiagnosticV2DebugMicroSkillStateView {
  microSkillId: string;
  status: MicroSkillStatus;
  evidenceCount: number;
  independentSuccessCount: number;
  independentFailureCount: number;
  assistedSuccessCount: number;
  observedContextStrengths: string[];
  observedContextGaps: string[];
}

/**
 * One question the session served, with where it came from. The student-facing
 * `AI` chip deliberately does not carry this distinction — a child does not
 * need to know whether their question was rendered or authored — but a
 * reviewer does, and so does any later analysis of the authoring path.
 */
export interface DiagnosticV2DebugItemView {
  itemKey: string;
  equationPrompt: string;
  origin: DiagnosticV2ItemOrigin;
  /** null for an AI-authored item, which by definition belongs to no template. */
  templateId: string | null;
  primaryMicroSkillId: string;
  status: string;
}

/** An "I don't know" — no step row exists for it, so it is listed separately rather than left invisible between two steps. */
export interface DiagnosticV2DebugDeclineView {
  itemKey: string;
  microSkillId: string;
  assistanceLevel: AssistanceLevel;
  at: string;
}

/** GET /diagnostic-v2/sessions/:id — the internal debug view (Master Prompt §19). */
export interface DiagnosticV2DebugView {
  sessionId: string;
  status: DiagnosticV2SessionStatus;
  currentStageId: string;
  stageHistory: Array<{ stageId: string; source: "RULE" | "AI"; reasoning?: string; at: string }>;
  items: DiagnosticV2DebugItemView[];
  steps: DiagnosticV2DebugStepView[];
  declines: DiagnosticV2DebugDeclineView[];
  hypotheses: DiagnosticV2DebugHypothesisView[];
  microSkillStates: DiagnosticV2DebugMicroSkillStateView[];
}

export interface DiagnosticV2SummaryResponse {
  sessionId: string;
  status: DiagnosticV2SessionStatus;
  childFacingSummary: string;
}
