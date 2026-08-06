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
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  EVIDENCE_POLICY_MICROSKILL_V1,
  STEP_VERIFICATION_RULES_FRACTION_V1,
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
  type VerificationSource,
} from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";
import {
  findFixedItem,
  FIXED_ITEMS,
  isKnownTemplateId,
  type DiagnosticV2Item,
  type DiagnosticV2ItemStageId,
  type DiagnosticV2TemplateId,
} from "./diagnostic-v2-template-render";
import {
  isSolvedForm,
  matchSingleBracket,
  parseLinearWithBracket,
  type ParsedLine,
} from "./linear-bracket-verifier";
import {
  checkBareFinalAnswerForTrack,
  verifyDiagnosticV2Step,
} from "./diagnostic-v2-verifier-router";
import { lineHasFractionSyntax } from "./fraction-linear-verifier";
import { assistanceTextFor } from "./diagnostic-v2-assistance-text";
import {
  ASSISTANCE_RANK,
  computeMicroSkillStateUpdate,
  evidenceKindForStep,
  evidenceWeight,
  isAssisted,
  type MicroSkillCounts,
} from "./diagnostic-v2.formulas";
import { findMicroSkill, layersForMicroSkill } from "./micro-skills.catalog";
import {
  DiagnosticV2AiSelectorService,
  type SelectorCandidate,
  type SelectorSkillLine,
} from "./diagnostic-v2-ai-selector.service";
import { DiagnosticV2AiInterpreterService } from "./diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "./diagnostic-v2-ai-grader.service";

// ─── Stages ─────────────────────────────────────────────────────────────────

export type DiagnosticV2StageId =
  | "ENTRY_TWO_STEP"
  | "ENTRY_VARIABLE_BOTH"
  | "NEG_DIST_MAIN"
  | "NEG_DIST_CONTRAST"
  | "RULE_PROMPT"
  | "TRANSFER_NEG_DIST"
  | "PREREQ_SIGN_PROBE"
  | "ENTRY_FRAC_SIMPLE"
  | "FRAC_CLEAR_MAIN"
  | "FRAC_CLEAR_CONTRAST"
  | "TRANSFER_FRAC_CLEAR"
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

export const FIRST_STAGE_ID: DiagnosticV2StageId = "ENTRY_TWO_STEP";
export const FIRST_FRAC_STAGE_ID: DiagnosticV2StageId = "ENTRY_FRAC_SIMPLE";

export function itemStageOrderForTrack(track: DiagnosticV2Track): DiagnosticV2StageId[] {
  return track === "FRACTION_LINEAR" ? FRAC_ITEM_STAGE_ORDER : ITEM_STAGE_ORDER;
}

export function firstStageForTrack(track: DiagnosticV2Track): DiagnosticV2StageId {
  return track === "FRACTION_LINEAR" ? FIRST_FRAC_STAGE_ID : FIRST_STAGE_ID;
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
  }
}

export function stageForItem(item: DiagnosticV2Item): DiagnosticV2StageId {
  return item.stageId;
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
  ctx: { targetSkillFailed: boolean; patternConfirmed: boolean },
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
    case "ENTRY_FRAC_SIMPLE":
      return ["FRAC_CLEAR_MAIN"];
    case "FRAC_CLEAR_MAIN":
      return ctx.targetSkillFailed ? ["FRAC_CLEAR_CONTRAST"] : ["TRANSFER_FRAC_CLEAR"];
    case "FRAC_CLEAR_CONTRAST":
      return ctx.patternConfirmed
        ? ["RULE_PROMPT", "TRANSFER_FRAC_CLEAR"]
        : ["TRANSFER_FRAC_CLEAR"];
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
}

export function trackFromStageHistory(history: unknown): DiagnosticV2Track {
  if (!Array.isArray(history) || history.length === 0) return "NEGATIVE_DISTRIBUTION";
  const first = history[0] as StageHistoryEntry;
  if (first.track === "FRACTION_LINEAR" || first.track === "NEGATIVE_DISTRIBUTION") {
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
  item: DiagnosticV2Item;
}): { primary: MicroSkillId; supporting: MicroSkillId[] } {
  const fallback = {
    primary: input.item.primaryMicroSkillId,
    supporting: [...input.item.supportingMicroSkillIds],
  };

  const prev = tryParse(input.previousLine);
  const next = tryParse(input.submittedLine);
  if (!prev || !next) return fallback;

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

  // Fraction-track clearing: MULTIPLY_BOTH_SIDES on a line that still (or
  // just) involved fractions is evidence about LIN_CLEAR_FRACTIONS, not about
  // removing a coefficient after the equation is already integer.
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
};

const RETENTION_CHECK_TYPE = "MICRO_SKILL_RETENTION_CHECK";
const RETENTION_CHECK_DELAY_DAYS = 2;

/**
 * The catalogue's skill names are precise and unreadable to a 13-year-old
 * ("distribute a negative multiplier and preserve sign products"). These are
 * the same nine skills said out loud. Used for the summary and for the
 * interpreter's prompt, which is explicitly writing in a child's register.
 */
const CHILD_FACING_SKILL_NAMES: Record<MicroSkillId, string> = {
  FND_SIGN_MUL_DIV: "multiplying and dividing with minus signs",
  LIN_DISTRIBUTE_NEG: "expanding brackets that have a minus in front",
  LIN_DISTRIBUTE_POS: "expanding brackets",
  LIN_COMBINE_LIKE: "tidying up like terms",
  LIN_REMOVE_CONSTANT: "moving a number across the equals sign",
  LIN_REMOVE_COEFFICIENT: "dividing to get the letter on its own",
  LIN_SOLVE_TWO_STEP: "two-step equations",
  LIN_SOLVE_VARIABLE_BOTH: "equations with the letter on both sides",
  LIN_CHECK_SOLUTION: "checking an answer by putting it back in",
  FND_FRACTION_EQUIV: "writing the same fraction in a different way",
  FND_FRACTION_OPS: "working with fractions",
  LIN_CLEAR_FRACTIONS: "clearing fractions by multiplying both sides",
  LIN_SOLVE_FRACTIONS: "solving equations that have fractions in them",
};

export function childFacingSkillName(microSkillId: string): string {
  return CHILD_FACING_SKILL_NAMES[microSkillId as MicroSkillId] ?? "this skill";
}

/** Long lists stop being readable — name a few things the student did well, not all of them. */
const MAX_SKILLS_NAMED_IN_SUMMARY = 3;

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
  firstInvalidActionDescription: string | null;
  primaryMicroSkillId: string | null;
  topicId: string | null;
  competencyFamilyId: string | null;
  contextModifierIds: string[];
  assistanceLevel: AssistanceLevel;
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
    const openingReason =
      track === "FRACTION_LINEAR"
        ? "Opening item of the fraction-linear diagnostic track."
        : "Opening item of the fixed entry sequence.";

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

    return {
      sessionId: session.id,
      stageId: firstStage,
      ...attemptView(attempt.id, item),
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
    const submittedLine = body.submittedLine.trim();
    if (!declined && !submittedLine) {
      throw new BadRequestException("submittedLine is required unless dontKnow is set.");
    }

    const track = trackFromStageHistory(session.stageHistory);

    // 1. Deterministic verification — ground truth. Skipped entirely for a
    //    decline: there is no line to verify. Track picks the verifier module.
    const verification = declined
      ? null
      : verifyDiagnosticV2Step(expectedPreviousLine, submittedLine, track);
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
          item,
        });
    const contextModifierIds = contextModifiersForStep({
      assistanceLevel,
      isTransferCheck: item.isTransferCheck,
      finalAnswerOnly,
      hasFractions:
        track === "FRACTION_LINEAR" ||
        lineHasFractionSyntax(item.openingLine) ||
        lineHasFractionSyntax(expectedPreviousLine),
    });
    const layers = layersForMicroSkill(attribution.primary);
    const verifierVersion =
      track === "FRACTION_LINEAR" ? STEP_VERIFICATION_RULES_FRACTION_V1 : STEP_VERIFICATION_RULES_V1;

    // 4. Evidence. Unresolved lines produce none at all — an unreadable line is
    //    explicitly not a wrong line. A decline produces SKIPPED, which is a
    //    real, citable observation carrying zero weight: it moves no success or
    //    failure counter, so it can never push a skill toward LIKELY_GAP.
    const evidenceKind: MicroSkillEvidenceKind | null = declined
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
      validity === "INVALID" && attribution.primary === item.primaryMicroSkillId;
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
    const interpretation =
      stepEvidence && isInterestingPattern({
        kind: stepEvidence.kind,
        previousStatus: stepEvidence.previousStatus,
        nextStatus: stepEvidence.update.status,
      })
        ? await this.interpreter.interpret({
            studentId: session.studentId,
            sessionId,
            microSkillId: stepEvidence.microSkillId,
            microSkillName: childFacingSkillName(stepEvidence.microSkillId),
            counts: stepEvidence.update.counts,
            observedContextStrengths: stepEvidence.update.observedContextStrengths,
            observedContextGaps: stepEvidence.update.observedContextGaps,
            firstInvalidActionDescription: verification?.firstInvalidActionDescription,
          })
        : null;

    // 7. Route. Only computed once the item is done.
    const completedStage = stageForItem(item);

    let nextStageIds: DiagnosticV2StageId[] = [];
    let nextItem: DiagnosticV2Item | null = null;
    let selectorSource: "RULE" | "AI" = "RULE";
    let selectorReasoning: string | undefined;

    if (itemComplete) {
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
      });
      if (nextStageIds.includes("RULE_PROMPT")) {
        assistanceOffered = "RULE_PROMPT";
      }
      const nextItemStage = nextStageIds.find((s) => s !== "RULE_PROMPT" && s !== "COMPLETE");
      if (nextItemStage) {
        const selected = await this.selectNextItem({
          session: { id: sessionId, studentId: session.studentId },
          ruleStage: nextItemStage,
          track,
          lastStepSummary: summarizeStep(
            validity,
            verification?.firstInvalidActionDescription,
            attribution.primary,
          ),
        });
        nextItem = selected.item;
        selectorSource = selected.source;
        selectorReasoning = selected.reasoning;
        // The AI may serve a different (or freshly generated/authored) item;
        // the stage it occupies always comes from that item's stated stageId.
        nextStageIds = nextStageIds.map((s) =>
          s === nextItemStage ? stageForItem(selected.item) : s,
        );
      }
    }

    const sessionComplete = itemComplete && !nextItem;
    const now = new Date();
    const at = now.toISOString();
    const appendedHistory: StageHistoryEntry[] = nextStageIds.map((stageId) => ({
      stageId,
      source: stageId === "RULE_PROMPT" || stageId === "COMPLETE" ? "RULE" : selectorSource,
      ...(stageId === "RULE_PROMPT"
        ? { reasoning: "Same distribution error twice on structurally different problems — taught the sign rule before re-testing." }
        : stageId === "COMPLETE"
          ? { reasoning: "All planned items complete." }
          : selectorReasoning
            ? { reasoning: selectorReasoning }
            : {}),
      at,
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
            microSkillId: stepEvidence.microSkillId,
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
        ? { nextAttempt: attemptView(written.nextAttemptId, nextItem) }
        : {}),
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
      stageHistory: readStageHistory(session.stageHistory),
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
      steps: steps.map((s) => ({
        id: s.id,
        attemptId: s.attemptId,
        stepIndex: s.stepIndex,
        previousLine: s.previousLine,
        submittedLine: s.submittedLine,
        validity: s.validity,
        verificationSource: s.verificationSource,
        attemptedTransformation: s.attemptedTransformation,
        ...(s.firstInvalidActionDescription
          ? { firstInvalidActionDescription: s.firstInvalidActionDescription }
          : {}),
        ...(s.primaryMicroSkillId ? { primaryMicroSkillId: s.primaryMicroSkillId } : {}),
        ...(s.topicId ? { topicId: s.topicId } : {}),
        ...(s.competencyFamilyId ? { competencyFamilyId: s.competencyFamilyId } : {}),
        contextModifierIds: s.contextModifierIds,
        assistanceLevel: s.assistanceLevel,
      })),
      hypotheses: hypotheses.map((h) => ({
        microSkillId: h.microSkillId,
        hypothesisLabel: h.hypothesisLabel,
        confidence: h.confidence,
        reasoning: h.reasoning,
        source: h.source as HypothesisSource,
        ...(h.childFacingSummary ? { childFacingSummary: h.childFacingSummary } : {}),
      })),
      microSkillStates: states.map((st) => ({
        microSkillId: st.microSkillId,
        status: st.status as MicroSkillStatus,
        evidenceCount: st.evidenceCount,
        independentSuccessCount: st.independentSuccessCount,
        independentFailureCount: st.independentFailureCount,
        assistedSuccessCount: st.assistedSuccessCount,
        observedContextStrengths: st.observedContextStrengths,
        observedContextGaps: st.observedContextGaps,
      })),
    };
  }

  async getSummary(sessionId: string): Promise<DiagnosticV2SummaryResponse> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Diagnostic session not found.");

    const states = await this.prisma.microSkillStateV2.findMany({
      where: { studentId: session.studentId },
      orderBy: { microSkillId: "asc" },
    });
    const hypotheses = await this.prisma.diagnosticV2Hypothesis.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    return {
      sessionId,
      status: session.status as DiagnosticV2SessionStatus,
      childFacingSummary: buildChildFacingSummary(
        states.map((s) => ({ microSkillId: s.microSkillId, status: s.status as MicroSkillStatus })),
        hypotheses.map((h) => ({
          microSkillId: h.microSkillId,
          childFacingSummary: h.childFacingSummary,
        })),
      ),
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

  private async selectNextItem(input: {
    session: { id: string; studentId: string };
    ruleStage: DiagnosticV2StageId;
    track: DiagnosticV2Track;
    lastStepSummary: string;
  }): Promise<{ item: DiagnosticV2Item; source: "RULE" | "AI"; reasoning?: string }> {
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
    const candidateItems = unserved.some((i) => i.itemKey === rulePick.itemKey)
      ? unserved
      : [rulePick, ...unserved];
    const ruleSelectedIndex = candidateItems.findIndex((i) => i.itemKey === rulePick.itemKey);

    const candidates: SelectorCandidate[] = candidateItems.map((item) => ({
      item,
      legalityReason:
        item.itemKey === rulePick.itemKey
          ? "next item in the fixed diagnostic sequence"
          : "a planned item for this session that has not been shown yet",
    }));

    const attempts = await this.prisma.diagnosticV2Attempt.findMany({
      where: { sessionId: input.session.id },
      orderBy: { createdAt: "asc" },
    });

    const skillLines = await this.buildSelectorSkillLines(
      input.session.studentId,
      input.session.id,
    );

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
      recentAuthorLatenciesMs: [...this.recentAuthorLatenciesMs],
    });

    if (result.authorLatencyMs !== undefined) {
      this.recentAuthorLatenciesMs.push(result.authorLatencyMs);
      if (this.recentAuthorLatenciesMs.length > 40) this.recentAuthorLatenciesMs.shift();
    }

    if (result.discardedGeneration) {
      this.logger.warn(
        `Discarded an AI-generated/authored item for session ${input.session.id}: ${result.discardedGeneration}`,
      );
    }
    return { item: result.item, source: result.source, reasoning: result.reasoning };
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

    return states.map((s) => {
      const recent = recentInvalidSteps.find((st) => st.primaryMicroSkillId === s.microSkillId);
      const hyp = hypotheses.find((h) => h.microSkillId === s.microSkillId);
      const line: SelectorSkillLine = {
        microSkillId: s.microSkillId,
        status: s.status,
        independentSuccessCount: s.independentSuccessCount,
        independentFailureCount: s.independentFailureCount,
        assistedSuccessCount: s.assistedSuccessCount,
        observedContextStrengths: s.observedContextStrengths,
        observedContextGaps: s.observedContextGaps,
        scope: touchedThisSession.has(s.microSkillId) ? "this session" : "earlier",
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
    });
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
function attemptView(attemptId: string, item: DiagnosticV2Item): DiagnosticV2AttemptView {
  return {
    attemptId,
    itemKey: item.itemKey,
    equationPrompt: item.prompt,
    openingLine: item.openingLine,
  };
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
    templateId === "TPL_TRANSFER_NEG_DISTRIBUTION" ||
    templateId === "TPL_TRANSFER_FRAC_CLEAR";

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
    v === "TRANSFER_FRAC_CLEAR"
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
  if (item.isBareExpression) return !submittedLine.includes("(");
  const parsed = tryParse(submittedLine);
  return parsed ? isSolvedForm(parsed) : false;
}

function normalizeWhitespace(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function summarizeStep(
  validity: StepValidity | null,
  firstInvalidActionDescription: string | undefined,
  microSkillId: string,
): string {
  if (validity === null) return `the student said they did not know how to start ${microSkillId}`;
  if (validity === "VALID") return `the last line was correct, working on ${microSkillId}`;
  if (validity === "INVALID") {
    return `the last line was incorrect on ${microSkillId}${
      firstInvalidActionDescription ? ` — ${firstInvalidActionDescription}` : ""
    }`;
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

/**
 * Deterministic, never a model call: the summary is assembled from the
 * hypotheses that were already written (AI- or rule-authored), so this endpoint
 * stays fast and cannot introduce new unreviewed student-facing text.
 */
export function buildChildFacingSummary(
  states: Array<{ microSkillId: string; status: MicroSkillStatus }>,
  hypotheses: Array<{ microSkillId: string; childFacingSummary: string | null }>,
): string {
  // RELIABLE first: if the list has to be trimmed, keep the strongest evidence.
  const solid = [
    ...states.filter((s) => s.status === "RELIABLE"),
    ...states.filter((s) => s.status === "DEVELOPING"),
  ]
    .slice(0, MAX_SKILLS_NAMED_IN_SUMMARY)
    .map((s) => childFacingSkillName(s.microSkillId));
  const gaps = states.filter((s) => s.status === "LIKELY_GAP");

  const parts: string[] = [];
  if (solid.length > 0) {
    parts.push(`You handled ${joinWords(solid)} on your own today.`);
  } else {
    parts.push("Thanks for working through those questions.");
  }

  for (const gap of gaps) {
    const latest = [...hypotheses].reverse().find((h) => h.microSkillId === gap.microSkillId);
    parts.push(
      latest?.childFacingSummary ??
        `Next time we'll spend a bit of time on ${childFacingSkillName(gap.microSkillId)}.`,
    );
  }

  if (gaps.length > 0) {
    parts.push("We'll come back to it in a few days to make sure it stuck.");
  }

  return parts.join(" ");
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
