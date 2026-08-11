/**
 * Debug-only provenance builders for the diagnostic-v2 session debug view.
 * Pure reconstruction from stored step columns + a re-run of the deterministic
 * verifier — never changes grading, evidence, or route.
 */
import type {
  DiagnosticV2StepProvenance,
  DiagnosticV2Track,
  StepValidity,
  StepTransformation,
  VerificationSource,
} from "@cogna/shared";
import { VERIFIER_VERSION } from "./linear-bracket-verifier";
import { solveLineForDisplay } from "./linear-bracket-verifier";
import { FRACTION_VERIFIER_VERSION } from "./fraction-linear-verifier";
import { IDENTITY_VERIFIER_VERSION } from "./identity-expr-verifier";
import { FACTOR_VERIFIER_VERSION } from "./factor-trinomial-verifier";
import { QUADRATIC_VERIFIER_VERSION } from "./quadratic-zero-product-verifier";
import {
  effectiveVerifierTrack,
  verifyDiagnosticV2Step,
} from "./diagnostic-v2-verifier-router";

export function verifierVersionForGrammar(
  grammar: Exclude<DiagnosticV2Track, "COMBINED_ALGEBRA">,
): string {
  switch (grammar) {
    case "FRACTION_LINEAR":
      return FRACTION_VERIFIER_VERSION;
    case "IDENTITY_DIFF_SQUARES":
      return IDENTITY_VERIFIER_VERSION;
    case "FACTOR_MONIC_TRINOMIAL":
      return FACTOR_VERIFIER_VERSION;
    case "QUAD_ZERO_PRODUCT":
      return QUADRATIC_VERIFIER_VERSION;
    default:
      return VERIFIER_VERSION;
  }
}

/**
 * Rebuild step provenance from stored columns + a deterministic re-verify.
 * The re-verify is what recovers `parseError` and the abstention outcome after
 * the AI grader (or bare-answer path) may have overwritten `validity` on the row.
 */
export function buildStepProvenance(input: {
  previousLine: string;
  submittedLine: string;
  track: DiagnosticV2Track;
  stageId: string;
  storedValidity: StepValidity;
  verificationSource: VerificationSource;
  aiGraderConfidence: number | null;
  storedFirstInvalidActionCode?: string | null;
  storedFirstInvalidActionDescription?: string | null;
  handedToAi: DiagnosticV2StepProvenance["handedToAi"];
}): DiagnosticV2StepProvenance {
  const grammar = effectiveVerifierTrack(input.track, input.stageId);
  const rule = verifyDiagnosticV2Step(
    input.previousLine,
    input.submittedLine,
    input.track,
    input.stageId,
  );
  const abstained = rule.validity === "PARSE_FAILED" || rule.validity === "AMBIGUOUS";
  const previousSolution = solveLineForDisplay(input.previousLine);
  const submittedSolution = solveLineForDisplay(input.submittedLine);

  const ruleAnalysis: DiagnosticV2StepProvenance["ruleAnalysis"] = {
    ...(rule.normalizedPreviousLine
      ? { normalizedPreviousLine: rule.normalizedPreviousLine }
      : {}),
    ...(rule.normalizedSubmittedLine
      ? { normalizedSubmittedLine: rule.normalizedSubmittedLine }
      : {}),
    ...(previousSolution ? { previousSolution } : {}),
    ...(submittedSolution ? { submittedSolution } : {}),
    outcome: abstained ? "ABSTAINED" : "DECIDED",
    validity: rule.validity,
    transformation: rule.transformation as StepTransformation,
    ...(rule.firstInvalidActionCode
      ? { firstInvalidActionCode: rule.firstInvalidActionCode }
      : {}),
    ...(rule.firstInvalidActionDescription
      ? { firstInvalidActionDescription: rule.firstInvalidActionDescription }
      : {}),
    ...(abstained && rule.parseError ? { parseError: rule.parseError } : {}),
  };

  let aiGraderFallback: DiagnosticV2StepProvenance["aiGraderFallback"] = null;
  if (input.verificationSource === "AI_FALLBACK") {
    aiGraderFallback = {
      whyItRan: rule.parseError
        ? `verifier ${rule.validity}; bare-answer check did not resolve (${rule.parseError})`
        : `verifier ${rule.validity}; bare-answer check did not resolve`,
      validity: input.storedValidity,
      confidence: input.aiGraderConfidence,
      ...(input.storedFirstInvalidActionDescription
        ? { reasoning: input.storedFirstInvalidActionDescription }
        : {}),
    };
  }

  return {
    input: {
      previousLine: input.previousLine,
      submittedLine: input.submittedLine,
      verifierVersion: verifierVersionForGrammar(grammar),
      resolvedGrammar: grammar,
      resolvedFromStageId: input.stageId,
    },
    ruleAnalysis,
    handedToAi: input.handedToAi,
    aiGraderFallback,
  };
}

/** Human route reason for the rules' next stage — captured at selection time. */
export function describeRouteReason(input: {
  completedStageId: string;
  ruleStageId: string;
  targetSkillFailed: boolean;
  patternConfirmed: boolean;
}): string {
  const { completedStageId, ruleStageId, targetSkillFailed, patternConfirmed } = input;
  if (targetSkillFailed && ruleStageId.includes("CONTRAST")) {
    return `target skill failed at ${completedStageId} -> contrast probe`;
  }
  if (patternConfirmed && ruleStageId.startsWith("TRANSFER_")) {
    return `pattern confirmed after ${completedStageId} -> transfer check`;
  }
  if (!targetSkillFailed && ruleStageId.startsWith("TRANSFER_")) {
    return `target skill held at ${completedStageId} -> transfer check`;
  }
  if (completedStageId === "PREREQ_SIGN_PROBE") {
    return `prerequisite probe complete -> resume ${ruleStageId}`;
  }
  return `backbone advance ${completedStageId} -> ${ruleStageId}`;
}
