/**
 * Phase B4 — quadratic zero-product verifier (three-piece kit).
 *
 * 1. Parser — standard form, factored product = 0, or root list
 * 2. Solver — rearrange → integer-factorability (B3) → zero-product → roots;
 *    verify proposed roots by substitution
 * 3. First-invalid-action finder — missed branch, wrong sign, dropped root, etc.
 *
 * Factor expand-and-compare is reused from factor-trinomial-verifier.
 */
import type { StepTransformation, StepValidity } from "@cogna/shared";
import { foldMinusLookalikes } from "./linear-bracket-verifier";
import type { StepVerification } from "./linear-bracket-verifier";
import {
  expandFactorPair,
  factorQuadraticInteger,
  formatQuadraticPoly,
  isIncompleteFactorisation,
  parseLinearFactorPair,
  parseQuadraticPoly,
  polysEq,
  type LinearFactorPair,
  type QuadraticPoly,
  verifyFactorStepValidity,
} from "./factor-trinomial-verifier";

export const QUADRATIC_VERIFIER_VERSION = "quadratic-zero-product-verifier-v1";

export interface QuadraticEquation {
  lhs: QuadraticPoly;
  /** Always 0 after rearrange for this thin grammar. */
  rhs: number;
}

export interface RootList {
  variable: string;
  roots: Array<{ n: number; d: number }>; // reduced fractions
}

function normalize(raw: string): string {
  return foldMinusLookalikes(raw)
    .replace(/\s+/g, "")
    .replace(/·/g, "*")
    .replace(/\u00d7/g, "*");
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function reduceFrac(n: number, d: number): { n: number; d: number } {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function fracsEq(
  a: { n: number; d: number },
  b: { n: number; d: number },
): boolean {
  return a.n === b.n && a.d === b.d;
}

function formatRoot(r: { n: number; d: number }): string {
  return r.d === 1 ? String(r.n) : `${r.n}/${r.d}`;
}

/** Parse `x^2+5x+6=0`, `2x^2-5x-3=0`. */
export function parseQuadraticEquation(raw: string): QuadraticEquation | null {
  const s = normalize(raw);
  const m = /^(.+)=([+-]?\d+)$/.exec(s);
  if (!m) return null;
  const lhs = parseQuadraticPoly(m[1]!);
  if (!lhs) return null;
  return { lhs, rhs: Number(m[2]) };
}

/** Parse `(x+2)(x-3)=0` / `(2x+1)(x-3)=0`. */
export function parseFactoredZeroProduct(raw: string): LinearFactorPair | null {
  const s = normalize(raw);
  const m = /^(.+)=0$/.exec(s);
  if (!m) return null;
  return parseLinearFactorPair(m[1]!);
}

/**
 * Parse root lists:
 * `x=-2 or x=3`, `x=3 or x=-2`, `x=-1/2 or x=3`, `x=-2, x=3`.
 */
export function parseRootList(raw: string): RootList | null {
  const s = normalize(raw).toLowerCase();
  // x=a or x=b  /  x=a,x=b  /  x=a or b
  const two =
    /^([a-z])=([+-]?\d+(?:\/\d+)?)\s*(?:or|,)\s*(?:\1=)?([+-]?\d+(?:\/\d+)?)$/i.exec(
      s,
    );
  if (!two) return null;
  const r1 = parseRationalToken(two[2]!);
  const r2 = parseRationalToken(two[3]!);
  if (!r1 || !r2) return null;
  return { variable: two[1]!.toLowerCase(), roots: [r1, r2] };
}

function parseRationalToken(tok: string): { n: number; d: number } | null {
  const m = /^([+-]?\d+)(?:\/(\d+))?$/.exec(tok);
  if (!m) return null;
  const n = Number(m[1]);
  const d = m[2] ? Number(m[2]) : 1;
  if (d === 0) return null;
  return reduceFrac(n, d);
}

/** Move all terms to LHS: `x^2+5x=-6` → `x^2+5x+6=0`. */
export function rearrangeToStandardForm(raw: string): QuadraticEquation | null {
  const s = normalize(raw);
  const m = /^(.+)=(.+)$/.exec(s);
  if (!m) return null;
  const left = parseQuadraticPoly(m[1]!);
  const rightPlain = /^([+-]?\d+)$/.exec(m[2]!);
  const rightQuad = parseQuadraticPoly(m[2]!);
  if (left && rightPlain) {
    return {
      lhs: { ...left, c: left.c - Number(rightPlain[1]) },
      rhs: 0,
    };
  }
  if (left && rightQuad && left.variable === rightQuad.variable) {
    return {
      lhs: {
        a: left.a - rightQuad.a,
        b: left.b - rightQuad.b,
        c: left.c - rightQuad.c,
        variable: left.variable,
      },
      rhs: 0,
    };
  }
  // Already = 0
  const eq = parseQuadraticEquation(raw);
  if (eq && eq.rhs === 0) return eq;
  return null;
}

export function rootsFromFactors(f: LinearFactorPair): RootList {
  // px + q = 0 → x = -q/p
  return {
    variable: f.variable,
    roots: [reduceFrac(-f.q, f.p), reduceFrac(-f.s, f.r)],
  };
}

export function evaluateQuadratic(q: QuadraticPoly, root: { n: number; d: number }): number {
  // a (n/d)^2 + b (n/d) + c  as exact rational numerator over d^2
  const { n, d } = root;
  return q.a * n * n + q.b * n * d + q.c * d * d;
}

export function rootsSatisfy(q: QuadraticPoly, roots: RootList): boolean {
  if (roots.variable !== q.variable) return false;
  if (roots.roots.length !== 2) return false;
  return roots.roots.every((r) => evaluateQuadratic(q, r) === 0);
}

function rootSetsEqual(a: RootList, b: RootList): boolean {
  if (a.variable !== b.variable || a.roots.length !== b.roots.length) return false;
  const used = new Set<number>();
  for (const r of a.roots) {
    let found = false;
    for (let i = 0; i < b.roots.length; i++) {
      if (used.has(i)) continue;
      if (fracsEq(r, b.roots[i]!)) {
        used.add(i);
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function classifyRootError(
  expected: RootList,
  student: RootList,
): { code: string; description: string } {
  if (student.roots.length === 1) {
    return {
      code: "MISSED_BRANCH",
      description: "a quadratic has two roots — set each factor to zero",
    };
  }

  // Sign flip: same magnitudes, at least one sign wrong (before DROPPED_ROOT)
  const expMags = expected.roots.map((r) => `${Math.abs(r.n)}/${r.d}`).sort();
  const stuMags = student.roots.map((r) => `${Math.abs(r.n)}/${r.d}`).sort();
  if (expMags.join() === stuMags.join() && !rootSetsEqual(expected, student)) {
    return {
      code: "WRONG_ROOT_SIGN",
      description: "a root has the wrong sign — remember x = −(constant)/(x-coefficient)",
    };
  }

  const matchCount = student.roots.filter((sr) =>
    expected.roots.some((er) => fracsEq(sr, er)),
  ).length;

  if (matchCount === 1) {
    return {
      code: "DROPPED_ROOT",
      description: "one root is right but the other is missing or wrong",
    };
  }

  return {
    code: "VERIFY_FAIL",
    description: `expected x = ${formatRoot(expected.roots[0]!)} or x = ${formatRoot(expected.roots[1]!)}`,
  };
}

/**
 * Verify a student step on the quadratic zero-product track.
 */
export function verifyQuadraticStepValidity(
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

  if (isIncompleteFactorisation(submittedLine)) {
    return invalid(
      "INCOMPLETE_FACTORISATION",
      "factorisation is unfinished",
      prevN,
      nextN,
    );
  }

  // Rearrange: x^2+5x=-6 → x^2+5x+6=0
  const prevNonZero = rearrangeToStandardForm(previousLine);
  const nextStd = parseQuadraticEquation(submittedLine);
  if (
    prevNonZero &&
    nextStd &&
    nextStd.rhs === 0 &&
    !normalize(previousLine).endsWith("=0")
  ) {
    if (polysEq(prevNonZero.lhs, nextStd.lhs) && nextStd.rhs === 0) {
      return valid("OTHER", prevN, nextN);
    }
    // Student wrote =0 but wrong constants
    if (nextStd.rhs === 0) {
      return invalid(
        "WRONG_STANDARD_FORM",
        "moving terms across the equals sign did not produce the correct standard form",
        prevN,
        nextN,
      );
    }
  }

  // Factor step on a quadratic equation: x^2+5x+6=0 → (x+2)(x+3)=0
  const prevEq = parseQuadraticEquation(previousLine);
  const nextFactored = parseFactoredZeroProduct(submittedLine);
  if (prevEq && nextFactored) {
    if (prevEq.rhs !== 0) {
      return invalid(
        "WRONG_STANDARD_FORM",
        "put the equation into … = 0 form before factorising",
        prevN,
        nextN,
      );
    }
    if (!factorQuadraticInteger(prevEq.lhs)) {
      return invalid(
        "NOT_INTEGER_FACTORABLE",
        "this quadratic does not factor over the integers",
        prevN,
        nextN,
      );
    }
    const expanded = expandFactorPair(nextFactored);
    if (polysEq(expanded, prevEq.lhs)) {
      return valid("OTHER", prevN, nextN);
    }
    // Delegate localisation to B3 classifier via factor-step on the LHS
    const fac = verifyFactorStepValidity(
      formatQuadraticPoly(prevEq.lhs),
      submittedLine.replace(/=0$/i, ""),
    );
    if (fac.validity === "INVALID") {
      return {
        ...fac,
        normalizedPreviousLine: prevN,
        normalizedSubmittedLine: nextN,
      };
    }
    return invalid(
      "EXPAND_CHECK_FAIL",
      "those factors do not expand back to the quadratic",
      prevN,
      nextN,
    );
  }

  // Zero-product: (x+2)(x-3)=0 → roots
  const prevFactored = parseFactoredZeroProduct(previousLine);
  const nextRoots = parseRootList(submittedLine);
  if (prevFactored && nextRoots) {
    const expected = rootsFromFactors(prevFactored);
    if (rootSetsEqual(expected, nextRoots)) {
      return valid("OTHER", prevN, nextN);
    }
    // Also accept a single-branch intermediate? No — thin slice wants both roots.
    if (nextRoots.roots.length < 2) {
      return invalid(
        "MISSED_BRANCH",
        "set each factor equal to zero to find both roots",
        prevN,
        nextN,
      );
    }
    const { code, description } = classifyRootError(expected, nextRoots);
    return invalid(code, description, prevN, nextN);
  }

  // Quadratic = 0 → roots directly (transfer may skip writing factors)
  if (prevEq && prevEq.rhs === 0 && nextRoots) {
    if (!factorQuadraticInteger(prevEq.lhs)) {
      return invalid(
        "NOT_INTEGER_FACTORABLE",
        "this quadratic does not factor over the integers",
        prevN,
        nextN,
      );
    }
    if (rootsSatisfy(prevEq.lhs, nextRoots) && nextRoots.roots.length === 2) {
      return valid("OTHER", prevN, nextN);
    }
    const factors = factorQuadraticInteger(prevEq.lhs)!;
    const expected = rootsFromFactors(factors);
    if (nextRoots.roots.length < 2) {
      return invalid(
        "MISSED_BRANCH",
        "a quadratic has two roots",
        prevN,
        nextN,
      );
    }
    if (!rootsSatisfy(prevEq.lhs, nextRoots)) {
      const { code, description } = classifyRootError(expected, nextRoots);
      // Prefer VERIFY_FAIL when substitution fails hard
      if (code === "VERIFY_FAIL" || !rootsSatisfy(prevEq.lhs, nextRoots)) {
        const anyOk = nextRoots.roots.some(
          (r) => evaluateQuadratic(prevEq.lhs, r) === 0,
        );
        if (!anyOk) {
          return invalid(
            "VERIFY_FAIL",
            "those values do not satisfy the original equation",
            prevN,
            nextN,
          );
        }
        return invalid(code, description, prevN, nextN);
      }
    }
    return invalid("VERIFY_FAIL", "roots do not check out", prevN, nextN);
  }

  // Bare quadratic factor (no =0) — allow B3 factor path for transfer glue
  const prevBare = parseQuadraticPoly(previousLine);
  const nextBareFactors = parseLinearFactorPair(submittedLine);
  if (prevBare && nextBareFactors) {
    return verifyFactorStepValidity(previousLine, submittedLine);
  }

  // Identity restatements
  if (prevFactored && nextFactored) {
    const a = expandFactorPair(prevFactored);
    const b = expandFactorPair(nextFactored);
    if (polysEq(a, b)) return valid("SIMPLIFY", prevN, nextN);
  }
  if (prevEq && nextStd && polysEq(prevEq.lhs, nextStd.lhs) && prevEq.rhs === nextStd.rhs) {
    return valid("SIMPLIFY", prevN, nextN);
  }

  return {
    validity: "PARSE_FAILED",
    transformation: "UNKNOWN",
    parseError: "line is outside the quadratic zero-product grammar",
    normalizedPreviousLine: prevN,
    normalizedSubmittedLine: nextN,
  };
}

function valid(
  transformation: StepTransformation,
  prevN: string,
  nextN: string,
): StepVerification {
  return {
    validity: "VALID" satisfies StepValidity,
    transformation,
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
