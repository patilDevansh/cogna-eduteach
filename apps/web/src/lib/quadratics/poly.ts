/**
 * Single-variable polynomial engine — no external
 * symbolic library. Supports the constrained expression family used by the
 * quadratic-expressions prototype: variable x, integer coefficients,
 * + - * juxtaposition, parentheses, and integer powers (^2 in practice).
 *
 * The core trick: every parsed expression is reduced to a flat list of
 * signed monomial Terms via full distribution — WITHOUT collecting
 * like terms. That flat list is itself pedagogically meaningful (for
 * (x+3)(x+5) it is literally the four partial products), and collecting
 * it into a coefficient array is a separate, explicit step. This lets the
 * diagnosis layer distinguish "wrong value" from "right value, not yet
 * combined" — a distinction a plain evaluator would silently erase.
 */

export interface Term {
  coeff: number;
  degree: number;
}

/** index i = coefficient of x^i, trimmed so the highest-degree entry is nonzero (or length 1 = [0]). */
export type NormalizedPoly = number[];

export type ParseResult = { ok: true; terms: Term[] } | { ok: false; reason: string };

export type NormalizeResult =
  | { ok: true; terms: Term[]; poly: NormalizedPoly }
  | { ok: false; reason: string };

const MAX_DEGREE = 6;
const MAX_TERMS = 400;

type TokenType = "NUM" | "VAR" | "PLUS" | "MINUS" | "STAR" | "CARET" | "LPAREN" | "RPAREN" | "EOF";
interface Token {
  type: TokenType;
  value?: number;
}

function tokenize(raw: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < raw.length && raw[j] >= "0" && raw[j] <= "9") j++;
      if (raw[j] === ".") return null; // decimals are outside the supported family
      tokens.push({ type: "NUM", value: Number(raw.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === "x" || c === "X") {
      tokens.push({ type: "VAR" });
      i++;
      continue;
    }
    if (c === "+") {
      tokens.push({ type: "PLUS" });
      i++;
      continue;
    }
    if (c === "-" || c === "−") {
      tokens.push({ type: "MINUS" });
      i++;
      continue;
    }
    if (c === "*" || c === "×" || c === "·") {
      tokens.push({ type: "STAR" });
      i++;
      continue;
    }
    if (c === "^") {
      tokens.push({ type: "CARET" });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }
    return null; // unsupported character — abstain rather than guess
  }
  tokens.push({ type: "EOF" });
  return tokens;
}

function mulTerms(a: Term[], b: Term[]): Term[] {
  const out: Term[] = [];
  for (const ta of a) {
    for (const tb of b) {
      out.push({ coeff: ta.coeff * tb.coeff, degree: ta.degree + tb.degree });
    }
  }
  return out;
}
function negTerms(a: Term[]): Term[] {
  return a.map((t) => ({ coeff: -t.coeff, degree: t.degree }));
}
function powTerms(a: Term[], n: number): Term[] {
  let result: Term[] = [{ coeff: 1, degree: 0 }];
  for (let k = 0; k < n; k++) result = mulTerms(result, a);
  return result;
}

class Parser {
  pos = 0;
  failed = false;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  atEnd(): boolean {
    return this.peek().type === "EOF";
  }
  private advance(): Token {
    return this.tokens[this.pos++];
  }
  private fail(): Term[] {
    this.failed = true;
    return [];
  }

  parseExpression(): Term[] {
    let terms = this.parseTerm();
    while (!this.failed) {
      const t = this.peek();
      if (t.type === "PLUS") {
        this.advance();
        terms = [...terms, ...this.parseTerm()];
      } else if (t.type === "MINUS") {
        this.advance();
        terms = [...terms, ...negTerms(this.parseTerm())];
      } else break;
    }
    return terms;
  }

  private parseTerm(): Term[] {
    let factor = this.parseSignedFactor();
    while (!this.failed) {
      const t = this.peek();
      if (t.type === "STAR") {
        this.advance();
        factor = mulTerms(factor, this.parseSignedFactor());
      } else if (t.type === "NUM" || t.type === "VAR" || t.type === "LPAREN") {
        // implicit multiplication: "3x", "3(x+4)", "(x+3)(x+5)"
        factor = mulTerms(factor, this.parseSignedFactor());
      } else break;
      if (factor.length > MAX_TERMS) return this.fail();
    }
    return factor;
  }

  private parseSignedFactor(): Term[] {
    if (this.peek().type === "MINUS") {
      this.advance();
      return negTerms(this.parseSignedFactor());
    }
    if (this.peek().type === "PLUS") {
      this.advance();
      return this.parseSignedFactor();
    }
    return this.parsePow();
  }

  private parsePow(): Term[] {
    const base = this.parsePrimary();
    if (this.failed) return [];
    if (this.peek().type === "CARET") {
      this.advance();
      const expTok = this.advance();
      if (
        expTok.type !== "NUM" ||
        expTok.value === undefined ||
        !Number.isInteger(expTok.value) ||
        expTok.value < 0
      ) {
        return this.fail();
      }
      if (expTok.value > MAX_DEGREE) return this.fail();
      return powTerms(base, expTok.value);
    }
    return base;
  }

  private parsePrimary(): Term[] {
    const t = this.peek();
    if (t.type === "NUM") {
      this.advance();
      return [{ coeff: t.value!, degree: 0 }];
    }
    if (t.type === "VAR") {
      this.advance();
      return [{ coeff: 1, degree: 1 }];
    }
    if (t.type === "LPAREN") {
      this.advance();
      const inner = this.parseExpression();
      if (this.failed) return [];
      if (this.peek().type !== "RPAREN") return this.fail();
      this.advance();
      return inner;
    }
    return this.fail();
  }
}

/** Parses into a flat, uncollected list of signed monomial terms (full distribution, no simplification). */
export function parseExpression(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const tokens = tokenize(trimmed);
  if (!tokens) return { ok: false, reason: "unsupported characters" };
  const parser = new Parser(tokens);
  const terms = parser.parseExpression();
  if (parser.failed || !parser.atEnd()) {
    return { ok: false, reason: "could not parse expression" };
  }
  const maxDeg = terms.reduce((m, t) => Math.max(m, t.degree), 0);
  if (maxDeg > MAX_DEGREE) return { ok: false, reason: "expression too complex" };
  return { ok: true, terms };
}

/** Merges same-degree terms into a canonical coefficient array. This is the "combine like terms" step, made explicit and separate from parsing. */
export function collectTerms(terms: Term[]): NormalizedPoly {
  const maxDeg = terms.reduce((m, t) => Math.max(m, t.degree), 0);
  const poly = new Array(maxDeg + 1).fill(0);
  for (const t of terms) poly[t.degree] += t.coeff;
  let end = poly.length - 1;
  while (end > 0 && poly[end] === 0) end--;
  return poly.slice(0, end + 1);
}

export function polyEquals(a: NormalizedPoly, b: NormalizedPoly): boolean {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  }
  return true;
}

export function normalize(raw: string): NormalizeResult {
  const r = parseExpression(raw);
  if (!r.ok) return r;
  return { ok: true, terms: r.terms, poly: collectTerms(r.terms) };
}

/** True only if both sides parse within the supported family AND are algebraically equivalent. */
export function areEquivalent(rawA: string, rawB: string): boolean {
  const a = normalize(rawA);
  const b = normalize(rawB);
  if (!a.ok || !b.ok) return false;
  return polyEquals(a.poly, b.poly);
}

export function equivalentToPoly(raw: string, target: NormalizedPoly): boolean {
  const n = normalize(raw);
  return n.ok && polyEquals(n.poly, target);
}

/**
 * True when the same power of x appears as more than one separate additive
 * term at the top level of full distribution — e.g. "x^2+3x+5x+15" collects
 * to the right value but still has two distinct degree-1 terms. This is the
 * "combining-like-terms gap" signal: correct value, unfinished simplification.
 */
export function hasUncombinedLikeTerms(terms: Term[]): boolean {
  const counts = new Map<number, number>();
  for (const t of terms) {
    if (t.coeff === 0) continue;
    counts.set(t.degree, (counts.get(t.degree) ?? 0) + 1);
  }
  return Array.from(counts.values()).some((n) => n > 1);
}

/** Canonical descending-degree display string, e.g. [15, 8, 1] → "x^2 + 8x + 15". */
export function formatPoly(poly: NormalizedPoly): string {
  const parts: string[] = [];
  for (let deg = poly.length - 1; deg >= 0; deg--) {
    const c = poly[deg];
    if (c === 0) continue;
    let term: string;
    if (deg === 0) term = `${Math.abs(c)}`;
    else if (deg === 1) term = Math.abs(c) === 1 ? "x" : `${Math.abs(c)}x`;
    else term = Math.abs(c) === 1 ? `x^${deg}` : `${Math.abs(c)}x^${deg}`;
    if (parts.length === 0) parts.push(c < 0 ? `-${term}` : term);
    else parts.push(c < 0 ? `- ${term}` : `+ ${term}`);
  }
  return parts.length === 0 ? "0" : parts.join(" ");
}

/** Numeric substitution — used for independent cross-checks of the symbolic engine (competency: checking equivalence through substitution). */
export function evaluateAt(poly: NormalizedPoly, x: number): number {
  return poly.reduce((sum, c, deg) => sum + c * Math.pow(x, deg), 0);
}

/** For a monic quadratic target [c, b, 1] (x^2+bx+c), checks a candidate factor pair against the product-and-sum conditions independently of any symbolic form the student writes. */
export function checkFactorPair(
  target: NormalizedPoly,
  p: number,
  q: number,
): { productOk: boolean; sumOk: boolean; product: number; sum: number; requiredProduct: number; requiredSum: number } {
  const requiredProduct = target[0] ?? 0;
  const requiredSum = target[1] ?? 0;
  const product = p * q;
  const sum = p + q;
  return {
    productOk: product === requiredProduct,
    sumOk: sum === requiredSum,
    product,
    sum,
    requiredProduct,
    requiredSum,
  };
}
