/**
 * Pure diagnosis logic. Everything here is a plain function of parsed
 * mathematical structure (via poly.ts) and explicit prior state — no
 * framework imports, no randomness, fully unit-testable.
 *
 * Known wrong-answer signatures are generated *programmatically* from each
 * problem's own two factors, not hand-typed per problem — so the same three
 * generators correctly reproduce the exact examples in the spec's Stage 4
 * table for (x+3)(x+5), and generalize correctly to the probe and transfer
 * problems too.
 */
import {
  normalize,
  polyEquals,
  hasUncombinedLikeTerms,
  equivalentToPoly,
  checkFactorPair,
  type NormalizedPoly,
} from "./poly";
import type {
  DiagnosisTracker,
  EvidenceState,
  FactorHypothesis,
  Hypothesis,
  LinearBinomial,
  QuadraticProblem,
  StepValidity,
} from "./types";

export function expandedPoly(problem: QuadraticProblem): NormalizedPoly {
  const { p, q } = problem.factors;
  // (x+p)(x+q) = x^2 + (p+q)x + pq
  return [p * q, p + q, 1];
}

function missingCrossProductsPoly(f: LinearBinomial): NormalizedPoly {
  // Only F and L of FOIL: x*x and p*q. The two cross terms (x*q and p*x) never happened.
  return [f.p * f.q, 0, 1];
}
function xSquaredMisreadPoly(f: LinearBinomial): NormalizedPoly {
  // x*x read as "2x" (added instead of multiplied); cross terms and constant otherwise correct.
  return [f.p * f.q, f.p + f.q + 2, 0];
}
function incompleteDoubleDistributionPoly(f: LinearBinomial): NormalizedPoly {
  // x*(x+q) fully distributed, but p was only multiplied into the constant (p*q), never into x.
  return [f.p * f.q, f.q, 1];
}

interface KnownPattern {
  hypothesis: Hypothesis;
  poly: NormalizedPoly;
}

function knownWrongPatterns(problem: QuadraticProblem): KnownPattern[] {
  const f = problem.factors;
  return [
    { hypothesis: "MISSING_CROSS_PRODUCTS", poly: missingCrossProductsPoly(f) },
    { hypothesis: "UNRELIABLE_X_SQUARED", poly: xSquaredMisreadPoly(f) },
    { hypothesis: "INCOMPLETE_DOUBLE_DISTRIBUTION", poly: incompleteDoubleDistributionPoly(f) },
  ];
}

export interface ExpansionClassification {
  stepValidity: StepValidity;
  hypothesis: Hypothesis;
  normalizedInput: string | null;
}

/** Classifies one expansion attempt against a specific problem's target. Accepts any equivalent route — never forces one method. */
export function classifyExpansionAttempt(raw: string, problem: QuadraticProblem): ExpansionClassification {
  const target = expandedPoly(problem);
  const trimmed = raw.trim();

  // Checked before parsing: typing the presented expression back unchanged
  // is a real, distinct "no meaningful attempt" signal even though it
  // happens to be syntactically valid (a factored form parses fine).
  const noAttempt = trimmed.length === 0 || trimmed.replace(/\s+/g, "") === problem.presented.replace(/\s+/g, "");
  if (noAttempt) {
    return { stepValidity: "UNPARSEABLE", hypothesis: "STRATEGY_SELECTION_DIFFICULTY", normalizedInput: null };
  }

  const n = normalize(raw);
  if (!n.ok) {
    return { stepValidity: "UNPARSEABLE", hypothesis: "NONE", normalizedInput: null };
  }

  const normalizedInput = n.poly.join(",");

  if (polyEquals(n.poly, target)) {
    if (hasUncombinedLikeTerms(n.terms)) {
      return { stepValidity: "VALID", hypothesis: "COMBINING_LIKE_TERMS_GAP", normalizedInput };
    }
    return { stepValidity: "VALID", hypothesis: "NONE", normalizedInput };
  }

  for (const kp of knownWrongPatterns(problem)) {
    if (polyEquals(n.poly, kp.poly)) {
      return { stepValidity: "INVALID", hypothesis: kp.hypothesis, normalizedInput };
    }
  }

  // Wrong, but not one of the three recognized FOIL-family signatures — a
  // real, structured attempt that just isn't one this scripted prototype
  // can name with confidence. This is NOT "no meaningful attempt": that
  // label is reserved for empty/unparseable/unchanged input, handled above.
  return { stepValidity: "INVALID", hypothesis: "NONE", normalizedInput };
}

/** After the main problem: a single wrong answer becomes SUSPECTED, never a confirmed misconception. */
export function recordMainAttempt(tracker: DiagnosisTracker, hypothesis: Hypothesis): DiagnosisTracker {
  if (hypothesis === "NONE") {
    return tracker.hypothesis ? { ...tracker, evidenceState: "UNCERTAIN" } : tracker;
  }
  return { hypothesis, evidenceState: "SUSPECTED", observations: 1, probesUsed: tracker.probesUsed };
}

/**
 * At most one probe is ever shown per hypothesis in this scripted session
 * (Stage 5). A "stuck" signal is already enough certainty on its own — it
 * skips the probe and goes straight to support rather than pressing further.
 */
export function needsProbe(tracker: DiagnosisTracker): boolean {
  return (
    tracker.evidenceState === "SUSPECTED" &&
    tracker.probesUsed < 1 &&
    tracker.hypothesis !== null &&
    tracker.hypothesis !== "STRATEGY_SELECTION_DIFFICULTY"
  );
}

/**
 * Repeating the same structural error on the probe is enough evidence for
 * the targeted intervention. A correct (or differently-wrong) probe answer
 * treats the original error as a possible slip, not a confirmed pattern.
 */
export function recordProbeAttempt(tracker: DiagnosisTracker, hypothesisAtProbe: Hypothesis): DiagnosisTracker {
  const probesUsed = tracker.probesUsed + 1;
  if (hypothesisAtProbe !== "NONE" && hypothesisAtProbe === tracker.hypothesis) {
    return { ...tracker, evidenceState: "INTERVENTION_READY", observations: tracker.observations + 1, probesUsed };
  }
  return { ...tracker, evidenceState: "UNCERTAIN", probesUsed };
}

/** Whether the targeted (area-model) intervention should be shown at all. */
export function needsIntervention(tracker: DiagnosisTracker): boolean {
  return tracker.evidenceState === "INTERVENTION_READY" || (tracker.evidenceState === "SUSPECTED" && tracker.hypothesis === "STRATEGY_SELECTION_DIFFICULTY");
}

export interface FactorAttempt {
  p: number;
  q: number;
  writtenForm: string;
}

/** Section 6 / Stage 7 table — five distinct outcomes from one factorisation attempt. */
export function classifyFactorAttempt(
  attempt: FactorAttempt,
  target: NormalizedPoly,
  sawInterventionThisSession: boolean,
): FactorHypothesis {
  const check = checkFactorPair(target, attempt.p, attempt.q);
  if (!check.productOk) return "FACTOR_FLUENCY_DIFFICULTY";
  if (!check.sumOk) return "SUM_CONDITION_MISSED";
  const formOk = equivalentToPoly(attempt.writtenForm, target);
  if (!formOk) return "SYMBOLIC_CONSTRUCTION_UNRELIABLE";
  return sawInterventionThisSession ? "SUPPORTED_SUCCESS" : "INDEPENDENT_SUCCESS";
}

/**
 * Stage 8, research-log detail only: when a wrong transfer answer has
 * exactly the right magnitudes but a wrong sign somewhere, that's a more
 * specific (and more actionable) signal than a generic wrong answer.
 */
export function looksLikeSignIssue(studentPoly: NormalizedPoly, target: NormalizedPoly): boolean {
  const len = Math.max(studentPoly.length, target.length);
  let anyDifferentSign = false;
  for (let i = 0; i < len; i++) {
    const s = studentPoly[i] ?? 0;
    const t = target[i] ?? 0;
    if (Math.abs(s) !== Math.abs(t)) return false;
    if (s !== t) anyDifferentSign = true;
  }
  return anyDifferentSign;
}

/** Stage 8: a fully correct, unaided expansion after an earlier confirmed gap is the transfer signal that matters most. */
export function transferHadRelatedPriorGap(tracker: DiagnosisTracker): boolean {
  return tracker.evidenceState === "INTERVENTION_READY" || tracker.evidenceState === "REPEATED_EVIDENCE";
}

export function evidenceStateLabel(state: EvidenceState): string {
  // Internal-only — used solely in the research view, never student-facing.
  switch (state) {
    case "OBSERVED":
      return "Observed";
    case "SUSPECTED":
      return "Suspected";
    case "REPEATED_EVIDENCE":
      return "Repeated evidence";
    case "INTERVENTION_READY":
      return "Intervention ready";
    case "UNCERTAIN":
      return "Uncertain";
    case "UNKNOWN":
      return "Unknown";
  }
}
