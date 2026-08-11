/**
 * Demo-only "what would a conventional next line look like" generator.
 *
 * This exists purely so a tester driving the demo student does not have to
 * hand-compute every line. It is rendered as greyed-out placeholder text in
 * the input box and is never prefilled, never validated against, and never
 * seen by a real student.
 *
 * IMPORTANT — this is display-only, and deliberately so. The verifier accepts
 * any route that preserves the previous line's meaning: on
 * `-2(x - 5) + 3 = 11` a student may distribute first *or* subtract the 3
 * first, and both are VALID. Nothing here may leak into grading, evidence,
 * micro-skill state, hypotheses, or selection — it only picks one
 * conventional route to show, and the student remains free to ignore it.
 *
 * Safety property: every string this module returns has been fed back through
 * the real verifier and confirmed VALID against the line it follows. A hint
 * the grader would reject is never shown — if nothing verifies, we return
 * null and the UI falls back to its generic placeholder.
 */
import type { DiagnosticV2Track } from "@cogna/shared";
import {
  foldMinusLookalikes,
  isSolvedForm,
  matchSingleBracket,
  parseLinearWithBracket,
  rat,
  ratToString,
  type LinearForm,
  type ParsedLine,
  type Rational,
} from "./linear-bracket-verifier";
import { denominatorsOf } from "./fraction-linear-verifier";
import { effectiveVerifierTrack, verifyDiagnosticV2Step } from "./diagnostic-v2-verifier-router";

// ─── Local rational helpers ─────────────────────────────────────────────────
// linear-bracket-verifier keeps its arithmetic private, so the small pieces we
// need are re-derived here rather than widening that module's surface for a
// demo affordance.

function ratMul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

function ratSub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

function ratDiv(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d, a.d * b.n);
}

function ratNeg(a: Rational): Rational {
  return rat(-a.n, a.d);
}

function ratEq(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

function ratIsZero(a: Rational): boolean {
  return a.n === 0;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

function scaleForm(f: LinearForm, k: Rational): LinearForm {
  return { a: ratMul(f.a, k), b: ratMul(f.b, k), variable: f.variable };
}

// ─── Formatting ─────────────────────────────────────────────────────────────
// Everything emitted here must be re-readable by the tokenizer, so fractional
// coefficients are parenthesised — `(3/2)x` parses as a product, `3/2x` is a
// coin flip nobody should have to think about.

function formatFactor(r: Rational): string {
  return r.d === 1 ? String(r.n) : `(${r.n}/${r.d})`;
}

/** null when the coefficient is zero — the caller drops the term entirely. */
function formatVariableTerm(a: Rational, variable: string): string | null {
  if (ratIsZero(a)) return null;
  if (a.d === 1 && a.n === 1) return variable;
  if (a.d === 1 && a.n === -1) return `-${variable}`;
  return `${formatFactor(a)}${variable}`;
}

/** Appends `+ n` / `- n` for each non-zero term, so signs never double up. */
function appendTerms(head: string, terms: Rational[]): string {
  let out = head;
  for (const term of terms) {
    if (ratIsZero(term)) continue;
    out +=
      term.n < 0 ? ` - ${ratToString(ratNeg(term))}` : ` + ${ratToString(term)}`;
  }
  return out;
}

function formatSide(form: LinearForm, variable: string): string {
  const variableTerm = formatVariableTerm(form.a, variable);
  if (!variableTerm) return ratToString(form.b);
  if (ratIsZero(form.b)) return variableTerm;
  return appendTerms(variableTerm, [form.b]);
}

function formatLine(lhs: LinearForm, rhs: LinearForm | null, variable: string): string {
  return rhs === null
    ? formatSide(lhs, variable)
    : `${formatSide(lhs, variable)} = ${formatSide(rhs, variable)}`;
}

// ─── Candidate routes ───────────────────────────────────────────────────────

/**
 * Conventional solving order, most-preferred first. Every entry is only a
 * proposal: the caller verifies each one and takes the first that holds, so a
 * formatting slip here degrades to "no hint", never to a wrong hint.
 */
function candidateNextLines(rawLine: string, parsed: ParsedLine): string[] {
  const variable = parsed.variable ?? "x";
  const candidates: string[] = [];
  const { lhs, rhs } = parsed;

  // 1. Fractions present — multiply every term by the lowest common denominator.
  const denominators = denominatorsOf(parsed);
  if (denominators.length > 0 && rhs) {
    const lcd = rat(denominators.reduce((acc, d) => lcm(acc, d), 1));
    candidates.push(formatLine(scaleForm(lhs, lcd), scaleForm(rhs, lcd), variable));
  }

  // 2. A bracket is present — expand it.
  if (parsed.hadBracket) {
    // Preferred: show the bracket's own two products before combining, which is
    // what a student actually writes. parsed.lhs is already fully distributed,
    // so the pieces are recovered from the raw text.
    const bracket = matchSingleBracket(rawLine);
    if (bracket) {
      const multiplier = rat(bracket.multiplier);
      const expandedA = ratMul(multiplier, rat(bracket.inner.a));
      const expandedB = ratMul(multiplier, rat(bracket.inner.b));
      const outsideB = ratSub(lhs.b, expandedB);
      const variableTerm = formatVariableTerm(expandedA, variable);
      if (variableTerm) {
        const expandedLhs = appendTerms(variableTerm, [expandedB, outsideB]);
        candidates.push(
          rhs === null ? expandedLhs : `${expandedLhs} = ${formatSide(rhs, variable)}`,
        );
      }
    }
    // Fallback: the already-combined form, which is equally valid.
    candidates.push(formatLine(lhs, rhs, variable));
  }

  // 3. The variable sits on both sides — collect it on the left.
  if (rhs && !ratIsZero(lhs.a) && !ratIsZero(rhs.a)) {
    candidates.push(
      formatLine(
        { a: ratSub(lhs.a, rhs.a), b: lhs.b, variable: lhs.variable },
        { a: rat(0), b: rhs.b, variable: rhs.variable },
        variable,
      ),
    );
  }

  // 4. A constant shares the variable's side — move it across.
  if (rhs && !ratIsZero(lhs.b) && !ratIsZero(lhs.a)) {
    candidates.push(
      formatLine(
        { a: lhs.a, b: rat(0), variable: lhs.variable },
        { a: rhs.a, b: ratSub(rhs.b, lhs.b), variable: rhs.variable },
        variable,
      ),
    );
  }

  // 5. The coefficient is not 1 — divide both sides by it.
  if (rhs && !ratIsZero(lhs.a) && !ratEq(lhs.a, rat(1)) && ratIsZero(lhs.b) && ratIsZero(rhs.a)) {
    candidates.push(
      formatLine(
        { a: rat(1), b: rat(0), variable: lhs.variable },
        { a: rat(0), b: ratDiv(rhs.b, lhs.a), variable: rhs.variable },
        variable,
      ),
    );
  }

  return candidates;
}

/**
 * One conventional next line for `currentLine`, or null when we cannot offer
 * one we are certain the verifier accepts.
 *
 * Covered grammars: negative-distribution (linear + single bracket) and
 * fraction-linear. The identity, factor-trinomial and quadratic tracks return
 * null rather than guess — their canonical routes are not single-step
 * rewrites, and a wrong hint is worse than none.
 */
export function nextStepHint(
  currentLine: string,
  track: DiagnosticV2Track,
  stageId?: string | null,
): string | null {
  const grammar = effectiveVerifierTrack(track, stageId);
  if (grammar !== "NEGATIVE_DISTRIBUTION" && grammar !== "FRACTION_LINEAR") {
    return null;
  }

  let parsed: ParsedLine;
  try {
    parsed = parseLinearWithBracket(currentLine);
  } catch {
    return null;
  }

  // Already `x = n`, or a bare expression with nothing left to expand.
  if (isSolvedForm(parsed)) return null;
  if (parsed.rhs === null && !parsed.hadBracket) return null;

  const normalizedCurrent = foldMinusLookalikes(currentLine).replace(/\s+/g, "");
  for (const candidate of candidateNextLines(foldMinusLookalikes(currentLine), parsed)) {
    // A "next" line identical to the current one is not a step.
    if (candidate.replace(/\s+/g, "") === normalizedCurrent) continue;
    if (verifyDiagnosticV2Step(currentLine, candidate, track, stageId).validity === "VALID") {
      return candidate;
    }
  }
  return null;
}
