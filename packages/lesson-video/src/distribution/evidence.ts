/**
 * Deterministic misconception matching for bracket-distribution items.
 *
 * Given a question the student got wrong ("Evaluate −2(5 − 8).") and their
 * final answer, this recomputes what each known distribution mistake would
 * have produced and reports which one — if exactly one — the student's answer
 * equals. No model judgement is involved: a match is an arithmetic identity,
 * so a lesson built on it is teaching the mistake the student actually made.
 */
import {
  add,
  combine,
  eq,
  evaluateTerms,
  expandGroup,
  formatLeadingTerm,
  mul,
  neg,
  q,
  type BracketGroup,
  type Rational,
  type Term,
} from "./math";

export type DistributionMistake = "untouched" | "sign-lost";

export interface ParsedExpression {
  groups: BracketGroup[];
  /** Terms outside any bracket, e.g. the "+ 3" in −4(2 − 7) + 3. */
  extras: Term[];
  /** Variable letter, or null for a purely numeric expression. */
  variable: string | null;
}

export interface DistributionErrorMatch {
  prompt: string;
  expression: ParsedExpression;
  mistake: DistributionMistake;
  groupIndex: number;
  termIndex: number;
  /** What the student effectively wrote under each bracket. */
  studentProducts: Term[][];
  studentAnswer: Term[];
}

// ---------- parsing ----------

function normalize(text: string): string {
  return text
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("×", "*")
    .replaceAll("·", "*")
    .replaceAll("½", "(1/2)")
    .replace(/\s+/g, "");
}

class Cursor {
  i = 0;
  constructor(readonly s: string) {}
  peek(): string | undefined {
    return this.s[this.i];
  }
  eat(ch: string): boolean {
    if (this.s[this.i] === ch) {
      this.i += 1;
      return true;
    }
    return false;
  }
  done(): boolean {
    return this.i >= this.s.length;
  }
}

function readNumber(c: Cursor): Rational | null {
  const m = /^\d+/.exec(c.s.slice(c.i));
  if (!m) {
    // "(1/2)" coefficient written as a parenthesised fraction.
    const f = /^\((\d+)\/(\d+)\)/.exec(c.s.slice(c.i));
    if (!f) return null;
    c.i += f[0].length;
    return q(Number(f[1]), Number(f[2]));
  }
  c.i += m[0].length;
  const frac = /^\/(\d+)/.exec(c.s.slice(c.i));
  if (frac) {
    c.i += frac[0].length;
    return q(Number(m[0]), Number(frac[1]));
  }
  return q(Number(m[0]));
}

interface VarBox {
  name: string | null;
}

/** A single linear term with an explicit sign: "-8", "4x", "x", "(1/2)x". */
function readTerm(c: Cursor, sign: number, vars: VarBox): Term | null {
  const coef = readNumber(c);
  const ch = c.peek();
  if (ch && /[a-z]/i.test(ch)) {
    if (vars.name && vars.name !== ch) return null;
    vars.name = ch;
    c.i += 1;
    return { coef: q(sign * (coef?.n ?? 1), coef?.d ?? 1), x: true };
  }
  if (!coef) return null;
  return { coef: q(sign * coef.n, coef.d), x: false };
}

function readSign(c: Cursor, required: boolean): number | null {
  if (c.eat("+")) return 1;
  if (c.eat("-")) return -1;
  return required ? null : 1;
}

/** Linear terms inside a bracket, e.g. "5-8" or "4x-6". No nesting. */
function readInner(c: Cursor, vars: VarBox): Term[] | null {
  const terms: Term[] = [];
  let first = true;
  while (c.peek() !== ")") {
    const sign = readSign(c, !first);
    if (sign === null) return null;
    const term = readTerm(c, sign, vars);
    if (!term) return null;
    terms.push(term);
    first = false;
    if (c.done()) return null;
  }
  return terms.length >= 2 ? terms : null;
}

/** Parses sums of bracket groups and plain terms. Returns null for anything else. */
export function parseLinearExpression(text: string): ParsedExpression | null {
  const c = new Cursor(normalize(text));
  const vars: VarBox = { name: null };
  const groups: BracketGroup[] = [];
  const extras: Term[] = [];
  let first = true;
  while (!c.done()) {
    const sign = readSign(c, !first);
    if (sign === null) return null;
    first = false;
    const start = c.i;
    const coef = readNumber(c);
    c.eat("*");
    if (c.eat("(")) {
      const terms = readInner(c, vars);
      if (!terms || !c.eat(")")) return null;
      // A product of brackets or a trailing factor ("(−3) × 2") is out of scope.
      const next = c.peek();
      if (next === "(" || next === "*" || (next && /[\da-z]/i.test(next))) return null;
      groups.push({ multiplier: q(sign * (coef?.n ?? 1), coef?.d ?? 1), terms });
      continue;
    }
    c.i = start;
    const term = readTerm(c, sign, vars);
    if (!term) return null;
    extras.push(term);
  }
  if (!groups.length && !extras.length) return null;
  return { groups, extras, variable: vars.name };
}

/** The value the student committed to: the text after the last "=" on the last non-empty line. */
export function parseStudentAnswer(submitted: string, variable: string | null): Term[] | null {
  const lines = submitted.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines.at(-1);
  if (!last) return null;
  const rhs = last.includes("=") ? last.slice(last.lastIndexOf("=") + 1) : last;
  const parsed = parseLinearExpression(rhs);
  if (!parsed || parsed.groups.length) return null;
  if (parsed.variable && variable && parsed.variable !== variable) return null;
  return combine(parsed.extras);
}

/** The expression a bracket question asks about, e.g. "Evaluate −2(5 − 8). Show your steps." */
export function expressionFromPrompt(prompt: string): string | null {
  const m = /^\s*(?:Evaluate|Expand|Simplify|Expand and simplify)\s+(.+?)\.(?:\s|$)/i.exec(prompt);
  return m?.[1] ?? null;
}

// ---------- matching ----------

function sameTerms(a: Term[], b: Term[]): boolean {
  const ca = combine(a);
  const cb = combine(b);
  return ca.length === cb.length && ca.every((t, i) => t.x === cb[i]!.x && eq(t.coef, cb[i]!.coef));
}

export function answerFor(expression: ParsedExpression, products: Term[][]): Term[] {
  return combine([...products.flat(), ...expression.extras]);
}

/**
 * Returns the single distribution mistake the student's answer is explained
 * by, or null when the answer is right, unexplained, or ambiguous (two
 * different mistakes would give the same number).
 */
export function matchDistributionMistake(prompt: string, submitted: string): DistributionErrorMatch | null {
  const source = expressionFromPrompt(prompt);
  if (!source) return null;
  const expression = parseLinearExpression(source);
  if (!expression || !expression.groups.length) return null;
  const studentAnswer = parseStudentAnswer(submitted, expression.variable);
  if (!studentAnswer) return null;

  const correct = expression.groups.map(expandGroup);
  if (sameTerms(answerFor(expression, correct), studentAnswer)) return null;

  const hits: DistributionErrorMatch[] = [];
  expression.groups.forEach((group, g) => {
    if (eq(group.multiplier, q(1))) return;
    group.terms.forEach((term, t) => {
      const candidates: Array<[DistributionMistake, Term]> = [["untouched", term]];
      if (group.multiplier.n < 0) candidates.push(["sign-lost", { ...correct[g]![t]!, coef: neg(correct[g]![t]!.coef) }]);
      for (const [mistake, written] of candidates) {
        const products = correct.map((row, gi) => row.map((p, ti) => (gi === g && ti === t ? written : p)));
        if (sameTerms(answerFor(expression, products), studentAnswer)) {
          hits.push({ prompt, expression, mistake, groupIndex: g, termIndex: t, studentProducts: products, studentAnswer });
        }
      }
    });
  });
  if (hits.length === 1) return hits[0]!;
  // Several locations explain the same final answer (e.g. an untouched term in
  // either bracket gives 4x). Only the working can say which one happened: keep
  // the hits whose wrong product the student actually wrote down.
  const working = normalize(submitted);
  const written = hits.filter((h) => {
    const v = h.expression.variable ?? "x";
    const wrong = h.studentProducts[h.groupIndex]![h.termIndex]!;
    const right = correct[h.groupIndex]![h.termIndex]!;
    return working.includes(normalize(formatLeadingTerm(wrong, v))) && !working.includes(normalize(formatLeadingTerm(right, v)));
  });
  return written.length === 1 ? written[0]! : null;
}

/** Numeric value of a variable-free term list (for checks). */
export function numericValue(terms: Term[]): Rational {
  return evaluateTerms(terms, q(0));
}

export { add, mul };
