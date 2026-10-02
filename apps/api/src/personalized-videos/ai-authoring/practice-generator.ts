import type { AuthoredTask, PracticeItem } from "@cogna/shared";

/**
 * Practice built by code, not by a model: every item is constructed from
 * chosen factors and then expanded, so its answer is right by construction
 * (and it still goes through the same verifier as AI items).
 *
 * Used (1) after recipe lessons, (2) whenever the AI author is unavailable
 * or its practice is rejected, and (3) by the fake author, so the whole AI
 * pipeline runs without API credits.
 */

export type PracticeFamily = "trinomial" | "common-factor" | "expand";

const TRINOMIAL_SKILLS = new Set([
  "FAC_MONIC_TRINOMIAL", "FAC_PAIR_PRODUCT_SUM", "FAC_READ_ABC_SIGNS", "FND_FACTOR_PAIRS",
  "FND_SIGN_MUL_DIV", "FND_SIGN_ADD_SUB", "FAC_VERIFY_EXPAND", "EXP_EXPAND_BINOMIALS",
]);
const EXPAND_SKILLS = new Set(["EXP_EXPAND_SINGLE", "C3_DISTRIBUTIVE_PROPERTY"]);

export function practiceFamilyFor(skillId: string): PracticeFamily {
  if (TRINOMIAL_SKILLS.has(skillId)) return "trinomial";
  if (EXPAND_SKILLS.has(skillId)) return "expand";
  return "common-factor";
}

/** Small seeded generator so a lesson's practice is stable across reloads. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, items: T[]): T => items[Math.floor(rand() * items.length)]!;

function shuffle<T>(rand: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------- formatting (plain ASCII algebra the engine reads) ----------

/** "+ 7x", "- x", "+ 12" after a leading term; "7x", "-x" when leading. */
function term(coef: number, body: string, leading = false): string {
  if (coef === 0) return "";
  const abs = Math.abs(coef);
  const shown = body && abs === 1 ? body : `${abs}${body}`;
  return leading ? `${coef < 0 ? "-" : ""}${shown}` : ` ${coef < 0 ? "-" : "+"} ${shown}`;
}

export function formatTrinomial(b: number, c: number): string {
  return `x^2${term(b, "x")}${term(c, "")}`;
}

export function formatLinear(p: number): string {
  return p < 0 ? `x - ${-p}` : `x + ${p}`;
}

/** a·aBody + b·bBody, e.g. (6, "x^2", -9, "x") → "6x^2 - 9x". */
function binomial(a: number, aBody: string, b: number, bBody: string): string {
  return `${term(a, aBody, true)}${term(b, bBody)}`;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// ---------- choose items: correctness decided where options are made ----------

type Option = { text: string; kind: "right" | "unfinished" | "wrong" };

function choose(rand: () => number, id: string, prompt: string, expression: string, task: AuthoredTask, options: Option[]): PracticeItem {
  const shuffled = shuffle(rand, options);
  return {
    id, format: "choose", prompt, expression, task,
    options: shuffled.map((o) => o.text),
    answerIndex: shuffled.findIndex((o) => o.kind === "right"),
    feedback: shuffled.map((o) =>
      o.kind === "right"
        ? "Yes. Multiply it back out and you get the original."
        : o.kind === "unfinished"
          ? "That's equal, but something common is still left inside the bracket."
          : "Multiply it back out: it doesn't give the original. Check each sign.",
    ),
  };
}

// ---------- families ----------

function freshTrinomial(rand: () => number, used: Set<string>) {
  for (let tries = 0; tries < 80; tries++) {
    const p = pick(rand, [1, 2, 3, 4, 5, 6, 7]) * pick(rand, [1, -1]);
    const q = pick(rand, [2, 3, 4, 5, 6, 8, 9]) * pick(rand, [1, -1]);
    if (p === q || p + q === 0) continue;
    const expr = formatTrinomial(p + q, p * q);
    if (used.has(expr)) continue;
    used.add(expr);
    return {
      p, q, expr,
      answer: `(${formatLinear(p)})(${formatLinear(q)})`,
      signSwapped: `(${formatLinear(-p)})(${formatLinear(-q)})`,
      oneSign: `(${formatLinear(p)})(${formatLinear(-q)})`,
    };
  }
  throw new Error("Could not build a fresh trinomial.");
}

function freshCommonFactor(rand: () => number, used: Set<string>) {
  for (let tries = 0; tries < 80; tries++) {
    const k = pick(rand, [2, 3, 4, 5, 6]);
    const a = pick(rand, [1, 2, 3, 5]);
    const b = pick(rand, [1, 2, 3, 4, 5, 7]) * pick(rand, [1, -1]);
    if (gcd(a, b) !== 1) continue;
    const expr = binomial(k * a, "x^2", k * b, "x");
    if (used.has(expr)) continue;
    used.add(expr);
    return {
      k, a, b, expr,
      answer: `${k}x(${binomial(a, "x", b, "")})`,
      numberOnly: `${k}(${binomial(a, "x^2", b, "x")})`,
      letterOnly: `x(${binomial(k * a, "x", k * b, "")})`,
      signSlip: `${k}x(${binomial(a, "x", -b, "")})`,
      split: `${k}x*${a}x + ${k}x*(${b})`,
    };
  }
  throw new Error("Could not build a fresh common-factor item.");
}

function freshExpansion(rand: () => number, used: Set<string>) {
  for (let tries = 0; tries < 80; tries++) {
    const k = pick(rand, [2, 3, 4, 5, 6, 7]) * pick(rand, [1, 1, -1]);
    const a = pick(rand, [1, 2, 3, 4]);
    const b = pick(rand, [1, 2, 3, 4, 5, 6]) * pick(rand, [1, -1]);
    const expr = `${k}(${binomial(a, "x", b, "")})`;
    if (used.has(expr)) continue;
    used.add(expr);
    return {
      k, a, b, expr,
      answer: binomial(k * a, "x", k * b, ""),
      firstOnly: binomial(k * a, "x", b, ""),
      signSlip: binomial(k * a, "x", -k * b, ""),
      split: `(${k})*(${a}x) + (${k})*(${b})`,
      halfDone: `(${k})*(${a}x) + ${b}`,
    };
  }
  throw new Error("Could not build a fresh expansion.");
}

function trinomialSet(rand: () => number, used: Set<string>): PracticeItem[] {
  const t1 = freshTrinomial(rand, used);
  const t2 = freshTrinomial(rand, used);
  const t3 = freshTrinomial(rand, used);
  const t4 = freshTrinomial(rand, used);
  const c = t1.p * t1.q;
  const pairs: Array<[number, number]> = [[t1.p, t1.q], [-t1.p, -t1.q]];
  // A pair with the right product but the wrong sum, when one exists.
  for (let d = 1; d <= Math.abs(c); d++) {
    if (c % d !== 0) continue;
    const e = c / d;
    if (d + e !== t1.p + t1.q && !pairs.some(([x, y]) => (x === d && y === e) || (x === e && y === d))) {
      pairs.push([d, e]);
      break;
    }
  }
  return [
    {
      id: "p1", format: "pair-hunt",
      prompt: `Find the pair that multiplies to ${c} and adds to ${t1.p + t1.q}.`,
      expression: t1.expr, product: c, sum: t1.p + t1.q, options: shuffle(rand, pairs), answer: [t1.p, t1.q],
    },
    choose(rand, "p2", `Factorise ${t2.expr}.`, t2.expr, "factorise", [
      { text: t2.answer, kind: "right" },
      { text: t2.signSwapped, kind: "wrong" },
      { text: t2.oneSign, kind: "wrong" },
    ]),
    {
      id: "p3", format: "spot-mistake",
      prompt: "One line of this working goes wrong. Which one?",
      lines: [t3.expr, t3.signSwapped, formatTrinomial(-(t3.p + t3.q), t3.p * t3.q)],
      wrongLine: 1, fix: t3.answer,
      explanation: "Both signs in the brackets were flipped, so the middle term comes out with the wrong sign. Read the last sign, then the middle sign.",
    },
    {
      id: "p4", format: "type-answer",
      prompt: `Factorise ${t4.expr}.`, expression: t4.expr, task: "factorise", answer: t4.answer,
      hint: "Read the last sign first, then the middle sign, then find the pair.",
      workedSteps: [t4.expr, `x^2${term(t4.p, "x")}${term(t4.q, "x")}${term(t4.p * t4.q, "")}`, t4.answer],
    },
  ];
}

function commonFactorSet(rand: () => number, used: Set<string>): PracticeItem[] {
  const c1 = freshCommonFactor(rand, used);
  const c2 = freshCommonFactor(rand, used);
  const c3 = freshCommonFactor(rand, used);
  const c4 = freshCommonFactor(rand, used);
  return [
    choose(rand, "p1", `Factorise ${c1.expr} fully.`, c1.expr, "factorise", [
      { text: c1.answer, kind: "right" },
      { text: c1.numberOnly, kind: "unfinished" },
      { text: c1.letterOnly, kind: "unfinished" },
    ]),
    {
      id: "p2", format: "spot-mistake",
      prompt: "One line of this working goes wrong. Which one?",
      lines: [c2.expr, c2.signSlip, binomial(c2.k * c2.a, "x^2", -c2.k * c2.b, "x")],
      wrongLine: 1, fix: c2.answer,
      explanation: "A sign changed while dividing by the common factor. Multiply the bracket back out to check every term.",
    },
    {
      id: "p3", format: "type-answer",
      prompt: `Factorise ${c3.expr} fully.`, expression: c3.expr, task: "factorise", answer: c3.answer,
      hint: "Take out the biggest number and the letter that every term shares.",
      workedSteps: [c3.expr, c3.split, c3.answer],
    },
    choose(rand, "p4", `Which is ${c4.expr} fully factorised?`, c4.expr, "factorise", [
      { text: c4.numberOnly, kind: "unfinished" },
      { text: c4.answer, kind: "right" },
      { text: c4.signSlip, kind: "wrong" },
    ]),
  ];
}

function expandSet(rand: () => number, used: Set<string>): PracticeItem[] {
  const e1 = freshExpansion(rand, used);
  const e2 = freshExpansion(rand, used);
  const e3 = freshExpansion(rand, used);
  const e4 = freshExpansion(rand, used);
  return [
    choose(rand, "p1", `Expand ${e1.expr}.`, e1.expr, "expand", [
      { text: e1.answer, kind: "right" },
      { text: e1.firstOnly, kind: "wrong" },
      { text: e1.signSlip, kind: "wrong" },
    ]),
    {
      id: "p2", format: "spot-mistake",
      prompt: "One line of this working goes wrong. Which one?",
      lines: [e2.expr, e2.halfDone, e2.firstOnly],
      wrongLine: 1, fix: e2.split,
      explanation: `The ${e2.k} outside has to multiply every term inside, including the last one.`,
    },
    {
      id: "p3", format: "type-answer",
      prompt: `Expand ${e3.expr}.`, expression: e3.expr, task: "expand", answer: e3.answer,
      hint: "Draw one arrow from the outside number to every term inside.",
      workedSteps: [e3.expr, e3.split, e3.answer],
    },
    {
      id: "p4", format: "type-answer",
      prompt: `Expand ${e4.expr}.`, expression: e4.expr, task: "expand", answer: e4.answer,
      hint: "Multiply the outside number into each term, keeping each sign.",
      workedSteps: [e4.expr, e4.split, e4.answer],
    },
  ];
}

export interface GeneratedPractice {
  family: PracticeFamily;
  items: PracticeItem[];
  /** A fresh, held-out item for the independent exit check. */
  exit: { prompt: string; expression: string; task: AuthoredTask; answer: string };
}

/**
 * A practice set and a fresh exit item for a skill. `avoid` lists expressions
 * the student has already seen (diagnostic, lesson) so nothing repeats.
 */
export function generatePractice(skillId: string, seed: string, avoid: string[] = []): GeneratedPractice {
  const rand = seededRandom(seed);
  const used = new Set(avoid);
  const family = practiceFamilyFor(skillId);
  if (family === "trinomial") {
    const items = trinomialSet(rand, used);
    const e = freshTrinomial(rand, used);
    return { family, items, exit: { prompt: `Factorise ${e.expr}.`, expression: e.expr, task: "factorise", answer: e.answer } };
  }
  if (family === "expand") {
    const items = expandSet(rand, used);
    const e = freshExpansion(rand, used);
    return { family, items, exit: { prompt: `Expand ${e.expr}.`, expression: e.expr, task: "expand", answer: e.answer } };
  }
  const items = commonFactorSet(rand, used);
  const e = freshCommonFactor(rand, used);
  return { family, items, exit: { prompt: `Factorise ${e.expr} fully.`, expression: e.expr, task: "factorise", answer: e.answer } };
}
