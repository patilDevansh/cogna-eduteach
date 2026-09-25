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
    .replace(/[−–—]/g, "-")
    .replace(/[×·∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4").replace(/⁵/g, "^5")
    .replace(/\s+/g, "");
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
      tokens.push({ kind: "var", value: c });
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

/** True when the text is written as a product whose non-constant factors can't be split further (within Grade 8 scope). */
export function isFullyFactorisedForm(text: string): boolean {
  return factorisationDefect(text) === null;
}

/** How many non-constant factors an answer has — (2x + 4)(x + 3) has two, 3(x² − 4) has one. */
export function nonConstantFactorCount(text: string): number {
  try { return profile(text)?.nonConstant.length ?? 0; } catch { return 0; }
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
