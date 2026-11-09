/**
 * Exact algebra for factorisation: expands any expression the diagnostic uses
 * (integers, single-letter variables, + − × ÷, whole-number powers, brackets,
 * implicit multiplication) into a canonical fraction of polynomials, so two
 * expressions can be compared exactly rather than by sampling.
 *
 * In factorisation "wrong" has two kinds, and conflating them throws away the
 * most diagnostic answers: NOT EQUAL to the original, or EQUAL but UNFINISHED
 * (3(4x + 6) for 12x + 18). classifyFactorisation separates them.
 */

type Monomial = string; // e.g. "x^2*y^1", "" for the constant term
type Poly = Map<Monomial, number>;
interface Frac { num: Poly; den: Poly }

type Node =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Node }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node };

export class AlgebraParseError extends Error {}

export function normalizeMathText(text: string): string {
  return String(text)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (sup) => `^${[...sup].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)).join("")}`)
    // Full-width and other compatibility forms some phone keyboards type (＋, （, ７), after the powers, which it would flatten.
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/[×·∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\*\*/g, "^")
    // Square and curly brackets are brackets: CBSE books use them for nesting.
    .replace(/[[{]/g, "(")
    .replace(/[\]}]/g, ")")
    .replace(/\s+/g, "");
}

/**
 * The expression a student meant as their final answer, without what students wrap around it:
 * "Ans: 7(x + 4).", "= 7(x + 4)", or the whole line "7x + 28 = 7(x + 4)" (the last side is the answer).
 */
export function finalAnswerText(text: string): string {
  const sides = String(text).split("=").map((side) => side.trim()).filter(Boolean);
  return (sides.at(-1) ?? "")
    .replace(/^(final\s+)?(ans(wer)?|so|therefore|hence)\b\s*(is\b)?\s*[:\-]?\s*/i, "")
    .replace(/[.,;!]+$/, "")
    .trim();
}

// ---------- parsing ----------

interface Token { kind: "num" | "var" | "op"; value: string }

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j]!)) j += 1;
      tokens.push({ kind: "num", value: source.slice(i, j) });
      i = j;
    } else if (/[a-zA-Z]/.test(c)) {
      // Variables are single letters, so "4xy" is 4·x·y. But a run of four or
      // more letters is a word ("none", "yes it is"), not a product of variables.
      let j = i;
      while (j < source.length && /[a-zA-Z]/.test(source[j]!)) j += 1;
      if (j - i >= 4) throw new AlgebraParseError("That looks like words, not an expression.");
      // X and x are one letter: phones capitalise, and Grade 8 never tells variables apart by case.
      tokens.push({ kind: "var", value: c.toLowerCase() });
      i += 1;
    } else if ("+-*/^()".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i += 1;
    } else {
      throw new AlgebraParseError(`Unsupported character "${c}".`);
    }
  }
  return tokens;
}

export function parseExpression(text: string): Node {
  const tokens = tokenize(normalizeMathText(text));
  if (tokens.length === 0) throw new AlgebraParseError("Empty expression.");
  let p = 0;
  const peek = () => tokens[p];
  const take = (value?: string): Token => {
    const t = tokens[p];
    if (!t || (value !== undefined && t.value !== value)) throw new AlgebraParseError(`Expected ${value ?? "a token"}.`);
    p += 1;
    return t;
  };
  const startsFactor = (t: Token | undefined) => !!t && (t.kind !== "op" || t.value === "(");

  const expression = (): Node => {
    let node = term();
    while (peek() && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = take().value as "+" | "-";
      node = { kind: "bin", op, left: node, right: term() };
    }
    return node;
  };
  const term = (): Node => {
    let node = unary();
    for (;;) {
      const t = peek();
      if (t && (t.value === "*" || t.value === "/")) {
        const op = take().value as "*" | "/";
        node = { kind: "bin", op, left: node, right: unary() };
      } else if (startsFactor(t)) {
        node = { kind: "bin", op: "*", left: node, right: power() };
      } else {
        return node;
      }
    }
  };
  const unary = (): Node => {
    const t = peek();
    if (t?.value === "-") { take(); return { kind: "neg", arg: unary() }; }
    if (t?.value === "+") { take(); return unary(); }
    return power();
  };
  const power = (): Node => {
    const base = primary();
    if (peek()?.value === "^") { take(); return { kind: "bin", op: "^", left: base, right: unary() }; }
    return base;
  };
  const primary = (): Node => {
    const t = take();
    if (t.kind === "num") {
      const value = Number(t.value);
      if (!Number.isFinite(value)) throw new AlgebraParseError(`Bad number ${t.value}.`);
      return { kind: "num", value };
    }
    if (t.kind === "var") return { kind: "var", name: t.value };
    if (t.value === "(") { const inner = expression(); take(")"); return inner; }
    throw new AlgebraParseError(`Unexpected "${t.value}".`);
  };

  const root = expression();
  if (p !== tokens.length) throw new AlgebraParseError("Unexpected trailing input.");
  return root;
}

// ---------- polynomial arithmetic ----------

function monomialKey(powers: Map<string, number>): Monomial {
  return [...powers.entries()].filter(([, e]) => e !== 0).sort(([a], [b]) => a.localeCompare(b)).map(([v, e]) => `${v}^${e}`).join("*");
}
function parseMonomial(key: Monomial): Map<string, number> {
  const m = new Map<string, number>();
  if (!key) return m;
  for (const part of key.split("*")) { const [v, e] = part.split("^"); m.set(v!, Number(e)); }
  return m;
}
function clean(poly: Poly): Poly {
  for (const [k, c] of poly) if (Math.abs(c) < 1e-12) poly.delete(k);
  return poly;
}
const constant = (c: number): Poly => clean(new Map([["", c]]));
function add(a: Poly, b: Poly, sign = 1): Poly {
  const out = new Map(a);
  for (const [k, c] of b) out.set(k, (out.get(k) ?? 0) + sign * c);
  return clean(out);
}
function mul(a: Poly, b: Poly): Poly {
  if (a.size * b.size > 64) {
    throw new AlgebraParseError("Expression exceeds supported polynomial complexity.");
  }
  const out: Poly = new Map();
  for (const [ka, ca] of a) {
    for (const [kb, cb] of b) {
      const powers = parseMonomial(ka);
      for (const [v, e] of parseMonomial(kb)) powers.set(v, (powers.get(v) ?? 0) + e);
      const key = monomialKey(powers);
      out.set(key, (out.get(key) ?? 0) + ca * cb);
    }
  }
  return clean(out);
}
function polyEqual(a: Poly, b: Poly): boolean {
  const diff = add(a, b, -1);
  return diff.size === 0;
}
function isZero(p: Poly): boolean { return p.size === 0; }

function toFrac(node: Node): Frac {
  switch (node.kind) {
    case "num": return { num: constant(node.value), den: constant(1) };
    case "var": return { num: new Map([[`${node.name}^1`, 1]]), den: constant(1) };
    case "neg": { const f = toFrac(node.arg); return { num: mul(f.num, constant(-1)), den: f.den }; }
    case "bin": {
      if (node.op === "^") {
        const exponent = node.right;
        if (exponent.kind !== "num" || !Number.isInteger(exponent.value) || exponent.value < 0 || exponent.value > 12) {
          throw new AlgebraParseError("Only whole-number powers up to 12 are supported.");
        }
        const base = toFrac(node.left);
        if (base.num.size > 2 && exponent.value > 4) {
          throw new AlgebraParseError("Powers above 4 for multi-term expressions are not supported.");
        }
        let num = constant(1); let den = constant(1);
        for (let i = 0; i < exponent.value; i += 1) { num = mul(num, base.num); den = mul(den, base.den); }
        return { num, den };
      }
      const l = toFrac(node.left); const r = toFrac(node.right);
      if (node.op === "+") return { num: add(mul(l.num, r.den), mul(r.num, l.den)), den: mul(l.den, r.den) };
      if (node.op === "-") return { num: add(mul(l.num, r.den), mul(r.num, l.den), -1), den: mul(l.den, r.den) };
      if (node.op === "*") return { num: mul(l.num, r.num), den: mul(l.den, r.den) };
      if (isZero(r.num)) throw new AlgebraParseError("Division by zero.");
      return { num: mul(l.num, r.den), den: mul(l.den, r.num) };
    }
  }
}

/** Exact: a/b ≡ c/d exactly when a·d ≡ c·b as polynomials. */
export function algebraicallyEqual(left: string, right: string): boolean {
  const a = toFrac(parseExpression(left));
  const b = toFrac(parseExpression(right));
  return polyEqual(mul(a.num, b.den), mul(b.num, a.den));
}

// ---------- factor structure ----------

function isNumberNode(node: Node): node is { kind: "num"; value: number } { return node.kind === "num"; }

/** Flattens a product into its factors, expanding whole-number powers and pulling out signs. */
function productFactors(node: Node): { constant: number; factors: Node[] } | null {
  if (node.kind === "neg") {
    const inner = productFactors(node.arg);
    return inner ? { constant: -inner.constant, factors: inner.factors } : null;
  }
  if (node.kind === "num") return { constant: node.value, factors: [] };
  if (node.kind === "bin" && node.op === "*") {
    const l = productFactors(node.left); const r = productFactors(node.right);
    return l && r ? { constant: l.constant * r.constant, factors: [...l.factors, ...r.factors] } : null;
  }
  if (node.kind === "bin" && node.op === "^" && isNumberNode(node.right) && Number.isInteger(node.right.value) && node.right.value >= 1) {
    const base = productFactors(node.left);
    if (!base) return null;
    const factors: Node[] = []; let c = 1;
    for (let i = 0; i < node.right.value; i += 1) { factors.push(...base.factors); c *= base.constant; }
    return { constant: c, factors };
  }
  if (node.kind === "bin" && node.op === "/") return null;
  return { constant: 1, factors: [node] };
}

function polyOf(node: Node): Poly {
  const f = toFrac(node);
  if (f.den.size !== 1 || !f.den.has("")) throw new AlgebraParseError("Not a polynomial.");
  const d = f.den.get("")!;
  return clean(new Map([...f.num].map(([k, c]) => [k, c / d])));
}

function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
function integerContent(poly: Poly): number | null {
  let g = 0;
  for (const c of poly.values()) { if (!Number.isInteger(c)) return null; g = gcd(g, c); }
  return g;
}
function degree(poly: Poly): number {
  let d = 0;
  for (const k of poly.keys()) d = Math.max(d, [...parseMonomial(k).values()].reduce((s, e) => s + e, 0));
  return d;
}
function variables(poly: Poly): string[] {
  const vs = new Set<string>();
  for (const k of poly.keys()) for (const v of parseMonomial(k).keys()) vs.add(v);
  return [...vs];
}

/**
 * A degree-2 factor splits over the integers when it's a quadratic (or a
 * two-variable homogeneous quadratic, like 49a² − 25b²) with a perfect-square
 * discriminant. Enough for Grade 8 factorisation; higher-degree reducibility
 * is not attempted and is reported as not reducible.
 */
function reducibleQuadratic(poly: Poly): boolean {
  if (degree(poly) !== 2) return false;
  const vs = variables(poly);
  let a = 0; let b = 0; let c = 0;
  if (vs.length === 1) {
    const v = vs[0]!;
    for (const [k, coef] of poly) {
      const e = parseMonomial(k).get(v) ?? 0;
      if (e === 2) a += coef; else if (e === 1) b += coef; else c += coef;
    }
  } else if (vs.length === 2) {
    const [u, w] = vs as [string, string];
    for (const [k, coef] of poly) {
      const m = parseMonomial(k);
      const eu = m.get(u) ?? 0; const ew = m.get(w) ?? 0;
      if (eu + ew !== 2) return false; // not homogeneous
      if (eu === 2) a += coef; else if (eu === 1) b += coef; else c += coef;
    }
  } else {
    return false;
  }
  if (a === 0) return false;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const root = Math.round(Math.sqrt(disc));
  return root * root === disc;
}

interface FactorProfile { constant: number; nonConstant: Poly[] }

function profile(text: string): FactorProfile | null {
  const factors = productFactors(parseExpression(text));
  if (!factors) return null;
  let c = factors.constant;
  const nonConstant: Poly[] = [];
  for (const node of factors.factors) {
    const poly = polyOf(node);
    if (degree(poly) === 0) { c *= poly.get("") ?? 0; continue; }
    nonConstant.push(poly);
  }
  return { constant: c, nonConstant };
}

/** Why an answer that equals the original still isn't finished. The reason points at different skills. */
export type UnfinishedReason = "NOT_A_PRODUCT" | "NUMBER_LEFT_INSIDE" | "LETTER_LEFT_INSIDE" | "FACTOR_SPLITS_FURTHER";

/** Null when the text is a finished factorisation; otherwise the first reason it isn't. */
export function factorisationDefect(text: string): UnfinishedReason | "UNREADABLE" | null {
  let prof: FactorProfile | null;
  try { prof = profile(text); } catch { return "UNREADABLE"; }
  // A sum is never a finished factorisation — 2y(x + 1) + 3(x + 1) is exactly
  // the "stopped at a sum" mistake, so it must not count as factorised.
  let root = parseExpression(text);
  while (root.kind === "neg") root = root.arg;
  const isProduct = root.kind === "bin" && (root.op === "*" || root.op === "^");
  if (!prof || prof.nonConstant.length === 0 || !isProduct) return "NOT_A_PRODUCT";
  for (const poly of prof.nonConstant) {
    const content = integerContent(poly);
    if (content === null || content !== 1) return "NUMBER_LEFT_INSIDE";
    if (poly.size > 1 && variables(poly).length === 1 && degree(poly) === 1) continue;
    if (poly.size > 1) {
      // A lone monomial factor like x or x² is fine; a letter common to every term inside a bracket is not.
      for (const v of variables(poly)) {
        let minE = Infinity;
        for (const k of poly.keys()) minE = Math.min(minE, parseMonomial(k).get(v) ?? 0);
        if (minE > 0) return "LETTER_LEFT_INSIDE";
      }
    }
    if (reducibleQuadratic(poly)) return "FACTOR_SPLITS_FURTHER";
  }
  return null;
}

/** A mistake inside the bracket that code can name once the factor outside is known to be right. */
export type CommonFactorMistake = "DIVIDED_FIRST_TERM_ONLY" | "DROPPED_THE_ONE" | "INDEX_NOT_REDUCED";

export interface CommonFactorReading {
  /** The factor taken out has a number part above 1, so finding it shows the numeric common factor. */
  numberPart: boolean;
  /** The factor taken out has a letter, so finding it shows the common letters. */
  letterPart: boolean;
  /** Only with `allowSmallerNumber`: the number taken out divides the highest common number but is smaller than it (2x for 4x). */
  numberNotHighest?: boolean;
  /** What went wrong inside the bracket, when it is one pattern code recognises; absent otherwise. */
  mistake?: CommonFactorMistake;
}

function divideMonomial(key: Monomial, by: Monomial): Monomial | null {
  const powers = parseMonomial(key);
  for (const [v, e] of parseMonomial(by)) {
    const left = (powers.get(v) ?? 0) - e;
    if (left < 0) return null;
    powers.set(v, left);
  }
  return monomialKey(powers);
}

/**
 * Reads a wrong answer to "take out the common factor" as one written m(B),
 * when m is the highest common factor of the expression's terms (up to sign).
 * The right m shows the student found the common factor; each term inside B is
 * then matched to a term of the expression: divided by m (right), left as it
 * was (7(x + 28) for 7x + 28: DIVIDED_FIRST_TERM_ONLY), number divided but
 * letters not (3x(x² + 2x) for 3x³ + 6x²: INDEX_NOT_REDUCED), or missing where
 * dividing would leave 1 (3x(x) for 3x² + 3x: DROPPED_THE_ONE). Any other
 * bracket gives the reading without a mistake. Null when the answer isn't one
 * factor times one bracket, or the factor outside isn't the highest one.
 */
export function readCommonFactor(answer: string, expression: string, allowSmallerNumber = false): CommonFactorReading | null {
  try {
    const terms = polyOf(parseExpression(expression));
    const g = integerContent(terms);
    if (terms.size < 2 || !g) return null;
    const common = new Map<string, number>();
    for (const v of variables(terms)) {
      const least = Math.min(...[...terms.keys()].map((k) => parseMonomial(k).get(v) ?? 0));
      if (least > 0) common.set(v, least);
    }
    const commonKey = monomialKey(common);
    if (g === 1 && !commonKey) return null;

    const prof = profile(answer);
    if (!prof) return null;
    let outside: Poly = constant(prof.constant);
    const brackets = prof.nonConstant.filter((p) => p.size > 1);
    for (const p of prof.nonConstant) if (p.size === 1) outside = mul(outside, p);
    if (brackets.length !== 1 || outside.size !== 1) return null;
    const [[outsideKey, outsideCoef]] = [...outside] as [[Monomial, number]];
    const smaller = allowSmallerNumber && Math.abs(outsideCoef) !== g && Math.abs(outsideCoef) >= 1 && Number.isInteger(outsideCoef) && g % Math.abs(outsideCoef) === 0;
    if (outsideKey !== commonKey || (Math.abs(outsideCoef) !== g && !smaller)) return null;

    const reading: CommonFactorReading = { numberPart: g > 1 && !smaller, letterPart: !!commonKey, ...(smaller ? { numberNotHighest: true } : {}) };
    const inside = [...brackets[0]!];
    const used = new Set<number>();
    const take = (key: Monomial | null, coef: number) => {
      const i = inside.findIndex(([k, c], j) => !used.has(j) && k === key && Math.abs(c - coef) < 1e-9);
      if (i >= 0) used.add(i);
      return i >= 0;
    };
    let divided = 0, undivided = 0, unreduced = 0, droppedOne = 0;
    for (const [key, coef] of terms) {
      const sign = Math.sign(outsideCoef);
      const quotient = divideMonomial(key, outsideKey);
      if (take(quotient, coef / outsideCoef)) divided++;
      else if (take(key, coef) || take(key, coef * sign)) undivided++;
      // 9x ÷ 3x written as 9: the letters were divided out but the number was left as it was.
      else if (quotient !== null && (take(quotient, coef) || take(quotient, coef * sign))) undivided++;
      else if (outsideKey && take(key, coef / outsideCoef)) unreduced++;
      else if (quotient === "" && Math.abs(coef / outsideCoef) === 1) droppedOne++;
      else return reading;
    }
    if (used.size !== inside.length || [undivided, unreduced, droppedOne].filter((n) => n > 0).length !== 1) return reading;
    // Leaving every term undivided, or dropping every term, isn't "only the first term": it's no division at all.
    if (unreduced) reading.mistake = "INDEX_NOT_REDUCED";
    else if (divided) reading.mistake = undivided ? "DIVIDED_FIRST_TERM_ONLY" : "DROPPED_THE_ONE";
    return reading;
  } catch {
    return null;
  }
}

/** True when the text is written as a product whose non-constant factors can't be split further (within Grade 8 scope). */
export function isFullyFactorisedForm(text: string): boolean {
  return factorisationDefect(text) === null;
}

/** How many non-constant factors an answer has — (2x + 4)(x + 3) has two, 3(x² − 4) has one. */
export function nonConstantFactorCount(text: string): number {
  try { return profile(text)?.nonConstant.length ?? 0; } catch { return 0; }
}

/** How many bracketed (multi-term) factors an answer has — x(6x + 10y) has one, (2x + 4)(x + 3) has two. */
export function bracketFactorCount(text: string): number {
  try { return profile(text)?.nonConstant.filter((p) => p.size > 1).length ?? 0; } catch { return 0; }
}

/**
 * True when every term inside the answer's bracket(s) shares no letter, i.e. the letter part of the
 * common factor was fully taken out. Needs at least one bracket; a lone monomial factor is fine.
 */
export function lettersFullyTakenOut(text: string): boolean {
  try {
    const prof = profile(text);
    if (!prof) return false;
    const brackets = prof.nonConstant.filter((p) => p.size > 1);
    if (!brackets.length) return false;
    for (const poly of brackets) {
      for (const v of variables(poly)) {
        let minE = Infinity;
        for (const k of poly.keys()) minE = Math.min(minE, parseMonomial(k).get(v) ?? 0);
        if (minE > 0) return false;
      }
    }
    return true;
  } catch { return false; }
}

/**
 * Does the answer take out only letters that every term of the expression has? x(6x + 10y) for 6x² + 10xy and
 * 3x(xy + 9) for 3x²y + 9x do. Null when the answer isn't a product with a letter outside to judge.
 */
export function lettersOutsideAreCommon(answer: string, expression: string): boolean | null {
  try {
    const terms = polyOf(parseExpression(expression));
    const prof = profile(answer);
    if (!prof || terms.size < 2) return null;
    let outside: Poly = constant(1);
    for (const p of prof.nonConstant) if (p.size === 1) outside = mul(outside, p);
    const outsideLetters = variables(outside);
    if (!outsideLetters.length) return null;
    return outsideLetters.every((v) => [...terms.keys()].every((k) => (parseMonomial(k).get(v) ?? 0) > 0));
  } catch { return null; }
}

/**
 * The difference-of-squares belief, read from the shape of a wrong answer when the item doesn't list it:
 * (3a - 5)(3a + 5) for the perfect square 9a² - 30a + 25 (WROTE_DIFF_OF_SQUARES), and (x - 6)(x + 6) for the
 * sum of squares x² + 36 (NOT_DIFF_OF_SQUARES). One letter only; null for anything else, and for right answers.
 */
export function squarePatternMistake(answer: string, expression: string): "WROTE_DIFF_OF_SQUARES" | "NOT_DIFF_OF_SQUARES" | null {
  try {
    const coefficients = (text: string): { v: string; c: number[] } | null => {
      const poly = polyOf(parseExpression(text));
      const letters = variables(poly);
      if (letters.length !== 1) return null;
      const c = [0, 0, 0];
      for (const [key, coef] of poly) {
        const degreeOf = [...parseMonomial(key).values()].reduce((a, b) => a + b, 0);
        if (degreeOf > 2) return null;
        c[degreeOf] = (c[degreeOf] ?? 0) + coef;
      }
      return { v: letters[0]!, c };
    };
    const ex = coefficients(expression);
    const an = coefficients(answer);
    if (!ex || !an || ex.v !== an.v) return null;
    const [c0, c1, c2] = ex.c as [number, number, number];
    const [a0, a1, a2] = an.c as [number, number, number];
    const isSquare = (n: number) => n > 0 && Number.isInteger(Math.sqrt(n));
    // Where a right answer would have been equal to the expression, this is never reached; guard anyway.
    if (a2 === c2 && a1 === c1 && a0 === c0) return null;
    const diffShape = a2 === c2 && a1 === 0 && a0 === -c0 && isSquare(c2) && isSquare(c0);
    if (!diffShape) return null;
    if (c1 !== 0 && c1 * c1 === 4 * c2 * c0) return "WROTE_DIFF_OF_SQUARES";
    if (c1 === 0) return "NOT_DIFF_OF_SQUARES";
    return null;
  } catch { return null; }
}

/** True when some letter appears in every term of the expression (6x² + 10xy shares x). */
export function expressionHasCommonLetter(expression: string): boolean {
  try {
    const terms = polyOf(parseExpression(expression));
    if (terms.size < 2) return false;
    return variables(terms).some((v) => [...terms.keys()].every((k) => (parseMonomial(k).get(v) ?? 0) > 0));
  } catch { return false; }
}

/**
 * Can this expression exercise the skill at all? 9x + 15 has no letter in every term, so it can't show
 * "the letters common to every term"; 7x + 3 has no number in common, so it can't show "the number common to
 * every term". Skills code knows nothing about are always allowed. Unreadable expressions are allowed too.
 */
export function expressionCanShowSkill(skillId: string, expression: string | undefined): boolean {
  if (!expression) return true;
  try {
    if (skillId === "FAC_GCF_VARIABLE") return expressionHasCommonLetter(expression);
    if (skillId === "FAC_GCF_NUMERIC") {
      const terms = polyOf(parseExpression(expression));
      return terms.size < 2 || (integerContent(terms) ?? 0) > 1;
    }
  } catch { /* unreadable: don't drop credit */ }
  return true;
}

export type FactorisationVerdict = "CORRECT" | "UNFINISHED" | "INCORRECT" | "UNREADABLE";

/**
 * Compares a student's answer with the expression they were asked to
 * factorise. CORRECT = equal and fully factorised; UNFINISHED = equal but not
 * fully factorised; INCORRECT = not equal; UNREADABLE = couldn't be parsed.
 */
export function classifyFactorisation(studentAnswer: string, expression: string): FactorisationVerdict {
  let equal: boolean;
  try { equal = algebraicallyEqual(studentAnswer, expression); } catch { return "UNREADABLE"; }
  if (!equal) return "INCORRECT";
  return isFullyFactorisedForm(studentAnswer) ? "CORRECT" : "UNFINISHED";
}

/** For "simplify this division" items: equal and no longer a division of polynomials sharing a factor. */
export function classifySimplification(studentAnswer: string, expression: string, key: string): FactorisationVerdict {
  let equal: boolean;
  try { equal = algebraicallyEqual(studentAnswer, expression); } catch { return "UNREADABLE"; }
  if (!equal) return "INCORRECT";
  try {
    const s = toFrac(parseExpression(studentAnswer)); const k = toFrac(parseExpression(key));
    return degree(s.num) + degree(s.den) <= degree(k.num) + degree(k.den) ? "CORRECT" : "UNFINISHED";
  } catch { return "UNREADABLE"; }
}

/**
 * Authoring-time check for a claimed-reduced SIMPLIFY answer, when there is no
 * independently verified `key` to compare against yet — the candidate answer
 * IS the key being validated, so classifySimplification's `degree(s) <=
 * degree(k)` test is a no-op if called with the candidate as both arguments.
 * Instead this compares the candidate against the original (unreduced)
 * expression it's meant to simplify, and requires STRICTLY lower total
 * numerator+denominator degree — equal-or-less would accept the untouched
 * original as its own "simplification".
 */
export function classifyReducedForm(candidate: string, originalExpression: string): FactorisationVerdict {
  let equal: boolean;
  try { equal = algebraicallyEqual(candidate, originalExpression); } catch { return "UNREADABLE"; }
  if (!equal) return "INCORRECT";
  try {
    const c = toFrac(parseExpression(candidate));
    const o = toFrac(parseExpression(originalExpression));
    return degree(c.num) + degree(c.den) < degree(o.num) + degree(o.den) ? "CORRECT" : "UNFINISHED";
  } catch { return "UNREADABLE"; }
}

/** Two answers are the same factorisation when they're equal and have the same factors, in any order and up to sign. */
export function sameFactorisation(a: string, b: string): boolean {
  try {
    if (!algebraicallyEqual(a, b)) return false;
    const pa = profile(a); const pb = profile(b);
    if (!pa || !pb) return normalizeMathText(a) === normalizeMathText(b);
    if (pa.nonConstant.length !== pb.nonConstant.length || Math.abs(pa.constant) !== Math.abs(pb.constant)) return false;
    const remaining = [...pb.nonConstant];
    for (const poly of pa.nonConstant) {
      const i = remaining.findIndex((q) => polyEqual(poly, q) || polyEqual(poly, mul(q, constant(-1))));
      if (i === -1) return false;
      remaining.splice(i, 1);
    }
    return true;
  } catch {
    return false;
  }
}

/** Safe wrapper: true only when the text parses. */
export function isReadable(text: string): boolean {
  try { toFrac(parseExpression(text)); return true; } catch { return false; }
}

// ---------- expanding and numeric answers ----------

function additiveTerms(node: Node): number {
  if (node.kind === "bin" && (node.op === "+" || node.op === "-")) return additiveTerms(node.left) + additiveTerms(node.right);
  if (node.kind === "neg") return additiveTerms(node.arg);
  return 1;
}

/**
 * For "expand" and "simplify" items: CORRECT = equal, no brackets or letter
 * divisions left, and like terms collected (one written term per term of the
 * result); UNFINISHED = equal but not there yet.
 */
export function classifyExpansion(studentAnswer: string, expression: string): FactorisationVerdict {
  let equal: boolean;
  try { equal = algebraicallyEqual(studentAnswer, expression); } catch { return "UNREADABLE"; }
  if (!equal) return "INCORRECT";
  if (normalizeMathText(studentAnswer).includes("(")) return "UNFINISHED";
  const root = parseExpression(studentAnswer);
  const { num, den } = toFrac(root);
  if (den.size !== 1 || !den.has("")) return "UNFINISHED";
  return additiveTerms(root) === Math.max(1, num.size) ? "CORRECT" : "UNFINISHED";
}

/** "4.2" → "(42/10)", so decimals compare exactly. */
export function exactDecimals(text: string): string {
  return text.replace(/(\d+)\.(\d+)/g, (_, a: string, b: string) => `(${a}${b}/1${"0".repeat(b.length)})`);
}

/**
 * A written number answer: drops "x =", units, ₹, %, ° and Indian digit
 * grouping (3,40,00,000). Null unless what's left is one number or fraction,
 * so unfinished working like "2*18*4" isn't read as a number.
 * Mixed numbers ("1 1/2", "1½") are read as fractions; a full stop at the end is punctuation.
 */
export function readNumberAnswer(text: string): string | null {
  // A superscript right after a digit is a power (2⁷ is 2 to the 7th), never the digits "27"; it is not one plain number.
  if (/[\d)][⁰¹²³⁴-⁹]/.test(String(text))) return null;
  const stripped = String(text)
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (f) => ` ${VULGAR[f]}`)
    .normalize("NFKC")
    .replace(/⁄/g, "/")
    .replace(/^\s*[a-zA-Z]\s*=\s*/, "")
    .replace(/[−–—]/g, "-")
    .replace(/[²³]|[a-zA-Z]+|[₹%°,:]/g, "")
    .trim()
    .replace(/\.$/, "");
  const mixed = stripped.match(/^([+-]?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const [, sign, whole, top, bottom] = mixed;
    return `${sign === "-" ? "-" : ""}${Number(whole) * Number(bottom) + Number(top)}/${bottom}`;
  }
  const m = stripped.match(/^([+-]?)\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  return `${m[1] === "-" ? "-" : ""}${m[2]}${m[3] ? `/${m[3]}` : ""}`;
}

const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/**
 * A "find the value" answer written as a number expression that is exactly equal to the key but not yet one number:
 * 2^7 or 2⁷ or 4*32 for 128. False for a plain number (use sameNumber) and for anything with letters or unreadable text.
 */
export function isUnevaluatedNumberEqualTo(answer: string, key: string): boolean {
  const text = String(answer).trim().replace(/[⁰¹²³⁴-⁹]+/g, (run) => `^${[...run].map((c) => SUPERSCRIPTS[c]).join("")}`)
    .replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-").replace(/\.$/, "");
  if (!text || !/^[\d\s+\-*/^().]+$/.test(text) || !/[+\-*/^]/.test(text.replace(/^\s*-/, ""))) return false;
  const target = readNumberAnswer(key);
  if (target === null) return false;
  try { return algebraicallyEqual(exactDecimals(text), exactDecimals(target)); } catch { return false; }
}

const VULGAR: Record<string, string> = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

/** Exact numeric equality of two written answers; false when either can't be read. */
export function sameNumber(a: string, b: string): boolean {
  const x = readNumberAnswer(a); const y = readNumberAnswer(b);
  if (x === null || y === null) return false;
  try { return algebraicallyEqual(exactDecimals(x), exactDecimals(y)); } catch { return false; }
}

/**
 * Whether `check` proves `answer`: an expression equal to it, or an equation
 * in x that the answer solves.
 */
export function checkProves(check: string, answer: string): boolean {
  const value = readNumberAnswer(answer) ?? answer;
  const sides = check.split("=");
  try {
    if (sides.length === 1) return algebraicallyEqual(exactDecimals(check), exactDecimals(value));
    if (sides.length !== 2) return false;
    const put = (side: string) => exactDecimals(side).replace(/x/g, `(${exactDecimals(value)})`);
    return algebraicallyEqual(put(sides[0]!), put(sides[1]!));
  } catch {
    return false;
  }
}
