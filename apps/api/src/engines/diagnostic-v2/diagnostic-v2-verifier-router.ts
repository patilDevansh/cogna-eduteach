/**
 * Picks the step verifier by diagnostic track / item grammar.
 * Negative-distribution stays on linear-bracket-verifier; fraction track uses
 * fraction-linear-verifier. Never one mega-parser.
 *
 * COMBINED_ALGEBRA resolves to a solo-track grammar from the current stageId
 * so each enabled topic keeps its own verifier while the combined session advances.
 */
import type { DiagnosticV2Track } from "@cogna/shared";
import {
  verifyStepValidity,
  checkBareFinalAnswer,
  type StepVerification,
  type BareAnswerCheck,
} from "./linear-bracket-verifier";
import { verifyFractionStepValidity } from "./fraction-linear-verifier";
import { verifyIdentityStepValidity } from "./identity-expr-verifier";
import { verifyFactorStepValidity } from "./factor-trinomial-verifier";
import { verifyQuadraticStepValidity } from "./quadratic-zero-product-verifier";

/** Map a combined-session stage onto the solo track that owns that grammar. */
export function effectiveVerifierTrack(
  track: DiagnosticV2Track,
  stageId?: string | null,
): Exclude<DiagnosticV2Track, "COMBINED_ALGEBRA"> {
  if (track !== "COMBINED_ALGEBRA") {
    return track;
  }
  const stage = stageId ?? "";
  if (
    stage.startsWith("FRAC_") ||
    stage === "ENTRY_FRAC_SIMPLE" ||
    stage === "TRANSFER_FRAC_CLEAR"
  ) {
    return "FRACTION_LINEAR";
  }
  if (
    stage.startsWith("ID_") ||
    stage === "ENTRY_EXPAND_BINOMIAL" ||
    stage === "TRANSFER_ID_DIFF"
  ) {
    return "IDENTITY_DIFF_SQUARES";
  }
  if (
    stage.startsWith("FAC_") ||
    stage === "ENTRY_FACTOR_EXPAND" ||
    stage === "TRANSFER_FAC_NONMONIC"
  ) {
    return "FACTOR_MONIC_TRINOMIAL";
  }
  if (
    stage.startsWith("QUAD_") ||
    stage === "ENTRY_QUAD_STANDARD" ||
    stage === "TRANSFER_QUAD_ZP"
  ) {
    return "QUAD_ZERO_PRODUCT";
  }
  return "NEGATIVE_DISTRIBUTION";
}

export function verifyDiagnosticV2Step(
  previousLine: string,
  submittedLine: string,
  track: DiagnosticV2Track,
  stageId?: string | null,
): StepVerification {
  const effective = effectiveVerifierTrack(track, stageId);
  if (effective === "FRACTION_LINEAR") {
    return verifyFractionStepValidity(previousLine, submittedLine);
  }
  if (effective === "IDENTITY_DIFF_SQUARES") {
    return verifyIdentityStepValidity(previousLine, submittedLine);
  }
  if (effective === "FACTOR_MONIC_TRINOMIAL") {
    return verifyFactorStepValidity(previousLine, submittedLine);
  }
  if (effective === "QUAD_ZERO_PRODUCT") {
    return verifyQuadraticStepValidity(previousLine, submittedLine);
  }
  return verifyStepValidity(previousLine, submittedLine);
}

export function checkBareFinalAnswerForTrack(
  previousLine: string,
  submittedLine: string,
  _track: DiagnosticV2Track,
): BareAnswerCheck {
  // Bare numeric answers share the same arithmetic solve path.
  return checkBareFinalAnswer(previousLine, submittedLine);
}
