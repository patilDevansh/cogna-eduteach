/**
 * Phase B1 — fraction-linear step verifier.
 *
 * Reuses the rational linear parser / solution-set equivalence from
 * linear-bracket-verifier.ts. Owns only what that module does not: recognising
 * a clear-denominators move as MULTIPLY_BOTH_SIDES, and localizing the common
 * clearing mistakes (wrong LCD, dropped term, sign flip) that otherwise all
 * collapse to generic NOT_EQUIVALENT.
 *
 * AUTHOR is out of scope for B1 — this file exists so templates can be
 * independently re-checked and so student steps on the fraction track get
 * teachable first-invalid codes.
 */
import type { StepTransformation, StepValidity } from "@cogna/shared";
import {
  foldMinusLookalikes,
  normalizeLine,
  parseLinearWithBracket,
  rat,
  ratToString,
  type LinearForm,
  type ParsedLine,
  type Rational,
  type StepVerification,
  verifyStepValidity,
  classifyTransformation as classifyLinearTransformation,
  findFirstInvalidAction as findLinearFirstInvalidAction,
} from "./linear-bracket-verifier";

export const FRACTION_VERIFIER_VERSION = "fraction-linear-verifier-v1";

// ─── Rational helpers (local — linear-bracket keeps add/sub/mul/div private) ─

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

function ratEq(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

function ratIsZero(a: Rational): boolean {
  return a.n === 0;
}

function ratMul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

function ratAdd(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

function ratSub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

function scaleForm(f: LinearForm, k: Rational): LinearForm {
  return { a: ratMul(f.a, k), b: ratMul(f.b, k), variable: f.variable };
}

function formsEq(l: LinearForm, r: LinearForm): boolean {
  return ratEq(l.a, r.a) && ratEq(l.b, r.b);
}

function equationFormsEq(prev: ParsedLine, next: ParsedLine): boolean {
  if (!prev.rhs || !next.rhs) return false;
  return formsEq(prev.lhs, next.lhs) && formsEq(prev.rhs, next.rhs);
}

/** True when the raw line uses `/` (fraction syntax), after minus-lookalike fold. */
export function lineHasFractionSyntax(raw: string): boolean {
  return foldMinusLookalikes(raw).includes("/");
}

/** Denominators > 1 appearing in any coefficient of the parsed line. */
export function denominatorsOf(parsed: ParsedLine): number[] {
  const dens = new Set<number>();
  const consider = (f: LinearForm) => {
    if (f.a.d > 1) dens.add(f.a.d);
    if (f.b.d > 1) dens.add(f.b.d);
  };
  consider(parsed.lhs);
  if (parsed.rhs) consider(parsed.rhs);
  return [...dens].sort((a, b) => a - b);
}

export function lineHasFractionalCoefficients(parsed: ParsedLine): boolean {
  return denominatorsOf(parsed).length > 0;
}

function lcdOf(dens: number[]): number {
  return dens.reduce((acc, d) => lcm(acc, d), 1);
}

/** Multiply every term of an equation by k (both sides). */
function clearBy(parsed: ParsedLine, k: number): ParsedLine | null {
  if (!parsed.rhs) return null;
  const factor = rat(k);
  return {
    lhs: scaleForm(parsed.lhs, factor),
    rhs: scaleForm(parsed.rhs, factor),
    variable: parsed.variable,
    hadBracket: parsed.hadBracket,
    lhsTermCount: parsed.lhsTermCount,
    rhsTermCount: parsed.rhsTermCount,
  };
}

/**
 * Heuristic: previous had fractional coefficients, next does not (or has
 * fewer), and the coefficient magnitude grew — student attempted to clear.
 */
function looksLikeClearAttempt(prev: ParsedLine, next: ParsedLine): boolean {
  if (!prev.rhs || !next.rhs) return false;
  if (!lineHasFractionalCoefficients(prev)) return false;
  const prevDens = denominatorsOf(prev);
  const nextDens = denominatorsOf(next);
  if (nextDens.length >= prevDens.length && nextDens.length > 0) return false;
  // Coefficient on x grew in absolute value, or constant terms scaled up.
  const prevMag = Math.abs(prev.lhs.a.n / prev.lhs.a.d) + Math.abs(prev.rhs.a.n / prev.rhs.a.d);
  const nextMag = Math.abs(next.lhs.a.n / next.lhs.a.d) + Math.abs(next.rhs.a.n / next.rhs.a.d);
  return nextMag > prevMag + 1e-9;
}

/**
 * Classify a fraction-track step. A successful (or attempted) clear of
 * denominators is MULTIPLY_BOTH_SIDES — the linear classifier mis-labels this
 * as DIVIDE_BOTH_SIDES because the x-coefficient grows rather than shrinks.
 */
export function classifyFractionTransformation(
  prev: ParsedLine,
  next: ParsedLine,
): StepTransformation {
  if (looksLikeClearAttempt(prev, next)) return "MULTIPLY_BOTH_SIDES";
  if (
    lineHasFractionalCoefficients(prev) &&
    !lineHasFractionalCoefficients(next) &&
    prev.rhs &&
    next.rhs
  ) {
    return "MULTIPLY_BOTH_SIDES";
  }
  return classifyLinearTransformation(prev, next);
}

function almostNegated(expected: ParsedLine, next: ParsedLine): boolean {
  if (!expected.rhs || !next.rhs) return false;
  const neg = clearBy(expected, -1);
  return neg !== null && equationFormsEq(neg, next);
}

function missingConstantRelativeTo(expected: ParsedLine, next: ParsedLine): boolean {
  if (!expected.rhs || !next.rhs) return false;
  // Same variable coefficients, different constants → a constant was dropped
  // or altered while the variable pieces look like a clear.
  const varMatch =
    ratEq(expected.lhs.a, next.lhs.a) && ratEq(expected.rhs.a, next.rhs.a);
  if (!varMatch) return false;
  const constDiffer =
    !ratEq(expected.lhs.b, next.lhs.b) || !ratEq(expected.rhs.b, next.rhs.b);
  if (!constDiffer) return false;
  // Dropped: next's constant magnitude is strictly smaller on a side that had a non-zero expected constant.
  const droppedLhs =
    !ratIsZero(expected.lhs.b) &&
    Math.abs(next.lhs.b.n / next.lhs.b.d) < Math.abs(expected.lhs.b.n / expected.lhs.b.d) - 1e-9;
  const droppedRhs =
    !ratIsZero(expected.rhs.b) &&
    Math.abs(next.rhs.b.n / next.rhs.b.d) < Math.abs(expected.rhs.b.n / expected.rhs.b.d) - 1e-9;
  return droppedLhs || droppedRhs;
}

/**
 * Classic Grade-8 mistake on (x+1)/2 = (x-1)/3 + 1: use 2 on the left and 3
 * on the right (each side by "its" denominator) instead of LCD 6 on both.
 * After parsing, that shows up as the variable coefficients being swapped
 * relative to the correctly cleared form (expected lhs.a=3, rhs.a=2; wrong
 * next has lhs.a=2, rhs.a=3).
 */
function matchesSwappedClearMultipliers(
  expected: ParsedLine,
  next: ParsedLine,
  dens: number[],
): boolean {
  if (!expected.rhs || !next.rhs || dens.length !== 2) return false;
  return (
    ratEq(expected.lhs.a, next.rhs.a) &&
    ratEq(expected.rhs.a, next.lhs.a) &&
    !ratEq(expected.lhs.a, next.lhs.a)
  );
}

export function findFirstInvalidFractionAction(
  previousLineRaw: string,
  prev: ParsedLine,
  next: ParsedLine,
): { firstInvalidActionCode?: string; firstInvalidActionDescription?: string } {
  const dens = denominatorsOf(prev);
  const hadFractions = dens.length > 0 || lineHasFractionSyntax(previousLineRaw);

  if (hadFractions && prev.rhs && next.rhs) {
    if (lineHasFractionalCoefficients(next) && looksLikeClearAttempt(prev, next) === false) {
      // Still fractional and not equivalent — may be an incomplete clear.
      if (denominatorsOf(next).length > 0 && denominatorsOf(next).length <= dens.length) {
        return {
          firstInvalidActionCode: "FRACTION_NOT_CLEARED",
          firstInvalidActionDescription:
            "a denominator is still present — both sides need multiplying by a common multiple that clears every fraction",
        };
      }
    }

    const lcd = lcdOf(dens.length > 0 ? dens : [2]);
    const expected = dens.length > 0 ? clearBy(prev, lcd) : null;

    if (expected && almostNegated(expected, next)) {
      return {
        firstInvalidActionCode: "SIGN_ERROR_AFTER_CLEARING",
        firstInvalidActionDescription: `clearing by ${lcd} flipped a sign — multiplying both sides by ${lcd} should keep the same signs on each term`,
      };
    }

    if (expected && missingConstantRelativeTo(expected, next)) {
      return {
        firstInvalidActionCode: "DROPPED_TERM_WHEN_CLEARING",
        firstInvalidActionDescription: `when clearing denominators by multiplying by ${lcd}, every term on both sides must be multiplied — a constant term was dropped`,
      };
    }

    if (expected && dens.length === 2 && matchesSwappedClearMultipliers(expected, next, dens)) {
      return {
        firstInvalidActionCode: "WRONG_COMMON_MULTIPLE",
        firstInvalidActionDescription: `each side was multiplied by a different denominator (${dens[0]} and ${dens[1]}) — both sides need the same common multiple (${lcd})`,
      };
    }

    // Sign flip that isn't exactly -expected but flipped one side's leading sign.
    // Must run before the generic wrong-multiple near-miss, or |3| vs |-3| gets
    // mis-labelled as a wrong LCD.
    if (expected && looksLikeClearAttempt(prev, next)) {
      const lhsSignFlip =
        expected.lhs.a.n * next.lhs.a.n < 0 &&
        Math.abs(expected.lhs.a.n) * next.lhs.a.d === Math.abs(next.lhs.a.n) * expected.lhs.a.d;
      if (lhsSignFlip) {
        return {
          firstInvalidActionCode: "SIGN_ERROR_AFTER_CLEARING",
          firstInvalidActionDescription: `clearing introduced a sign error on the left side — multiplying by ${lcd} should not flip the sign of the ${prev.variable ?? "x"} term`,
        };
      }
    }

    // Near-miss on LCD clear: variable coeffs match expected but constants wrong
    // in a way that isn't a pure drop (e.g. constant not scaled).
    if (expected && looksLikeClearAttempt(prev, next)) {
      const varLhsOk = ratEq(expected.lhs.a, next.lhs.a);
      const varRhsOk = ratEq(expected.rhs!.a, next.rhs.a);
      if (varLhsOk && varRhsOk && !equationFormsEq(expected, next)) {
        return {
          firstInvalidActionCode: "DROPPED_TERM_WHEN_CLEARING",
          firstInvalidActionDescription: `when clearing denominators by multiplying by ${lcd}, every term on both sides must be multiplied — a term was lost or under-scaled`,
        };
      }
      if (!varLhsOk || !varRhsOk) {
        return {
          firstInvalidActionCode: "WRONG_COMMON_MULTIPLE",
          firstInvalidActionDescription: `the multipliers used when clearing are not a valid common multiple of the denominators ${dens.join(", ")} (need ${lcd} on every term)`,
        };
      }
    }
  }

  // Fall back to the linear-bracket localizer (distribution etc.) then generic.
  const linear = findLinearFirstInvalidAction(previousLineRaw, prev, next);
  if (linear.firstInvalidActionCode && linear.firstInvalidActionCode !== "NOT_EQUIVALENT") {
    return linear;
  }
  return {
    firstInvalidActionCode: "NOT_EQUIVALENT",
    firstInvalidActionDescription: "this line does not have the same solution as the line above it",
  };
}

/**
 * Same contract as verifyStepValidity, but with fraction-aware transformation
 * classification and first-invalid codes. Equivalence is still solution-set
 * identity from the shared parser — AI never decides validity here.
 */
export function verifyFractionStepValidity(
  previousLine: string,
  submittedLine: string,
): StepVerification {
  // Reuse parse / abstention / equivalence path from the linear verifier, then
  // overwrite transformation + first-invalid with fraction-aware versions.
  const base = verifyStepValidity(previousLine, submittedLine);
  if (base.validity === "PARSE_FAILED" || base.validity === "AMBIGUOUS") {
    return base;
  }

  let prev: ParsedLine;
  let next: ParsedLine;
  try {
    prev = parseLinearWithBracket(previousLine);
    next = parseLinearWithBracket(submittedLine);
  } catch {
    return base;
  }

  const transformation = classifyFractionTransformation(prev, next);
  const normalizedPreviousLine = normalizeLine(prev);
  const normalizedSubmittedLine = normalizeLine(next);

  if (base.validity === "VALID") {
    return {
      validity: "VALID",
      transformation,
      normalizedPreviousLine,
      normalizedSubmittedLine,
    };
  }

  const firstInvalid = findFirstInvalidFractionAction(previousLine, prev, next);
  return {
    validity: "INVALID" satisfies StepValidity,
    transformation,
    normalizedPreviousLine,
    normalizedSubmittedLine,
    ...firstInvalid,
  };
}

/** Independent re-solve display helper for fraction templates (integer solutions only in B1). */
export function solveFractionEquationForDisplay(line: string, variable: string): string | null {
  let parsed: ParsedLine;
  try {
    parsed = parseLinearWithBracket(line);
  } catch {
    return null;
  }
  if (!parsed.rhs) return null;
  const a = ratSub(parsed.lhs.a, parsed.rhs.a);
  const b = ratSub(parsed.rhs.b, parsed.lhs.b);
  if (ratIsZero(a)) return null;
  // x = b / a
  const value = rat(b.n * a.d, b.d * a.n);
  if (value.d !== 1) return null; // B1 templates require integer solutions
  return `${variable} = ${ratToString(value)}`;
}
