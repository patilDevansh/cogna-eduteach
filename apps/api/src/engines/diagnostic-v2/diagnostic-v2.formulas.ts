/**
 * Pure evidence/state logic for the micro-skill step diagnostic — no Prisma,
 * no NestJS, same split as diagnostic-formulas.ts / student-analysis.formulas.ts.
 *
 * Weights come from Work Order 03 §10. They are evidence *strength*, never a
 * mastery percentage and never shown to a student as a number.
 */
import type {
  AssistanceLevel,
  ContextModifierId,
  MicroSkillEvidenceKind,
  MicroSkillStatus,
  StepValidity,
  VerificationSource,
} from "@cogna/shared";

export const EVIDENCE_WEIGHTS: Record<MicroSkillEvidenceKind, number> = {
  INDEPENDENT_CORRECT: 1.0,
  TRANSFER_SUCCESS: 1.2,
  SELF_CORRECTED: 0.55,
  ASSISTED_CORRECT: 0.2,
  INDEPENDENT_INCORRECT: -1.0,
  TRANSFER_FAILURE: -0.75,
  ASSISTED_INCORRECT: -0.3,
  SKIPPED: 0,
  INSUFFICIENT: 0,
};

/**
 * An AI-graded line is real evidence but weaker evidence: the deterministic
 * verifier couldn't classify it, so the reading is a judgement call rather
 * than arithmetic. Same principle as assisted-vs-independent, applied to a
 * different axis — who did the grading, not how much help the student had.
 */
export const AI_FALLBACK_WEIGHT_MULTIPLIER = 0.5;

/**
 * A bare final answer is decided by arithmetic, so it is not a *grading*
 * judgement call — but it is still lower-resolution *evidence*: a correct
 * value proves the student reached the destination, not that they can perform
 * each step along the way. Weaker than shown working, well short of nothing.
 *
 * Deliberately not stacked with AI_FALLBACK: a bare answer never reaches the
 * grader, so the two multipliers can never both apply.
 */
export const FINAL_ANSWER_ONLY_WEIGHT_MULTIPLIER = 0.6;

/**
 * The assistance ladder in escalating order. Index is the rung, so "which of
 * these two is more help" is a comparison rather than a scattered switch.
 */
export const ASSISTANCE_RANK: readonly string[] = [
  "NONE",
  "REVIEW_OPPORTUNITY",
  "GENERAL_PROMPT",
  "LOCATION_HINT",
  "RULE_PROMPT",
  "MICRO_QUESTION",
  "PARTIAL_WORKED_STEP",
  "FULL_EXPLANATION",
];

export function isAssisted(level: AssistanceLevel): boolean {
  return level !== "NONE" && level !== "REVIEW_OPPORTUNITY";
}

/** Maps one verified step onto the kind of evidence it produces. Returns null when the step should create no evidence at all (unparseable/ambiguous work is not a wrong answer). */
export function evidenceKindForStep(input: {
  validity: StepValidity;
  assistanceLevel: AssistanceLevel;
  isSelfCorrection: boolean;
  isTransferCheck: boolean;
}): MicroSkillEvidenceKind | null {
  const { validity, assistanceLevel, isSelfCorrection, isTransferCheck } = input;

  if (validity === "PARSE_FAILED" || validity === "AMBIGUOUS") return null;

  const correct = validity === "VALID";
  const assisted = isAssisted(assistanceLevel);

  if (correct) {
    if (isSelfCorrection) return "SELF_CORRECTED";
    if (assisted) return "ASSISTED_CORRECT";
    if (isTransferCheck) return "TRANSFER_SUCCESS";
    return "INDEPENDENT_CORRECT";
  }
  if (assisted) return "ASSISTED_INCORRECT";
  if (isTransferCheck) return "TRANSFER_FAILURE";
  return "INDEPENDENT_INCORRECT";
}

export function evidenceWeight(
  kind: MicroSkillEvidenceKind,
  verificationSource: VerificationSource,
  contextModifierIds: readonly string[] = [],
): number {
  const base = EVIDENCE_WEIGHTS[kind];
  if (verificationSource === "AI_FALLBACK") return base * AI_FALLBACK_WEIGHT_MULTIPLIER;
  if (contextModifierIds.includes("FINAL_ANSWER_ONLY")) {
    return base * FINAL_ANSWER_ONLY_WEIGHT_MULTIPLIER;
  }
  return base;
}

export interface MicroSkillCounts {
  evidenceCount: number;
  independentSuccessCount: number;
  independentFailureCount: number;
  assistedSuccessCount: number;
}

export const EMPTY_COUNTS: MicroSkillCounts = {
  evidenceCount: 0,
  independentSuccessCount: 0,
  independentFailureCount: 0,
  assistedSuccessCount: 0,
};

export function applyEvidenceToCounts(
  counts: MicroSkillCounts,
  kind: MicroSkillEvidenceKind,
): MicroSkillCounts {
  const next: MicroSkillCounts = { ...counts, evidenceCount: counts.evidenceCount + 1 };
  switch (kind) {
    case "INDEPENDENT_CORRECT":
    case "TRANSFER_SUCCESS":
      next.independentSuccessCount++;
      break;
    case "INDEPENDENT_INCORRECT":
    case "TRANSFER_FAILURE":
      next.independentFailureCount++;
      break;
    case "ASSISTED_CORRECT":
    case "SELF_CORRECTED":
      next.assistedSuccessCount++;
      break;
    default:
      break;
  }
  return next;
}

/**
 * Two independent failures remain *necessary* for LIKELY_GAP (one wrong line
 * is a hypothesis, not a diagnosis — Master Prompt §3.4). They are no longer
 * *sufficient* on their own: without a failure-rate floor, 8 right / 5 wrong
 * (62% independent success) wore the same label as 0 right / 2 wrong, and that
 * label drove both the hypothesis panel and the end-of-session report.
 *
 * Rate is among independent trials only (assisted work does not dilute or
 * inflate the gap call). Threshold is exclusive (`>`): a 50/50 split stays
 * EMERGING rather than flipping to a gap on a coin toss.
 */
export const LIKELY_GAP_MIN_INDEPENDENT_FAILURES = 2;
/** Floor on independent trials before a gap label is allowed at all. */
export const LIKELY_GAP_MIN_INDEPENDENT_TRIALS = 3;
/** Independent failure rate must exceed this (strict) to call LIKELY_GAP. */
export const LIKELY_GAP_FAILURE_RATE_THRESHOLD = 0.5;

/**
 * Discrete status, not a continuous score — the whole point of this track is
 * to avoid a single "algebra percentage".
 *
 * LIKELY_GAP deliberately needs two independent failures across at least
 * three independent opportunities: two wrong calculations alone establish
 * repetition of the outcome, but not its conceptual cause. RELIABLE deliberately
 * needs two independent successes and zero failures — a single sitting cannot
 * prove durable mastery, so this is the ceiling this phase can award.
 */
export function computeMicroSkillStatus(counts: MicroSkillCounts): MicroSkillStatus {
  const { evidenceCount, independentSuccessCount, independentFailureCount, assistedSuccessCount } =
    counts;

  if (evidenceCount === 0) return "UNKNOWN";

  const independentTrials = independentSuccessCount + independentFailureCount;
  const failureRate =
    independentTrials === 0 ? 0 : independentFailureCount / independentTrials;
  if (
    independentFailureCount >= LIKELY_GAP_MIN_INDEPENDENT_FAILURES &&
    independentTrials >= LIKELY_GAP_MIN_INDEPENDENT_TRIALS &&
    failureRate > LIKELY_GAP_FAILURE_RATE_THRESHOLD
  ) {
    return "LIKELY_GAP";
  }

  if (independentSuccessCount >= 2 && independentFailureCount === 0) return "RELIABLE";
  if (independentSuccessCount >= 1 && independentFailureCount === 0) return "DEVELOPING";
  if (assistedSuccessCount >= 1 || independentSuccessCount >= 1) return "EMERGING";
  if (independentFailureCount >= 1) return "EMERGING";
  return "UNKNOWN";
}

export interface MicroSkillStateUpdate {
  counts: MicroSkillCounts;
  status: MicroSkillStatus;
  observedContextStrengths: string[];
  observedContextGaps: string[];
}

/** Layer 5 bookkeeping: which conditions this skill has actually held up under, and which it hasn't. Sorted so stored rows stay stable across replays. */
export function computeMicroSkillStateUpdate(input: {
  previousCounts: MicroSkillCounts;
  previousStrengths: string[];
  previousGaps: string[];
  kind: MicroSkillEvidenceKind;
  contextModifierIds: ContextModifierId[];
}): MicroSkillStateUpdate {
  const counts = applyEvidenceToCounts(input.previousCounts, input.kind);
  const positive =
    input.kind === "INDEPENDENT_CORRECT" ||
    input.kind === "TRANSFER_SUCCESS" ||
    input.kind === "SELF_CORRECTED" ||
    input.kind === "ASSISTED_CORRECT";
  const negative =
    input.kind === "INDEPENDENT_INCORRECT" ||
    input.kind === "TRANSFER_FAILURE" ||
    input.kind === "ASSISTED_INCORRECT";

  const strengths = new Set(input.previousStrengths);
  const gaps = new Set(input.previousGaps);
  for (const ctx of input.contextModifierIds) {
    if (positive) strengths.add(ctx);
    if (negative) gaps.add(ctx);
  }

  return {
    counts,
    status: computeMicroSkillStatus(counts),
    observedContextStrengths: [...strengths].sort(),
    observedContextGaps: [...gaps].sort(),
  };
}

/**
 * The deterministic hypothesis used whenever the AI interpreter is off, fails,
 * or times out — so a hypothesis always exists and is never fabricated by absence.
 *
 * Present-tense wording uses `sessionCounts` only. Lifetime counters may be
 * mentioned explicitly when they differ — never rendered as if they happened
 * "just now". A first-ever sitting with one failure must never claim a
 * "repeated pattern" just because an older shared account had five.
 */
export function buildRuleHypothesis(input: {
  microSkillId: string;
  microSkillName: string;
  /** Counts from this session only — drive present-tense wording and the label. */
  sessionCounts: MicroSkillCounts;
  /** All-time counters — named only when they exceed the session counts. */
  lifetimeCounts: MicroSkillCounts;
  firstInvalidActionDescription?: string;
  /**
   * @deprecated Prefer sessionCounts + lifetimeCounts. Kept so older call sites
   * that still pass a single `counts` blob compile during the migration; treated
   * as both session and lifetime (identical).
   */
  counts?: MicroSkillCounts;
}): { hypothesisLabel: string; confidence: number; reasoning: string; childFacingSummary: string } {
  const sessionCounts = input.sessionCounts ?? input.counts ?? EMPTY_COUNTS;
  const lifetimeCounts = input.lifetimeCounts ?? input.counts ?? sessionCounts;
  // Label from this session's evidence alone — lifetime pollution must not
  // escalate a first-sitting slip into REPEATED_PATTERN.
  const status = computeMicroSkillStatus(sessionCounts);
  const sessionFailures = sessionCounts.independentFailureCount;
  const lifetimeFailures = lifetimeCounts.independentFailureCount;

  if (status === "LIKELY_GAP" && sessionFailures >= 2) {
    const lifetimeNote =
      lifetimeFailures > sessionFailures
        ? ` (${lifetimeFailures} times across earlier sittings)`
        : "";
    return {
      hypothesisLabel: "REPEATED_PATTERN",
      confidence: 0.7,
      reasoning: `The same kind of error appeared ${sessionFailures} times in this session${lifetimeNote} on ${input.microSkillName.toLowerCase()}${
        input.firstInvalidActionDescription ? ` — most recently, ${input.firstInvalidActionDescription}` : ""
      }.`,
      childFacingSummary: `Let's spend a little time on ${input.microSkillName.toLowerCase()} — it came up more than once.`,
    };
  }

  if (sessionFailures === 1) {
    const lifetimeNote =
      lifetimeFailures > sessionFailures
        ? ` (seen ${lifetimeFailures} times across earlier sittings, but only once here)`
        : "";
    return {
      hypothesisLabel: "POSSIBLE_SLIP",
      confidence: 0.4,
      reasoning: `One error on ${input.microSkillName.toLowerCase()} in this session${lifetimeNote}${
        input.firstInvalidActionDescription ? ` (${input.firstInvalidActionDescription})` : ""
      }, which is not yet enough to tell a slip from a real gap.`,
      childFacingSummary: `We'll check ${input.microSkillName.toLowerCase()} once more to be sure.`,
    };
  }

  if (sessionFailures >= 2) {
    const isCoefficientDivision = input.microSkillId === "LIN_REMOVE_COEFFICIENT";
    return {
      hypothesisLabel: "POSSIBLE_SLIP",
      confidence: 0.5,
      reasoning: isCoefficientDivision
        ? `${sessionFailures} incorrect quotient calculations were observed while dividing to isolate the variable, but only ${sessionCounts.independentSuccessCount + sessionFailures} independent opportunities have been seen. This is evidence of a calculation pattern to re-check, not enough evidence of a conceptual division gap.`
        : `${sessionFailures} errors were observed on ${input.microSkillName.toLowerCase()}, but there have only been ${sessionCounts.independentSuccessCount + sessionFailures} independent opportunities. That is not yet enough to separate repeated slips from a conceptual gap.`,
      childFacingSummary: isCoefficientDivision
        ? "The division step is the right idea; let's slow down the quotient calculation and check it by multiplying back."
        : `This came up twice, so we'll check ${input.microSkillName.toLowerCase()} once more before drawing a conclusion.`,
    };
  }

  return {
    hypothesisLabel: "WORKING_WELL",
    confidence: 0.6,
    reasoning: `No errors observed on ${input.microSkillName.toLowerCase()} so far in this session.`,
    childFacingSummary: `You're handling ${input.microSkillName.toLowerCase()} well.`,
  };
}

// ─── Agreement functions for the shadow-gate evaluator ──────────────────────
// Each mirrors the pattern in question-recommender/student-analysis: the gate
// re-uses these exact functions rather than reimplementing comparison, so the
// evaluator can never drift from what each capability's own tests certify.

/** Selector agreement: same choice type, and for EXISTING the same index / for GENERATE the same template / for AUTHOR the same target skill. */
export function selectorAgreesWithRule(
  rule: { choice: string; index?: number; templateId?: string; targetMicroSkillId?: string },
  ai: { choice: string; index?: number; templateId?: string; targetMicroSkillId?: string },
): boolean {
  if (rule.choice !== ai.choice) return false;
  if (ai.choice === "EXISTING") return rule.index === ai.index;
  if (ai.choice === "GENERATE") return rule.templateId === ai.templateId;
  if (ai.choice === "AUTHOR") return rule.targetMicroSkillId === ai.targetMicroSkillId;
  return false;
}

/** Interpreter agreement: same hypothesis label. Confidence and wording are expected to differ — only the conclusion is comparable. */
export function interpreterAgreesWithRule(ruleLabel: string, aiLabel: string): boolean {
  return ruleLabel === aiLabel;
}

/** Grader agreement: the rule baseline is always AMBIGUOUS by construction (the AI grader only runs when rules couldn't decide), so there is nothing to agree *with* — always report "not comparable" rather than inventing agreement. */
export function graderAgreesWithRule(): boolean {
  return false;
}
