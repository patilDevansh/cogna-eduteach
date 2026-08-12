/**
 * Orchestration for the micro-skill step diagnostic (MVP 9.0.1 Phase A).
 *
 * Ordering is the whole safety story, and it is fixed:
 *   1. the deterministic verifier decides whether the line is valid,
 *   2. only if it abstained (PARSE_FAILED/AMBIGUOUS) may the AI grader speak,
 *   3. evidence and micro-skill state are computed from that decision alone,
 *   4. the AI interpreter writes prose *about* that state, never into it,
 *   5. the AI selector picks the next item from a rule-built legal set.
 *
 * Every AI step degrades to a deterministic result — flag off, call failed,
 * or timed out all land on the same fallback, so a session run with AI
 * completely disabled produces byte-identical evidence and the same route.
 *
 * Nothing here touches Attempt / Question / Concept / MasteryScore or any
 * MVP 1.0-9.0 engine. The one shared table it writes is RevisionQueueItem,
 * via its additive nullable microSkillId column, and only to *schedule* a
 * retention check — running it is a later phase.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  EVIDENCE_POLICY_MICROSKILL_V1,
  STEP_VERIFICATION_RULES_FRACTION_V1,
  STEP_VERIFICATION_RULES_IDENTITY_V1,
  STEP_VERIFICATION_RULES_FACTOR_V1,
  STEP_VERIFICATION_RULES_QUADRATIC_V1,
  STEP_VERIFICATION_RULES_V1,
  isDiagnosticV2ItemOrigin,
  type AssistanceLevel,
  type ContextModifierId,
  type DiagnosticV2AttemptView,
  type DiagnosticV2DebugView,
  type DiagnosticV2ItemOrigin,
  type DiagnosticV2SessionStatus,
  type DiagnosticV2SummaryResponse,
  type DiagnosticV2Track,
  type HypothesisSource,
  type MicroSkillEvidenceKind,
  type MicroSkillId,
  type MicroSkillStatus,
  type StartDiagnosticV2SessionResponse,
  type StepTransformation,
  type StepValidity,
  type SubmitDiagnosticV2StepRequest,
  type SubmitDiagnosticV2StepResponse,
  type DiagnosticV2SelectionProvenance,
  type VerificationSource,
} from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";
import {
  findFixedItem,
  FIXED_ITEMS,
  isKnownTemplateId,
  normalizedQuestionKey,
  renderFreshInstance,
  type DiagnosticV2Item,
  type DiagnosticV2ItemStageId,
  type DiagnosticV2TemplateId,
} from "./diagnostic-v2-template-render";
import {
  likelyPrefetchTemplates,
  peekBufferedItem,
  putBufferedItem,
} from "./diagnostic-v2-next-item-buffer";
import {
  isSolvedForm,
  matchSingleBracket,
  parseLinearWithBracket,
  type ParsedLine,
} from "./linear-bracket-verifier";
import {
  checkBareFinalAnswerForTrack,
  effectiveVerifierTrack,
  verifyDiagnosticV2Step,
} from "./diagnostic-v2-verifier-router";
import { lineHasFractionSyntax } from "./fraction-linear-verifier";
import { nextStepHint } from "./diagnostic-v2-next-step-hint";
// Re-exported below for callers, but also needed locally to gate the demo hint.
import { isDemoStudent as isDemoStudentId } from "./demo-student";
import { assistanceTextFor } from "./diagnostic-v2-assistance-text";
import {
  applyEvidenceToCounts,
  ASSISTANCE_RANK,
  computeMicroSkillStateUpdate,
  EMPTY_COUNTS,
  evidenceKindForStep,
  evidenceWeight,
  isAssisted,
  type MicroSkillCounts,
} from "./diagnostic-v2.formulas";
import { findMicroSkill, layersForMicroSkill } from "./micro-skills.catalog";
import {
  DiagnosticV2AiSelectorService,
  formatSkillLine,
  type SelectorCandidate,
  type SelectorSkillLine,
} from "./diagnostic-v2-ai-selector.service";
import { buildStepProvenance, describeRouteReason } from "./diagnostic-v2-provenance";
import { DiagnosticV2AiInterpreterService } from "./diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "./diagnostic-v2-ai-grader.service";
import { DiagnosticV2ReportService } from "./diagnostic-v2-report.service";
import {
  buildChildFacingSummary,
  buildSummaryOverview,
  childFacingSkillName,
} from "./diagnostic-v2-summary";

function extractRejectedSelectorDetails(
  failureReason: string | null | undefined,
  rejectedOutput: unknown,
): { forbiddenTerm?: string; rejectedReasoning?: string } {
  const result: { forbiddenTerm?: string; rejectedReasoning?: string } = {};
  const term = failureReason?.match(/forbidden term "([^"]+)"/i)?.[1];
  if (term) result.forbiddenTerm = term;
  if (rejectedOutput && typeof rejectedOutput === "object" && !Array.isArray(rejectedOutput)) {
    const reasoning = (rejectedOutput as Record<string, unknown>).reasoning;
    if (typeof reasoning === "string" && reasoning.trim()) result.rejectedReasoning = reasoning.trim();
  }
  return result;
}

export {
  buildChildFacingSummary,
  buildSummaryOverview,
  childFacingSkillName,
} from "./diagnostic-v2-summary";
export { isDemoStudent, DEMO_STUDENT_TEMPLATE_ID } from "./demo-student";

// ─── Stages ─────────────────────────────────────────────────────────────────

export type DiagnosticV2StageId =
  | "ENTRY_TWO_STEP"
  | "ENTRY_VARIABLE_BOTH"
  | "NEG_DIST_MAIN"
  | "NEG_DIST_CONTRAST"
  | "RULE_PROMPT"
  | "TRANSFER_NEG_DIST"
  | "PREREQ_SIGN_PROBE"
  | "COEFFICIENT_VERIFICATION"
  | "ENTRY_FRAC_SIMPLE"
  | "FRAC_CLEAR_MAIN"
  | "FRAC_CLEAR_CONTRAST"
  | "TRANSFER_FRAC_CLEAR"
  | "ENTRY_EXPAND_BINOMIAL"
  | "ID_DIFF_MAIN"
  | "ID_DIFF_CONTRAST"
  | "TRANSFER_ID_DIFF"
  | "ENTRY_FACTOR_EXPAND"
  | "FAC_MONIC_MAIN"
  | "FAC_MONIC_CONTRAST"
  | "TRANSFER_FAC_NONMONIC"
  | "ENTRY_QUAD_STANDARD"
  | "QUAD_ZP_MAIN"
  | "QUAD_ZP_CONTRAST"
  | "TRANSFER_QUAD_ZP"
  | "COMPLETE";

/** Item-bearing stages for the Phase A negative-distribution track. */
export const ITEM_STAGE_ORDER: DiagnosticV2StageId[] = [
  "ENTRY_TWO_STEP",
  "ENTRY_VARIABLE_BOTH",
  "NEG_DIST_MAIN",
  "NEG_DIST_CONTRAST",
  "TRANSFER_NEG_DIST",
];

/** Item-bearing stages for the Phase B1 fraction-linear track. */
export const FRAC_ITEM_STAGE_ORDER: DiagnosticV2StageId[] = [
  "ENTRY_FRAC_SIMPLE",
  "FRAC_CLEAR_MAIN",
  "FRAC_CLEAR_CONTRAST",
  "TRANSFER_FRAC_CLEAR",
];

/** Item-bearing stages for the Phase B2 difference-of-squares track. */
export const ID_ITEM_STAGE_ORDER: DiagnosticV2StageId[] = [
  "ENTRY_EXPAND_BINOMIAL",
  "ID_DIFF_MAIN",
  "ID_DIFF_CONTRAST",
  "TRANSFER_ID_DIFF",
];

/** Item-bearing stages for the Phase B3 factorisation track. */
export const FAC_ITEM_STAGE_ORDER: DiagnosticV2StageId[] = [
  "ENTRY_FACTOR_EXPAND",
  "FAC_MONIC_MAIN",
  "FAC_MONIC_CONTRAST",
  "TRANSFER_FAC_NONMONIC",
];

/** Item-bearing stages for the Phase B4 quadratic zero-product track. */
export const QUAD_ITEM_STAGE_ORDER: DiagnosticV2StageId[] = [
  "ENTRY_QUAD_STANDARD",
  "QUAD_ZP_MAIN",
  "QUAD_ZP_CONTRAST",
  "TRANSFER_QUAD_ZP",
];

export const FIRST_STAGE_ID: DiagnosticV2StageId = "ENTRY_TWO_STEP";
export const FIRST_FRAC_STAGE_ID: DiagnosticV2StageId = "ENTRY_FRAC_SIMPLE";
export const FIRST_ID_STAGE_ID: DiagnosticV2StageId = "ENTRY_EXPAND_BINOMIAL";
export const FIRST_FAC_STAGE_ID: DiagnosticV2StageId = "ENTRY_FACTOR_EXPAND";
export const FIRST_QUAD_STAGE_ID: DiagnosticV2StageId = "ENTRY_QUAD_STANDARD";

/** Temporarily scoped combined backbone: Topics 1–2 only. */
export const COMBINED_ITEM_STAGE_ORDER: DiagnosticV2StageId[] = [
  ...ITEM_STAGE_ORDER,
  ...FRAC_ITEM_STAGE_ORDER,
];

/** After a topic transfer on COMBINED_ALGEBRA, hop to the next topic entry. */
const COMBINED_NEXT_AFTER_TRANSFER: Partial<Record<DiagnosticV2StageId, DiagnosticV2StageId>> = {
  TRANSFER_NEG_DIST: "ENTRY_FRAC_SIMPLE",
};

export function itemStageOrderForTrack(track: DiagnosticV2Track): DiagnosticV2StageId[] {
  if (track === "COMBINED_ALGEBRA") return COMBINED_ITEM_STAGE_ORDER;
  if (track === "FRACTION_LINEAR") return FRAC_ITEM_STAGE_ORDER;
  if (track === "IDENTITY_DIFF_SQUARES") return ID_ITEM_STAGE_ORDER;
  if (track === "FACTOR_MONIC_TRINOMIAL") return FAC_ITEM_STAGE_ORDER;
  if (track === "QUAD_ZERO_PRODUCT") return QUAD_ITEM_STAGE_ORDER;
  return ITEM_STAGE_ORDER;
}

export function firstStageForTrack(track: DiagnosticV2Track): DiagnosticV2StageId {
  if (track === "FRACTION_LINEAR") return FIRST_FRAC_STAGE_ID;
  if (track === "IDENTITY_DIFF_SQUARES") return FIRST_ID_STAGE_ID;
  if (track === "FACTOR_MONIC_TRINOMIAL") return FIRST_FAC_STAGE_ID;
  if (track === "QUAD_ZERO_PRODUCT") return FIRST_QUAD_STAGE_ID;
  // COMBINED_ALGEBRA and NEGATIVE_DISTRIBUTION both open on NegDist entry.
  return FIRST_STAGE_ID;
}

export function openingReasonForTrack(track: DiagnosticV2Track): string {
  switch (track) {
    case "COMBINED_ALGEBRA":
      return "Opening item of the combined algebra diagnostic (starts with brackets / negative distribution).";
    case "FRACTION_LINEAR":
      return "Opening item of the fraction-linear diagnostic track.";
    case "IDENTITY_DIFF_SQUARES":
      return "Opening item of the difference-of-squares identities track.";
    case "FACTOR_MONIC_TRINOMIAL":
      return "Opening item of the factorisation track.";
    case "QUAD_ZERO_PRODUCT":
      return "Opening item of the quadratic zero-product track.";
    default:
      return "Opening item of the fixed entry sequence.";
  }
}

export function rulePromptReasoningForStage(completedStage: DiagnosticV2StageId): string {
  switch (completedStage) {
    case "NEG_DIST_CONTRAST":
      return "Same distribution error twice on structurally different problems — taught the sign rule before re-testing.";
    case "FRAC_CLEAR_CONTRAST":
      return "Same fraction-clearing error twice on structurally different problems — taught the clearing rule before re-testing.";
    case "ID_DIFF_CONTRAST":
      return "Same difference-of-squares error twice on structurally different problems — taught the identity before re-testing.";
    case "FAC_MONIC_CONTRAST":
      return "Same factorisation error twice on structurally different problems — taught the factor pair rule before re-testing.";
    case "QUAD_ZP_CONTRAST":
      return "Same zero-product error twice on structurally different problems — taught the zero-product rule before re-testing.";
    default:
      return "Same error twice on structurally different problems — taught the rule before re-testing.";
  }
}

/**
 * A served item's stage comes from the item itself (stageId), never from
 * guessing at an item-key prefix. Template mapping remains for the fixed
 * bank and for freshly rendered instances that set stageId from TEMPLATE_STAGES.
 */
export function stageForTemplate(templateId: DiagnosticV2TemplateId): DiagnosticV2StageId {
  switch (templateId) {
    case "TPL_TWO_STEP":
      return "ENTRY_TWO_STEP";
    case "TPL_VARIABLE_BOTH":
      return "ENTRY_VARIABLE_BOTH";
    case "TPL_NEG_DISTRIBUTION":
      return "NEG_DIST_MAIN";
    case "TPL_NEG_DISTRIBUTION_BARE":
      return "NEG_DIST_CONTRAST";
    case "TPL_TRANSFER_NEG_DISTRIBUTION":
      return "TRANSFER_NEG_DIST";
    case "TPL_SIGN_MUL_DIV":
      return "PREREQ_SIGN_PROBE";
    case "TPL_FRAC_SIMPLE":
      return "ENTRY_FRAC_SIMPLE";
    case "TPL_FRAC_CLEAR":
      return "FRAC_CLEAR_MAIN";
    case "TPL_FRAC_CLEAR_BARE":
      return "FRAC_CLEAR_CONTRAST";
    case "TPL_TRANSFER_FRAC_CLEAR":
      return "TRANSFER_FRAC_CLEAR";
    case "TPL_EXPAND_BINOMIAL":
      return "ENTRY_EXPAND_BINOMIAL";
    case "TPL_DIFF_SQUARES":
      return "ID_DIFF_MAIN";
    case "TPL_DIFF_SQUARES_BARE":
      return "ID_DIFF_CONTRAST";
    case "TPL_TRANSFER_DIFF_SQUARES":
      return "TRANSFER_ID_DIFF";
    case "TPL_FACTOR_EXPAND":
      return "ENTRY_FACTOR_EXPAND";
    case "TPL_FAC_MONIC":
      return "FAC_MONIC_MAIN";
    case "TPL_FAC_MONIC_BARE":
      return "FAC_MONIC_CONTRAST";
    case "TPL_TRANSFER_FAC_NONMONIC":
      return "TRANSFER_FAC_NONMONIC";
    case "TPL_QUAD_STANDARD":
      return "ENTRY_QUAD_STANDARD";
    case "TPL_QUAD_ZERO_PRODUCT":
      return "QUAD_ZP_MAIN";
    case "TPL_QUAD_ZP_BARE":
      return "QUAD_ZP_CONTRAST";
    case "TPL_TRANSFER_QUAD_ZP":
      return "TRANSFER_QUAD_ZP";
  }
}

export function stageForItem(item: DiagnosticV2Item): DiagnosticV2StageId {
  return item.stageId;
}

/** Next fixed-backbone template for Phase C prefetch (skill/template likelihood). */
export function nextBackboneTemplateId(
  currentStage: DiagnosticV2StageId,
  track?: DiagnosticV2Track,
): DiagnosticV2TemplateId | null {
  const orders = track
    ? [itemStageOrderForTrack(track)]
    : [
        ITEM_STAGE_ORDER,
        FRAC_ITEM_STAGE_ORDER,
        ID_ITEM_STAGE_ORDER,
        FAC_ITEM_STAGE_ORDER,
        QUAD_ITEM_STAGE_ORDER,
      ];
  for (const order of orders) {
    const idx = order.indexOf(currentStage);
    if (idx >= 0 && idx + 1 < order.length) {
      return findFixedItem(order[idx + 1]!)?.templateId ?? null;
    }
  }
  return null;
}

/**
 * The deterministic route. The contrast probe only appears when the target
 * skill actually failed — a student who distributes correctly first time is
 * not made to prove it twice. RULE_PROMPT is a teaching moment, not an item:
 * it is logged into stageHistory and immediately followed by the transfer
 * check that tests whether the teaching took.
 */
export function nextStagesAfter(
  completed: DiagnosticV2StageId,
  ctx: {
    targetSkillFailed: boolean;
    patternConfirmed: boolean;
    track?: DiagnosticV2Track;
  },
): DiagnosticV2StageId[] {
  switch (completed) {
    case "ENTRY_TWO_STEP":
      return ["ENTRY_VARIABLE_BOTH"];
    case "ENTRY_VARIABLE_BOTH":
      return ["NEG_DIST_MAIN"];
    case "NEG_DIST_MAIN":
      return ctx.targetSkillFailed ? ["NEG_DIST_CONTRAST"] : ["TRANSFER_NEG_DIST"];
    case "NEG_DIST_CONTRAST":
      return ctx.patternConfirmed ? ["RULE_PROMPT", "TRANSFER_NEG_DIST"] : ["TRANSFER_NEG_DIST"];
    // Off-backbone: reached only when the selector detoured here because it
    // saw FND_SIGN_MUL_DIV untested or weak. Resume into the discriminating
    // contrast check — the step that decides whether the original error was a
    // slip or a real gap — now with fresh evidence on the prerequisite. If
    // NEG_DIST_CONTRAST already ran earlier in this same session,
    // selectNextItem's duplicate guard is what stops it being served twice,
    // not this routing decision.
    case "PREREQ_SIGN_PROBE":
      return ["NEG_DIST_CONTRAST"];
    case "COEFFICIENT_VERIFICATION":
      return ["COMPLETE"];
    case "ENTRY_FRAC_SIMPLE":
      return ["FRAC_CLEAR_MAIN"];
    case "FRAC_CLEAR_MAIN":
      return ctx.targetSkillFailed ? ["FRAC_CLEAR_CONTRAST"] : ["TRANSFER_FRAC_CLEAR"];
    case "FRAC_CLEAR_CONTRAST":
      return ctx.patternConfirmed
        ? ["RULE_PROMPT", "TRANSFER_FRAC_CLEAR"]
        : ["TRANSFER_FRAC_CLEAR"];
    case "ENTRY_EXPAND_BINOMIAL":
      return ["ID_DIFF_MAIN"];
    case "ID_DIFF_MAIN":
      return ctx.targetSkillFailed ? ["ID_DIFF_CONTRAST"] : ["TRANSFER_ID_DIFF"];
    case "ID_DIFF_CONTRAST":
      return ctx.patternConfirmed
        ? ["RULE_PROMPT", "TRANSFER_ID_DIFF"]
        : ["TRANSFER_ID_DIFF"];
    case "ENTRY_FACTOR_EXPAND":
      return ["FAC_MONIC_MAIN"];
    case "FAC_MONIC_MAIN":
      return ctx.targetSkillFailed ? ["FAC_MONIC_CONTRAST"] : ["TRANSFER_FAC_NONMONIC"];
    case "FAC_MONIC_CONTRAST":
      return ctx.patternConfirmed
        ? ["RULE_PROMPT", "TRANSFER_FAC_NONMONIC"]
        : ["TRANSFER_FAC_NONMONIC"];
    case "ENTRY_QUAD_STANDARD":
      return ["QUAD_ZP_MAIN"];
    case "QUAD_ZP_MAIN":
      return ctx.targetSkillFailed ? ["QUAD_ZP_CONTRAST"] : ["TRANSFER_QUAD_ZP"];
    case "QUAD_ZP_CONTRAST":
      return ctx.patternConfirmed
        ? ["RULE_PROMPT", "TRANSFER_QUAD_ZP"]
        : ["TRANSFER_QUAD_ZP"];
    case "TRANSFER_NEG_DIST":
    case "TRANSFER_FRAC_CLEAR":
    case "TRANSFER_ID_DIFF":
    case "TRANSFER_FAC_NONMONIC":
    case "TRANSFER_QUAD_ZP": {
      if (ctx.track === "COMBINED_ALGEBRA") {
        const nextTopic = COMBINED_NEXT_AFTER_TRANSFER[completed];
        if (nextTopic) return [nextTopic];
      }
      return ["COMPLETE"];
    }
    default:
      return ["COMPLETE"];
  }
}

export interface StageHistoryEntry {
  stageId: string;
  source: "RULE" | "AI";
  reasoning?: string;
  at: string;
  /** Present on the opening history entry — which vertical slice this session runs. */
  track?: DiagnosticV2Track;
  /** Debug-only selection trail when this entry advanced onto a new item. */
  selection?: DiagnosticV2SelectionProvenance;
  /** Debug-only: what was handed to the selector for this transition (for step provenance.handedToAi). */
  selectorHanded?: { lastStepSummary: string; skillLines: string[] };
}

export function trackFromStageHistory(history: unknown): DiagnosticV2Track {
  if (!Array.isArray(history) || history.length === 0) return "NEGATIVE_DISTRIBUTION";
  const first = history[0] as StageHistoryEntry;
  if (
    first.track === "FRACTION_LINEAR" ||
    first.track === "NEGATIVE_DISTRIBUTION" ||
    first.track === "IDENTITY_DIFF_SQUARES" ||
    first.track === "FACTOR_MONIC_TRINOMIAL" ||
    first.track === "QUAD_ZERO_PRODUCT" ||
    first.track === "COMBINED_ALGEBRA"
  ) {
    return first.track;
  }
  const stageId = String(first.stageId ?? "");
  if (
    stageId.startsWith("FRAC_") ||
    stageId === "ENTRY_FRAC_SIMPLE" ||
    stageId === "TRANSFER_FRAC_CLEAR"
  ) {
    return "FRACTION_LINEAR";
  }
  if (
    stageId.startsWith("ID_") ||
    stageId === "ENTRY_EXPAND_BINOMIAL" ||
    stageId === "TRANSFER_ID_DIFF"
  ) {
    return "IDENTITY_DIFF_SQUARES";
  }
  if (
    stageId.startsWith("FAC_") ||
    stageId === "ENTRY_FACTOR_EXPAND" ||
    stageId === "TRANSFER_FAC_NONMONIC"
  ) {
    return "FACTOR_MONIC_TRINOMIAL";
  }
  if (
    stageId.startsWith("QUAD_") ||
    stageId === "ENTRY_QUAD_STANDARD" ||
    stageId === "TRANSFER_QUAD_ZP"
  ) {
    return "QUAD_ZERO_PRODUCT";
  }
  return "NEGATIVE_DISTRIBUTION";
}

// ─── Micro-skill attribution ────────────────────────────────────────────────

/**
 * Which single micro-skill this one line is evidence about.
 *
 * The catalogue's core rule (docs/diagnostic-microskill-slice §3) is that a
 * wrong answer must not poison every skill a question touches: evidence
 * attaches to the operation the student was actually performing on this line,
 * not to the item's headline skill. Only this primary skill produces an
 * evidence event — the supporting ids are recorded on the step for traceability
 * but are prerequisites, and a prerequisite is never scored just because the
 * line that used it went wrong.
 */
export function attributeMicroSkill(input: {
  previousLine: string;
  submittedLine: string;
  transformation: StepTransformation;
  firstInvalidActionCode?: string;
  item: DiagnosticV2Item;
}): { primary: MicroSkillId; supporting: MicroSkillId[] } {
  const fallback = {
    primary: input.item.primaryMicroSkillId,
    supporting: [...input.item.supportingMicroSkillIds],
  };

  const prev = tryParse(input.previousLine);
  const next = tryParse(input.submittedLine);
  if (!prev || !next) return fallback;

  // A correctly performed operation followed by an altered, untouched value
  // is not evidence against the operation. Associate it with checking work for
  // traceability; the submit path below deliberately does not score the slip.
  if (input.firstInvalidActionCode === "COPIED_UNCHANGED_SIDE") {
    return { primary: "LIN_CHECK_SOLUTION", supporting: [input.item.primaryMicroSkillId] };
  }

  // Parentheses used as fraction numerators are not bracket-distribution
  // evidence. Attribute clearing denominators before the generic bracket test.
  if (
    input.transformation === "MULTIPLY_BOTH_SIDES" &&
    (lineHasFractionSyntax(input.previousLine) ||
      input.item.primaryMicroSkillId === "LIN_CLEAR_FRACTIONS" ||
      input.item.primaryMicroSkillId === "LIN_SOLVE_FRACTIONS")
  ) {
    return {
      primary: "LIN_CLEAR_FRACTIONS",
      supporting: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
    };
  }

  if (prev.hadBracket && !next.hadBracket) {
    return bracketMultiplierIsNegative(input.previousLine)
      ? { primary: "LIN_DISTRIBUTE_NEG", supporting: ["FND_SIGN_MUL_DIV"] }
      : { primary: "LIN_DISTRIBUTE_POS", supporting: ["FND_SIGN_MUL_DIV"] };
  }

  if (prev.rhs && next.rhs) {
    const prevBothSidesHaveVar = prev.lhs.a.n !== 0 && prev.rhs.a.n !== 0;
    const nextOneSideHasVar = (next.lhs.a.n === 0) !== (next.rhs.a.n === 0);
    if (prevBothSidesHaveVar && nextOneSideHasVar) {
      return { primary: "LIN_COMBINE_LIKE", supporting: [] };
    }
  }

  switch (input.transformation) {
    case "DIVIDE_BOTH_SIDES":
    case "MULTIPLY_BOTH_SIDES":
      return { primary: "LIN_REMOVE_COEFFICIENT", supporting: [] };
    case "ADD_BOTH_SIDES":
    case "SUBTRACT_BOTH_SIDES":
      return { primary: "LIN_REMOVE_CONSTANT", supporting: [] };
    case "COMBINE_LIKE_TERMS":
      return { primary: "LIN_COMBINE_LIKE", supporting: [] };
    case "SUBSTITUTE_CHECK":
      return { primary: "LIN_CHECK_SOLUTION", supporting: [] };
    default:
      return fallback;
  }
}

function tryParse(line: string): ParsedLine | null {
  try {
    return parseLinearWithBracket(line);
  } catch {
    return null;
  }
}

/** Reuses the verifier's own bracket matcher rather than a second regex, so attribution can never disagree with grading about which bracket it is looking at. */
function bracketMultiplierIsNegative(raw: string): boolean {
  return (matchSingleBracket(raw)?.multiplier ?? 1) < 0;
}

/**
 * The help already in force when the student writes the next line.
 *
 * A decline hands over the rule, so everything after it in the same item is
 * assisted work and scores as such. A review opportunity does not — looking at
 * your own line again is not being told anything.
 */
export function assistanceInForce(input: {
  priorDeclineCount: number;
  retriedAfterInvalid: boolean;
}): AssistanceLevel {
  if (input.priorDeclineCount >= 1) return "RULE_PROMPT";
  if (input.retriedAfterInvalid) return "REVIEW_OPPORTUNITY";
  return "NONE";
}

/** Layer 5 tags for one submitted line. */
export function contextModifiersForStep(input: {
  assistanceLevel: AssistanceLevel;
  isTransferCheck: boolean;
  /** The answer was given as a bare value, with no working shown. */
  finalAnswerOnly?: boolean;
  /** Phase B1 — step taken on the fraction-linear track / a fraction item. */
  hasFractions?: boolean;
}): ContextModifierId[] {
  const modifiers: ContextModifierId[] = [isAssisted(input.assistanceLevel) ? "ASSISTED" : "INDEPENDENT"];
  if (input.isTransferCheck) modifiers.push("NEAR_TRANSFER");
  if (input.finalAnswerOnly) modifiers.push("FINAL_ANSWER_ONLY");
  if (input.hasFractions) modifiers.push("HAS_FRACTIONS");
  return modifiers;
}

/** A hypothesis is worth writing when something changed that a human would want explained — a new error, a confirmed pattern, or a gap that just held up under a fresh problem. */
export function isInterestingPattern(input: {
  kind: MicroSkillEvidenceKind;
  previousStatus: MicroSkillStatus;
  nextStatus: MicroSkillStatus;
}): boolean {
  const negative =
    input.kind === "INDEPENDENT_INCORRECT" ||
    input.kind === "TRANSFER_FAILURE" ||
    input.kind === "ASSISTED_INCORRECT";
  if (negative) return true;
  if (input.nextStatus === "LIKELY_GAP") return true;
  return input.kind === "TRANSFER_SUCCESS" && input.previousStatus === "LIKELY_GAP";
}

export interface CoefficientVerificationObservation {
  questionId: string;
  primaryMicroSkillId: string | null;
  attemptedTransformation: string;
  validity: StepValidity;
  assistanceLevel: AssistanceLevel;
}

export interface CoefficientVerificationGate {
  eligible: boolean;
  independentOpportunities: number;
  quotientFailures: number;
  independentSuccesses: number;
  distinctQuestions: number;
  contradictoryStrengthEvidence: number;
  reason: string;
}

/**
 * A neutral response-consistency gate. It never tries to infer intent. The
 * extra one-step question is eligible only at a caller-chosen natural
 * checkpoint, after enough ordinary work already exists to justify it.
 */
export function assessCoefficientVerificationGate(
  observations: readonly CoefficientVerificationObservation[],
): CoefficientVerificationGate {
  const independent = observations.filter((observation) => observation.assistanceLevel === "NONE");
  const coefficient = independent.filter(
    (observation) =>
      observation.primaryMicroSkillId === "LIN_REMOVE_COEFFICIENT" &&
      observation.attemptedTransformation === "REMOVE_COEFFICIENT",
  );
  const quotientFailures = coefficient.filter((observation) => observation.validity === "INVALID").length;
  const independentSuccesses = coefficient.filter((observation) => observation.validity === "VALID").length;
  const distinctQuestions = new Set(coefficient.map((observation) => observation.questionId)).size;
  const contradictoryStrengthEvidence = independent.filter(
    (observation) =>
      observation.validity === "VALID" &&
      observation.primaryMicroSkillId !== "LIN_REMOVE_COEFFICIENT",
  ).length;
  const independentOpportunities = quotientFailures + independentSuccesses;
  const hasContradiction = independentSuccesses >= 1 || contradictoryStrengthEvidence >= 2;
  const eligible =
    independentOpportunities >= 3 &&
    quotientFailures >= 2 &&
    quotientFailures / independentOpportunities > 0.5 &&
    distinctQuestions >= 2 &&
    hasContradiction;

  const reason = eligible
    ? `Verification eligible at the end-of-flow checkpoint: ${quotientFailures} incorrect quotient calculations across ${independentOpportunities} independent division opportunities in ${distinctQuestions} questions, with ${independentSuccesses} correct division and ${contradictoryStrengthEvidence} other correct algebra steps. This is an inconsistent response pattern; intent is not inferred.`
    : `Normal flow preserved: verification requires at least 3 independent division opportunities, at least 2 quotient failures on more than half of them across 2 questions, and contradictory success evidence. Observed ${independentOpportunities} opportunities, ${quotientFailures} failures, ${distinctQuestions} questions, ${independentSuccesses} correct division, and ${contradictoryStrengthEvidence} other correct algebra steps.`;

  return {
    eligible,
    independentOpportunities,
    quotientFailures,
    independentSuccesses,
    distinctQuestions,
    contradictoryStrengthEvidence,
    reason,
  };
}

/**
 * Retention checks are scheduled against the nearest existing concept as well
 * as the micro-skill, so that if the existing concept-level revision loop ever
 * picks one of these rows up it degrades into a sensible concept revision
 * rather than pointing at a concept id that doesn't exist.
 */
const MICRO_SKILL_TO_CONCEPT: Record<MicroSkillId, string> = {
  FND_SIGN_MUL_DIV: "P2_NEGATIVE_OPS",
  LIN_DISTRIBUTE_NEG: "P2_NEGATIVE_OPS",
  LIN_DISTRIBUTE_POS: "P2_NEGATIVE_OPS",
  LIN_COMBINE_LIKE: "C7_VARIABLE_BOTH_SIDES",
  LIN_REMOVE_CONSTANT: "C5_TWO_STEP_EQUATIONS",
  LIN_REMOVE_COEFFICIENT: "C5_TWO_STEP_EQUATIONS",
  LIN_SOLVE_TWO_STEP: "C5_TWO_STEP_EQUATIONS",
  LIN_SOLVE_VARIABLE_BOTH: "C7_VARIABLE_BOTH_SIDES",
  LIN_CHECK_SOLUTION: "C5_TWO_STEP_EQUATIONS",
  FND_FRACTION_EQUIV: "C8_FRACTIONAL_COEFFICIENTS",
  FND_FRACTION_OPS: "C8_FRACTIONAL_COEFFICIENTS",
  LIN_CLEAR_FRACTIONS: "C8_FRACTIONAL_COEFFICIENTS",
  LIN_SOLVE_FRACTIONS: "C8_FRACTIONAL_COEFFICIENTS",
  ALG_IDENTIFY_STRUCTURE: "ALG_IDENTITIES",
  EXP_EXPAND_BINOMIALS: "ALG_IDENTITIES",
  ID_DIFF_SQUARES: "ALG_IDENTITIES",
  ID_VERIFY_EXPANSION: "ALG_IDENTITIES",
  FAC_READ_ABC_SIGNS: "ALG_FACTORISATION",
  FAC_PAIR_PRODUCT_SUM: "ALG_FACTORISATION",
  FAC_MONIC_TRINOMIAL: "ALG_FACTORISATION",
  FAC_COMPUTE_AC: "ALG_FACTORISATION",
  FAC_SPLIT_MIDDLE: "ALG_FACTORISATION",
  FAC_NONMONIC_GROUP: "ALG_FACTORISATION",
  FAC_VERIFY_EXPAND: "ALG_FACTORISATION",
  QUAD_STANDARD_FORM: "ALG_QUADRATICS",
  QUAD_FACTOR_EXPRESSION: "ALG_QUADRATICS",
  QUAD_ZERO_PRODUCT: "ALG_QUADRATICS",
  QUAD_CREATE_BRANCHES: "ALG_QUADRATICS",
  QUAD_SOLVE_UNIT_FACTOR: "ALG_QUADRATICS",
  QUAD_VERIFY_ROOTS: "ALG_QUADRATICS",
};

const RETENTION_CHECK_TYPE = "MICRO_SKILL_RETENTION_CHECK";
const RETENTION_CHECK_DELAY_DAYS = 2;

// ─── Service ────────────────────────────────────────────────────────────────

interface AttemptRow {
  id: string;
  sessionId: string;
  itemKey: string;
  equationPrompt: string;
  origin: string;
  templateId: string | null;
  stageId: string;
  status: string;
}

interface StepRow {
  id: string;
  attemptId: string;
  stepIndex: number;
  previousLine: string;
  submittedLine: string;
  validity: StepValidity;
  verificationSource: VerificationSource;
  attemptedTransformation: StepTransformation;
  firstInvalidActionCode: string | null;
  firstInvalidActionDescription: string | null;
  primaryMicroSkillId: string | null;
  topicId: string | null;
  competencyFamilyId: string | null;
  contextModifierIds: string[];
  assistanceLevel: AssistanceLevel;
  aiGraderConfidence: number | null;
}

@Injectable()
export class DiagnosticV2SessionService {
  private readonly logger = new Logger(DiagnosticV2SessionService.name);
  /** Process-local authoring latencies for G2.4 budget checks. Newest last. */
  private readonly recentAuthorLatenciesMs: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly selector: DiagnosticV2AiSelectorService,
    private readonly interpreter: DiagnosticV2AiInterpreterService,
    private readonly grader: DiagnosticV2AiGraderService,
    /** Optional so goldens that construct the service with four deps still compile. */
    @Optional() private readonly reports?: DiagnosticV2ReportService,
  ) {}

  async startSession(
    studentId: string,
    track: DiagnosticV2Track = "NEGATIVE_DISTRIBUTION",
  ): Promise<StartDiagnosticV2SessionResponse> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException("Student not found.");

    const firstStage = firstStageForTrack(track);
    const item = requireFixedItem(firstStage);
    const at = new Date().toISOString();
    const openingReason = openingReasonForTrack(track);

    const { session, attempt } = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.diagnosticV2Session.create({
        data: {
          studentId,
          status: "ACTIVE",
          currentStageId: firstStage,
          stageHistory: [
            {
              stageId: firstStage,
              source: "RULE",
              reasoning: openingReason,
              at,
              track,
            },
          ] as unknown as never,
          policyVersion: EVIDENCE_POLICY_MICROSKILL_V1,
        },
      });
      const createdAttempt = await tx.diagnosticV2Attempt.create({
        data: {
          sessionId: createdSession.id,
          itemKey: item.itemKey,
          equationPrompt: item.prompt,
          origin: item.origin,
          templateId: item.templateId,
          stageId: item.stageId,
          status: "IN_PROGRESS",
        },
      });
      return { session: createdSession, attempt: createdAttempt };
    });

    // Phase C: fire-and-forget prefetch for likely early skill/template targets.
    // Never blocks the startSession response.
    this.prefetchInBackground({
      sessionId: session.id,
      templates: likelyPrefetchTemplates({
        currentTemplateId: item.templateId,
        currentSkillId: item.primaryMicroSkillId,
        nextBackboneTemplateId: nextBackboneTemplateId(firstStage, track),
      }),
      alreadyServed: new Set([normalizedQuestionKey(item.openingLine)]),
      serveOrdinal: 1,
    });

    return {
      sessionId: session.id,
      stageId: firstStage,
      ...attemptView(
        attempt.id,
        item,
        demoHintFor(studentId, item.openingLine, track, item.stageId),
      ),
    };
  }

  async submitStep(
    sessionId: string,
    body: SubmitDiagnosticV2StepRequest,
  ): Promise<SubmitDiagnosticV2StepResponse> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Diagnostic session not found.");
    if (session.status !== "ACTIVE") {
      throw new BadRequestException("This diagnostic session has already ended.");
    }

    const attempt = (await this.prisma.diagnosticV2Attempt.findUnique({
      where: { id: body.attemptId },
    })) as AttemptRow | null;
    if (!attempt || attempt.sessionId !== sessionId) {
      throw new NotFoundException("Attempt not found in this session.");
    }
    if (attempt.status !== "IN_PROGRESS") {
      throw new BadRequestException("This question is already finished.");
    }

    const item = itemForAttempt(attempt);
    const priorSteps = (await this.prisma.diagnosticV2Step.findMany({
      where: { attemptId: attempt.id },
      orderBy: { stepIndex: "asc" },
    })) as StepRow[];

    // The line being built on is derived here, never taken on trust from the
    // client — otherwise a caller could grade an easy step against a line the
    // student never actually reached.
    const expectedPreviousLine = lastAcceptedLine(item, priorSteps);
    if (normalizeWhitespace(body.previousLine) !== normalizeWhitespace(expectedPreviousLine)) {
      throw new BadRequestException(
        `previousLine does not match this attempt's current line ("${expectedPreviousLine}").`,
      );
    }
    // "I don't know" is an action on the item, not a line of working. It is
    // never parsed, never graded, and never counted as getting the maths wrong.
    const declined = body.dontKnow === true;
    const submittedLine = normalizeSubmittedMathLine(body.submittedLine);
    if (!declined && !submittedLine) {
      throw new BadRequestException("submittedLine is required unless dontKnow is set.");
    }

    const track = trackFromStageHistory(session.stageHistory);
    const grammarTrack = effectiveVerifierTrack(track, item.stageId);

    // 1. Deterministic verification — ground truth. Skipped entirely for a
    //    decline: there is no line to verify. Track/stage picks the verifier.
    const verification = declined
      ? null
      : verifyDiagnosticV2Step(
          expectedPreviousLine,
          submittedLine,
          track,
          item.stageId,
        );
    let validity: StepValidity | null = verification?.validity ?? null;
    let verificationSource: VerificationSource = "DETERMINISTIC";
    let aiGraderConfidence: number | null = null;
    let graderReasoning: string | undefined;

    // 1b. Bare final answer — `5` rather than `x = 5`. The rules abstain
    //     because it isn't an equation, but deciding it is pure arithmetic:
    //     solve the previous line and compare. Handled here so it never
    //     reaches the AI grader, whose VALID/INVALID contract cannot express
    //     "right answer, no working shown" and which used to call it INVALID.
    let finalAnswerOnly = false;
    if (verification && (validity === "PARSE_FAILED" || validity === "AMBIGUOUS")) {
      const bare = checkBareFinalAnswerForTrack(expectedPreviousLine, submittedLine, track);
      if (bare.isBareAnswer && bare.matchesSolution !== undefined) {
        validity = bare.matchesSolution ? "VALID" : "INVALID";
        verificationSource = "DETERMINISTIC";
        finalAnswerOnly = true;
        graderReasoning = bare.matchesSolution
          ? `answered ${submittedLine} without showing the working; the line above solves to ${bare.solution}`
          : `answered ${submittedLine}, but the line above solves to ${bare.solution}`;
      }
    }

    // 2. AI grader — only when the rules abstained on a line that exists, and
    //    it may still abstain. A decline never reaches it, and neither does a
    //    bare answer resolved above.
    if (verification && (validity === "PARSE_FAILED" || validity === "AMBIGUOUS")) {
      const outcome = await this.grader.grade({
        studentId: session.studentId,
        sessionId,
        previousLine: expectedPreviousLine,
        submittedLine,
        parseError: verification.parseError,
      });
      if (outcome.validity) {
        validity = outcome.validity;
        verificationSource = "AI_FALLBACK";
        aiGraderConfidence = outcome.confidence ?? null;
        graderReasoning = outcome.reasoning;
      }
    }

    // 3. Assistance context for this line, derived from what came before it.
    //    A previous decline has already handed over a rule, so everything after
    //    it in the same item is assisted work, not independent work.
    const priorDeclineCount = await this.declineCount(attempt.id);
    const lastStep = priorSteps[priorSteps.length - 1];
    const retriedAfterInvalid =
      !!lastStep &&
      lastStep.validity === "INVALID" &&
      normalizeWhitespace(lastStep.previousLine) === normalizeWhitespace(expectedPreviousLine);
    const assistanceLevel: AssistanceLevel = assistanceInForce({
      priorDeclineCount,
      retriedAfterInvalid,
    });
    const selfCorrectionOfStepId = retriedAfterInvalid && !declined ? lastStep!.id : null;

    // A decline is evidence about the item's own target skill — the student is
    // telling us about the thing the item was chosen to probe, not about
    // whichever operation the next line would have performed.
    const attribution = declined
      ? { primary: item.primaryMicroSkillId, supporting: [...item.supportingMicroSkillIds] }
      : attributeMicroSkill({
          previousLine: expectedPreviousLine,
          submittedLine,
          transformation: verification!.transformation,
          firstInvalidActionCode: verification!.firstInvalidActionCode,
          item,
        });
    const contextModifierIds = contextModifiersForStep({
      assistanceLevel,
      isTransferCheck: item.isTransferCheck,
      finalAnswerOnly,
      hasFractions:
        grammarTrack === "FRACTION_LINEAR" ||
        lineHasFractionSyntax(item.openingLine) ||
        lineHasFractionSyntax(expectedPreviousLine),
    });
    const layers = layersForMicroSkill(attribution.primary);
    const verifierVersion =
      grammarTrack === "FRACTION_LINEAR"
        ? STEP_VERIFICATION_RULES_FRACTION_V1
        : grammarTrack === "IDENTITY_DIFF_SQUARES"
          ? STEP_VERIFICATION_RULES_IDENTITY_V1
          : grammarTrack === "FACTOR_MONIC_TRINOMIAL"
            ? STEP_VERIFICATION_RULES_FACTOR_V1
            : grammarTrack === "QUAD_ZERO_PRODUCT"
              ? STEP_VERIFICATION_RULES_QUADRATIC_V1
              : STEP_VERIFICATION_RULES_V1;

    // 4. Evidence. Unresolved lines produce none at all — an unreadable line is
    //    explicitly not a wrong line. A decline produces SKIPPED, which is a
    //    real, citable observation carrying zero weight: it moves no success or
    //    failure counter, so it can never push a skill toward LIKELY_GAP.
    const isTranscriptionSlip = verification?.firstInvalidActionCode === "COPIED_UNCHANGED_SIDE";
    const evidenceKind: MicroSkillEvidenceKind | null = isTranscriptionSlip
      ? null
      : declined
        ? "SKIPPED"
        : evidenceKindForStep({
          validity: validity!,
          assistanceLevel,
          isSelfCorrection: retriedAfterInvalid && validity === "VALID",
          isTransferCheck: item.isTransferCheck,
          });

    const stepEvidence = evidenceKind
      ? await this.buildEvidencePlan({
          studentId: session.studentId,
          microSkillId: attribution.primary,
          kind: evidenceKind,
          verificationSource,
          assistanceLevel,
          contextModifierIds,
        })
      : null;

    // 5. Item completion.
    const isTargetSkillFailure =
      !isTranscriptionSlip && validity === "INVALID" && attribution.primary === item.primaryMicroSkillId;
    const priorInvalidCount = priorSteps.filter((s) => s.validity === "INVALID").length;
    const solved = validity === "VALID" && reachedEndState(item, submittedLine);

    let assistanceOffered: AssistanceLevel | undefined;
    let itemComplete = false;
    let attemptStatus = attempt.status;

    if (declined) {
      // Same two-rung ladder as a wrong line: hand over the rule and let them
      // try it, then explain it properly and move on rather than sitting on a
      // question the student has twice said they cannot start.
      if (priorDeclineCount === 0) {
        assistanceOffered = "RULE_PROMPT";
      } else {
        assistanceOffered = "FULL_EXPLANATION";
        itemComplete = true;
        attemptStatus = "DECLINED";
      }
    } else if (solved) {
      itemComplete = true;
      attemptStatus = "SOLVED";
    } else if (isTargetSkillFailure) {
      // The item's diagnostic purpose is met the moment the target skill fails.
      // Grinding on a confirmed error is not what this diagnostic does — the
      // response is the contrast probe, then teaching.
      itemComplete = true;
      attemptStatus = "TARGET_ERROR_OBSERVED";
    } else if (validity === "INVALID") {
      if (priorInvalidCount === 0) {
        assistanceOffered = "REVIEW_OPPORTUNITY";
      } else {
        assistanceOffered = "FULL_EXPLANATION";
        itemComplete = true;
        attemptStatus = "EXPLAINED";
      }
    }

    // Completing an item cleanly is evidence for the item's headline skill,
    // but only when no line in the attempt already evidenced it (otherwise the
    // transfer item would count the same success twice).
    const alreadyEvidencedPrimary =
      attribution.primary === item.primaryMicroSkillId ||
      priorSteps.some((s) => s.primaryMicroSkillId === item.primaryMicroSkillId);
    const completionEvidence =
      itemComplete && attemptStatus === "SOLVED" && priorInvalidCount === 0 && !alreadyEvidencedPrimary
        ? await this.buildEvidencePlan({
            studentId: session.studentId,
            microSkillId: item.primaryMicroSkillId,
            kind: item.isTransferCheck ? "TRANSFER_SUCCESS" : "INDEPENDENT_CORRECT",
            verificationSource: "DETERMINISTIC",
            assistanceLevel: "NONE",
            contextModifierIds,
            // The step-level plan above may already have moved this skill's
            // counters within this same submit, so chain off it when they collide.
            chainFrom: stepEvidence,
          })
        : null;

    // 6. AI interpreter — prose about the evidence, never into it.
    const sessionCountsAfter = stepEvidence
      ? applyEvidenceToCounts(
          await this.sessionCountsForMicroSkill(sessionId, stepEvidence.microSkillId),
          stepEvidence.kind,
        )
      : null;
    const sessionSkillEvidence = stepEvidence
      ? await Promise.all((await this.prisma.microSkillStateV2.findMany({
          where: { studentId: session.studentId, evidenceCount: { gt: 0 } },
          orderBy: { lastEvidenceAt: "asc" },
        })).map(async (state) => {
          const counts = state.microSkillId === stepEvidence.microSkillId
            ? sessionCountsAfter!
            : await this.sessionCountsForMicroSkill(sessionId, state.microSkillId);
          return {
            microSkillId: state.microSkillId,
            microSkillName: childFacingSkillName(state.microSkillId),
            independentSuccessCount: counts.independentSuccessCount,
            independentFailureCount: counts.independentFailureCount,
            assistedSuccessCount: counts.assistedSuccessCount,
          };
        }))
      : [];
    // Every scored step gets an interpretation. Previously this was limited
    // to errors/pattern changes, which left correct questions blank in the
    // question-by-question learning picture and left reliable skills without
    // an AI explanation in micro-skill management.
    const interpretation =
      stepEvidence
        ? await this.interpreter.interpret({
            studentId: session.studentId,
            sessionId,
            microSkillId: stepEvidence.microSkillId,
            microSkillName: childFacingSkillName(stepEvidence.microSkillId),
            counts: stepEvidence.update.counts,
            sessionCounts: sessionCountsAfter!,
            lifetimeCounts: stepEvidence.update.counts,
            observedContextStrengths: stepEvidence.update.observedContextStrengths,
            observedContextGaps: stepEvidence.update.observedContextGaps,
            firstInvalidActionDescription: verification?.firstInvalidActionDescription,
            questionPrompt: item.prompt,
            previousLine: expectedPreviousLine,
            submittedLine,
            sessionSkillEvidence,
          })
        : null;

    // 7. Route. Only computed once the item is done.
    const completedStage = stageForItem(item);

    let nextStageIds: DiagnosticV2StageId[] = [];
    let nextItem: DiagnosticV2Item | null = null;
    let selectorSource: "RULE" | "AI" = "RULE";
    let selectorReasoning: string | undefined;
    let selectionProvenance: DiagnosticV2SelectionProvenance | undefined;
    let selectorHanded: StageHistoryEntry["selectorHanded"];

    if (itemComplete) {
      let coefficientVerificationGate: CoefficientVerificationGate | undefined;
      // The optional check is considered only after the final planned topic,
      // never mid-question or between ordinary questions.
      if (track === "COMBINED_ALGEBRA" && completedStage === "TRANSFER_FRAC_CLEAR") {
        const sessionAttempts = await this.prisma.diagnosticV2Attempt.findMany({
          where: { sessionId },
          select: { id: true },
        });
        const recordedSteps = await this.prisma.diagnosticV2Step.findMany({
          where: { attemptId: { in: sessionAttempts.map((candidate) => candidate.id) } },
          select: {
            attemptId: true,
            primaryMicroSkillId: true,
            attemptedTransformation: true,
            validity: true,
            assistanceLevel: true,
          },
        });
        coefficientVerificationGate = assessCoefficientVerificationGate([
          ...recordedSteps.map((recorded) => ({
            questionId: recorded.attemptId,
            primaryMicroSkillId: recorded.primaryMicroSkillId,
            attemptedTransformation: recorded.attemptedTransformation,
            validity: recorded.validity,
            assistanceLevel: recorded.assistanceLevel,
          })),
          ...(verification
            ? [{
                questionId: attempt.id,
                primaryMicroSkillId: attribution.primary,
                attemptedTransformation: verification.transformation,
                validity: validity!,
                assistanceLevel,
              }]
            : []),
        ]);
      }
      // Pattern confirmation is about the item's headline skill (negative
      // distribution on the Phase A track, clear-fractions on B1) — not a
      // hardcoded id, or a later topic's contrast stage can never trigger teaching.
      const patternConfirmed = await this.hasConfirmedGap(
        session.studentId,
        item.primaryMicroSkillId,
        stepEvidence,
      );
      nextStageIds = nextStagesAfter(completedStage, {
        targetSkillFailed: isTargetSkillFailure,
        patternConfirmed,
        track,
      });
      if (coefficientVerificationGate?.eligible) {
        nextStageIds = ["COEFFICIENT_VERIFICATION"];
      }
      if (nextStageIds.includes("RULE_PROMPT")) {
        assistanceOffered = "RULE_PROMPT";
      }
      const nextItemStage = nextStageIds.find((s) => s !== "RULE_PROMPT" && s !== "COMPLETE");
      if (nextItemStage) {
        const routeReason = describeRouteReason({
          completedStageId: completedStage,
          ruleStageId: nextItemStage,
          targetSkillFailed: isTargetSkillFailure,
          patternConfirmed,
        });
        const selected = await this.selectNextItem({
          session: { id: sessionId, studentId: session.studentId },
          ruleStage: nextItemStage,
          track,
          lastStepSummary: summarizeStep(
            validity,
            verification?.firstInvalidActionDescription,
            attribution.primary,
            expectedPreviousLine,
            submittedLine,
          ),
          routeReason,
          verificationGate: coefficientVerificationGate,
        });
        nextItem = selected.item;
        selectorSource = selected.source;
        selectorReasoning = selected.reasoning;
        selectionProvenance = selected.selection;
        selectorHanded = selected.handedToAi;
        // The AI may serve a different (or freshly generated/authored) item;
        // the stage it occupies always comes from that item's stated stageId.
        nextStageIds = nextStageIds.map((s) =>
          s === nextItemStage ? stageForItem(selected.item) : s,
        );
        // Phase C: after consuming a buffered item, refill that skill/template slot
        // without blocking the submit response (same F&F shape as mid-item refill).
        if (selected.consumedBufferTemplateId) {
          const consumedTemplate = selected.consumedBufferTemplateId;
          const consumedOpening = normalizedQuestionKey(selected.item.openingLine);
          void Promise.all([
            this.servedOpeningKeys(sessionId),
            this.prisma.diagnosticV2Attempt.count({ where: { sessionId } }),
          ])
            .then(([served, attemptCount]) => {
              served.add(consumedOpening);
              this.prefetchInBackground({
                sessionId,
                templates: [consumedTemplate],
                alreadyServed: served,
                serveOrdinal: attemptCount + 1,
              });
            })
            .catch((err) => {
              this.logger.warn(
                `diagnostic_v2 buffer post-consume refill schedule failed for ${sessionId}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            });
        }
      }
    }

    const sessionComplete = itemComplete && !nextItem;
    const now = new Date();
    const at = now.toISOString();
    const appendedHistory: StageHistoryEntry[] = nextStageIds.map((stageId) => ({
      stageId,
      source: stageId === "RULE_PROMPT" || stageId === "COMPLETE" ? "RULE" : selectorSource,
      ...(stageId === "RULE_PROMPT"
        ? { reasoning: rulePromptReasoningForStage(completedStage) }
        : stageId === "COMPLETE"
          ? {
              reasoning:
                track === "COMBINED_ALGEBRA"
                  ? "The first two topic backbones in the combined algebra diagnostic are complete."
                  : "All planned items complete.",
            }
          : selectorReasoning
            ? { reasoning: selectorReasoning }
            : {}),
      at,
      ...(selectionProvenance && stageId !== "RULE_PROMPT" && stageId !== "COMPLETE"
        ? { selection: selectionProvenance, selectorHanded }
        : {}),
    }));

    const currentStageId = appendedHistory.length > 0
      ? appendedHistory[appendedHistory.length - 1]!.stageId
      : session.currentStageId;

    const retentionTargets = sessionComplete
      ? await this.retentionTargets(session.studentId, [stepEvidence, completionEvidence])
      : [];

    // ─── One transaction for every durable effect of this submission ────────
    const written = await this.prisma.$transaction(async (tx) => {
      // No step row for a decline: DiagnosticV2Step stores submitted lines, and
      // there is no honest StepValidityV2 value for work that was never done.
      // MicroSkillEvidenceEventV2.stepId is nullable for exactly this case.
      const step = verification
        ? await tx.diagnosticV2Step.create({
            data: {
              attemptId: attempt.id,
              stepIndex: priorSteps.length,
              previousLine: expectedPreviousLine,
              submittedLine,
              normalizedPreviousLine: verification.normalizedPreviousLine ?? null,
              normalizedSubmittedLine: verification.normalizedSubmittedLine ?? null,
              attemptedTransformation: verification.transformation,
              validity: validity!,
              verificationSource,
              aiGraderConfidence,
              firstInvalidActionCode: verification.firstInvalidActionCode ?? null,
              firstInvalidActionDescription:
                verification.firstInvalidActionDescription ?? graderReasoning ?? null,
              primaryMicroSkillId: attribution.primary,
              supportingMicroSkillIds: attribution.supporting,
              topicId: layers.topicId,
              competencyFamilyId: layers.competencyFamilyId,
              contextModifierIds,
              assistanceLevel,
              selfCorrectionOfStepId,
              verifierVersion,
            },
          })
        : null;

      for (const plan of [stepEvidence, completionEvidence]) {
        if (!plan) continue;
        await tx.microSkillEvidenceEventV2.create({
          data: {
            studentId: session.studentId,
            sessionId,
            attemptId: attempt.id,
            stepId: step?.id ?? null,
            microSkillId: plan.microSkillId,
            topicId: plan.layers.topicId,
            competencyFamilyId: plan.layers.competencyFamilyId,
            contextModifierIds: plan.contextModifierIds,
            evidenceKind: plan.kind,
            weight: plan.weight,
            assistanceLevel: plan.assistanceLevel,
            evidencePolicyVersion: EVIDENCE_POLICY_MICROSKILL_V1,
          },
        });
        await tx.microSkillStateV2.upsert({
          where: {
            studentId_microSkillId: { studentId: session.studentId, microSkillId: plan.microSkillId },
          },
          create: {
            studentId: session.studentId,
            microSkillId: plan.microSkillId,
            status: plan.update.status,
            evidenceCount: plan.update.counts.evidenceCount,
            independentSuccessCount: plan.update.counts.independentSuccessCount,
            independentFailureCount: plan.update.counts.independentFailureCount,
            assistedSuccessCount: plan.update.counts.assistedSuccessCount,
            observedContextStrengths: plan.update.observedContextStrengths,
            observedContextGaps: plan.update.observedContextGaps,
            lastEvidenceAt: now,
            policyVersion: EVIDENCE_POLICY_MICROSKILL_V1,
          },
          update: {
            status: plan.update.status,
            evidenceCount: plan.update.counts.evidenceCount,
            independentSuccessCount: plan.update.counts.independentSuccessCount,
            independentFailureCount: plan.update.counts.independentFailureCount,
            assistedSuccessCount: plan.update.counts.assistedSuccessCount,
            observedContextStrengths: plan.update.observedContextStrengths,
            observedContextGaps: plan.update.observedContextGaps,
            lastEvidenceAt: now,
            stateVersion: { increment: 1 },
            policyVersion: EVIDENCE_POLICY_MICROSKILL_V1,
          },
        });
      }

      if (interpretation && stepEvidence) {
        await tx.diagnosticV2Hypothesis.create({
          data: {
            sessionId,
            microSkillId: interpretation.microSkillId,
            attemptId: attempt.id,
            stepId: step?.id ?? null,
            hypothesisLabel: interpretation.hypothesisLabel,
            confidence: interpretation.confidence,
            reasoning: interpretation.reasoning,
            source: interpretation.source as HypothesisSource,
            childFacingSummary: interpretation.childFacingSummary,
          },
        });
      }

      if (itemComplete) {
        await tx.diagnosticV2Attempt.update({
          where: { id: attempt.id },
          data: { status: attemptStatus, completedAt: now },
        });
      }

      let nextAttemptId: string | null = null;
      if (nextItem) {
        const created = await tx.diagnosticV2Attempt.create({
          data: {
            sessionId,
            itemKey: nextItem.itemKey,
            equationPrompt: nextItem.prompt,
            origin: nextItem.origin,
            templateId: nextItem.templateId,
            stageId: nextItem.stageId,
            status: "IN_PROGRESS",
          },
        });
        nextAttemptId = created.id;
      }

      if (appendedHistory.length > 0 || sessionComplete) {
        await tx.diagnosticV2Session.update({
          where: { id: sessionId },
          data: {
            currentStageId,
            stageHistory: [
              ...readStageHistory(session.stageHistory),
              ...appendedHistory,
            ] as unknown as never,
            ...(sessionComplete ? { status: "COMPLETED" as const, endedAt: now } : {}),
          },
        });
      }

      // Schedule only — Phase A never runs the delayed check.
      for (const microSkillId of retentionTargets) {
        const conceptId = MICRO_SKILL_TO_CONCEPT[microSkillId];
        const dedupeKey = `${RETENTION_CHECK_TYPE}:${conceptId}:${microSkillId}`;
        const dueAt = new Date(now.getTime() + RETENTION_CHECK_DELAY_DAYS * 24 * 60 * 60 * 1000);
        await tx.revisionQueueItem.upsert({
          where: { studentId_dedupeKey: { studentId: session.studentId, dedupeKey } },
          create: {
            studentId: session.studentId,
            conceptId,
            microSkillId,
            type: RETENTION_CHECK_TYPE,
            priority: 0.8,
            dueAt,
            questionCount: 2,
            status: "PENDING",
            reasoning: `Micro-skill step diagnostic saw a repeated error on ${microSkillId}; re-check that it stuck.`,
            confidence: 0.7,
            recommendationVersion: EVIDENCE_POLICY_MICROSKILL_V1,
            dedupeKey,
          },
          update: { dueAt, priority: 0.8, status: "PENDING" },
        });
      }

      return { step, nextAttemptId };
    });

    const assistanceMessage = assistanceOffered
      ? assistanceTextFor({
          level: assistanceOffered,
          microSkillId: attribution.primary,
          line: expectedPreviousLine,
        })
      : undefined;

    // Phase C: on a mid-item step (student still working), refill likely next targets.
    if (!itemComplete) {
      void this.servedOpeningKeys(sessionId)
        .then((served) => {
          this.prefetchInBackground({
            sessionId,
            templates: likelyPrefetchTemplates({
              currentTemplateId: item.templateId,
              currentSkillId: item.primaryMicroSkillId,
              nextBackboneTemplateId: nextBackboneTemplateId(stageForItem(item)),
            }),
            alreadyServed: served,
            serveOrdinal: Math.max(1, priorSteps.length + 1),
          });
        })
        .catch((err) => {
          this.logger.warn(
            `diagnostic_v2 buffer mid-item prefetch schedule failed for ${sessionId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }

    // Phase D.v2: polish + persist student/parent reports off the hot path.
    if (sessionComplete) {
      this.reports?.ensureSessionReportsInBackground(sessionId);
    }

    const shared = {
      ...(assistanceOffered ? { assistanceOffered } : {}),
      ...(assistanceMessage ? { assistanceMessage } : {}),
      itemComplete,
      sessionStatus: (sessionComplete ? "COMPLETED" : "ACTIVE") as DiagnosticV2SessionStatus,
      ...(itemComplete
        ? {
            selectorDecision: {
              source: selectorSource,
              ...(selectorReasoning ? { reasoning: selectorReasoning } : {}),
            },
          }
        : {}),
      ...(nextItem && written.nextAttemptId
        ? {
            nextAttempt: attemptView(
              written.nextAttemptId,
              nextItem,
              demoHintFor(session.studentId, nextItem.openingLine, track, nextItem.stageId),
            ),
          }
        : {}),
      // Staying on this item: hint against the line the student's next step
      // will be compared to — their own line when it was accepted, otherwise
      // the one they are still working from.
      ...(itemComplete
        ? {}
        : (() => {
            const nextPreviousLine =
              validity === "VALID" ? submittedLine : expectedPreviousLine;
            const hint = demoHintFor(
              session.studentId,
              nextPreviousLine,
              track,
              item.stageId,
            );
            return hint ? { demoNextLineHint: hint } : {};
          })()),
    };

    if (!verification || !written.step) {
      return { outcome: "DECLINED", microSkillId: attribution.primary, ...shared };
    }

    return {
      outcome: "SUBMITTED",
      stepId: written.step.id,
      stepIndex: written.step.stepIndex,
      validity: validity!,
      verificationSource,
      attemptedTransformation: verification.transformation,
      ...(verification.firstInvalidActionCode
        ? { firstInvalidActionCode: verification.firstInvalidActionCode }
        : {}),
      ...(verification.firstInvalidActionDescription
        ? { firstInvalidActionDescription: verification.firstInvalidActionDescription }
        : graderReasoning
          ? { firstInvalidActionDescription: graderReasoning }
          : {}),
      ...shared,
    };
  }

  async getDebugView(sessionId: string): Promise<DiagnosticV2DebugView> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Diagnostic session not found.");

    const attempts = await this.prisma.diagnosticV2Attempt.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    const steps = (await this.prisma.diagnosticV2Step.findMany({
      where: { attemptId: { in: attempts.map((a) => a.id) } },
      orderBy: [{ attemptId: "asc" }, { stepIndex: "asc" }],
    })) as StepRow[];
    const hypotheses = await this.prisma.diagnosticV2Hypothesis.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    const states = await this.prisma.microSkillStateV2.findMany({
      where: { studentId: session.studentId },
      orderBy: { microSkillId: "asc" },
    });
    const selectorAudits = this.prisma.aiDecisionAuditLog?.findMany
      ? await this.prisma.aiDecisionAuditLog.findMany({
          where: { sessionId, capability: "DIAGNOSTIC_V2_SELECTOR" },
          orderBy: { createdAt: "asc" },
          select: { failureReason: true, latencyMs: true, passed: true, served: true, rejectedOutput: true },
        })
      : [];

    const track = trackFromStageHistory(session.stageHistory);
    const stageHistory = readStageHistory(session.stageHistory);
    const attemptStageById = new Map(attempts.map((a) => [a.id, a.stageId]));

    const lastStepIndexByAttempt = new Map<string, number>();
    for (const s of steps) {
      lastStepIndexByAttempt.set(s.attemptId, s.stepIndex);
    }

    const selectionHandedEntries = stageHistory.filter((h) => h.selectorHanded);
    const handedToAiByAttempt = new Map<string, StageHistoryEntry["selectorHanded"]>();
    for (let i = 0; i < selectionHandedEntries.length && i < attempts.length; i++) {
      handedToAiByAttempt.set(attempts[i]!.id, selectionHandedEntries[i]!.selectorHanded);
    }

    const selections = stageHistory
      .filter((h): h is StageHistoryEntry & { selection: DiagnosticV2SelectionProvenance } =>
        !!h.selection,
      )
      .map((h, index) => {
        if (h.selection.aiDecision || h.selection.aiFallback) return h.selection;
        const audit = selectorAudits[index];
        return {
          ...h.selection,
          aiFallback: {
            reason: audit?.failureReason
              ? audit.failureReason
              : audit?.passed && !audit.served
                ? "AI response passed validation but serving is disabled (shadow mode)."
                : "No AI selector call was recorded; generation may have been disabled.",
            latencyMs: audit?.latencyMs ?? null,
            ...extractRejectedSelectorDetails(audit?.failureReason, audit?.rejectedOutput),
          },
        };
      });

    const sessionCountsBySkill = new Map<string, MicroSkillCounts>();
    for (const st of states) {
      sessionCountsBySkill.set(
        st.microSkillId,
        await this.sessionCountsForMicroSkill(sessionId, st.microSkillId),
      );
    }

    // A decline has no step row, so it would otherwise be an invisible gap
    // between two steps — and an unexplained jump in assistance level.
    const itemKeyByAttempt = new Map(attempts.map((a) => [a.id, a.itemKey]));
    const declines = (
      await this.prisma.microSkillEvidenceEventV2.findMany({
        where: { sessionId, evidenceKind: "SKIPPED" },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => ({
      itemKey: itemKeyByAttempt.get(e.attemptId) ?? e.attemptId,
      microSkillId: e.microSkillId,
      assistanceLevel: e.assistanceLevel as AssistanceLevel,
      at: e.createdAt.toISOString(),
    }));

    return {
      sessionId,
      status: session.status as DiagnosticV2SessionStatus,
      currentStageId: session.currentStageId,
      stageHistory: stageHistory.map(({ stageId, source, reasoning, at }) => ({
        stageId,
        source,
        ...(reasoning ? { reasoning } : {}),
        at,
      })),
      items: (attempts as AttemptRow[]).map((a) => {
        const item = itemForAttempt(a);
        return {
          itemKey: a.itemKey,
          equationPrompt: a.equationPrompt,
          origin: item.origin,
          templateId: item.templateId,
          primaryMicroSkillId: item.primaryMicroSkillId,
          status: a.status,
        };
      }),
      declines,
      steps: steps.map((s) => {
        const stageId = attemptStageById.get(s.attemptId) ?? "";
        const isLastStepOfAttempt = s.stepIndex === lastStepIndexByAttempt.get(s.attemptId);
        const handedToAi =
          isLastStepOfAttempt && handedToAiByAttempt.has(s.attemptId)
            ? (handedToAiByAttempt.get(s.attemptId) ?? null)
            : null;
        return {
          id: s.id,
          attemptId: s.attemptId,
          stepIndex: s.stepIndex,
          previousLine: s.previousLine,
          submittedLine: s.submittedLine,
          validity: s.validity,
          verificationSource: s.verificationSource,
          attemptedTransformation: s.attemptedTransformation,
          ...(s.firstInvalidActionCode
            ? { firstInvalidActionCode: s.firstInvalidActionCode }
            : {}),
          ...(s.firstInvalidActionDescription
            ? { firstInvalidActionDescription: s.firstInvalidActionDescription }
            : {}),
          ...(s.primaryMicroSkillId ? { primaryMicroSkillId: s.primaryMicroSkillId } : {}),
          ...(s.topicId ? { topicId: s.topicId } : {}),
          ...(s.competencyFamilyId ? { competencyFamilyId: s.competencyFamilyId } : {}),
          contextModifierIds: s.contextModifierIds,
          assistanceLevel: s.assistanceLevel,
          provenance: buildStepProvenance({
            previousLine: s.previousLine,
            submittedLine: s.submittedLine,
            track,
            stageId,
            storedValidity: s.validity,
            verificationSource: s.verificationSource,
            aiGraderConfidence: s.aiGraderConfidence,
            storedFirstInvalidActionCode: s.firstInvalidActionCode,
            storedFirstInvalidActionDescription: s.firstInvalidActionDescription,
            handedToAi,
          }),
        };
      }),
      hypotheses: hypotheses.map((h) => {
        const sessionCounts = sessionCountsBySkill.get(h.microSkillId) ?? EMPTY_COUNTS;
        const lifetimeState = states.find((st) => st.microSkillId === h.microSkillId);
        return {
          ...(h.attemptId ? { attemptId: h.attemptId } : {}),
          ...(h.stepId ? { stepId: h.stepId } : {}),
          microSkillId: h.microSkillId,
          hypothesisLabel: h.hypothesisLabel,
          confidence: h.confidence,
          reasoning: h.reasoning,
          source: h.source as HypothesisSource,
          ...(h.childFacingSummary ? { childFacingSummary: h.childFacingSummary } : {}),
          sessionIndependentFailureCount: sessionCounts.independentFailureCount,
          ...(lifetimeState &&
          lifetimeState.independentFailureCount !== sessionCounts.independentFailureCount
            ? { lifetimeIndependentFailureCount: lifetimeState.independentFailureCount }
            : {}),
        };
      }),
      microSkillStates: states.map((st) => {
        const sessionCounts = sessionCountsBySkill.get(st.microSkillId) ?? EMPTY_COUNTS;
        return {
          microSkillId: st.microSkillId,
          status: st.status as MicroSkillStatus,
          evidenceCount: st.evidenceCount,
          independentSuccessCount: st.independentSuccessCount,
          independentFailureCount: st.independentFailureCount,
          assistedSuccessCount: st.assistedSuccessCount,
          observedContextStrengths: st.observedContextStrengths,
          observedContextGaps: st.observedContextGaps,
          sessionEvidenceCount: sessionCounts.evidenceCount,
          sessionIndependentSuccessCount: sessionCounts.independentSuccessCount,
          sessionIndependentFailureCount: sessionCounts.independentFailureCount,
          sessionAssistedSuccessCount: sessionCounts.assistedSuccessCount,
        };
      }),
      ...(selections.length > 0 ? { selections } : {}),
    };
  }

  async getSummary(sessionId: string): Promise<DiagnosticV2SummaryResponse> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Diagnostic session not found.");

    if (this.reports) {
      const summaries = await this.reports.getOrBuildSummaries(sessionId);
      const data = summaries.structuredData;
      return {
        sessionId,
        status: session.status as DiagnosticV2SessionStatus,
        childFacingSummary: summaries.childFacingSummary,
        parentFacingSummary: summaries.parentFacingSummary,
        overview: {
          itemsAttempted: data.itemsAttempted,
          itemsCompleted: data.itemsCompleted,
          solidSkillNames: data.solidSkillNames,
          gapSkillNames: data.gapSkillNames,
          skills: data.skills.map((s) => ({
            microSkillId: s.microSkillId,
            childFacingName: s.childFacingName,
            status: s.status as MicroSkillStatus,
            note: s.childFacingSummary ?? null,
          })),
        },
      };
    }

    const [states, hypotheses, attempts, sessionSteps] = await Promise.all([
      this.prisma.microSkillStateV2.findMany({
        where: { studentId: session.studentId },
        orderBy: { microSkillId: "asc" },
      }),
      this.prisma.diagnosticV2Hypothesis.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.diagnosticV2Attempt.findMany({
        where: { sessionId },
        select: { status: true },
      }),
      this.prisma.diagnosticV2Step.findMany({
        where: { attempt: { sessionId } },
        select: { primaryMicroSkillId: true },
      }),
    ]);

    const sessionSkillIds = new Set<string>();
    for (const h of hypotheses) sessionSkillIds.add(h.microSkillId);
    for (const step of sessionSteps) {
      if (step.primaryMicroSkillId) sessionSkillIds.add(step.primaryMicroSkillId);
    }
    const touched = states.filter((s) => sessionSkillIds.has(s.microSkillId));

    const stateViews = touched.map((s) => ({
      microSkillId: s.microSkillId,
      status: s.status as MicroSkillStatus,
    }));
    const hypViews = hypotheses.map((h) => ({
      microSkillId: h.microSkillId,
      childFacingSummary: h.childFacingSummary,
    }));

    return {
      sessionId,
      status: session.status as DiagnosticV2SessionStatus,
      childFacingSummary: buildChildFacingSummary(stateViews, hypViews),
      overview: buildSummaryOverview({
        itemsAttempted: attempts.length,
        itemsCompleted: attempts.filter((a) => a.status === "COMPLETED").length,
        states: stateViews,
        hypotheses: hypViews,
      }),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Reads the skill's current counters and folds one new piece of evidence
   * into them. Deliberately computed before the transaction opens so no model
   * call or read amplification happens while a write lock is held.
   */
  private async buildEvidencePlan(input: {
    studentId: string;
    microSkillId: MicroSkillId;
    kind: MicroSkillEvidenceKind;
    verificationSource: VerificationSource;
    assistanceLevel: AssistanceLevel;
    contextModifierIds: ContextModifierId[];
    chainFrom?: EvidencePlan | null;
  }): Promise<EvidencePlan> {
    const chained =
      input.chainFrom && input.chainFrom.microSkillId === input.microSkillId ? input.chainFrom : null;
    const existing = chained
      ? null
      : await this.prisma.microSkillStateV2.findUnique({
          where: {
            studentId_microSkillId: { studentId: input.studentId, microSkillId: input.microSkillId },
          },
        });

    const previousCounts: MicroSkillCounts = chained
      ? chained.update.counts
      : {
          evidenceCount: existing?.evidenceCount ?? 0,
          independentSuccessCount: existing?.independentSuccessCount ?? 0,
          independentFailureCount: existing?.independentFailureCount ?? 0,
          assistedSuccessCount: existing?.assistedSuccessCount ?? 0,
        };

    const update = computeMicroSkillStateUpdate({
      previousCounts,
      previousStrengths: chained
        ? chained.update.observedContextStrengths
        : (existing?.observedContextStrengths ?? []),
      previousGaps: chained ? chained.update.observedContextGaps : (existing?.observedContextGaps ?? []),
      kind: input.kind,
      contextModifierIds: input.contextModifierIds,
    });

    return {
      microSkillId: input.microSkillId,
      kind: input.kind,
      weight: evidenceWeight(input.kind, input.verificationSource, input.contextModifierIds),
      assistanceLevel: input.assistanceLevel,
      contextModifierIds: input.contextModifierIds,
      layers: layersForMicroSkill(input.microSkillId),
      previousStatus: chained
        ? chained.update.status
        : ((existing?.status as MicroSkillStatus | undefined) ?? "UNKNOWN"),
      update,
    };
  }

  private async hasConfirmedGap(
    studentId: string,
    microSkillId: MicroSkillId,
    pending: EvidencePlan | null,
  ): Promise<boolean> {
    if (pending?.microSkillId === microSkillId) return pending.update.status === "LIKELY_GAP";
    const state = await this.prisma.microSkillStateV2.findUnique({
      where: { studentId_microSkillId: { studentId, microSkillId } },
    });
    return state?.status === "LIKELY_GAP";
  }

  /** How many times the student has already said "I don't know" on this item. Counted from the evidence log, which is the only record a decline leaves. */
  private async declineCount(attemptId: string): Promise<number> {
    const rows = await this.prisma.microSkillEvidenceEventV2.findMany({
      where: { attemptId, evidenceKind: "SKIPPED" },
      select: { id: true },
    });
    return rows.length;
  }

  private async servedItemKeys(sessionId: string): Promise<Set<string>> {
    const attempts = await this.prisma.diagnosticV2Attempt.findMany({
      where: { sessionId },
      select: { itemKey: true },
    });
    return new Set(attempts.map((a) => a.itemKey));
  }

  /** Normalized opening lines already shown — used by the Phase C buffer fill path. */
  private async servedOpeningKeys(sessionId: string): Promise<Set<string>> {
    const attempts = await this.prisma.diagnosticV2Attempt.findMany({
      where: { sessionId },
      select: { equationPrompt: true },
    });
    const keys = new Set<string>();
    for (const a of attempts) {
      const idx = a.equationPrompt.indexOf(":");
      const opening = (idx === -1 ? a.equationPrompt : a.equationPrompt.slice(idx + 1)).trim();
      keys.add(normalizedQuestionKey(opening));
    }
    return keys;
  }

  /**
   * Phase C prefetch worker. GENERATE-primary through existing verify
   * (`renderFreshInstance` → `verifyRendered`). Fire-and-forget wrapper must
   * not throw into the request path.
   */
  private prefetchInBackground(input: {
    sessionId: string;
    templates: DiagnosticV2TemplateId[];
    alreadyServed: ReadonlySet<string>;
    serveOrdinal: number;
  }): void {
    void this.fillVerifiedBuffer(input).catch((err) => {
      this.logger.warn(
        `diagnostic_v2 buffer prefetch failed for ${input.sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async fillVerifiedBuffer(input: {
    sessionId: string;
    templates: DiagnosticV2TemplateId[];
    alreadyServed: ReadonlySet<string>;
    serveOrdinal: number;
  }): Promise<void> {
    for (const templateId of input.templates) {
      if (peekBufferedItem(input.sessionId, templateId)) continue;
      const fresh = renderFreshInstance({
        templateId,
        seedBase: `${input.sessionId}:${templateId}:prefetch:${input.serveOrdinal}`,
        alreadyServed: input.alreadyServed,
      });
      if (!fresh.item) {
        this.logger.log(
          JSON.stringify({
            event: "diagnostic_v2_buffer.fill_skip",
            sessionId: input.sessionId,
            templateId,
            reason: fresh.failure ?? "no instance",
          }),
        );
        continue;
      }
      putBufferedItem({
        sessionId: input.sessionId,
        templateId,
        skillId: fresh.item.primaryMicroSkillId,
        item: fresh.item,
      });
      this.logger.log(
        JSON.stringify({
          event: "diagnostic_v2_buffer.filled",
          sessionId: input.sessionId,
          templateId,
          itemKey: fresh.item.itemKey,
        }),
      );
    }
  }

  private async selectNextItem(input: {
    session: { id: string; studentId: string };
    ruleStage: DiagnosticV2StageId;
    track: DiagnosticV2Track;
    lastStepSummary: string;
    routeReason?: string;
    verificationGate?: CoefficientVerificationGate;
  }): Promise<{
    item: DiagnosticV2Item;
    source: "RULE" | "AI";
    reasoning?: string;
    fromBuffer?: boolean;
    consumedBufferTemplateId?: DiagnosticV2TemplateId;
    selection: DiagnosticV2SelectionProvenance;
    handedToAi: { lastStepSummary: string; skillLines: string[] };
  }> {
    const requestedRulePick = requireFixedItem(input.ruleStage);
    const servedItemKeys = await this.servedItemKeys(input.session.id);
    const backbone = itemStageOrderForTrack(input.track);
    const unserved = backbone.map((stage) => requireFixedItem(stage)).filter(
      (i) => !servedItemKeys.has(i.itemKey),
    );
    // A rule stage normally names an item that hasn't been shown yet — the
    // backbone only ever moves forward. That stops being guaranteed once a
    // stage can be reached by more than one route (PREREQ_SIGN_PROBE resumes
    // into NEG_DIST_CONTRAST, which may already have run). Re-deriving the
    // rule's own pick as "the earliest unserved backbone item" rather than
    // blindly trusting the requested stage is what stops that from silently
    // serving the same question twice.
    const rulePick = servedItemKeys.has(requestedRulePick.itemKey)
      ? (unserved[0] ?? requestedRulePick)
      : requestedRulePick;
    const candidateItems = rulePick.stageId === "COEFFICIENT_VERIFICATION"
      ? [rulePick]
      : unserved.some((i) => i.itemKey === rulePick.itemKey)
        ? unserved
        : [rulePick, ...unserved];
    const ruleSelectedIndex = candidateItems.findIndex((i) => i.itemKey === rulePick.itemKey);

    const candidates: SelectorCandidate[] = candidateItems.map((item) => ({
      item,
      legalityReason:
        item.itemKey === rulePick.itemKey
          ? "next planned question in the rule sequence"
          : "a planned item for this session that has not been shown yet",
    }));

    const attempts = await this.prisma.diagnosticV2Attempt.findMany({
      where: { sessionId: input.session.id },
      orderBy: { createdAt: "asc" },
    });
    const priorWork = await this.prisma.diagnosticV2Step.findMany({
      where: { attemptId: { in: attempts.map((attempt) => attempt.id) } },
      orderBy: { createdAt: "asc" },
      select: {
        attemptId: true,
        stepIndex: true,
        previousLine: true,
        submittedLine: true,
        validity: true,
        primaryMicroSkillId: true,
      },
    });
    const questionByAttempt = new Map(attempts.map((attempt, index) => [attempt.id, index + 1]));
    const workEvidenceLines = priorWork.map((step) =>
      `Q${questionByAttempt.get(step.attemptId) ?? "?"} Step ${step.stepIndex + 1}: ${step.previousLine} -> ${step.submittedLine} (${step.validity}${step.primaryMicroSkillId ? `, ${step.primaryMicroSkillId}` : ""})`,
    );

    const skillLines = await this.buildSelectorSkillLines(
      input.session.studentId,
      input.session.id,
    );

    if (rulePick.stageId === "COEFFICIENT_VERIFICATION") {
      const handedToAi = {
        lastStepSummary: input.lastStepSummary,
        skillLines: [
          ...skillLines.map(formatSkillLine),
          ...workEvidenceLines.map((line) => `Evidence: ${line}`),
        ],
      };
      return {
        item: rulePick,
        source: "RULE",
        reasoning: input.verificationGate?.reason,
        selection: {
          ...(input.verificationGate ? { verificationGate: input.verificationGate } : {}),
          rulePick: {
            itemKey: rulePick.itemKey,
            stageId: rulePick.stageId,
            origin: rulePick.origin,
            routeReason: input.verificationGate?.reason ?? input.routeReason ?? "end-of-flow verification gate passed",
          },
          candidates: [{
            index: 0,
            itemKey: rulePick.itemKey,
            prompt: rulePick.prompt,
            origin: rulePick.origin,
            templateId: rulePick.templateId,
            primaryMicroSkillId: rulePick.primaryMicroSkillId,
            legalityReason: "eligible only because the neutral end-of-flow verification evidence bar passed",
            isRulePick: true,
          }],
          aiDecision: null,
          aiFallback: {
            reason: "AI intentionally not used: response intent cannot be inferred, so this verification check is deterministic.",
            latencyMs: null,
          },
          servedItemKey: rulePick.itemKey,
          servedSource: "RULE",
        },
        handedToAi,
      };
    }

    const selectorStartedAt = new Date();
    const result = await this.selector.selectNext({
      studentId: input.session.studentId,
      sessionId: input.session.id,
      candidates,
      ruleSelectedIndex,
      ruleStageId: input.ruleStage as DiagnosticV2ItemStageId,
      skillLines,
      alreadyServed: attempts.map((a) => ({
        prompt: a.equationPrompt,
        templateId: a.templateId,
        origin: a.origin,
      })),
      serveOrdinal: attempts.length,
      lastStepSummary: input.lastStepSummary,
      workEvidenceLines,
      recentAuthorLatenciesMs: [...this.recentAuthorLatenciesMs],
    });
    const selectorAudit = !result.aiDecision && this.prisma.aiDecisionAuditLog?.findFirst
      ? await this.prisma.aiDecisionAuditLog.findFirst({
          where: {
            sessionId: input.session.id,
            capability: "DIAGNOSTIC_V2_SELECTOR",
            createdAt: { gte: selectorStartedAt },
          },
          orderBy: { createdAt: "desc" },
          select: { failureReason: true, latencyMs: true, passed: true, served: true, rejectedOutput: true },
        })
      : null;

    if (result.authorLatencyMs !== undefined) {
      this.recentAuthorLatenciesMs.push(result.authorLatencyMs);
      if (this.recentAuthorLatenciesMs.length > 40) this.recentAuthorLatenciesMs.shift();
    }

    if (result.discardedGeneration) {
      this.logger.warn(
        `Discarded an AI-generated/authored item for session ${input.session.id}: ${result.discardedGeneration}`,
      );
    }

    const handedToAi = {
      lastStepSummary: input.lastStepSummary,
      skillLines: [
        ...skillLines.map(formatSkillLine),
        ...workEvidenceLines.map((line) => `Evidence: ${line}`),
      ],
    };
    const selection: DiagnosticV2SelectionProvenance = {
      ...(input.verificationGate ? { verificationGate: input.verificationGate } : {}),
      rulePick: {
        itemKey: rulePick.itemKey,
        stageId: rulePick.stageId,
        origin: rulePick.origin,
        routeReason: input.routeReason ?? `backbone advance -> ${input.ruleStage}`,
      },
      candidates: candidates.map((c, index) => ({
        index,
        itemKey: c.item.itemKey,
        prompt: c.item.prompt,
        origin: c.item.origin,
        templateId: c.item.templateId,
        primaryMicroSkillId: c.item.primaryMicroSkillId,
        legalityReason: c.legalityReason,
        isRulePick: index === ruleSelectedIndex,
      })),
      aiDecision: result.aiDecision
        ? {
            ...result.aiDecision,
            latencyMs: result.authorLatencyMs ?? null,
            ...(result.discardedGeneration ? { discardedReason: result.discardedGeneration } : {}),
          }
        : null,
      ...(!result.aiDecision
        ? {
            aiFallback: {
              reason: selectorAudit?.failureReason
                ? selectorAudit.failureReason
                : selectorAudit?.passed && !selectorAudit.served
                  ? "AI response passed validation but serving is disabled (shadow mode)."
                  : "No AI selector call was recorded; generation may be disabled.",
              latencyMs: selectorAudit?.latencyMs ?? null,
              ...extractRejectedSelectorDetails(selectorAudit?.failureReason, selectorAudit?.rejectedOutput),
            },
          }
        : {}),
      servedItemKey: result.item.itemKey,
      servedSource: result.source,
    };

    return {
      item: result.item,
      source: result.source,
      reasoning: result.reasoning,
      fromBuffer: result.fromBuffer,
      consumedBufferTemplateId: result.consumedBufferTemplateId,
      selection,
      handedToAi,
    };
  }

  /** Session-scoped evidence counters for one skill — used for present-tense wording. */
  private async sessionCountsForMicroSkill(
    sessionId: string,
    microSkillId: string,
  ): Promise<MicroSkillCounts> {
    const events = await this.prisma.microSkillEvidenceEventV2.findMany({
      where: { sessionId, microSkillId },
      select: { evidenceKind: true },
    });
    return events.reduce(
      (acc, e) => applyEvidenceToCounts(acc, e.evidenceKind as MicroSkillEvidenceKind),
      EMPTY_COUNTS,
    );
  }

  /**
   * D3 + G1.1: every skill the student has a state row for enters the prompt,
   * labelled `this session` when this session already produced evidence for it,
   * otherwise `earlier`. Dropping either label (or silently merging them) is a
   * regression the D3 golden test is written to catch.
   */
  private async buildSelectorSkillLines(
    studentId: string,
    sessionId: string,
  ): Promise<SelectorSkillLine[]> {
    const states = await this.prisma.microSkillStateV2.findMany({
      where: { studentId },
      orderBy: { microSkillId: "asc" },
    });
    if (states.length === 0) return [];

    const thisSessionEvidence = await this.prisma.microSkillEvidenceEventV2.findMany({
      where: { sessionId },
      select: { microSkillId: true },
    });
    const touchedThisSession = new Set(thisSessionEvidence.map((e) => e.microSkillId));

    const sessionAttempts = await this.prisma.diagnosticV2Attempt.findMany({
      where: { sessionId },
      select: { id: true },
    });
    const attemptIds = sessionAttempts.map((a) => a.id);
    const recentInvalidSteps =
      attemptIds.length > 0
        ? ((await this.prisma.diagnosticV2Step.findMany({
            where: {
              attemptId: { in: attemptIds },
              validity: "INVALID",
            },
            orderBy: { createdAt: "desc" },
          })) as Array<{
            primaryMicroSkillId: string | null;
            firstInvalidActionCode: string | null;
            firstInvalidActionDescription: string | null;
          }>)
        : [];

    // Highest assistance already delivered per skill this session. A skill that
    // has failed twice untaught and one that has failed twice *after* being
    // taught need opposite next moves, and were identical to the selector until
    // this was passed.
    const assistedSteps =
      attemptIds.length > 0
        ? ((await this.prisma.diagnosticV2Step.findMany({
            where: { attemptId: { in: attemptIds } },
            select: { primaryMicroSkillId: true, assistanceLevel: true },
          })) as Array<{ primaryMicroSkillId: string | null; assistanceLevel: string }>)
        : [];
    const highestAssistance = new Map<string, string>();
    for (const st of assistedSteps) {
      if (!st.primaryMicroSkillId) continue;
      const current = highestAssistance.get(st.primaryMicroSkillId);
      if (!current || ASSISTANCE_RANK.indexOf(st.assistanceLevel) > ASSISTANCE_RANK.indexOf(current)) {
        highestAssistance.set(st.primaryMicroSkillId, st.assistanceLevel);
      }
    }

    const statusById = new Map(states.map((s) => [s.microSkillId, s.status as string]));

    const hypotheses = await this.prisma.diagnosticV2Hypothesis.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(states.map(async (s) => {
      const recent = recentInvalidSteps.find((st) => st.primaryMicroSkillId === s.microSkillId);
      const hyp = hypotheses.find((h) => h.microSkillId === s.microSkillId);
      const touched = touchedThisSession.has(s.microSkillId);
      const displayedCounts = touched
        ? await this.sessionCountsForMicroSkill(sessionId, s.microSkillId)
        : s;
      const line: SelectorSkillLine = {
        microSkillId: s.microSkillId,
        status: s.status,
        independentSuccessCount: displayedCounts.independentSuccessCount,
        independentFailureCount: displayedCounts.independentFailureCount,
        assistedSuccessCount: displayedCounts.assistedSuccessCount,
        observedContextStrengths: s.observedContextStrengths,
        observedContextGaps: s.observedContextGaps,
        scope: touched ? "this session" : "earlier",
        // The prerequisite graph already lives in the catalogue; it just was
        // never handed to the selector. UNKNOWN is the honest default for a
        // prerequisite the student has no state row for — never tested is not
        // the same as fine.
        prerequisites: (findMicroSkill(s.microSkillId)?.prerequisiteMicroSkillIds ?? []).map(
          (p) => ({ microSkillId: p, status: statusById.get(p) ?? "UNKNOWN" }),
        ),
      };
      const taught = highestAssistance.get(s.microSkillId);
      if (taught && taught !== "NONE") line.highestAssistanceGiven = taught;
      if (recent?.firstInvalidActionDescription) {
        line.recentErrorDescription = recent.firstInvalidActionDescription;
        if (recent.firstInvalidActionCode) line.recentErrorCode = recent.firstInvalidActionCode;
      }
      if (hyp) {
        line.hypothesisLabel = hyp.hypothesisLabel;
        line.hypothesisConfidence = hyp.confidence;
      }
      return line;
    }));
  }

  /** Which skills this session should schedule a delayed re-check for. */
  private async retentionTargets(
    studentId: string,
    pending: Array<EvidencePlan | null>,
  ): Promise<MicroSkillId[]> {
    const states = await this.prisma.microSkillStateV2.findMany({ where: { studentId } });
    const statusById = new Map<string, MicroSkillStatus>(
      states.map((s) => [s.microSkillId, s.status as MicroSkillStatus]),
    );
    for (const plan of pending) {
      if (plan) statusById.set(plan.microSkillId, plan.update.status);
    }
    return [...statusById.entries()]
      .filter(([id, status]) => status === "LIKELY_GAP" && id in MICRO_SKILL_TO_CONCEPT)
      .map(([id]) => id as MicroSkillId)
      .sort();
  }
}

interface EvidencePlan {
  microSkillId: MicroSkillId;
  kind: MicroSkillEvidenceKind;
  weight: number;
  assistanceLevel: AssistanceLevel;
  contextModifierIds: ContextModifierId[];
  layers: { topicId: string | null; competencyFamilyId: string | null };
  previousStatus: MicroSkillStatus;
  update: ReturnType<typeof computeMicroSkillStateUpdate>;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** The client needs the bare opening line, not just the prompt wording, because that is what it must send back as the first `previousLine`. */
function attemptView(
  attemptId: string,
  item: DiagnosticV2Item,
  /** Demo-only placeholder hint; omitted entirely for a real student. */
  demoNextLineHint?: string | null,
): DiagnosticV2AttemptView {
  return {
    attemptId,
    itemKey: item.itemKey,
    equationPrompt: item.prompt,
    openingLine: item.openingLine,
    stageId: item.stageId,
    ...(demoNextLineHint ? { demoNextLineHint } : {}),
  };
}

/**
 * The hint for whatever line the student will be writing against next, or
 * null for anyone who is not a demo account. Computed behind the demo check so
 * a real student never pays for work that is discarded.
 *
 * Must use isDemoStudent, never an equality test against the template id:
 * every demo login now mints a fresh `demo_<cuid>` student, so an exact match
 * would silently stop matching and the hint would just quietly disappear.
 */
function demoHintFor(
  studentId: string,
  line: string,
  track: DiagnosticV2Track,
  stageId?: string | null,
): string | null {
  if (!isDemoStudentId(studentId)) return null;
  return nextStepHint(line, track, stageId);
}

function requireFixedItem(stage: DiagnosticV2StageId): DiagnosticV2Item {
  const item = findFixedItem(stage);
  if (!item) throw new Error(`No fixed item is registered for stage ${stage}`);
  return item;
}

/**
 * Reconstructs the item a student is working on. Prefers the origin / template /
 * stage columns written when the attempt was created — those are authoritative.
 * Key-prefix inference is a last resort for rows written before Phase A2, and
 * must never confuse GEN_TRANSFER_NEG_DIST with GEN_NEG_DIST.
 */
function itemForAttempt(attempt: AttemptRow): DiagnosticV2Item {
  const fixed = findFixedItem(attempt.itemKey);
  if (fixed) return fixed;

  const origin: DiagnosticV2ItemOrigin = isDiagnosticV2ItemOrigin(attempt.origin)
    ? attempt.origin
    : attempt.itemKey.startsWith("AUTH_")
      ? "AI_AUTHORED"
      : "TEMPLATE_RENDERED";

  const templateId: DiagnosticV2TemplateId | null =
    attempt.templateId && isKnownTemplateId(attempt.templateId)
      ? attempt.templateId
      : origin === "AI_AUTHORED"
        ? null
        : templateIdFromGeneratedKey(attempt.itemKey);

  const stageId: DiagnosticV2ItemStageId =
    isItemStageId(attempt.stageId)
      ? attempt.stageId
      : templateId
        ? (stageForTemplate(templateId) as DiagnosticV2ItemStageId)
        : "NEG_DIST_MAIN";

  const openingLine = openingLineFromPrompt(attempt.equationPrompt);
  const isBareExpression = !openingLine.includes("=");
  const isTransferCheck =
    stageId === "TRANSFER_NEG_DIST" ||
    stageId === "TRANSFER_FRAC_CLEAR" ||
    stageId === "TRANSFER_ID_DIFF" ||
    stageId === "TRANSFER_FAC_NONMONIC" ||
    stageId === "TRANSFER_QUAD_ZP" ||
    templateId === "TPL_TRANSFER_NEG_DISTRIBUTION" ||
    templateId === "TPL_TRANSFER_FRAC_CLEAR" ||
    templateId === "TPL_TRANSFER_DIFF_SQUARES" ||
    templateId === "TPL_TRANSFER_FAC_NONMONIC" ||
    templateId === "TPL_TRANSFER_QUAD_ZP";

  const primaryMicroSkillId: MicroSkillId =
    templateId === "TPL_TWO_STEP"
      ? "LIN_SOLVE_TWO_STEP"
      : templateId === "TPL_VARIABLE_BOTH"
        ? "LIN_SOLVE_VARIABLE_BOTH"
        : templateId === "TPL_SIGN_MUL_DIV"
          ? "FND_SIGN_MUL_DIV"
          : templateId === "TPL_FRAC_SIMPLE"
            ? "LIN_SOLVE_FRACTIONS"
            : templateId === "TPL_FRAC_CLEAR" ||
                templateId === "TPL_FRAC_CLEAR_BARE" ||
                templateId === "TPL_TRANSFER_FRAC_CLEAR"
              ? "LIN_CLEAR_FRACTIONS"
              : templateId === "TPL_EXPAND_BINOMIAL" || templateId === "TPL_FACTOR_EXPAND"
                ? "EXP_EXPAND_BINOMIALS"
                : templateId === "TPL_DIFF_SQUARES" ||
                    templateId === "TPL_DIFF_SQUARES_BARE" ||
                    templateId === "TPL_TRANSFER_DIFF_SQUARES"
                  ? "ID_DIFF_SQUARES"
                  : templateId === "TPL_FAC_MONIC" || templateId === "TPL_FAC_MONIC_BARE"
                    ? "FAC_MONIC_TRINOMIAL"
                    : templateId === "TPL_TRANSFER_FAC_NONMONIC"
                      ? "FAC_NONMONIC_GROUP"
                      : templateId === "TPL_QUAD_STANDARD"
                        ? "QUAD_STANDARD_FORM"
                        : templateId === "TPL_QUAD_ZP_BARE"
                          ? "QUAD_SOLVE_UNIT_FACTOR"
                          : templateId === "TPL_QUAD_ZERO_PRODUCT" ||
                              templateId === "TPL_TRANSFER_QUAD_ZP"
                            ? "QUAD_ZERO_PRODUCT"
                            : "LIN_DISTRIBUTE_NEG";

  const supportingMicroSkillIds: MicroSkillId[] =
    templateId === "TPL_TWO_STEP"
      ? ["LIN_REMOVE_CONSTANT", "LIN_REMOVE_COEFFICIENT"]
      : templateId === "TPL_VARIABLE_BOTH"
        ? ["LIN_COMBINE_LIKE", "LIN_REMOVE_COEFFICIENT"]
        : templateId === "TPL_SIGN_MUL_DIV"
          ? []
          : templateId === "TPL_FRAC_SIMPLE"
            ? ["FND_FRACTION_OPS", "LIN_CLEAR_FRACTIONS"]
            : templateId === "TPL_FRAC_CLEAR" ||
                templateId === "TPL_FRAC_CLEAR_BARE" ||
                templateId === "TPL_TRANSFER_FRAC_CLEAR"
              ? ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"]
              : templateId === "TPL_EXPAND_BINOMIAL"
                ? ["ALG_IDENTIFY_STRUCTURE"]
                : templateId === "TPL_DIFF_SQUARES" ||
                    templateId === "TPL_DIFF_SQUARES_BARE" ||
                    templateId === "TPL_TRANSFER_DIFF_SQUARES"
                  ? ["EXP_EXPAND_BINOMIALS", "ID_VERIFY_EXPANSION"]
                  : templateId === "TPL_FACTOR_EXPAND"
                    ? ["FAC_VERIFY_EXPAND", "ALG_IDENTIFY_STRUCTURE"]
                    : templateId === "TPL_FAC_MONIC" || templateId === "TPL_FAC_MONIC_BARE"
                      ? ["FAC_PAIR_PRODUCT_SUM", "FAC_READ_ABC_SIGNS", "FAC_VERIFY_EXPAND"]
                      : templateId === "TPL_TRANSFER_FAC_NONMONIC"
                        ? ["FAC_COMPUTE_AC", "FAC_SPLIT_MIDDLE", "FAC_VERIFY_EXPAND"]
                        : templateId === "TPL_QUAD_STANDARD"
                          ? ["QUAD_FACTOR_EXPRESSION"]
                          : templateId === "TPL_QUAD_ZERO_PRODUCT" ||
                              templateId === "TPL_QUAD_ZP_BARE"
                            ? ["QUAD_CREATE_BRANCHES", "QUAD_SOLVE_UNIT_FACTOR", "QUAD_VERIFY_ROOTS"]
                            : templateId === "TPL_TRANSFER_QUAD_ZP"
                              ? ["QUAD_FACTOR_EXPRESSION", "QUAD_VERIFY_ROOTS"]
                              : ["FND_SIGN_MUL_DIV"];

  return {
    itemKey: attempt.itemKey,
    templateId,
    origin,
    stageId,
    prompt: attempt.equationPrompt,
    openingLine,
    primaryMicroSkillId,
    supportingMicroSkillIds,
    isTransferCheck,
    isBareExpression,
  };
}

function isItemStageId(v: string): v is DiagnosticV2ItemStageId {
  return (
    v === "ENTRY_TWO_STEP" ||
    v === "ENTRY_VARIABLE_BOTH" ||
    v === "NEG_DIST_MAIN" ||
    v === "NEG_DIST_CONTRAST" ||
    v === "TRANSFER_NEG_DIST" ||
    v === "PREREQ_SIGN_PROBE" ||
    v === "ENTRY_FRAC_SIMPLE" ||
    v === "FRAC_CLEAR_MAIN" ||
    v === "FRAC_CLEAR_CONTRAST" ||
    v === "TRANSFER_FRAC_CLEAR" ||
    v === "ENTRY_EXPAND_BINOMIAL" ||
    v === "ID_DIFF_MAIN" ||
    v === "ID_DIFF_CONTRAST" ||
    v === "TRANSFER_ID_DIFF" ||
    v === "ENTRY_FACTOR_EXPAND" ||
    v === "FAC_MONIC_MAIN" ||
    v === "FAC_MONIC_CONTRAST" ||
    v === "TRANSFER_FAC_NONMONIC" ||
    v === "ENTRY_QUAD_STANDARD" ||
    v === "QUAD_ZP_MAIN" ||
    v === "QUAD_ZP_CONTRAST" ||
    v === "TRANSFER_QUAD_ZP"
  );
}

function templateIdFromGeneratedKey(itemKey: string): DiagnosticV2TemplateId {
  if (itemKey.startsWith("GEN_TWO_STEP")) return "TPL_TWO_STEP";
  if (itemKey.startsWith("GEN_VAR_BOTH")) return "TPL_VARIABLE_BOTH";
  if (itemKey.startsWith("GEN_NEG_DIST_BARE")) return "TPL_NEG_DISTRIBUTION_BARE";
  if (itemKey.startsWith("GEN_TRANSFER_NEG_DIST")) return "TPL_TRANSFER_NEG_DISTRIBUTION";
  if (itemKey.startsWith("GEN_SIGN_MUL")) return "TPL_SIGN_MUL_DIV";
  if (itemKey.startsWith("GEN_FRAC_SIMPLE")) return "TPL_FRAC_SIMPLE";
  if (itemKey.startsWith("GEN_FRAC_CLEAR_BARE")) return "TPL_FRAC_CLEAR_BARE";
  if (itemKey.startsWith("GEN_TRANSFER_FRAC_CLEAR")) return "TPL_TRANSFER_FRAC_CLEAR";
  if (itemKey.startsWith("GEN_FRAC_CLEAR")) return "TPL_FRAC_CLEAR";
  if (itemKey.startsWith("GEN_EXPAND_BIN")) return "TPL_EXPAND_BINOMIAL";
  if (itemKey.startsWith("GEN_TRANSFER_DIFF")) return "TPL_TRANSFER_DIFF_SQUARES";
  if (itemKey.startsWith("GEN_DIFF_SQ_") && itemKey.endsWith("_C")) return "TPL_DIFF_SQUARES_BARE";
  if (itemKey.startsWith("GEN_DIFF_SQ_")) return "TPL_DIFF_SQUARES";
  if (itemKey.startsWith("GEN_FACTOR_EXPAND")) return "TPL_FACTOR_EXPAND";
  if (itemKey.startsWith("GEN_TRANSFER_FAC_NONMONIC")) return "TPL_TRANSFER_FAC_NONMONIC";
  if (itemKey.startsWith("GEN_FAC_MONIC_") && itemKey.endsWith("_C")) return "TPL_FAC_MONIC_BARE";
  if (itemKey.startsWith("GEN_FAC_MONIC_")) return "TPL_FAC_MONIC";
  if (itemKey.startsWith("GEN_QUAD_STD_")) return "TPL_QUAD_STANDARD";
  if (itemKey.startsWith("GEN_QUAD_ZP_BARE_")) return "TPL_QUAD_ZP_BARE";
  if (itemKey.startsWith("GEN_TRANSFER_QUAD_ZP_")) return "TPL_TRANSFER_QUAD_ZP";
  if (itemKey.startsWith("GEN_QUAD_ZP_")) return "TPL_QUAD_ZERO_PRODUCT";
  return "TPL_NEG_DISTRIBUTION";
}

function openingLineFromPrompt(prompt: string): string {
  const idx = prompt.indexOf(":");
  return (idx === -1 ? prompt : prompt.slice(idx + 1)).trim();
}

/** The line a new step builds on: the opening line, or the last line the verifier accepted. */
export function lastAcceptedLine(
  item: DiagnosticV2Item,
  priorSteps: Array<Pick<StepRow, "validity" | "submittedLine">>,
): string {
  for (let i = priorSteps.length - 1; i >= 0; i--) {
    if (priorSteps[i]!.validity === "VALID") return priorSteps[i]!.submittedLine;
  }
  return item.openingLine;
}

/** There is no separate "final answer" button — an item ends when the work reaches its end state. */
export function reachedEndState(item: DiagnosticV2Item, submittedLine: string): boolean {
  const compact = submittedLine.replace(/\s+/g, "");
  // B2 transfer / B3 factor stages: end state *has* parentheses (a product).
  if (
    item.stageId === "TRANSFER_ID_DIFF" ||
    item.templateId === "TPL_TRANSFER_DIFF_SQUARES" ||
    item.stageId === "FAC_MONIC_MAIN" ||
    item.stageId === "FAC_MONIC_CONTRAST" ||
    item.stageId === "TRANSFER_FAC_NONMONIC" ||
    item.templateId === "TPL_FAC_MONIC" ||
    item.templateId === "TPL_FAC_MONIC_BARE" ||
    item.templateId === "TPL_TRANSFER_FAC_NONMONIC"
  ) {
    return /^\([+-]?\d*[a-z][+-]\d+\)\([+-]?\d*[a-z][+-]\d+\)$/i.test(compact);
  }
  // B4: roots list is the end state for zero-product / transfer.
  if (
    item.stageId === "QUAD_ZP_MAIN" ||
    item.stageId === "QUAD_ZP_CONTRAST" ||
    item.stageId === "TRANSFER_QUAD_ZP" ||
    item.templateId === "TPL_QUAD_ZERO_PRODUCT" ||
    item.templateId === "TPL_QUAD_ZP_BARE" ||
    item.templateId === "TPL_TRANSFER_QUAD_ZP"
  ) {
    return /^[a-z]=[+-]?\d+(?:\/\d+)?(?:or|,)(?:[a-z]=)?[+-]?\d+(?:\/\d+)?$/i.test(
      compact.toLowerCase(),
    );
  }
  // B4 entry: rearranged to …=0
  if (
    item.stageId === "ENTRY_QUAD_STANDARD" ||
    item.templateId === "TPL_QUAD_STANDARD"
  ) {
    return /=0$/i.test(compact) && /\^2/.test(compact);
  }
  if (item.isBareExpression) return !submittedLine.includes("(");
  const parsed = tryParse(submittedLine);
  return parsed ? isSolvedForm(parsed) : false;
}

/** Remove only harmless unmatched closing punctuation at the very end. */
export function normalizeSubmittedMathLine(line: string): string {
  // Algebra lines in this diagnostic legitimately end in a number, variable,
  // or closing parenthesis. Strip any accidental trailing keyboard punctuation
  // (`]`, quotes, commas, etc.) in one pass instead of maintaining a fragile
  // character allow-list.
  return line.trim().replace(/[^a-zA-Z0-9)]+$/, "");
}

function normalizeWhitespace(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function summarizeStep(
  validity: StepValidity | null,
  firstInvalidActionDescription: string | undefined,
  microSkillId: string,
  previousLine?: string,
  submittedLine?: string,
): string {
  const numericalEvidence = previousLine && submittedLine
    ? `; exact submitted change: ${previousLine} -> ${submittedLine}`
    : "";
  if (validity === null) return `the student said they did not know how to start ${microSkillId}`;
  if (validity === "VALID") return `the last line was correct on ${microSkillId}${numericalEvidence}`;
  if (validity === "INVALID") {
    return `the last line was incorrect on ${microSkillId}${
      firstInvalidActionDescription ? ` — ${firstInvalidActionDescription}` : ""
    }${numericalEvidence}`;
  }
  return `the last line could not be read by the checker (${validity.toLowerCase()})`;
}

function readStageHistory(raw: unknown): StageHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StageHistoryEntry =>
      !!e && typeof e === "object" && typeof (e as StageHistoryEntry).stageId === "string",
  );
}
