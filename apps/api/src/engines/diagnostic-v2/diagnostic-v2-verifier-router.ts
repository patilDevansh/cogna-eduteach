/**
 * Picks the step verifier by diagnostic track / item grammar.
 * Negative-distribution stays on linear-bracket-verifier; fraction track uses
 * fraction-linear-verifier. Never one mega-parser.
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

export function verifyDiagnosticV2Step(
  previousLine: string,
  submittedLine: string,
  track: DiagnosticV2Track,
): StepVerification {
  if (track === "FRACTION_LINEAR") {
    return verifyFractionStepValidity(previousLine, submittedLine);
  }
  if (track === "IDENTITY_DIFF_SQUARES") {
    return verifyIdentityStepValidity(previousLine, submittedLine);
  }
  if (track === "FACTOR_MONIC_TRINOMIAL") {
    return verifyFactorStepValidity(previousLine, submittedLine);
  }
  if (track === "QUAD_ZERO_PRODUCT") {
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
