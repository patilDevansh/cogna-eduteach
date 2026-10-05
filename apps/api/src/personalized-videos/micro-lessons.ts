import type { MicroAction, MicroLessonView, MicroStep, MicroTemplate, MicroToken } from "@cogna/shared";
import { algebraicallyEqual, classifyFactorisation, normalizeMathText } from "../lotus/lotus-algebra";
import { splitFactors } from "../interaction-formats/tile-builder";
import { taskVerdict } from "./ai-authoring/lesson-verifier";
import type { LessonBrief } from "./ai-authoring/lesson-brief";

/**
 * Builds a 15–25 second targeted micro-lesson from the student's own
 * diagnostic answer. Code only, no model: the template is chosen from the
 * shape of the question and the kind of mistake, every expression on screen
 * is re-checked with the exact algebra engine, and the quick check's options
 * are classified by the engine (right / unfinished / wrong) when built.
 *
 * Returns null when the student's item doesn't fit a template safely; the
 * longer lesson still plays.
 */

export interface MicroLessonPlan {
  view: Omit<MicroLessonView, "steps"> & { steps: MicroStep[] };
  /** Server-only: which option is right, and what to say for each pick. */
  check: { answerIndex: number; feedback: string[] };
}

type Item = LessonBrief["studentItems"][number];

const sup = (t: string) => t.replace(/\^2/g, "²").replace(/\^3/g, "³");
/** How the maths looks on screen: x², real minus signs, even spacing. */
export function pretty(text: string): string {
  return sup(String(text))
    .replace(/\*/g, "")
    .replace(/\s*([+-])\s*/g, " $1 ")
    .replace(/\(\s+/g, "(")
    .replace(/^\s*-\s+/, "-")
    .replace(/\( - /g, "(-")
    .replace(/-/g, "−")
    .replace(/\s+/g, " ")
    .trim();
}
const signed = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
const lin = (n: number) => `x ${n < 0 ? "−" : "+"} ${Math.abs(n)}`;
const asciiLin = (n: number) => `x ${n < 0 ? "-" : "+"} ${Math.abs(n)}`;
const words = (n: number) => (n < 0 ? `minus ${-n}` : `${n}`);

/** (x + p)(x + q) → [p, q], or null. */
function bracketPair(answer: string): [number, number] | null {
  const factors = splitFactors(answer);
  if (!factors || factors.length !== 2) return null;
  const nums = factors.map((f) => f.match(/^\(x ([+-]) (\d+)\)$/));
  if (nums.some((m) => !m)) return null;
  return nums.map((m) => (m![1] === "-" ? -1 : 1) * Number(m![2])) as [number, number];
}

function shuffleWith<T>(seed: string, items: T[]): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = ((h >>> 0) % (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A quick check whose options the engine classifies; exactly one must be CORRECT. */
function quickCheck(task: "factorise" | "expand", expression: string, options: Array<{ text: string; feedback: string }>, seed: string, right: string) {
  const verdicts = options.map((o) => taskVerdict(task, o.text, expression));
  if (verdicts.filter((v) => v === "CORRECT").length !== 1 || verdicts.includes("UNREADABLE")) return null;
  const shuffled = shuffleWith(seed, options.map((o, i) => ({ ...o, verdict: verdicts[i]! })));
  return {
    prompt: `${pretty(expression)} = ?`,
    options: shuffled.map((o) => pretty(o.text)),
    answerIndex: shuffled.findIndex((o) => o.verdict === "CORRECT"),
    feedback: shuffled.map((o) => (o.verdict === "CORRECT" ? right : o.feedback)),
  };
}

function plan(template: MicroTemplate, who: string, gap: string, takeaway: string, rows: MicroToken[][], steps: MicroStep[], check: ReturnType<typeof quickCheck>, extra: Partial<MicroLessonView> = {}): MicroLessonPlan | null {
  if (!check) return null;
  return {
    view: { template, who, gap, takeaway, rows, arrow: "mint", steps, check: { prompt: check.prompt, options: check.options }, ...extra },
    check: { answerIndex: check.answerIndex, feedback: check.feedback },
  };
}

/** Rohan: right numbers, wrong signs in x² + bx + c. */
function signsInPair(item: Item, who: string): MicroLessonPlan | null {
  const pair = bracketPair(item.correctAnswer);
  if (!pair || item.task !== "factorise") return null;
  const [p, q] = pair;
  const P = p * q, S = p + q;
  if (S === 0 || !algebraicallyEqual(item.expression, `x^2 + (${S})x + (${P})`)) return null;
  const rows: MicroToken[][] = [
    [["x2", "x²"], " ", ["b", `${S < 0 ? "−" : "+"} ${Math.abs(S) === 1 ? "" : Math.abs(S)}x`], " ", ["c", `${P < 0 ? "−" : "+"} ${Math.abs(P)}`]],
    [["f", `(${lin(p)})`, "under"], ["g", `(${lin(q)})`, "under"]],
  ];
  const signLine = P > 0
    ? `${P > 0 ? "Plus" : "Minus"} ${Math.abs(P)} at the end means both numbers have the same sign.`
    : `Minus ${Math.abs(P)} at the end means the two numbers have opposite signs.`;
  const middleLine = P > 0
    ? (S < 0 ? `Minus ${Math.abs(S)} in the middle means they must both be negative.` : `Plus ${S} in the middle means they're both positive.`)
    : `The middle is ${S < 0 ? "minus" : "plus"}, so the bigger number is ${S < 0 ? "negative" : "positive"}.`;
  const steps: MicroStep[] = [
    { say: `${who}, you wrote ${pretty(item.studentAnswer)}. Let's check the signs.`, actions: [{ op: "pill", text: `${who} wrote: ${pretty(item.studentAnswer)}`, tone: "bad" }] },
    { say: signLine, actions: [{ op: "add", id: "c", cls: ["hl"] }, { op: "pulse", ids: ["c"] }] },
    { say: middleLine, actions: [{ op: "rm", id: "c", cls: ["hl"] }, { op: "add", id: "b", cls: ["hl", "hy"] }, { op: "pulse", ids: ["b"] }] },
    { say: `${signed(p)} and ${signed(q)} multiply to ${signed(P)} and add to ${signed(S)}.`, actions: [{ op: "clearPills" }, { op: "pill", text: `${signed(p)} × ${signed(q)} = ${signed(P)}`, tone: "good" }, { op: "later", ms: 900, then: { op: "pill", text: `${signed(p)} + ${signed(q)} = ${signed(S)}`, tone: "good" } }] },
    { say: `So it's ${pretty(item.correctAnswer)}. Read the signs first, then find the pair.`, actions: [{ op: "rm", id: "b", cls: ["hl"] }, { op: "down", index: 0 }, { op: "show", ids: ["f", "g"] }, { op: "pulse", ids: ["f", "g"] }, { op: "later", ms: 500, then: { op: "add", id: "f", cls: ["under"] } }, { op: "later", ms: 500, then: { op: "add", id: "g", cls: ["under"] } }] },
  ];
  // A fresh trinomial with the same sign pattern.
  const a = P > 0 ? (S > 0 ? 4 : -4) : (S > 0 ? 6 : -6);
  const b = P > 0 ? (S > 0 ? 5 : -5) : (S > 0 ? -2 : 2);
  const expr = `x^2 ${a + b < 0 ? "-" : "+"} ${Math.abs(a + b)}x ${a * b < 0 ? "-" : "+"} ${Math.abs(a * b)}`;
  const check = quickCheck("factorise", expr, [
    { text: `(${asciiLin(a)})(${asciiLin(b)})`, feedback: "" },
    { text: `(${asciiLin(-a)})(${asciiLin(-b)})`, feedback: `They multiply to ${signed(a * b)}, but add to ${signed(-(a + b))}. Check the middle sign.` },
    { text: `(${asciiLin(a)})(${asciiLin(-b)})`, feedback: `Multiply it back: the last sign comes out wrong. Read the last sign first.` },
  ], `${who}|signs`, `Yes! ${words(a)} and ${words(b)}: the signs come first.`);
  return plan("SIGNS_IN_PAIR", who, "signs in the factor pair", "Read the signs first, then find the pair.", rows, steps, check);
}

/** Kabir: equal, but not finished. */
function equalNotFinished(item: Item, who: string): MicroLessonPlan | null {
  if (item.task !== "factorise" || classifyFactorisation(item.studentAnswer, item.expression) !== "UNFINISHED") return null;
  if (classifyFactorisation(item.correctAnswer, item.expression) !== "CORRECT") return null;
  const rows: MicroToken[][] = [[["e", pretty(item.expression)]], [["s", pretty(item.studentAnswer)]], [["a", pretty(item.correctAnswer), "hl"]]];
  const steps: MicroStep[] = [
    { say: `${who}, you wrote ${pretty(item.studentAnswer)}. That step is right.`, actions: [{ op: "down", index: 0 }, { op: "show", ids: ["s"] }] },
    { say: "It's equal, but it isn't finished. Look inside the bracket.", actions: [{ op: "pill", text: "equal ✓", tone: "good" }, { op: "pill", text: "not finished", tone: "warn" }, { op: "add", id: "s", cls: ["hl"] }, { op: "pulse", ids: ["s"] }] },
    { say: "Something in there still splits, or still has a common factor.", actions: [{ op: "pulse", ids: ["s"] }] },
    { say: `Keep going: ${pretty(item.correctAnswer)}.`, actions: [{ op: "down", index: 1 }, { op: "fly", from: "s", to: "a" }, { op: "add", id: "s", cls: ["dim"] }] },
    { say: "Equal isn't finished. Keep going until nothing splits.", actions: [{ op: "add", id: "a", cls: ["hl"] }, { op: "pulse", ids: ["a"] }] },
  ];
  const check = quickCheck("factorise", "3x^2 - 27", [
    { text: "3(x^2 - 9)", feedback: "That's equal, but x squared minus 9 still splits." },
    { text: "3(x - 3)(x + 3)", feedback: "" },
    { text: "(3x - 9)(x + 3)", feedback: "That's equal, but 3x minus 9 still has a common factor of 3." },
  ], `${who}|finish`, "Yes! Take out the 3, then x squared minus 9 splits too.");
  return plan("EQUAL_NOT_FINISHED", who, "stopping too early", "Equal isn't finished. Keep going until nothing splits.", rows, steps, check, { size: 5.4 });
}

/** Meena: the same bracket in both terms is a common factor. */
function commonBracket(item: Item, who: string): MicroLessonPlan | null {
  const m = normalizeMathText(item.expression).match(/^([0-9]*[a-z]?)\(([^()]+)\)\+([0-9]*[a-z]?)\(([^()]+)\)$/);
  if (!m || normalizeMathText(m[2]!) !== normalizeMathText(m[4]!) || !m[1] || !m[3]) return null;
  const [, p, inner, q] = m;
  const bracket = `(${pretty(inner!)})`;
  const answer = `(${inner})(${p} + ${q})`;
  if (classifyFactorisation(answer, item.expression) !== "CORRECT") return null;
  const rows: MicroToken[][] = [
    [["p", pretty(p!)], ["A", bracket, "hl"], " + ", ["q", pretty(q!)], ["B", bracket, "hl"]],
    [["C", bracket], ["o", "("], ["p2", pretty(p!)], ["plus", " + "], ["q2", pretty(q!)], ["c", ")"]],
  ];
  const steps: MicroStep[] = [
    { say: `${who}, you wrote ${pretty(item.studentAnswer)}. But there's a factor hiding in plain sight.`, actions: [{ op: "pill", text: `${who} wrote: ${pretty(item.studentAnswer)}`, tone: "bad" }] },
    { say: `Both terms have the same bracket: ${bracket}.`, actions: [{ op: "add", id: "A", cls: ["hl"] }, { op: "add", id: "B", cls: ["hl"] }, { op: "pulse", ids: ["A", "B"] }] },
    { say: "Treat the whole bracket like one number. It's a common factor.", actions: [{ op: "pulse", ids: ["A", "B"] }] },
    { say: "Take it out once, at the front.", actions: [{ op: "down", index: 0 }, { op: "fly", from: "A", to: "C" }, { op: "fly", from: "B", to: "C" }, { op: "add", id: "A", cls: ["dim"] }, { op: "add", id: "B", cls: ["dim"] }] },
    { say: `What's left, ${pretty(p!)} and ${pretty(q!)}, goes together in the second bracket.`, actions: [{ op: "show", ids: ["o", "plus", "c"] }, { op: "fly", from: "p", to: "p2" }, { op: "fly", from: "q", to: "q2" }, { op: "add", id: "p", cls: ["dim"] }, { op: "add", id: "q", cls: ["dim"] }] },
    { say: "Spot the bracket both terms share, and take it out.", actions: [{ op: "add", id: "C", cls: ["hv"] }, { op: "clearPills" }, { op: "pill", text: pretty(answer), tone: "good" }] },
  ];
  const check = quickCheck("factorise", "a(x - 2) + 5(x - 2)", [
    { text: "(x - 2)(a + 5)", feedback: "" },
    { text: "5a(x - 2)", feedback: "That multiplies a and 5. They were added, so they stay added: a plus 5." },
    { text: "(x - 2)(5a)", feedback: "Look again: a and 5 are added, so the second bracket is a plus 5." },
  ], `${who}|bracket`, "Yes! The shared bracket comes out, and a plus 5 is left.");
  return plan("COMMON_BRACKET", who, "common bracket", "Spot the bracket both terms share.", rows, steps, check, { arrow: "violet" });
}

/** Aarav: a negative times a bracket flips every sign inside. */
function negativeTimesBracket(item: Item, who: string): MicroLessonPlan | null {
  const m = normalizeMathText(item.expression).match(/^-(\d+)\((\d*)x([+-])(\d+)\)$/);
  if (!m) return null;
  const k = Number(m[1]), a = Number(m[2] || "1"), s = m[3] === "-" ? -1 : 1, b = Number(m[4]);
  const first = -k * a, second = -k * s * b;
  const answer = `${first}x ${second < 0 ? "-" : "+"} ${Math.abs(second)}`;
  if (taskVerdict("expand", answer, item.expression) !== "CORRECT") return null;
  const ax = `${a === 1 ? "" : a}x`;
  const rows: MicroToken[][] = [
    [["m", `−${k}`], "(", ["a", ax], " ", ["b", `${s < 0 ? "−" : "+"} ${b}`], ")"],
    [["r1", `${first < 0 ? "−" : ""}${Math.abs(first)}x`], " ", ["r2", `${second < 0 ? "−" : "+"} ${Math.abs(second)}`, "under"]],
  ];
  const steps: MicroStep[] = [
    { say: `${who}, you wrote ${pretty(item.studentAnswer)}. Let's look at the second term.`, actions: [{ op: "pill", text: `${who} wrote: ${pretty(item.studentAnswer)}`, tone: "bad" }] },
    { say: `The minus ${k} outside multiplies every term inside the bracket.`, actions: [{ op: "arc", from: "m", to: "a" }, { op: "arc", from: "m", to: "b", delayMs: 450 }] },
    { say: `Minus ${k} times ${ax} is ${first < 0 ? "minus " : ""}${Math.abs(first)}x.`, actions: [{ op: "add", id: "a", cls: ["hl"] }, { op: "down", index: 0 }, { op: "show", ids: ["r1"] }, { op: "pulse", ids: ["r1"] }] },
    { say: `Now minus ${k} times ${s < 0 ? "minus " : ""}${b}. ${s < 0 ? "Two negatives make a positive." : "A negative times a positive is negative."}`, actions: [{ op: "rm", id: "a", cls: ["hl"] }, { op: "add", id: "b", cls: ["hl", "hy"] }, { op: "pulse", ids: ["b"] }] },
    { say: `So it's ${second < 0 ? "minus" : "plus"} ${Math.abs(second)}.`, actions: [{ op: "show", ids: ["r2"] }, { op: "add", id: "r2", cls: ["hy"] }, { op: "pulse", ids: ["r2"] }, { op: "later", ms: 500, then: { op: "add", id: "r2", cls: ["under"] } }, { op: "clearPills" }, { op: "pill", text: pretty(answer), tone: "good" }] },
    { say: "Remember: a negative times a bracket flips every sign inside.", actions: [{ op: "rm", id: "b", cls: ["hl"] }] },
  ];
  const check = quickCheck("expand", "-3(x - 4)", [
    { text: "-3x - 12", feedback: "Look at the second term. Minus 3 times minus 4: two negatives." },
    { text: "-3x + 12", feedback: "" },
    { text: "3x + 12", feedback: "Check the first term. Minus 3 times x is minus 3x." },
  ], `${who}|negative`, "Yes! Minus 3 times minus 4 is plus 12.");
  return plan("NEGATIVE_TIMES_BRACKET", who, "the sign of each term", "A negative times a bracket flips every sign inside.", rows, steps, check);
}

/** Anything else: your answer beside the right one, and how to check by multiplying back. */
function yourAnswerVsRight(item: Item, who: string): MicroLessonPlan | null {
  const task = item.task === "factorise" ? "factorise" : "expand";
  if (taskVerdict(task, item.correctAnswer, item.expression) !== "CORRECT" || taskVerdict(task, item.studentAnswer, item.expression) === "CORRECT") return null;
  const rows: MicroToken[][] = [[["e", pretty(item.expression)]], [["a", pretty(item.correctAnswer), "under"]]];
  const steps: MicroStep[] = [
    { say: `${who}, you wrote ${pretty(item.studentAnswer)}.`, actions: [{ op: "pill", text: `${who} wrote: ${pretty(item.studentAnswer)}`, tone: "bad" }] },
    { say: `Multiply it back out: it doesn't give ${pretty(item.expression)}.`, actions: [{ op: "add", id: "e", cls: ["hl"] }, { op: "pulse", ids: ["e"] }] },
    { say: `The right answer is ${pretty(item.correctAnswer)}.`, actions: [{ op: "rm", id: "e", cls: ["hl"] }, { op: "down", index: 0 }, { op: "show", ids: ["a"] }, { op: "pulse", ids: ["a"] }, { op: "later", ms: 500, then: { op: "add", id: "a", cls: ["under"] } }] },
    { say: "Always multiply your answer back out to check it.", actions: [{ op: "clearPills" }, { op: "pill", text: "multiply back to check", tone: "good" }] },
  ];
  const check = quickCheck(task, item.expression, [
    { text: item.correctAnswer, feedback: "" },
    { text: item.studentAnswer, feedback: "That's the answer from your test. Multiply it back out and compare." },
  ], `${who}|vs`, "Yes! It multiplies back to the original.");
  return plan("YOUR_ANSWER_VS_RIGHT", who, "checking by multiplying back", "Multiply your answer back out to check it.", rows, steps, check);
}

/** The micro-lesson for this brief: the first of the student's items that fits a template. */
export function buildMicroLesson(brief: LessonBrief): MicroLessonPlan | null {
  const who = brief.studentFirstName || "Your";
  for (const item of brief.studentItems) {
    for (const build of [negativeTimesBracket, commonBracket, equalNotFinished, signsInPair]) {
      try {
        const built = build(item, who);
        if (built) return built;
      } catch {
        /* a template that can't read this item just doesn't apply */
      }
    }
  }
  for (const item of brief.studentItems) {
    try {
      const built = yourAnswerVsRight(item, who);
      if (built) return built;
    } catch {
      /* no micro-lesson for this item */
    }
  }
  return null;
}

/** Seconds a silent line should stay on screen (when the voice is unavailable). */
export function estimatedSeconds(say: string): number {
  return Math.max(1.6, say.split(/\s+/).length * 0.34);
}

export type { MicroAction };
