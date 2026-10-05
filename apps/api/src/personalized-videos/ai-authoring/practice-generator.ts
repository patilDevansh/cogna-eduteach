import type { AuthoredTask, MarkReason, PracticeItem } from "@cogna/shared";
import { taskVerdict } from "./lesson-verifier";
import { buildTileInteraction } from "../../interaction-formats/tile-builder";

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

// ---------- game items (code-built, checked by the same algebra engine) ----------

/** A tile "build it" item, or nothing when the tile set can't be made safely. */
function buildItem(id: string, prompt: string, expression: string, task: AuthoredTask, answer: string, mistakes: string[], workedSteps: string[]): PracticeItem[] {
  if (task === "simplify") return [];
  const interaction = buildTileInteraction({ stage: "PRACTICE", task, expression, answer, mistakes, seed: `${id}|${expression}` });
  return interaction ? [{ id, format: "build", prompt, expression, task, answer, interaction, workedSteps }] : [];
}

function factorSafe(id: string, t: { p: number; q: number; expr: string }): PracticeItem {
  return {
    id, format: "factor-safe",
    prompt: `Open the safe: turn the dials to two numbers for ${t.expr}.`,
    expression: t.expr, product: t.p * t.q, sum: t.p + t.q, answer: [t.p, t.q],
  };
}

/** Make it a rectangle: a positive x² + bx + c, where the strips split b and the corner holds c. */
function rectangleItem(id: string, rand: () => number, used: Set<string>): PracticeItem[] {
  for (let tries = 0; tries < 40; tries++) {
    const p = pick(rand, [1, 2, 3, 4, 5]);
    const q = pick(rand, [2, 3, 4, 5, 6]);
    if (p === q) continue;
    const expr = formatTrinomial(p + q, p * q);
    if (used.has(expr)) continue;
    used.add(expr);
    return [{ id, format: "rectangle", prompt: `Make ${expr} into one rectangle.`, expression: expr, strips: p + q, units: p * q, answer: [Math.max(p, q), Math.min(p, q)] }];
  }
  return [];
}

type Paper = Extract<PracticeItem, { format: "mark-it" }>["papers"][number];

/** One of Bit's papers. Right or wrong is decided by the algebra engine, never by the label. */
function paper(task: AuthoredTask, expression: string, bitAnswer: string, reasons: MarkReason[], learn: string): Paper | null {
  const verdict = taskVerdict(task, bitAnswer, expression);
  if (verdict === "UNREADABLE") return null;
  const right = verdict === "CORRECT";
  if (right !== (reasons.length === 0)) return null;
  if (!right && reasons.includes("unfinished") !== (verdict === "UNFINISHED")) return null;
  return {
    question: `${task === "expand" ? "Expand" : "Factorise"} ${expression}${task === "factorise" && reasons.includes("unfinished") ? " fully" : ""}`,
    expression, task, bitAnswer, verdict: right ? "right" : "wrong", reasons, learn,
  };
}

/** Marker's desk: three of Bit's papers, mixed right and wrong. */
function markItItem(id: string, family: PracticeFamily, rand: () => number, used: Set<string>): PracticeItem[] {
  let papers: Array<Paper | null>;
  if (family === "trinomial") {
    const a = freshTrinomial(rand, used), b = freshTrinomial(rand, used), c = freshTrinomial(rand, used);
    papers = [
      paper("factorise", a.expr, a.signSwapped, ["sign", "pair"], `Oh! Both signs were flipped. It should be ${a.answer}.`),
      paper("factorise", b.expr, b.answer, [], `Multiply it back out: ${b.expr}. I was right!`),
      paper("factorise", c.expr, c.oneSign, ["sign", "pair"], `I flipped one sign. The pair multiplies to the last number and adds to the middle: ${c.answer}.`),
    ];
  } else if (family === "expand") {
    const a = freshExpansion(rand, used), b = freshExpansion(rand, used), c = freshExpansion(rand, used);
    papers = [
      paper("expand", a.expr, a.firstOnly, ["forgot"], `The ${a.k} multiplies the last term too. It's ${a.answer}.`),
      paper("expand", b.expr, b.answer, [], `One arrow to every term: ${b.answer}. I was right!`),
      paper("expand", c.expr, c.signSlip, ["sign"], `Watch the signs when multiplying: ${c.answer}.`),
    ];
  } else {
    const a = freshCommonFactor(rand, used), b = freshCommonFactor(rand, used), c = freshCommonFactor(rand, used);
    papers = [
      paper("factorise", a.expr, a.numberOnly, ["unfinished"], `Every term still shares an x. Take it out too: ${a.answer}.`),
      paper("factorise", b.expr, b.answer, [], `Multiply it back out and you get ${b.expr}. I was right!`),
      paper("factorise", c.expr, c.signSlip, ["sign"], `A sign changed inside the bracket. It's ${c.answer}.`),
    ];
  }
  if (papers.some((p) => !p)) return [];
  return [{ id, format: "mark-it", prompt: "Bit did some homework. Stamp each paper right or wrong, and name the mistake.", papers: shuffle(rand, papers as Paper[]) }];
}

/** Bracket rush: twelve quick picks. Every option is classified by the algebra engine when it's built. */
function rushItem(id: string, family: PracticeFamily, rand: () => number, used: Set<string>): PracticeItem[] {
  // Rush expressions join the shared pool, so the exit questions never repeat one.
  const local = used;
  const rounds: Extract<PracticeItem, { format: "rush" }>["rounds"] = [];
  for (let i = 0; i < 12; i++) {
    let task: AuthoredTask, expression: string, right: string, wrong: Array<[string, string]>;
    if (family === "trinomial") {
      const t = freshTrinomial(rand, local);
      task = "factorise"; expression = t.expr; right = t.answer;
      wrong = [[t.signSwapped, "Those multiply to the right number but add to the wrong sign."], [t.oneSign, "One sign is flipped: multiply it back and the middle term changes."]];
    } else if (family === "expand") {
      const e = freshExpansion(rand, local);
      task = "expand"; expression = e.expr; right = e.answer;
      wrong = [[e.firstOnly, "The outside number has to multiply the last term too."], [e.signSlip, "Check the sign of the last term."]];
    } else {
      const c = freshCommonFactor(rand, local);
      task = "factorise"; expression = c.expr; right = c.answer;
      wrong = [[c.numberOnly, "Equal, but every term still shares an x."], [c.signSlip, "A sign changed inside the bracket."]];
    }
    if (taskVerdict(task, right, expression) !== "CORRECT" || wrong.some(([w]) => taskVerdict(task, w, expression) === "CORRECT")) continue;
    const options = shuffle(rand, [[right, "Right: it multiplies back to the original."] as [string, string], ...wrong]);
    if (new Set(options.map(([o]) => o)).size !== options.length) continue;
    rounds.push({ expression, task, options: options.map(([o]) => o), answerIndex: options.findIndex(([o]) => o === right), why: options.map(([, w]) => w) });
  }
  return rounds.length >= 8 ? [{ id, format: "rush", prompt: "Bracket rush: tap the right answer before it lands.", seconds: 45, rounds }] : [];
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
    // 2(4x + 6) and 4(2x + 3) are the same expression: dedupe by the expanded form too.
    const expanded = binomial(k * a, "x", k * b, "");
    if (used.has(expr) || used.has(expanded)) continue;
    used.add(expr);
    used.add(expanded);
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
  // Pair hunt and pick-from-three are replaced by games where the child does the maths (factor safe, rectangle, build).
  const t3 = freshTrinomial(rand, used);
  const t4 = freshTrinomial(rand, used);
  return [
    factorSafe("p1", freshTrinomial(rand, used)),
    ...rectangleItem("p2", rand, used),
    {
      id: "p3", format: "spot-mistake",
      prompt: "One line of this working goes wrong. Which one?",
      lines: [t3.expr, t3.signSwapped, formatTrinomial(-(t3.p + t3.q), t3.p * t3.q)],
      wrongLine: 1, fix: t3.answer,
      explanation: "Both signs in the brackets were flipped, so the middle term comes out with the wrong sign. Read the last sign, then the middle sign.",
    },
    ...(() => {
      const t6 = freshTrinomial(rand, used);
      return buildItem("p4", `Build ${t6.expr} as two brackets.`, t6.expr, "factorise", t6.answer, [t6.signSwapped, t6.oneSign],
        [t6.expr, `x^2${term(t6.p, "x")}${term(t6.q, "x")}${term(t6.p * t6.q, "")}`, t6.answer]);
    })(),
    ...markItItem("p5", "trinomial", rand, used),
    {
      id: "p6", format: "type-answer",
      prompt: `Factorise ${t4.expr}.`, expression: t4.expr, task: "factorise", answer: t4.answer,
      hint: "Read the last sign first, then the middle sign, then find the pair.",
      workedSteps: [t4.expr, `x^2${term(t4.p, "x")}${term(t4.q, "x")}${term(t4.p * t4.q, "")}`, t4.answer],
    },
    ...rushItem("p7", "trinomial", rand, used),
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
    ...(() => {
      const c5 = freshCommonFactor(rand, used);
      return buildItem("p5", `Build ${c5.expr} fully factorised.`, c5.expr, "factorise", c5.answer, [c5.numberOnly, c5.letterOnly, c5.signSlip], [c5.expr, c5.split, c5.answer]);
    })(),
    ...markItItem("p6", "common-factor", rand, used),
    ...rushItem("p7", "common-factor", rand, used),
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
    ...(() => {
      const e5 = freshExpansion(rand, used);
      return buildItem("p5", `Build the expansion of ${e5.expr}.`, e5.expr, "expand", e5.answer, [e5.firstOnly, e5.signSlip], [e5.expr, e5.split, e5.answer]);
    })(),
    ...markItItem("p6", "expand", rand, used),
    ...rushItem("p7", "expand", rand, used),
  ];
}

export interface GeneratedPractice {
  family: PracticeFamily;
  items: PracticeItem[];
  /** A fresh, held-out item for the independent exit check. */
  exit: { prompt: string; expression: string; task: AuthoredTask; answer: string };
  /**
   * A second held-out item of the same skill in a different form (the other
   * sign pattern), so the exit checks that the idea carries over, not just
   * the numbers.
   */
  transfer: { prompt: string; expression: string; task: AuthoredTask; answer: string };
}

/** Draws until the item's sign pattern differs from the exit's, so the transfer item is a different form. */
function differentForm<T>(make: () => T, signOf: (item: T) => number, exitSign: number): T {
  let item = make();
  for (let tries = 0; tries < 40 && Math.sign(signOf(item)) === Math.sign(exitSign); tries++) item = make();
  return item;
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
    const t = differentForm(() => freshTrinomial(rand, used), (x) => x.p * x.q, e.p * e.q);
    return {
      family, items,
      exit: { prompt: `Factorise ${e.expr}.`, expression: e.expr, task: "factorise", answer: e.answer },
      transfer: { prompt: `Factorise ${t.expr}.`, expression: t.expr, task: "factorise", answer: t.answer },
    };
  }
  if (family === "expand") {
    const items = expandSet(rand, used);
    const e = freshExpansion(rand, used);
    const t = differentForm(() => freshExpansion(rand, used), (x) => x.k, e.k);
    return {
      family, items,
      exit: { prompt: `Expand ${e.expr}.`, expression: e.expr, task: "expand", answer: e.answer },
      transfer: { prompt: `Expand ${t.expr}.`, expression: t.expr, task: "expand", answer: t.answer },
    };
  }
  const items = commonFactorSet(rand, used);
  const e = freshCommonFactor(rand, used);
  const t = differentForm(() => freshCommonFactor(rand, used), (x) => x.b, e.b);
  return {
    family, items,
    exit: { prompt: `Factorise ${e.expr} fully.`, expression: e.expr, task: "factorise", answer: e.answer },
    transfer: { prompt: `Factorise ${t.expr} fully.`, expression: t.expr, task: "factorise", answer: t.answer },
  };
}
