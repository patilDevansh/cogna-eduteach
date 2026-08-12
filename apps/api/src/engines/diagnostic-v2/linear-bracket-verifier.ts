/**
 * Deterministic step verifier for the Phase A grammar: single-variable linear
 * expressions and equations with at most one bracket group and integer
 * coefficients — e.g. `-2(x - 5) + 3 = 11`, `3x + 5 = 20`, `-3(y - 4)`.
 *
 * Pure functions, no NestJS, no Prisma, no model call — this is the ground
 * truth the whole diagnostic rests on, and the AI grader fallback
 * (diagnostic-v2-ai-grader.service.ts) only ever runs when this returns
 * PARSE_FAILED or AMBIGUOUS.
 *
 * Exact rational arithmetic throughout: `x = -1/2` must compare exactly, and
 * float equality would silently mis-grade cases like 0.1 + 0.2.
 *
 * Scope is deliberately narrow. Anything outside the grammar (x², two
 * brackets, two variables) returns PARSE_FAILED rather than a guess — an
 * unparseable line is explicitly NOT a wrong line (Work Order 03 §7.5).
 */
import type { StepTransformation, StepValidity } from "@cogna/shared";

export const VERIFIER_VERSION = "linear-bracket-verifier-v1";

// ─── Exact rational arithmetic ──────────────────────────────────────────────

export interface Rational {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

export function rat(n: number, d = 1): Rational {
  if (d === 0) throw new Error("rational: zero denominator");
  const sign = d < 0 ? -1 : 1;
  const nn = n * sign;
  const dd = d * sign;
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

const ZERO = rat(0);

function ratAdd(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

function ratSub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

function ratMul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

function ratDiv(a: Rational, b: Rational): Rational {
  if (b.n === 0) throw new Error("rational: division by zero");
  return rat(a.n * b.d, a.d * b.n);
}

function ratEq(a: Rational, b: Rational): boolean {
  return a.n === b.n && a.d === b.d;
}

function ratIsZero(a: Rational): boolean {
  return a.n === 0;
}

export function ratToString(a: Rational): string {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}

// ─── Linear form: a·x + b ───────────────────────────────────────────────────

export interface LinearForm {
  a: Rational;
  b: Rational;
  /** null when the expression is a pure constant (no variable appeared). */
  variable: string | null;
}

export interface ParsedLine {
  lhs: LinearForm;
  /** null for a bare expression (`-3(y - 4)`) rather than an equation. */
  rhs: LinearForm | null;
  variable: string | null;
  /** True when a bracket group was present — used to classify DISTRIBUTE. */
  hadBracket: boolean;
  /** Term count on each side before combining — used to classify COMBINE_LIKE_TERMS. */
  lhsTermCount: number;
  rhsTermCount: number;
}

// ─── Tokenizer ──────────────────────────────────────────────────────────────

/**
 * Characters a model or a student can produce that mean "minus" but are not
 * ASCII `-`: U+2212 (the real minus sign, which LLMs emit routinely when
 * formatting maths) and U+2013 (en-dash, which word processors autocorrect
 * hyphens into).
 */
const MINUS_LOOKALIKES = new Set(["−", "–"]);

/**
 * Folds minus lookalikes to ASCII `-`.
 *
 * Every raw-string reader in this module must run text through here first.
 * The tokenizer always handled these characters, but `matchSingleBracket`
 * originally ran its regex on the un-normalized string — so a unicode-minus
 * equation parsed and solved correctly while the first-invalid-action
 * analysis silently failed to find its bracket, degrading a precise
 * diagnosis ("(-2)(-5) was evaluated as -10") into a generic one. Anything
 * that pattern-matches raw text here needs this, not just the tokenizer.
 */
export function foldMinusLookalikes(raw: string): string {
  let out = "";
  for (const c of raw) out += MINUS_LOOKALIKES.has(c) ? "-" : c;
  return out;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "eq" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < s.length && s[j]! >= "0" && s[j]! <= "9") j++;
      tokens.push({ kind: "num", value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      tokens.push({ kind: "var", name: c.toLowerCase() });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (MINUS_LOOKALIKES.has(c)) {
      tokens.push({ kind: "op", value: "-" });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (c === "=") {
      tokens.push({ kind: "eq" });
      i++;
      continue;
    }
    throw new Error(`unexpected character "${c}"`);
  }
  return tokens;
}

// ─── Parser: tokens -> LinearForm (full distribution, degree <= 1) ──────────

interface ParseState {
  tokens: Token[];
  pos: number;
  variable: string | null;
  hadBracket: boolean;
  termCount: number;
}

function linear(a: Rational, b: Rational, variable: string | null): LinearForm {
  return { a, b, variable };
}

function addForms(l: LinearForm, r: LinearForm): LinearForm {
  return linear(ratAdd(l.a, r.a), ratAdd(l.b, r.b), l.variable ?? r.variable);
}

function subForms(l: LinearForm, r: LinearForm): LinearForm {
  return linear(ratSub(l.a, r.a), ratSub(l.b, r.b), l.variable ?? r.variable);
}

/** Rejects anything of degree > 1 — x·x is outside this grammar, not "wrong". */
function mulForms(l: LinearForm, r: LinearForm): LinearForm {
  if (!ratIsZero(l.a) && !ratIsZero(r.a)) {
    throw new Error("degree > 1 is outside the supported grammar");
  }
  if (ratIsZero(l.a)) {
    return linear(ratMul(l.b, r.a), ratMul(l.b, r.b), r.variable ?? l.variable);
  }
  return linear(ratMul(l.a, r.b), ratMul(l.b, r.b), l.variable ?? r.variable);
}

function divForms(l: LinearForm, r: LinearForm): LinearForm {
  if (!ratIsZero(r.a)) {
    throw new Error("division by an expression containing a variable is outside the supported grammar");
  }
  if (ratIsZero(r.b)) {
    throw new Error("division by zero");
  }
  return linear(ratDiv(l.a, r.b), ratDiv(l.b, r.b), l.variable);
}

function peek(st: ParseState): Token | undefined {
  return st.tokens[st.pos];
}

function parseExpression(st: ParseState): LinearForm {
  let left = parseTerm(st);
  for (;;) {
    const t = peek(st);
    if (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
      st.pos++;
      st.termCount++;
      const right = parseTerm(st);
      left = t.value === "+" ? addForms(left, right) : subForms(left, right);
      continue;
    }
    return left;
  }
}

function parseTerm(st: ParseState): LinearForm {
  let left = parseFactor(st);
  for (;;) {
    const t = peek(st);
    if (t && t.kind === "op" && (t.value === "*" || t.value === "/")) {
      st.pos++;
      const right = parseFactor(st);
      left = t.value === "*" ? mulForms(left, right) : divForms(left, right);
      continue;
    }
    // Implicit multiplication: 3x, 2(x+1), (x+1)(...) is rejected by mulForms.
    if (t && (t.kind === "var" || t.kind === "lparen" || t.kind === "num")) {
      const right = parseFactor(st);
      left = mulForms(left, right);
      continue;
    }
    return left;
  }
}

function parseFactor(st: ParseState): LinearForm {
  const t = peek(st);
  if (!t) throw new Error("unexpected end of expression");

  if (t.kind === "op" && t.value === "-") {
    st.pos++;
    const inner = parseFactor(st);
    return linear(ratMul(inner.a, rat(-1)), ratMul(inner.b, rat(-1)), inner.variable);
  }
  if (t.kind === "op" && t.value === "+") {
    st.pos++;
    return parseFactor(st);
  }
  if (t.kind === "num") {
    st.pos++;
    return linear(ZERO, rat(t.value), null);
  }
  if (t.kind === "var") {
    st.pos++;
    if (st.variable && st.variable !== t.name) {
      throw new Error(`two different variables (${st.variable}, ${t.name}) are outside the supported grammar`);
    }
    st.variable = t.name;
    return linear(rat(1), ZERO, t.name);
  }
  if (t.kind === "lparen") {
    st.pos++;
    st.hadBracket = true;
    const inner = parseExpression(st);
    const close = peek(st);
    if (!close || close.kind !== "rparen") throw new Error("unbalanced bracket");
    st.pos++;
    return inner;
  }
  throw new Error(`unexpected token in expression`);
}

/** Throws on anything outside the grammar — the caller turns that into PARSE_FAILED, never INVALID. */
export function parseLinearWithBracket(input: string): ParsedLine {
  if (!input || !input.trim()) throw new Error("empty line");
  const tokens = tokenize(input);
  const eqIndex = tokens.findIndex((t) => t.kind === "eq");

  if (tokens.filter((t) => t.kind === "eq").length > 1) {
    throw new Error("more than one equals sign");
  }

  if (eqIndex === -1) {
    const st: ParseState = { tokens, pos: 0, variable: null, hadBracket: false, termCount: 1 };
    const lhs = parseExpression(st);
    if (st.pos !== tokens.length) throw new Error("trailing tokens after expression");
    return {
      lhs,
      rhs: null,
      variable: st.variable,
      hadBracket: st.hadBracket,
      lhsTermCount: st.termCount,
      rhsTermCount: 0,
    };
  }

  const leftTokens = tokens.slice(0, eqIndex);
  const rightTokens = tokens.slice(eqIndex + 1);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    throw new Error("equation is missing a side");
  }

  const lst: ParseState = { tokens: leftTokens, pos: 0, variable: null, hadBracket: false, termCount: 1 };
  const lhs = parseExpression(lst);
  if (lst.pos !== leftTokens.length) throw new Error("trailing tokens on the left side");

  const rst: ParseState = {
    tokens: rightTokens,
    pos: 0,
    variable: lst.variable,
    hadBracket: false,
    termCount: 1,
  };
  const rhs = parseExpression(rst);
  if (rst.pos !== rightTokens.length) throw new Error("trailing tokens on the right side");

  return {
    lhs,
    rhs,
    variable: rst.variable,
    hadBracket: lst.hadBracket || rst.hadBracket,
    lhsTermCount: lst.termCount,
    rhsTermCount: rst.termCount,
  };
}

/** Canonical `a·x + b` (or `a·x + b = c·x + d`) string — stored alongside the raw submission so a later reader can see what the verifier actually compared. */
export function normalizeLine(parsed: ParsedLine): string {
  const side = (f: LinearForm): string =>
    `${ratToString(f.a)}${parsed.variable ?? "x"}${f.b.n < 0 ? "-" : "+"}${ratToString(
      f.b.n < 0 ? ratMul(f.b, rat(-1)) : f.b,
    )}`;
  return parsed.rhs ? `${side(parsed.lhs)}=${side(parsed.rhs)}` : side(parsed.lhs);
}

// ─── Equivalence ────────────────────────────────────────────────────────────

type SolutionSet =
  | { kind: "unique"; value: Rational }
  | { kind: "none" }
  | { kind: "all" };

function solutionSet(parsed: ParsedLine): SolutionSet {
  const rhs = parsed.rhs ?? linear(ZERO, ZERO, null);
  const a = ratSub(parsed.lhs.a, rhs.a);
  const b = ratSub(rhs.b, parsed.lhs.b);
  if (ratIsZero(a)) {
    return ratIsZero(b) ? { kind: "all" } : { kind: "none" };
  }
  return { kind: "unique", value: ratDiv(b, a) };
}

/**
 * Display form of a line's solution for debug provenance — reuses the same
 * `solutionSet` arithmetic the verifier already uses for equivalence. Returns
 * null when the line has no unique solution (identity, contradiction, bare
 * expression, or unparseable input). Do not re-implement solving elsewhere.
 */
export function solveLineForDisplay(line: string): string | null {
  let parsed: ParsedLine;
  try {
    parsed = parseLinearWithBracket(line);
  } catch {
    return null;
  }
  if (!parsed.rhs) return null;
  const set = solutionSet(parsed);
  if (set.kind !== "unique") return null;
  const variable = parsed.variable ?? "x";
  return `${variable} = ${ratToString(set.value)}`;
}

// ─── Step verification ──────────────────────────────────────────────────────

export interface StepVerification {
  validity: StepValidity;
  transformation: StepTransformation;
  normalizedPreviousLine?: string;
  normalizedSubmittedLine?: string;
  firstInvalidActionCode?: string;
  firstInvalidActionDescription?: string;
  /** Set when the line could not be parsed — the reason, for debugging and for the AI-grader prompt. */
  parseError?: string;
}

/**
 * The central rule: a step is VALID when the submitted line preserves the
 * previous line's meaning — same solution for equations, same linear form for
 * bare expressions. Any valid route is accepted; there is no canonical
 * sequence a student must mimic.
 */
export interface BareAnswerCheck {
  /** True when the submitted line is a naked value — `5`, `-1/2` — with no variable and no equals sign. */
  isBareAnswer: boolean;
  /** Whether that value is the solution of the previous line. Undefined unless `isBareAnswer`. */
  matchesSolution?: boolean;
  /** The independently computed solution, for the caller's message. */
  solution?: string;
}

/**
 * Decides a bare final answer without asking a model.
 *
 * A student who solves `3x + 5 = 20` in their head and types `5` is right, but
 * `5` is not an equation, so `verifyStepValidity` abstains (AMBIGUOUS) and the
 * line used to fall through to the AI grader — whose contract is VALID or
 * INVALID and nothing else. It chose INVALID, so a correct answer was marked
 * wrong and negative evidence was written against a skill the student had just
 * demonstrated.
 *
 * Nothing here is a judgement call: solve the previous line, compare. The AI
 * grader is for input with genuinely nothing to compute — `umm i think ?? x` —
 * not for arithmetic.
 *
 * The caller still has to weigh this as weaker evidence than shown working:
 * a right answer proves the destination, not the route.
 */
export function checkBareFinalAnswer(previousLine: string, submittedLine: string): BareAnswerCheck {
  const raw = foldMinusLookalikes(submittedLine).trim();
  // A bare answer has no equals sign and no letters — anything else is a line
  // of working and belongs to the normal path.
  if (raw.includes("=") || /[a-zA-Z]/.test(raw)) return { isBareAnswer: false };

  let value: Rational;
  try {
    const parsed = parseLinearWithBracket(raw);
    if (parsed.rhs !== null || !ratIsZero(parsed.lhs.a)) return { isBareAnswer: false };
    value = parsed.lhs.b;
  } catch {
    return { isBareAnswer: false };
  }

  let prev: ParsedLine;
  try {
    prev = parseLinearWithBracket(previousLine);
  } catch {
    return { isBareAnswer: true };
  }
  // Needs a solvable equation to compare against.
  if (!prev.rhs) return { isBareAnswer: true };
  const a = ratSub(prev.lhs.a, prev.rhs.a);
  const b = ratSub(prev.rhs.b, prev.lhs.b);
  if (ratIsZero(a)) return { isBareAnswer: true };

  const solution = ratDiv(b, a);
  return {
    isBareAnswer: true,
    matchesSolution: ratEq(value, solution),
    solution: ratToString(solution),
  };
}

export function verifyStepValidity(previousLine: string, submittedLine: string): StepVerification {
  let prev: ParsedLine;
  let next: ParsedLine;

  try {
    prev = parseLinearWithBracket(previousLine);
  } catch (err) {
    return {
      validity: "PARSE_FAILED",
      transformation: "UNKNOWN",
      parseError: `previous line: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    next = parseLinearWithBracket(submittedLine);
  } catch (err) {
    return {
      validity: "PARSE_FAILED",
      transformation: "UNKNOWN",
      normalizedPreviousLine: normalizeLine(prev),
      parseError: `submitted line: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const normalizedPreviousLine = normalizeLine(prev);
  const normalizedSubmittedLine = normalizeLine(next);
  const transformation = classifyTransformation(prev, next);

  // Mixing an equation and a bare expression means the two lines aren't
  // comparable — valid work may still be happening, so this is AMBIGUOUS
  // (eligible for the AI fallback), never INVALID.
  if ((prev.rhs === null) !== (next.rhs === null)) {
    return {
      validity: "AMBIGUOUS",
      transformation,
      normalizedPreviousLine,
      normalizedSubmittedLine,
    };
  }

  if (prev.rhs === null) {
    const equal = ratEq(prev.lhs.a, next.lhs.a) && ratEq(prev.lhs.b, next.lhs.b);
    if (equal) {
      return { validity: "VALID", transformation, normalizedPreviousLine, normalizedSubmittedLine };
    }
    const firstInvalid = findFirstInvalidAction(previousLine, prev, next);
    return {
      validity: "INVALID",
      transformation,
      normalizedPreviousLine,
      normalizedSubmittedLine,
      ...firstInvalid,
    };
  }

  const prevSolution = solutionSet(prev);
  const nextSolution = solutionSet(next);

  // A degenerate line (0 = 0, or 3 = 5) has no single solution to compare
  // against, so solution-matching can't decide — again AMBIGUOUS, not INVALID.
  if (prevSolution.kind !== "unique" || nextSolution.kind !== "unique") {
    const sameDegenerateKind = prevSolution.kind === nextSolution.kind;
    return {
      validity: sameDegenerateKind ? "VALID" : "AMBIGUOUS",
      transformation,
      normalizedPreviousLine,
      normalizedSubmittedLine,
    };
  }

  if (ratEq(prevSolution.value, nextSolution.value)) {
    return { validity: "VALID", transformation, normalizedPreviousLine, normalizedSubmittedLine };
  }

  const firstInvalid = findFirstInvalidAction(previousLine, prev, next);
  return {
    validity: "INVALID",
    transformation,
    normalizedPreviousLine,
    normalizedSubmittedLine,
    ...firstInvalid,
  };
}

/** Structural heuristics only — what the student appears to have been doing, which is separate from whether it was correct. */
export function classifyTransformation(prev: ParsedLine, next: ParsedLine): StepTransformation {
  if (prev.hadBracket && !next.hadBracket) {
    // The parser normalises the bracketed side to its correctly expanded
    // expression. If that side is unchanged but the untouched side was copied
    // differently, distribution succeeded; this is a transcription slip.
    if (
      prev.rhs &&
      next.rhs &&
      linearExpressionEquals(prev.lhs, next.lhs) &&
      !linearExpressionEquals(prev.rhs, next.rhs)
    ) {
      return "OTHER";
    }
    return "DISTRIBUTE";
  }

  if (prev.rhs && next.rhs) {
    const prevTerms = prev.lhsTermCount + prev.rhsTermCount;
    const nextTerms = next.lhsTermCount + next.rhsTermCount;

    // Variable disappeared from one side -> terms were collected across the =.
    const prevBothSidesHaveVar = !ratIsZero(prev.lhs.a) && !ratIsZero(prev.rhs.a);
    const nextOneSideHasVar = ratIsZero(next.lhs.a) !== ratIsZero(next.rhs.a);
    if (prevBothSidesHaveVar && nextOneSideHasVar) return "SUBTRACT_BOTH_SIDES";

    // Coefficient on x went to 1 while the constant scaled too -> divided through.
    if (!ratEq(prev.lhs.a, next.lhs.a) && !ratIsZero(prev.lhs.a) && !ratIsZero(next.lhs.a)) {
      const factor = ratDiv(prev.lhs.a, next.lhs.a);
      if (!ratEq(factor, rat(1))) return "DIVIDE_BOTH_SIDES";
    }

    // A constant moved off the variable side without the coefficient changing.
    if (ratEq(prev.lhs.a, next.lhs.a) && !ratEq(prev.lhs.b, next.lhs.b)) {
      return ratSub(next.lhs.b, prev.lhs.b).n > 0 ? "ADD_BOTH_SIDES" : "SUBTRACT_BOTH_SIDES";
    }

    if (nextTerms < prevTerms) return "COMBINE_LIKE_TERMS";
  }

  if (!prev.rhs && !next.rhs && next.lhsTermCount < prev.lhsTermCount) {
    return "COMBINE_LIKE_TERMS";
  }

  return "SIMPLIFY";
}

/**
 * Pinpoints the first wrong action, which is what makes this diagnostic worth
 * building: "the -5 inside the bracket became -10 instead of +10" is
 * teachable in 30 seconds, whereas "wrong answer" is not.
 *
 * Only the negative-distribution family is analysed in depth here — that is
 * this slice's diagnostic target. Everything else gets a truthful generic
 * description rather than a speculative one.
 */
export function findFirstInvalidAction(
  previousLineRaw: string,
  prev: ParsedLine,
  next: ParsedLine,
): { firstInvalidActionCode?: string; firstInvalidActionDescription?: string } {
  if (prev.hadBracket && !next.hadBracket) {
    if (
      prev.rhs &&
      next.rhs &&
      linearExpressionEquals(prev.lhs, next.lhs) &&
      !linearExpressionEquals(prev.rhs, next.rhs)
    ) {
      return {
        firstInvalidActionCode: "COPIED_UNCHANGED_SIDE",
        firstInvalidActionDescription: `the bracket was expanded correctly, but the unchanged right side was copied as ${formatLinearExpression(
          next.rhs,
          prev.variable ?? "x",
        )} instead of ${formatLinearExpression(prev.rhs, prev.variable ?? "x")}`,
      };
    }
    const bracket = matchSingleBracket(previousLineRaw);
    if (bracket) {
      const { multiplier, inner } = bracket;
      const variable = prev.variable ?? "x";
      // Correct expansion of the bracket alone (prev.lhs already includes any
      // terms that sat outside it — e.g. the +3 in `-2(x - 5) + 3`).
      const correctA = ratMul(rat(multiplier), rat(inner.a));
      const correctB = ratMul(rat(multiplier), rat(inner.b));
      const outsideB = ratSub(prev.lhs.b, correctB);

      // Coefficient of the variable must match a correct expansion before we
      // diagnose constant-term mistakes. Dropping the outer minus
      // (`2x - 10 + 3` from `-2(x - 5) + 3`) produces the same constant delta
      // as the canonical sign-product error, so checking only deltaB conflates
      // them.
      if (!ratEq(next.lhs.a, correctA)) {
        return {
          firstInvalidActionCode: "OUTER_SIGN_DROPPED",
          firstInvalidActionDescription: `the outer factor ${multiplier} was not applied to ${variable} — the coefficient became ${ratToString(
            next.lhs.a,
          )} instead of ${ratToString(correctA)}`,
        };
      }

      // prev.lhs is already the *correctly* expanded line, so comparing deltas
      // isolates the bracket mistake even when other terms sit outside the
      // bracket (`-2(x - 5) + 3` — the +3 must not mask the sign error).
      const deltaB = ratSub(next.lhs.b, prev.lhs.b);

      // Signature error: the product's sign was lost, so the constant lands
      // 2x the correct product away from where it should be.
      if (!ratIsZero(correctB) && ratEq(deltaB, ratMul(correctB, rat(-2)))) {
        return {
          firstInvalidActionCode: "NEGATIVE_SIGN_PRODUCT",
          firstInvalidActionDescription: `(${multiplier})(${inner.b}) was evaluated as ${ratToString(
            ratMul(correctB, rat(-1)),
          )}, but multiplying those two signs gives ${ratToString(correctB)}`,
        };
      }

      // Multiplier reached the variable term but never the constant inside.
      if (ratEq(deltaB, ratSub(rat(inner.b), correctB))) {
        return {
          firstInvalidActionCode: "INCOMPLETE_DISTRIBUTION",
          firstInvalidActionDescription: `the ${multiplier} was multiplied by the first term inside the bracket but not by ${inner.b}`,
        };
      }

      // Bracket expanded correctly; a constant that sat *outside* it vanished.
      // `-2x + 10` from `-2(x - 5) + 3` must not be blamed on the bracket.
      if (ratEq(next.lhs.b, correctB) && !ratIsZero(outsideB)) {
        const outsideText =
          outsideB.n < 0 ? ratToString(outsideB) : `+${ratToString(outsideB)}`;
        return {
          firstInvalidActionCode: "OUTER_CONSTANT_DROPPED",
          firstInvalidActionDescription: `the ${outsideText} outside the bracket was dropped; the bracket itself expanded correctly`,
        };
      }

      return {
        firstInvalidActionCode: "DISTRIBUTION_ERROR",
        firstInvalidActionDescription: `expanding the bracket did not give the same value as ${multiplier} times each term inside it`,
      };
    }
  }

  if (prev.rhs && next.rhs) {
    const coefficientUnchanged = ratEq(prev.lhs.a, next.lhs.a);
    if (!coefficientUnchanged && ratEq(prev.rhs.b, next.rhs.b) && !ratIsZero(prev.lhs.a)) {
      return {
        firstInvalidActionCode: "COEFFICIENT_DROPPED",
        firstInvalidActionDescription: `the coefficient changed from ${ratToString(prev.lhs.a)} to ${ratToString(
          next.lhs.a,
        )} without the other side being divided by the same amount`,
      };
    }
    return {
      firstInvalidActionCode: "NOT_EQUIVALENT",
      firstInvalidActionDescription: "this line does not have the same solution as the line above it",
    };
  }

  return {
    firstInvalidActionCode: "NOT_EQUIVALENT",
    firstInvalidActionDescription: "this line is not equivalent to the line above it",
  };
}

function linearExpressionEquals(left: LinearForm, right: LinearForm): boolean {
  return ratEq(left.a, right.a) && ratEq(left.b, right.b);
}

function formatLinearExpression(expression: LinearForm, variable: string): string {
  if (ratIsZero(expression.a)) return ratToString(expression.b);
  const variableTerm = ratEq(expression.a, rat(1))
    ? variable
    : ratEq(expression.a, rat(-1))
      ? `-${variable}`
      : `${ratToString(expression.a)}${variable}`;
  if (ratIsZero(expression.b)) return variableTerm;
  const magnitude = rat(Math.abs(expression.b.n), expression.b.d);
  return `${variableTerm} ${expression.b.n < 0 ? "-" : "+"} ${ratToString(magnitude)}`;
}

/** Extracts `A(x ± B)` from the raw text so the first-invalid-action analysis can talk about the actual numbers the student saw. */
export function matchSingleBracket(
  raw: string,
): { multiplier: number; inner: { a: number; b: number } } | null {
  // Fold first: this regex only knows ASCII `-`, and a unicode minus here
  // costs the caller its precise first-invalid-action diagnosis.
  const m = /(-?\d*)\s*\(\s*(-?\d*)\s*([a-zA-Z])\s*([+-])\s*(\d+)\s*\)/.exec(
    foldMinusLookalikes(raw),
  );
  if (!m) return null;
  const rawMultiplier = m[1] ?? "";
  const rawInnerA = m[2] ?? "";
  const sign = m[4] === "-" ? -1 : 1;
  const innerB = Number(m[5]);
  const multiplier = rawMultiplier === "" || rawMultiplier === "-" ? (rawMultiplier === "-" ? -1 : 1) : Number(rawMultiplier);
  const innerA = rawInnerA === "" || rawInnerA === "-" ? (rawInnerA === "-" ? -1 : 1) : Number(rawInnerA);
  return { multiplier, inner: { a: innerA, b: sign * innerB } };
}

/** True once the line reads `x = <number>` — how the session service knows an item is finished without asking the student to press a separate "final answer" button. */
export function isSolvedForm(parsed: ParsedLine): boolean {
  if (!parsed.rhs) return false;
  return ratEq(parsed.lhs.a, rat(1)) && ratIsZero(parsed.lhs.b) && ratIsZero(parsed.rhs.a);
}
