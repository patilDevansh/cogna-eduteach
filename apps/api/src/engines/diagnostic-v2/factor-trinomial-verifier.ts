/**
 * Phase B3 — trinomial factorisation verifier (three-piece kit).
 *
 * 1. Parser — student text → quadratic or product of two linear factors
 * 2. Solver — independently factor over the integers; expand student proposal
 *    and compare polynomials (not strings; factor order may swap)
 * 3. First-invalid-action finder — wrong pair / sign / grouping / incomplete
 *
 * Diffing does not reuse the bracket mega-parser.
 */
import type { StepTransformation, StepValidity } from "@cogna/shared";
import { foldMinusLookalikes } from "./linear-bracket-verifier";
import type { StepVerification } from "./linear-bracket-verifier";

export const FACTOR_VERIFIER_VERSION = "factor-trinomial-verifier-v1";

export interface QuadraticPoly {
  a: number;
  b: number;
  c: number;
  variable: string;
}

/** Two linear factors (px + q)(rx + s). */
export interface LinearFactorPair {
  variable: string;
  p: number;
  q: number;
  r: number;
  s: number;
}

function normalize(raw: string): string {
  return foldMinusLookalikes(raw)
    .replace(/\s+/g, "")
    .replace(/·/g, "*")
    .replace(/\u00d7/g, "*");
}

function parseCoeffPrefix(raw: string): number | null {
  if (raw === "" || raw === "+") return 1;
  if (raw === "-") return -1;
  const n = Number(raw);
  return Number.isInteger(n) && n !== 0 ? n : null;
}

/** Parse linear-term coefficient: `+5`, `-3`, `+`, `-`, or `` before the variable. */
function parseLinearCoeff(raw: string): number | null {
  if (raw === "+" || raw === "") return 1;
  if (raw === "-") return -1;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Parse `x^2+5x+6`, `2x^2-5x-3`, `x^2-x-6`, `-x^2+3x+4`. */
export function parseQuadraticPoly(raw: string): QuadraticPoly | null {
  const s = normalize(raw);
  // ax^2 + bx + c  (b may be bare ±x)
  const withMiddle =
    /^([+-]?\d*)([a-z])\^2([+-]\d*)\2([+-]\d+)$/i.exec(s);
  if (withMiddle) {
    const a = parseCoeffPrefix(withMiddle[1]!);
    const b = parseLinearCoeff(withMiddle[3]!);
    if (a === null || b === null) return null;
    return {
      a,
      b,
      c: Number(withMiddle[4]),
      variable: withMiddle[2]!.toLowerCase(),
    };
  }
  // ax^2 + c (no middle)
  const noMiddle = /^([+-]?\d*)([a-z])\^2([+-]\d+)$/i.exec(s);
  if (noMiddle) {
    const a = parseCoeffPrefix(noMiddle[1]!);
    if (a === null) return null;
    return {
      a,
      b: 0,
      c: Number(noMiddle[3]),
      variable: noMiddle[2]!.toLowerCase(),
    };
  }
  // ax^2 + bx
  const noConst = /^([+-]?\d*)([a-z])\^2([+-]\d*)\2$/i.exec(s);
  if (noConst) {
    const a = parseCoeffPrefix(noConst[1]!);
    const b = parseLinearCoeff(noConst[3]!);
    if (a === null || b === null) return null;
    return {
      a,
      b,
      c: 0,
      variable: noConst[2]!.toLowerCase(),
    };
  }
  // ax^2
  const bare = /^([+-]?\d*)([a-z])\^2$/i.exec(s);
  if (bare) {
    const a = parseCoeffPrefix(bare[1]!);
    if (a === null) return null;
    return { a, b: 0, c: 0, variable: bare[2]!.toLowerCase() };
  }
  return null;
}

/** Parse `(x+2)(x+3)`, `(2x+1)(x-3)`, `(-x+2)(x+1)`. */
export function parseLinearFactorPair(raw: string): LinearFactorPair | null {
  const s = normalize(raw);
  const m =
    /^\(([+-]?\d*)([a-z])([+-]\d+)\)\(([+-]?\d*)([a-z])([+-]\d+)\)$/i.exec(s);
  if (!m) return null;
  if (m[2]!.toLowerCase() !== m[5]!.toLowerCase()) return null;
  const p = parseCoeffPrefix(m[1]!);
  const r = parseCoeffPrefix(m[4]!);
  if (p === null || r === null) return null;
  return {
    variable: m[2]!.toLowerCase(),
    p,
    q: Number(m[3]),
    r,
    s: Number(m[6]),
  };
}

/**
 * Incomplete forms: common-factor left with a quadratic inside, or decimal coeffs.
 * e.g. `2(x^2-2.5x-1.5)`, `2(x^2-5x/2-3/2)`.
 */
export function isIncompleteFactorisation(raw: string): boolean {
  const s = normalize(raw);
  if (/\d+\.\d+/.test(s)) return true;
  // k(quadratic) still containing x^2
  if (/^[+-]?\d+\(.+\^.+\)$/.test(s) && /\^2/.test(s)) return true;
  // single factor only
  if (/^\([+-]?\d*[a-z][+-]\d+\)$/i.test(s)) return true;
  return false;
}

export function expandFactorPair(f: LinearFactorPair): QuadraticPoly {
  return {
    a: f.p * f.r,
    b: f.p * f.s + f.q * f.r,
    c: f.q * f.s,
    variable: f.variable,
  };
}

export function polysEq(l: QuadraticPoly, r: QuadraticPoly): boolean {
  return l.a === r.a && l.b === r.b && l.c === r.c && l.variable === r.variable;
}

function factorPairsEqual(a: LinearFactorPair, b: LinearFactorPair): boolean {
  const sameOrder =
    a.p === b.p && a.q === b.q && a.r === b.r && a.s === b.s && a.variable === b.variable;
  const swapped =
    a.p === b.r && a.q === b.s && a.r === b.p && a.s === b.q && a.variable === b.variable;
  return sameOrder || swapped;
}

/** All ordered divisor pairs of n (positive and negative). */
function divisorPairs(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const abs = Math.abs(n);
  for (let i = 1; i <= abs; i++) {
    if (abs % i !== 0) continue;
    const j = abs / i;
    out.push([i, j], [-i, -j], [i, -j], [-i, j]);
    if (i !== j) {
      out.push([j, i], [-j, -i], [j, -i], [-j, i]);
    }
  }
  return out;
}

/**
 * Independently factor ax²+bx+c over the integers.
 * Returns one canonical pair (smaller |p| first; then lexicographic).
 */
export function factorQuadraticInteger(q: QuadraticPoly): LinearFactorPair | null {
  if (!Number.isInteger(q.a) || !Number.isInteger(q.b) || !Number.isInteger(q.c)) {
    return null;
  }
  if (q.a === 0) return null;

  const candidates: LinearFactorPair[] = [];
  const constPairs: Array<[number, number]> =
    q.c === 0
      ? [
          [0, 0],
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]
      : divisorPairs(q.c);

  for (const [p, r] of divisorPairs(q.a)) {
    if (p * r !== q.a) continue;
    for (const [qCoeff, sCoeff] of constPairs) {
      if (qCoeff * sCoeff !== q.c) continue;
      if (p * sCoeff + qCoeff * r === q.b) {
        candidates.push({
          variable: q.variable,
          p,
          q: qCoeff,
          r,
          s: sCoeff,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Prefer positive leading coefficients, then smaller |p|, then smaller |q|.
  candidates.sort((x, y) => {
    const xLead = (x.p > 0 ? 0 : 1) + (x.r > 0 ? 0 : 1);
    const yLead = (y.p > 0 ? 0 : 1) + (y.r > 0 ? 0 : 1);
    if (xLead !== yLead) return xLead - yLead;
    const xp = Math.abs(x.p) - Math.abs(y.p);
    if (xp !== 0) return xp;
    return Math.abs(x.q) - Math.abs(y.q) || x.p - y.p || x.q - y.q;
  });
  return candidates[0]!;
}

export function isIntegerFactorable(q: QuadraticPoly): boolean {
  return factorQuadraticInteger(q) !== null;
}

function formatFactors(f: LinearFactorPair): string {
  const left = `(${coeffVar(f.p, f.variable)}${signed(f.q)})`;
  const right = `(${coeffVar(f.r, f.variable)}${signed(f.s)})`;
  return `${left}${right}`;
}

function coeffVar(coeff: number, v: string): string {
  if (coeff === 1) return v;
  if (coeff === -1) return `-${v}`;
  return `${coeff}${v}`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function formatQuadraticPoly(q: QuadraticPoly): string {
  const v = q.variable;
  let s = q.a === 1 ? `${v}^2` : q.a === -1 ? `-${v}^2` : `${q.a}${v}^2`;
  if (q.b !== 0) s += q.b > 0 ? `+${q.b}${v}` : `${q.b}${v}`;
  if (q.c !== 0) s += q.c > 0 ? `+${q.c}` : `${q.c}`;
  return s;
}

/**
 * Classify a wrong factorisation against the independently solved pair.
 */
export function classifyFactorError(
  target: QuadraticPoly,
  student: LinearFactorPair,
  expected: LinearFactorPair | null,
): { code: string; description: string } {
  const expanded = expandFactorPair(student);

  if (expanded.variable !== target.variable || expanded.a !== target.a) {
    // Leading coefficient wrong — often wrong grouping on non-monic
    if (target.a !== 1 && expected) {
      const studentMags = [Math.abs(student.p), Math.abs(student.r)].sort().join(",");
      const expectedMags = [Math.abs(expected.p), Math.abs(expected.r)].sort().join(",");
      if (studentMags !== expectedMags && student.q * student.s === target.c) {
        return {
          code: "WRONG_GROUPING",
          description:
            "the constant factors look workable but the x-coefficients are grouped onto the wrong brackets",
        };
      }
    }
    return {
      code: "EXPAND_CHECK_FAIL",
      description: `expanding your factors gives ${formatQuadraticPoly(expanded)}, not ${formatQuadraticPoly(target)}`,
    };
  }

  // Sign flip on an otherwise-correct absolute factorisation
  if (expected) {
    const absMatch =
      (Math.abs(student.p) === Math.abs(expected.p) &&
        Math.abs(student.q) === Math.abs(expected.q) &&
        Math.abs(student.r) === Math.abs(expected.r) &&
        Math.abs(student.s) === Math.abs(expected.s)) ||
      (Math.abs(student.p) === Math.abs(expected.r) &&
        Math.abs(student.q) === Math.abs(expected.s) &&
        Math.abs(student.r) === Math.abs(expected.p) &&
        Math.abs(student.s) === Math.abs(expected.q));
    if (absMatch && !factorPairsEqual(student, expected)) {
      return {
        code: "SIGN_ERROR_MIDDLE_SPLIT",
        description:
          "the factor numbers look right but a sign on one of the constants is flipped",
      };
    }

    // Non-monic: correct AC numbers, wrong placement onto factors
    if (target.a !== 1) {
      const ac = target.a * target.c;
      const studentSplitProduct =
        (student.p * student.s) * (student.q * student.r) === 0
          ? null
          : student.p * student.s + student.q * student.r;
      void ac;
      void studentSplitProduct;
      if (
        student.q * student.s === target.c &&
        student.p * student.r === target.a &&
        expanded.b !== target.b
      ) {
        // Could be sign or grouping — if magnitudes of linear coeffs match expected divisors
        const expDivs = [Math.abs(expected.p), Math.abs(expected.r)].sort();
        const stuDivs = [Math.abs(student.p), Math.abs(student.r)].sort();
        if (expDivs[0] !== stuDivs[0] || expDivs[1] !== stuDivs[1]) {
          return {
            code: "WRONG_GROUPING",
            description:
              "a×c split numbers may be right but they were grouped onto the wrong factors",
          };
        }
      }
    }
  }

  // Right product of constants, wrong sum (middle)
  if (expanded.c === target.c && expanded.b !== target.b) {
    return {
      code: "WRONG_FACTOR_PAIR_SUM",
      description: `the constants multiply to ${target.c} but their weighted sum should give middle term ${target.b}${target.variable}, not ${expanded.b}${target.variable}`,
    };
  }

  // Right middle, wrong constant product
  if (expanded.b === target.b && expanded.c !== target.c) {
    return {
      code: "WRONG_FACTOR_PAIR_PRODUCT",
      description: `the middle term matches but the constants should multiply to ${target.c}, not ${expanded.c}`,
    };
  }

  // Monic: classic pair — sum vs product diagnostics from constants alone
  if (target.a === 1) {
    const sum = student.q + student.s;
    const product = student.q * student.s;
    if (product === target.c && sum !== target.b) {
      return {
        code: "WRONG_FACTOR_PAIR_SUM",
        description: `numbers that multiply to ${target.c} should also add to ${target.b}`,
      };
    }
    if (sum === target.b && product !== target.c) {
      return {
        code: "WRONG_FACTOR_PAIR_PRODUCT",
        description: `numbers that add to ${target.b} should also multiply to ${target.c}`,
      };
    }
  }

  return {
    code: "EXPAND_CHECK_FAIL",
    description: expected
      ? `expected ${formatFactors(expected)} (or swapped order)`
      : `expanding your factors gives ${formatQuadraticPoly(expanded)}, not ${formatQuadraticPoly(target)}`,
  };
}

/**
 * Verify a student step on the factorisation track.
 * Supports: expand product → quadratic; factor quadratic → product.
 */
export function verifyFactorStepValidity(
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
      "factorisation is unfinished — still has a quadratic inside, a decimal, or only one bracket",
      prevN,
      nextN,
    );
  }

  const prevFactors = parseLinearFactorPair(previousLine);
  const nextQuad = parseQuadraticPoly(submittedLine);
  const prevQuad = parseQuadraticPoly(previousLine);
  const nextFactors = parseLinearFactorPair(submittedLine);

  // Expand: (px+q)(rx+s) → quadratic
  if (prevFactors && nextQuad) {
    const expected = expandFactorPair(prevFactors);
    if (polysEq(expected, nextQuad)) {
      return valid("OTHER", prevN, nextN);
    }
    return invalid(
      "EXPAND_CHECK_FAIL",
      `expected ${formatQuadraticPoly(expected)}`,
      prevN,
      nextN,
    );
  }

  // Factor: quadratic → product
  if (prevQuad && nextFactors) {
    if (nextFactors.variable !== prevQuad.variable) {
      return invalid(
        "EXPAND_CHECK_FAIL",
        "the letter in the factors must match the quadratic",
        prevN,
        nextN,
      );
    }
    const expected = factorQuadraticInteger(prevQuad);
    if (!expected) {
      return invalid(
        "NOT_INTEGER_FACTORABLE",
        "this quadratic does not factor over the integers",
        prevN,
        nextN,
      );
    }
    const expanded = expandFactorPair(nextFactors);
    if (polysEq(expanded, prevQuad)) {
      return valid("OTHER", prevN, nextN);
    }
    const { code, description } = classifyFactorError(prevQuad, nextFactors, expected);
    return invalid(code, description, prevN, nextN);
  }

  // Same form restated
  if (prevFactors && nextFactors && factorPairsEqual(prevFactors, nextFactors)) {
    return valid("SIMPLIFY", prevN, nextN);
  }
  if (prevQuad && nextQuad && polysEq(prevQuad, nextQuad)) {
    return valid("SIMPLIFY", prevN, nextN);
  }

  return {
    validity: "PARSE_FAILED",
    transformation: "UNKNOWN",
    parseError: "line is outside the factor-trinomial grammar",
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
