import type { VideoMathClaim } from "@cogna/shared";
import {
  normalizeLine,
  parseLinearWithBracket,
  verifyStepValidity,
} from "../engines/diagnostic-v2/linear-bracket-verifier";
import { evaluateArithmetic } from "../lotus/lotus-math";

export interface MathValidationResult {
  valid: boolean;
  errors: string[];
  claimsChecked: number;
}

function numbersClose(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

function validateArithmetic(claim: Extract<VideoMathClaim, { kind: "ARITHMETIC" }>): string | null {
  try {
    const actual = evaluateArithmetic(claim.expression);
    if (!numbersClose(actual, claim.expected)) {
      return `Arithmetic claim failed: ${claim.expression} evaluated to ${actual}, expected ${claim.expected}.`;
    }
    return null;
  } catch (error) {
    return `Arithmetic claim could not be evaluated (${claim.expression}): ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function validateAlgebra(
  claim: Extract<VideoMathClaim, { kind: "ALGEBRA_EQUIVALENCE" }>,
): string | null {
  try {
    const left = normalizeLine(parseLinearWithBracket(claim.left));
    const right = normalizeLine(parseLinearWithBracket(claim.right));
    if (left !== right) {
      return `Algebraic equivalence failed: ${claim.left} normalizes to ${left}, but ${claim.right} normalizes to ${right}.`;
    }
    return null;
  } catch (error) {
    return `Algebraic claim could not be parsed (${claim.left} → ${claim.right}): ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function validateEquation(
  claim: Extract<VideoMathClaim, { kind: "EQUATION_TRANSFORMATION" }>,
): string | null {
  const result = verifyStepValidity(claim.from, claim.to);
  if (result.validity !== "VALID") {
    return `Equation transformation is not deterministically valid (${claim.from} → ${claim.to}): ${result.validity}${
      result.parseError ? ` (${result.parseError})` : ""
    }.`;
  }
  return null;
}

export function validateMathClaims(claims: VideoMathClaim[] | undefined): MathValidationResult {
  const errors: string[] = [];
  const list = claims ?? [];
  for (const claim of list) {
    const error =
      claim.kind === "ARITHMETIC"
        ? validateArithmetic(claim)
        : claim.kind === "ALGEBRA_EQUIVALENCE"
          ? validateAlgebra(claim)
          : validateEquation(claim);
    if (error) errors.push(error);
  }
  return {
    valid: errors.length === 0,
    errors,
    claimsChecked: list.length,
  };
}

export function collectSceneClaims(
  scenes: Array<{ claims?: VideoMathClaim[] }>,
): VideoMathClaim[] {
  return scenes.flatMap((scene) => scene.claims ?? []);
}
