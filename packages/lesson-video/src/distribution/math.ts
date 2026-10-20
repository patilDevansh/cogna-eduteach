/**
 * Exact rational arithmetic for linear expressions of the form
 *   m₁(a₁x + b₁) + m₂(a₂x + b₂) + …
 *
 * Every number the distribution lesson shows or narrates is computed here —
 * nothing on screen is hand-typed mathematics. verifyDistributionLesson
 * checks the expansion against the original expression before a render is
 * allowed, per "no unchecked math to students".
 */

export interface Rational {
  n: number;
  d: number;
}

export interface Term {
  coef: Rational;
  /** true for an x-term, false for a constant. */
  x: boolean;
}

export interface BracketGroup {
  multiplier: Rational;
  terms: Term[];
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function q(n: number, d = 1): Rational {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) {
    throw new Error(`Invalid rational ${n}/${d}`);
  }
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (sign * n) / g, d: Math.abs(d) / g };
}

export const add = (a: Rational, b: Rational): Rational => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational): Rational => q(a.n * b.n, a.d * b.d);
export const eq = (a: Rational, b: Rational): boolean => a.n === b.n && a.d === b.d;
export const isZero = (a: Rational): boolean => a.n === 0;
export const abs = (a: Rational): Rational => q(Math.abs(a.n), a.d);
export const neg = (a: Rational): Rational => q(-a.n, a.d);

export function expandGroup(group: BracketGroup): Term[] {
  return group.terms.map((term) => ({ coef: mul(group.multiplier, term.coef), x: term.x }));
}

/** Collects like terms: x-term first, then the constant. Zero terms drop. */
export function combine(terms: Term[]): Term[] {
  let xCoef = q(0);
  let constant = q(0);
  for (const term of terms) {
    if (term.x) xCoef = add(xCoef, term.coef);
    else constant = add(constant, term.coef);
  }
  const out: Term[] = [];
  if (!isZero(xCoef)) out.push({ coef: xCoef, x: true });
  if (!isZero(constant)) out.push({ coef: constant, x: false });
  return out;
}

export function evaluateTerms(terms: Term[], x: Rational): Rational {
  return terms.reduce((sum, term) => add(sum, term.x ? mul(term.coef, x) : term.coef), q(0));
}

export function evaluateGroup(group: BracketGroup, x: Rational): Rational {
  return mul(group.multiplier, evaluateTerms(group.terms, x));
}

export function evaluateGroups(groups: BracketGroup[], x: Rational): Rational {
  return groups.reduce((sum, group) => add(sum, evaluateGroup(group, x)), q(0));
}

// ---------- display formatting ----------

const UNICODE_FRACTIONS: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
};

/** Magnitude only — callers own the sign. */
export function formatMagnitude(r: Rational): string {
  const a = abs(r);
  if (a.d === 1) return String(a.n);
  return UNICODE_FRACTIONS[`${a.n}/${a.d}`] ?? `${a.n}/${a.d}`;
}

export function formatRational(r: Rational): string {
  return `${r.n < 0 ? "−" : ""}${formatMagnitude(r)}`;
}

/** "4x", "x", "6" — magnitude with variable, no leading sign. `v` is the variable letter. */
export function formatTermBody(term: Term, v = "x"): string {
  if (!term.x) return formatMagnitude(term.coef);
  const a = abs(term.coef);
  return eq(a, q(1)) ? v : `${formatMagnitude(a)}${v}`;
}

/** Signed term as it appears after the first position: "+ 6", "− 3". */
export function formatSignedTerm(term: Term, v = "x"): string {
  return `${term.coef.n < 0 ? "−" : "+"} ${formatTermBody(term, v)}`;
}

/** Signed term in leading position: "4x", "−3". */
export function formatLeadingTerm(term: Term, v = "x"): string {
  return `${term.coef.n < 0 ? "−" : ""}${formatTermBody(term, v)}`;
}

export function formatTerms(terms: Term[], v = "x"): string {
  if (!terms.length) return "0";
  return terms.map((term, i) => (i === 0 ? formatLeadingTerm(term, v) : formatSignedTerm(term, v))).join(" ");
}

/** A signed factor as it's written inside a product: "5", "(−8)". */
export function formatFactor(term: Term, v = "x"): string {
  const body = formatLeadingTerm(term, v);
  return term.coef.n < 0 ? `(${body})` : body;
}

// ---------- spoken formatting (narration) ----------

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const SPOKEN_FRACTIONS: Record<string, string> = {
  "1/2": "a half",
  "1/3": "a third",
  "1/4": "a quarter",
  "2/3": "two thirds",
  "3/4": "three quarters",
};

export function spokenMagnitude(r: Rational): string {
  const a = abs(r);
  if (a.d === 1) {
    if (a.n <= 20) return WORDS[a.n]!;
    if (a.n < 100) {
      const tens = TENS[Math.floor(a.n / 10)]!;
      return a.n % 10 ? `${tens}-${WORDS[a.n % 10]}` : tens;
    }
    throw new Error(`No spoken form for ${a.n}; extend spokenMagnitude before narrating it.`);
  }
  const spoken = SPOKEN_FRACTIONS[`${a.n}/${a.d}`];
  if (!spoken) throw new Error(`No spoken form for ${a.n}/${a.d}.`);
  return spoken;
}

export function spokenRational(r: Rational): string {
  return `${r.n < 0 ? "minus " : ""}${spokenMagnitude(r)}`;
}

/** "four x", "minus six", "x". */
export function spokenTerm(term: Term, v = "x"): string {
  const sign = term.coef.n < 0 ? "minus " : "";
  if (!term.x) return `${sign}${spokenMagnitude(term.coef)}`;
  const a = abs(term.coef);
  return `${sign}${eq(a, q(1)) ? "" : `${spokenMagnitude(a)} `}${v}`;
}
