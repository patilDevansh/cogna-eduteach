/**
 * Phase B2 — difference-of-squares / binomial-expand verifier.
 *
 * Thin grammar: products of two linear binomials, and quadratic monomials
 * `ax^2 + bx + c` (usually a=1). Slash/fraction syntax is out of scope.
 */
import type { StepTransformation, StepValidity } from "@cogna/shared";
import { foldMinusLookalikes } from "./linear-bracket-verifier";
import type { StepVerification } from "./linear-bracket-verifier";

export const IDENTITY_VERIFIER_VERSION = "identity-expr-verifier-v1";

export interface ExpandedQuadratic {
  a: number; // coeff of x^2
  b: number; // coeff of x
  c: number; // constant
  variable: string;
}

export interface BinomialProduct {
  variable: string;
  leftConst: number;
  rightConst: number;
}

function normalize(raw: string): string {
  return foldMinusLookalikes(raw)
    .replace(/\s+/g, "")
    .replace(/·/g, "*")
    .replace(/\u00d7/g, "*");
}

/** Parse `(x+3)(x-3)` / `(x + 3)(x - 3)`. */
export function parseBinomialProduct(raw: string): BinomialProduct | null {
  const s = normalize(raw);
  const m = /^\(([a-z])([+-]\d+)\)\(([a-z])([+-]\d+)\)$/i.exec(s);
  if (!m) return null;
  if (m[1]!.toLowerCase() !== m[3]!.toLowerCase()) return null;
  return {
    variable: m[1]!.toLowerCase(),
    leftConst: Number(m[2]),
    rightConst: Number(m[4]),
  };
}

/** Parse `x^2-9`, `x^2+5x+6`, `x^2 + 5x + 6`. */
export function parseExpandedQuadratic(raw: string): ExpandedQuadratic | null {
  const s = normalize(raw);
  const withMiddle = /^([a-z])\^2([+-]\d+)\1([+-]\d+)$/i.exec(s);
  if (withMiddle) {
    return {
      a: 1,
      b: Number(withMiddle[2]),
      c: Number(withMiddle[3]),
      variable: withMiddle[1]!.toLowerCase(),
    };
  }
  const noMiddle = /^([a-z])\^2([+-]\d+)$/i.exec(s);
  if (noMiddle) {
    return {
      a: 1,
      b: 0,
      c: Number(noMiddle[2]),
      variable: noMiddle[1]!.toLowerCase(),
    };
  }
  const bare = /^([a-z])\^2$/i.exec(s);
  if (bare) {
    return { a: 1, b: 0, c: 0, variable: bare[1]!.toLowerCase() };
  }
  return null;
}

function expandProduct(p: BinomialProduct): ExpandedQuadratic {
  return {
    a: 1,
    b: p.leftConst + p.rightConst,
    c: p.leftConst * p.rightConst,
    variable: p.variable,
  };
}

function quadsEq(l: ExpandedQuadratic, r: ExpandedQuadratic): boolean {
  return l.a === r.a && l.b === r.b && l.c === r.c && l.variable === r.variable;
}

function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

function formatQuad(q: ExpandedQuadratic): string {
  const v = q.variable;
  let s = `${v}^2`;
  if (q.b !== 0) s += q.b > 0 ? `+${q.b}${v}` : `${q.b}${v}`;
  if (q.c !== 0) s += q.c > 0 ? `+${q.c}` : `${q.c}`;
  return s;
}

/**
 * Verify a student step on the identity track.
 * Supports: expand binomial product → quadratic; factor difference of squares → product.
 */
export function verifyIdentityStepValidity(
  previousLine: string,
  submittedLine: string,
): StepVerification {
  const prevN = normalize(previousLine);
  const nextN = normalize(submittedLine);
  if (!prevN || !nextN) {
    return {
      validity: "PARSE_FAILED",
      transformation: "UNKNOWN",
      parseError: "empty line",
    };
  }

  const prevProduct = parseBinomialProduct(previousLine);
  const nextQuad = parseExpandedQuadratic(submittedLine);
  const prevQuad = parseExpandedQuadratic(previousLine);
  const nextProduct = parseBinomialProduct(submittedLine);

  // Expand: (x+a)(x+b) → quadratic
  if (prevProduct && nextQuad) {
    const expected = expandProduct(prevProduct);
    if (quadsEq(expected, nextQuad)) {
      return {
        validity: "VALID",
        transformation: "OTHER",
        normalizedPreviousLine: prevN,
        normalizedSubmittedLine: nextN,
      };
    }
    // Wrong expansion — classify
    if (nextQuad.a !== 1 || nextQuad.variable !== expected.variable) {
      return invalid("DROPPED_SQUARE", "the x² term is missing or wrong", prevN, nextN);
    }
    if (
      prevProduct.leftConst === -prevProduct.rightConst &&
      nextQuad.b !== 0
    ) {
      return invalid(
        "WRONG_MIDDLE_SIGN",
        "difference of squares expands to no middle term (x² − constant), but a middle term appeared",
        prevN,
        nextN,
      );
    }
    if (nextQuad.c !== expected.c && nextQuad.b === expected.b) {
      return invalid(
        "WRONG_MIDDLE_SIGN",
        `constant term should be ${expected.c}, not ${nextQuad.c}`,
        prevN,
        nextN,
      );
    }
    return invalid(
      "NOT_DIFF_OF_SQUARES",
      `expected ${formatQuad(expected)}`,
      prevN,
      nextN,
    );
  }

  // Factor: x^2 - k → (x+r)(x-r) when k is a perfect square
  if (prevQuad && nextProduct) {
    if (prevQuad.b !== 0 || prevQuad.c >= 0 || !isPerfectSquare(-prevQuad.c)) {
      return invalid(
        "NOT_DIFF_OF_SQUARES",
        "this quadratic is not a difference of squares to factor that way",
        prevN,
        nextN,
      );
    }
    const r = Math.round(Math.sqrt(-prevQuad.c));
    const expectedLeft = r;
    const expectedRight = -r;
    const ok =
      nextProduct.variable === prevQuad.variable &&
      ((nextProduct.leftConst === expectedLeft && nextProduct.rightConst === expectedRight) ||
        (nextProduct.leftConst === expectedRight && nextProduct.rightConst === expectedLeft));
    if (ok) {
      return {
        validity: "VALID",
        transformation: "OTHER",
        normalizedPreviousLine: prevN,
        normalizedSubmittedLine: nextN,
      };
    }
    return invalid(
      "FACTOR_PAIR_MISMATCH",
      `x² − ${-prevQuad.c} factors as (x+${r})(x−${r})`,
      prevN,
      nextN,
    );
  }

  // Same form restated
  if (prevProduct && nextProduct && JSON.stringify(prevProduct) === JSON.stringify(nextProduct)) {
    return {
      validity: "VALID",
      transformation: "SIMPLIFY",
      normalizedPreviousLine: prevN,
      normalizedSubmittedLine: nextN,
    };
  }
  if (prevQuad && nextQuad && quadsEq(prevQuad, nextQuad)) {
    return {
      validity: "VALID",
      transformation: "SIMPLIFY",
      normalizedPreviousLine: prevN,
      normalizedSubmittedLine: nextN,
    };
  }

  return {
    validity: "PARSE_FAILED",
    transformation: "UNKNOWN",
    parseError: "line is outside the identity-expression grammar",
    normalizedPreviousLine: prevN,
    normalizedSubmittedLine: nextN,
  };
}

function invalid(
  code: string,
  description: string,
  prevN: string,
  nextN: string,
): StepVerification {
  return {
    validity: "INVALID" satisfies StepValidity,
    transformation: "OTHER" satisfies StepTransformation,
    firstInvalidActionCode: code,
    firstInvalidActionDescription: description,
    normalizedPreviousLine: prevN,
    normalizedSubmittedLine: nextN,
  };
}
