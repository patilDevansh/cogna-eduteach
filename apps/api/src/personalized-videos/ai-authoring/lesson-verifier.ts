import type {
  AuthoredCheckpoint,
  AuthoredLessonDraft,
  AuthoredScene,
  AuthoredTask,
  AuthoredVisual,
  PracticeItem,
} from "@cogna/shared";
import {
  algebraicallyEqual,
  classifyFactorisation,
  isReadable,
  normalizeMathText,
} from "../../lotus/lotus-algebra";
import { assembleTileAnswer } from "@cogna/shared";
import { splitFactors, splitTerms } from "../../interaction-formats/tile-builder";
import { validateVideoLanguage } from "../video-language";
import type { LessonBrief } from "./lesson-brief";

/**
 * The gate between an AI-written lesson and a student.
 *
 * The model's draft is untrusted data. This re-derives every mathematical
 * claim in it with the exact algebra engine (lotus-algebra.ts), checks the
 * shape against the catalogue, scans the narration for numbers and
 * arithmetic the visuals don't back up, and checks the language. Any single
 * failure rejects the draft; the errors go back to the model for a rewrite.
 *
 * Pure and synchronous: no model call can change what passes.
 */

export interface VerificationResult {
  ok: boolean;
  /** "scenes[1].beats[2].visual: step 3 is not equal to step 2 …" — written so the model can fix it. */
  errors: string[];
  /** Number of maths claims checked, for the audit trail. */
  claimsChecked: number;
}

export const LIMITS = {
  scenes: { min: 2, max: 5 },
  beatsPerScene: { min: 1, max: 6 },
  totalBeats: { max: 18 },
  sayWords: { max: 45 },
  checkpoints: { min: 1, max: 3 },
  practice: { min: 4, max: 8, minFormats: 3 },
  options: { min: 2, max: 4 },
  text: 200,
} as const;

const VISUAL_TYPES = new Set(["title", "expression", "steps", "distribute", "area", "pair-search", "common-factor", "mistake", "rule", "tiles", "number-line"]);
const TASKS = new Set(["factorise", "expand", "simplify"]);
const FORMATS = new Set(["pair-hunt", "spot-mistake", "choose", "type-answer", "factor-safe", "build", "rectangle", "mark-it", "rush"]);

/** Verdict of an answer to a task on an expression, by exact algebra. */
export function taskVerdict(task: AuthoredTask, answer: string, expression: string): "CORRECT" | "UNFINISHED" | "INCORRECT" | "UNREADABLE" {
  if (!isReadable(answer) || !isReadable(expression)) return "UNREADABLE";
  if (task === "factorise") return classifyFactorisation(answer, expression);
  let equal: boolean;
  try { equal = algebraicallyEqual(answer, expression); } catch { return "UNREADABLE"; }
  if (!equal) return "INCORRECT";
  if (task === "expand") return normalizeMathText(answer).includes("(") ? "UNFINISHED" : "CORRECT";
  return "CORRECT";
}

function equal(a: string, b: string): boolean {
  try { return algebraicallyEqual(a, b); } catch { return false; }
}

const product = (a: string, b: string) => `(${a})*(${b})`;
const sum = (terms: string[]) => terms.map((t) => `(${t})`).join("+");

/** Numbers spelt out in narration, so "three times four is twelve" is checked like "3 times 4 is 12". */
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function spokenToDigits(text: string): string {
  return text
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\b(minus|negative)\s+(?=\d|[a-z]+)/g, "-")
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, t: string, u: string) => String(WORD_NUMBERS[t]! + WORD_NUMBERS[u]!))
    .replace(/\b[a-z]+\b/g, (w) => (w in WORD_NUMBERS ? String(WORD_NUMBERS[w]) : w));
}

/**
 * Arithmetic stated in words ("3 times 4 is 12", "minus 2 plus minus 5 makes minus 7").
 * Each one found is evaluated; a false one is an error.
 */
export function narrationArithmeticErrors(say: string): string[] {
  const text = spokenToDigits(say);
  const errors: string[] = [];
  const claim = /(-?\d+)\s*(times|×|multiplied by|plus|added to|\+|minus|take away|less)\s*(-?\d+)\s*(?:is|makes|gives|equals|=|comes to|leaves)\s*(-?\d+)/g;
  for (const m of text.matchAll(claim)) {
    const a = Number(m[1]); const b = Number(m[3]); const c = Number(m[4]);
    const op = m[2]!;
    const value = /times|×|multiplied/.test(op) ? a * b : /plus|added|\+/.test(op) ? a + b : a - b;
    if (value !== c) errors.push(`says "${m[0]}", but that is ${value}`);
  }
  return errors;
}

/** Every number in a string of maths ("x^2 - 7x + 12" → 2, 7, 12), as absolute values. */
function numbersIn(text: string): number[] {
  return [...normalizeMathText(text).matchAll(/\d+/g)].map((m) => Number(m[0]));
}

class Checker {
  readonly errors: string[] = [];
  claims = 0;
  /** Every number the verified maths contains: narration may only mention these (plus small counting numbers). */
  readonly backedNumbers = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  fail(path: string, message: string) {
    this.errors.push(`${path}: ${message}`);
  }

  text(path: string, value: unknown, max: number = LIMITS.text): value is string {
    if (typeof value !== "string" || !value.trim()) {
      this.fail(path, "must be a non-empty string");
      return false;
    }
    if (value.length > max) this.fail(path, `is ${value.length} characters; keep it under ${max}`);
    return true;
  }

  math(path: string, value: unknown): value is string {
    if (!this.text(path, value)) return false;
    if (!isReadable(value)) {
      this.fail(path, `"${value}" is not readable algebra (write it like "x^2 - 7x + 12" or "(x - 3)(x - 4)")`);
      return false;
    }
    for (const n of numbersIn(value)) this.backedNumbers.add(n);
    return true;
  }

  claim(path: string, ok: boolean, message: string) {
    this.claims += 1;
    if (!ok) this.fail(path, message);
  }

  verdict(path: string, task: AuthoredTask, answer: string, expression: string, want: "CORRECT" | "NOT_CORRECT", what: string) {
    const v = taskVerdict(task, answer, expression);
    this.claims += 1;
    if (want === "CORRECT" && v !== "CORRECT") {
      this.fail(path, `${what} "${answer}" is ${v === "UNFINISHED" ? "equal but not finished" : v === "INCORRECT" ? "not equal" : "unreadable"} for "${task} ${expression}"`);
    }
    if (want === "NOT_CORRECT" && v === "CORRECT") this.fail(path, `${what} "${answer}" is actually a correct answer to "${task} ${expression}"`);
  }

  visual(path: string, visual: AuthoredVisual | undefined) {
    if (!visual || typeof visual !== "object" || !VISUAL_TYPES.has((visual as { type: string }).type)) {
      this.fail(path, `visual.type must be one of ${[...VISUAL_TYPES].join(", ")}`);
      return;
    }
    switch (visual.type) {
      case "title":
        this.text(`${path}.text`, visual.text, 90);
        return;
      case "rule":
        this.text(`${path}.heading`, visual.heading, 60);
        if (!Array.isArray(visual.lines) || visual.lines.length < 2 || visual.lines.length > 4) this.fail(`${path}.lines`, "needs 2 to 4 lines");
        else visual.lines.forEach((l, i) => this.text(`${path}.lines[${i}]`, l, 80));
        return;
      case "expression": {
        if (!this.math(`${path}.expr`, visual.expr)) return;
        for (const [i, h] of (visual.highlight ?? []).entries()) {
          const compact = (s: string) => normalizeMathText(s);
          if (!compact(visual.expr).includes(compact(h))) this.fail(`${path}.highlight[${i}]`, `"${h}" does not appear in "${visual.expr}"`);
        }
        if (visual.caption !== undefined) this.text(`${path}.caption`, visual.caption, 90);
        return;
      }
      case "steps": {
        if (!Array.isArray(visual.steps) || visual.steps.length < 2 || visual.steps.length > 6) {
          this.fail(`${path}.steps`, "needs 2 to 6 steps");
          return;
        }
        const ok = visual.steps.map((s, i) => this.math(`${path}.steps[${i}]`, s));
        for (let i = 1; i < visual.steps.length; i++) {
          if (ok[i] && ok[i - 1]) {
            this.claim(`${path}.steps[${i}]`, equal(visual.steps[i]!, visual.steps[i - 1]!), `"${visual.steps[i]}" is not equal to the step before it, "${visual.steps[i - 1]}"`);
          }
        }
        if (visual.caption !== undefined) this.text(`${path}.caption`, visual.caption, 90);
        return;
      }
      case "distribute": {
        const outsideOk = this.math(`${path}.outside`, visual.outside);
        if (!Array.isArray(visual.inside) || !Array.isArray(visual.result) || visual.inside.length < 2 || visual.inside.length !== visual.result.length) {
          this.fail(path, "inside and result need the same number of terms (at least 2)");
          return;
        }
        visual.inside.forEach((term, i) => {
          if (outsideOk && this.math(`${path}.inside[${i}]`, term) && this.math(`${path}.result[${i}]`, visual.result[i])) {
            this.claim(`${path}.result[${i}]`, equal(visual.result[i]!, product(visual.outside, term)), `${visual.outside} × (${term}) is not "${visual.result[i]}"`);
          }
        });
        return;
      }
      case "area": {
        const rowsOk = Array.isArray(visual.rows) && visual.rows.length >= 1 && visual.rows.length <= 3;
        const colsOk = Array.isArray(visual.cols) && visual.cols.length >= 2 && visual.cols.length <= 3;
        if (!rowsOk || !colsOk || !Array.isArray(visual.cells) || visual.cells.length !== visual.rows.length) {
          this.fail(path, "needs 1–3 rows, 2–3 cols, and one cell per row × col");
          return;
        }
        visual.rows.forEach((r, i) => {
          const row = visual.cells[i];
          if (!Array.isArray(row) || row.length !== visual.cols.length) {
            this.fail(`${path}.cells[${i}]`, "needs one cell per column");
            return;
          }
          visual.cols.forEach((c, j) => {
            if (this.math(`${path}.rows[${i}]`, r) && this.math(`${path}.cols[${j}]`, c) && this.math(`${path}.cells[${i}][${j}]`, row[j])) {
              this.claim(`${path}.cells[${i}][${j}]`, equal(row[j]!, product(r, c)), `${r} × ${c} is not "${row[j]}"`);
            }
          });
        });
        return;
      }
      case "pair-search": {
        const { product: p, sum: s, pairs, answer } = visual;
        if (!Number.isInteger(p) || !Number.isInteger(s) || !Array.isArray(pairs) || pairs.length < 2 || pairs.length > 6 || !Array.isArray(answer)) {
          this.fail(path, "needs integer product and sum, 2–6 pairs, and an answer pair");
          return;
        }
        for (const n of [p, s, ...pairs.flat(), ...answer]) this.backedNumbers.add(Math.abs(n));
        pairs.forEach(([a, b], i) => this.claim(`${path}.pairs[${i}]`, a * b === p, `${a} × ${b} = ${a * b}, not ${p}`));
        this.claim(`${path}.answer`, answer[0]! * answer[1]! === p && answer[0]! + answer[1]! === s, `${answer[0]} and ${answer[1]} must multiply to ${p} and add to ${s}`);
        this.claim(`${path}.answer`, pairs.some(([a, b]) => (a === answer[0] && b === answer[1]) || (a === answer[1] && b === answer[0])), "the answer pair must be one of the listed pairs");
        return;
      }
      case "common-factor": {
        if (!this.math(`${path}.factor`, visual.factor)) return;
        if (!Array.isArray(visual.terms) || !Array.isArray(visual.remaining) || visual.terms.length < 2 || visual.terms.length !== visual.remaining.length) {
          this.fail(path, "terms and remaining need the same number of entries (at least 2)");
          return;
        }
        let allOk = true;
        visual.terms.forEach((t, i) => {
          if (this.math(`${path}.terms[${i}]`, t) && this.math(`${path}.remaining[${i}]`, visual.remaining[i])) {
            const ok = equal(t, product(visual.factor, visual.remaining[i]!));
            allOk &&= ok;
            this.claim(`${path}.remaining[${i}]`, ok, `${visual.factor} × (${visual.remaining[i]}) is not "${t}"`);
          } else allOk = false;
        });
        if (allOk) {
          const factored = `${visual.factor}(${visual.remaining.join(" + ")})`;
          this.verdict(path, "factorise", factored, sum(visual.terms), "CORRECT", "taking out this factor gives");
        }
        return;
      }
      case "tiles": {
        const { b, c, sides } = visual;
        const ok = [b, c].every((n) => Number.isInteger(n) && n > 0 && n <= 30) && Array.isArray(sides) && sides.length === 2 && sides.every((n) => Number.isInteger(n) && n > 0);
        if (!ok) {
          this.fail(path, "tiles need positive whole numbers: b strips (up to 30), c squares (up to 30) and two positive sides");
          return;
        }
        this.claim(`${path}.sides`, sides[0] + sides[1] === b && sides[0] * sides[1] === c, `sides ${sides[0]} and ${sides[1]} must add to ${b} and multiply to ${c}`);
        return;
      }
      case "number-line": {
        const { start, moves } = visual;
        const ok = Number.isInteger(start) && Math.abs(start) <= 12 && Array.isArray(moves) && moves.length >= 1 && moves.length <= 3 && moves.every((m) => Number.isInteger(m) && m !== 0 && Math.abs(m) <= 12);
        if (!ok) {
          this.fail(path, "a number line needs a whole start within ±12 and 1–3 non-zero whole moves within ±12");
          return;
        }
        let at = start;
        for (const m of moves) at += m;
        this.claim(`${path}.moves`, Math.abs(at) <= 15, "the walk must stay on the drawn line (within ±15)");
        if (visual.caption !== undefined) {
          this.text(`${path}.caption`, visual.caption, 80);
          // A caption that states the landing point must state the right one.
          const said = visual.caption.match(/(-|−)?\d+\s*$/);
          if (said) this.claim(`${path}.caption`, Number(said[0].replace("−", "-").replace(/\s/g, "")) === at, `the walk lands on ${at}, not ${said[0].trim()}`);
        }
        return;
      }
      case "mistake": {
        if (!TASKS.has(visual.task)) this.fail(`${path}.task`, "must be factorise, expand or simplify");
        this.text(`${path}.note`, visual.note, 120);
        if (this.math(`${path}.expr`, visual.expr) && this.math(`${path}.right`, visual.right) && this.math(`${path}.wrong`, visual.wrong)) {
          this.verdict(`${path}.right`, visual.task, visual.right, visual.expr, "CORRECT", "the right answer");
          this.verdict(`${path}.wrong`, visual.task, visual.wrong, visual.expr, "NOT_CORRECT", "the wrong answer");
          const actual = taskVerdict(visual.task, visual.wrong, visual.expr);
          const kind = actual === "UNFINISHED" ? "unfinished" : actual === "INCORRECT" ? "incorrect" : null;
          this.claim(`${path}.wrongKind`, visual.wrongKind === kind,
            kind ? `"${visual.wrong}" is ${kind === "unfinished" ? "equal to the expression but not finished" : "not equal to the expression"}, so wrongKind must be "${kind}"` : "wrongKind must be \"unfinished\" or \"incorrect\"");
        }
        return;
      }
    }
  }

  scenes(scenes: AuthoredScene[] | undefined) {
    if (!Array.isArray(scenes) || scenes.length < LIMITS.scenes.min || scenes.length > LIMITS.scenes.max) {
      this.fail("scenes", `needs ${LIMITS.scenes.min} to ${LIMITS.scenes.max} scenes`);
      return;
    }
    let total = 0;
    scenes.forEach((scene, si) => {
      this.text(`scenes[${si}].title`, scene?.title, 60);
      const beats = scene?.beats;
      if (!Array.isArray(beats) || beats.length < LIMITS.beatsPerScene.min || beats.length > LIMITS.beatsPerScene.max) {
        this.fail(`scenes[${si}].beats`, `needs ${LIMITS.beatsPerScene.min} to ${LIMITS.beatsPerScene.max} beats`);
        return;
      }
      total += beats.length;
      beats.forEach((beat, bi) => this.visual(`scenes[${si}].beats[${bi}].visual`, beat?.visual));
    });
    if (total > LIMITS.totalBeats.max) this.fail("scenes", `has ${total} beats; keep it to ${LIMITS.totalBeats.max} or fewer`);
  }

  /** Narration is checked after the visuals so it can be compared with the numbers they verified. */
  narration(scenes: AuthoredScene[]) {
    scenes.forEach((scene, si) =>
      (scene.beats ?? []).forEach((beat, bi) => {
        const path = `scenes[${si}].beats[${bi}].say`;
        if (!this.text(path, beat?.say, 320)) return;
        this.spoken(path, beat.say);
      }),
    );
  }

  spoken(path: string, say: string) {
    const words = say.trim().split(/\s+/).length;
    if (words > LIMITS.sayWords.max) this.fail(path, `is ${words} words; keep it to ${LIMITS.sayWords.max}`);
    if (/[\^*/=]/.test(say)) this.fail(path, "is read aloud: write maths in words (\"x squared\", \"times\"), not symbols like ^ * / =");
    for (const e of narrationArithmeticErrors(say)) this.fail(path, e);
    for (const m of spokenToDigits(say).matchAll(/\d+/g)) {
      const n = Number(m[0]);
      if (!this.backedNumbers.has(n)) this.fail(path, `mentions ${n}, which none of the checked maths contains`);
    }
  }

  checkpoints(checkpoints: AuthoredCheckpoint[] | undefined, scenes: AuthoredScene[]) {
    if (!Array.isArray(checkpoints) || checkpoints.length < LIMITS.checkpoints.min || checkpoints.length > LIMITS.checkpoints.max) {
      this.fail("checkpoints", `needs ${LIMITS.checkpoints.min} to ${LIMITS.checkpoints.max} checkpoints`);
      return;
    }
    checkpoints.forEach((cp, i) => {
      const path = `checkpoints[${i}]`;
      if (!scenes[cp?.afterScene]?.beats?.[cp?.afterBeat]) this.fail(path, "afterScene/afterBeat must point at a beat that exists");
      this.text(`${path}.prompt`, cp?.prompt, 140);
      const options = cp?.options;
      if (!Array.isArray(options) || options.length < LIMITS.options.min || options.length > LIMITS.options.max) {
        this.fail(`${path}.options`, `needs ${LIMITS.options.min} to ${LIMITS.options.max} options`);
        return;
      }
      if (options.filter((o) => o?.correct === true).length !== 1) this.fail(`${path}.options`, "needs exactly one correct option");
      if (new Set(options.map((o) => o?.label)).size !== options.length) this.fail(`${path}.options`, "has duplicate labels");
      options.forEach((o, j) => this.text(`${path}.options[${j}].label`, o?.label, 60));
      this.checkpointMath(path, cp, options);
      // Spoken text is checked after the options' maths, so it may mention their numbers.
      if (this.text(`${path}.spoken`, cp?.spoken, 240)) this.spoken(`${path}.spoken`, cp.spoken);
      options.forEach((o, j) => {
        if (this.text(`${path}.options[${j}].feedback`, o?.feedback, 200)) this.spoken(`${path}.options[${j}].feedback`, o.feedback);
      });
    });
  }

  private checkpointMath(path: string, cp: AuthoredCheckpoint, options: AuthoredCheckpoint["options"]) {
    if (cp.check) {
      if (!TASKS.has(cp.check.task)) this.fail(`${path}.check.task`, "must be factorise, expand or simplify");
      else if (this.math(`${path}.check.expression`, cp.check.expression)) {
        options.forEach((o, j) => {
          if (this.math(`${path}.options[${j}].label`, o.label)) {
            this.verdict(`${path}.options[${j}]`, cp.check!.task, o.label, cp.check!.expression, o.correct ? "CORRECT" : "NOT_CORRECT", o.correct ? "the option marked correct" : "an option marked wrong");
          }
        });
      }
    } else if (options.some((o) => typeof o?.label === "string" && /\d/.test(o.label) && isReadable(o.label))) {
      this.fail(`${path}.check`, "options look like maths answers, so add check: { task, expression } so they can be verified");
    }
  }

  practice(items: PracticeItem[] | undefined) {
    if (!Array.isArray(items) || items.length < LIMITS.practice.min || items.length > LIMITS.practice.max) {
      this.fail("practice", `needs ${LIMITS.practice.min} to ${LIMITS.practice.max} items`);
      return;
    }
    const formats = new Set(items.map((it) => it?.format));
    if (formats.size < LIMITS.practice.minFormats) this.fail("practice", `use at least ${LIMITS.practice.minFormats} different formats (pair-hunt, spot-mistake, choose, type-answer)`);
    if (new Set(items.map((it) => it?.id)).size !== items.length) this.fail("practice", "item ids must be unique");
    items.forEach((item, i) => this.practiceItem(`practice[${i}]`, item));
  }

  practiceItem(path: string, item: PracticeItem) {
    if (!item || !FORMATS.has(item.format)) {
      this.fail(`${path}.format`, `must be one of ${[...FORMATS].join(", ")}`);
      return;
    }
    this.text(`${path}.id`, item.id, 40);
    this.text(`${path}.prompt`, item.prompt, 140);
    switch (item.format) {
      case "pair-hunt": {
        const { product: p, sum: s, options, answer } = item;
        if (!Array.isArray(options) || options.length < 2 || options.length > 4 || !Array.isArray(answer)) {
          this.fail(path, "needs 2–4 option pairs and an answer pair");
          return;
        }
        if (this.math(`${path}.expression`, item.expression)) {
          this.claim(`${path}.expression`, equal(item.expression, `x^2 + (${s})x + (${p})`), `"${item.expression}" is not x² + ${s}x + ${p} (pair-hunt is for x² + bx + c)`);
        }
        this.claim(`${path}.answer`, answer[0]! * answer[1]! === p && answer[0]! + answer[1]! === s, `${answer[0]} and ${answer[1]} must multiply to ${p} and add to ${s}`);
        const right = options.filter(([a, b]) => a * b === p && a + b === s);
        this.claim(`${path}.options`, right.length === 1, "exactly one option pair may multiply to the product and add to the sum");
        this.claim(`${path}.options`, options.some(([a, b]) => (a === answer[0] && b === answer[1]) || (a === answer[1] && b === answer[0])), "the answer pair must be one of the options");
        return;
      }
      case "spot-mistake": {
        const { lines, wrongLine } = item;
        if (!Array.isArray(lines) || lines.length < 3 || lines.length > 5 || !Number.isInteger(wrongLine) || wrongLine < 1 || wrongLine >= lines.length) {
          this.fail(path, "needs 3–5 lines and a wrongLine index from 1 to the last line");
          return;
        }
        const ok = lines.map((l, i) => this.math(`${path}.lines[${i}]`, l));
        if (ok.every(Boolean)) {
          for (let i = 1; i < wrongLine; i++) this.claim(`${path}.lines[${i}]`, equal(lines[i]!, lines[i - 1]!), `line ${i} must equal the line before it (only line ${wrongLine} is wrong)`);
          this.claim(`${path}.lines[${wrongLine}]`, !equal(lines[wrongLine]!, lines[wrongLine - 1]!), `line ${wrongLine} is meant to be the mistake, but it equals the line before it`);
        }
        if (this.math(`${path}.fix`, item.fix) && ok[wrongLine - 1]) {
          this.claim(`${path}.fix`, equal(item.fix, lines[wrongLine - 1]!), `the fix "${item.fix}" must equal the line before the mistake`);
        }
        this.text(`${path}.explanation`, item.explanation, 200);
        return;
      }
      case "choose": {
        if (!TASKS.has(item.task)) this.fail(`${path}.task`, "must be factorise, expand or simplify");
        const { options, feedback, answerIndex } = item;
        if (!Array.isArray(options) || options.length < 2 || options.length > 4 || !Array.isArray(feedback) || feedback.length !== options.length) {
          this.fail(path, "needs 2–4 options and one feedback line per option");
          return;
        }
        if (!Number.isInteger(answerIndex) || !options[answerIndex]) this.fail(`${path}.answerIndex`, "must point at an option");
        if (new Set(options).size !== options.length) this.fail(`${path}.options`, "has duplicates");
        feedback.forEach((f, j) => this.text(`${path}.feedback[${j}]`, f, 200));
        if (this.math(`${path}.expression`, item.expression)) {
          options.forEach((o, j) => {
            if (this.math(`${path}.options[${j}]`, o)) {
              this.verdict(`${path}.options[${j}]`, item.task, o, item.expression, j === answerIndex ? "CORRECT" : "NOT_CORRECT", j === answerIndex ? "the answer" : "a distractor");
            }
          });
        }
        return;
      }
      case "type-answer": {
        if (!TASKS.has(item.task)) this.fail(`${path}.task`, "must be factorise, expand or simplify");
        this.text(`${path}.hint`, item.hint, 160);
        if (this.math(`${path}.expression`, item.expression) && this.math(`${path}.answer`, item.answer)) {
          this.verdict(`${path}.answer`, item.task, item.answer, item.expression, "CORRECT", "the answer");
        }
        const steps = item.workedSteps;
        if (!Array.isArray(steps) || steps.length < 2 || steps.length > 6) {
          this.fail(`${path}.workedSteps`, "needs 2 to 6 steps");
          return;
        }
        const ok = steps.map((s, i) => this.math(`${path}.workedSteps[${i}]`, s));
        for (let i = 1; i < steps.length; i++) {
          if (ok[i] && ok[i - 1]) this.claim(`${path}.workedSteps[${i}]`, equal(steps[i]!, steps[i - 1]!), `"${steps[i]}" is not equal to the step before it`);
        }
        if (ok[0] && typeof item.expression === "string") this.claim(`${path}.workedSteps[0]`, equal(steps[0]!, item.expression), "the first worked step must be the expression itself");
        if (ok[steps.length - 1] && typeof item.answer === "string") this.claim(`${path}.workedSteps`, equal(steps[steps.length - 1]!, item.answer), "the last worked step must be the answer");
        return;
      }
      case "factor-safe": {
        const { product: p, sum: s, answer } = item;
        if (!Array.isArray(answer) || answer.length !== 2) {
          this.fail(path, "needs an answer pair");
          return;
        }
        if (this.math(`${path}.expression`, item.expression)) {
          this.claim(`${path}.expression`, equal(item.expression, `x^2 + (${s})x + (${p})`), `"${item.expression}" is not x² + ${s}x + ${p} (factor-safe is for x² + bx + c)`);
        }
        this.claim(`${path}.answer`, answer[0]! * answer[1]! === p && answer[0]! + answer[1]! === s, `${answer[0]} and ${answer[1]} must multiply to ${p} and add to ${s}`);
        this.claim(`${path}.answer`, answer.every((n) => Number.isInteger(n) && Math.abs(n) <= 12 && n !== 0), "the dials only reach −12 to 12, without 0");
        return;
      }
      case "rectangle": {
        const [side, bottom] = item.answer ?? [];
        if (!Number.isInteger(side) || !Number.isInteger(bottom) || side! < 1 || bottom! < 1) {
          this.fail(`${path}.answer`, "needs two positive whole numbers");
          return;
        }
        if (this.math(`${path}.expression`, item.expression)) {
          this.claim(`${path}.expression`, equal(item.expression, `x^2 + ${item.strips}x + ${item.units}`), `"${item.expression}" is not x² + ${item.strips}x + ${item.units}`);
        }
        this.claim(`${path}.answer`, side! + bottom! === item.strips && side! * bottom! === item.units, `${side} and ${bottom} must split the ${item.strips} strips and fill the ${item.units} squares`);
        return;
      }
      case "mark-it": {
        if (!Array.isArray(item.papers) || item.papers.length < 2 || item.papers.length > 6) {
          this.fail(`${path}.papers`, "needs 2 to 6 papers");
          return;
        }
        item.papers.forEach((paper, j) => {
          const at = `${path}.papers[${j}]`;
          if (!this.math(`${at}.expression`, paper.expression) || !this.math(`${at}.bitAnswer`, paper.bitAnswer)) return;
          const verdict = taskVerdict(paper.task, paper.bitAnswer, paper.expression);
          this.claim(`${at}.verdict`, (verdict === "CORRECT") === (paper.verdict === "right"), `Bit's answer is ${verdict}, but the paper says ${paper.verdict}`);
          if (paper.verdict === "wrong") this.claim(`${at}.reasons`, paper.reasons.length > 0 && paper.reasons.includes("unfinished") === (verdict === "UNFINISHED"), "a wrong paper needs its real mistake named");
        });
        this.claim(`${path}.papers`, item.papers.some((p) => p.verdict === "right") && item.papers.some((p) => p.verdict === "wrong"), "mix right and wrong papers");
        return;
      }
      case "rush": {
        if (!Array.isArray(item.rounds) || item.rounds.length < 4 || item.rounds.length > 20) {
          this.fail(`${path}.rounds`, "needs 4 to 20 rounds");
          return;
        }
        item.rounds.forEach((round, j) => {
          const at = `${path}.rounds[${j}]`;
          if (!this.math(`${at}.expression`, round.expression)) return;
          round.options.forEach((option, k) => {
            if (this.math(`${at}.options[${k}]`, option)) this.verdict(`${at}.options[${k}]`, round.task, option, round.expression, k === round.answerIndex ? "CORRECT" : "NOT_CORRECT", k === round.answerIndex ? "the answer" : "a distractor");
          });
        });
        return;
      }
      case "build": {
        if (!TASKS.has(item.task) || item.task === "simplify") this.fail(`${path}.task`, "must be factorise or expand");
        const tiles = item.interaction?.tiles;
        if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 8) {
          this.fail(`${path}.interaction`, "needs 3 to 8 tiles");
          return;
        }
        if (this.math(`${path}.expression`, item.expression) && this.math(`${path}.answer`, item.answer)) {
          this.verdict(`${path}.answer`, item.task, item.answer, item.expression, "CORRECT", "the answer");
          const pieces = (item.task === "expand" ? splitTerms(item.answer) : item.interaction.format === "BRACKET_BRIDGE" ? splitFactors(item.answer)?.map((f) => f.slice(1, -1)) : splitFactors(item.answer)) ?? [];
          const picks: Array<number | null> = pieces.map((piece) => tiles.findIndex((t) => normalizeMathText(t) === normalizeMathText(piece)));
          while (picks.length < item.interaction.slots) picks.push(null);
          const built = picks.includes(-1) ? null : assembleTileAnswer(item.interaction, picks);
          this.claim(`${path}.interaction`, !!built && taskVerdict(item.task, built, item.expression) === "CORRECT", "the right tiles must build the correct answer");
        }
        return;
      }
    }
  }
}

/** Every expression the lesson or practice puts in front of the student, for the freshness check. */
function expressionsUsed(draft: AuthoredLessonDraft): string[] {
  const fromVisual = (v: AuthoredVisual): string[] =>
    v.type === "expression" ? [v.expr]
      : v.type === "steps" ? [v.steps[0] ?? ""]
      : v.type === "mistake" ? [v.expr]
      : v.type === "common-factor" ? [sum(v.terms)]
      : [];
  const fromPractice = (p: PracticeItem): string[] =>
    p.format === "spot-mistake" ? [p.lines[0] ?? ""]
      : p.format === "mark-it" ? p.papers.map((x) => x.expression)
      : p.format === "rush" ? p.rounds.map((r) => r.expression)
      : [p.expression];
  return [
    ...(draft.scenes ?? []).flatMap((s) => (s.beats ?? []).flatMap((b) => (b?.visual ? fromVisual(b.visual) : []))),
    ...(draft.practice ?? []).flatMap((p) => (p ? fromPractice(p) : [])),
  ].filter(Boolean);
}

export function verifyAuthoredLesson(draft: AuthoredLessonDraft, brief: LessonBrief): VerificationResult {
  const c = new Checker();
  if (!draft || typeof draft !== "object") return { ok: false, errors: ["The response must be one JSON object."], claimsChecked: 0 };

  c.text("title", draft.title, 70);
  c.text("objective", draft.objective, 160);
  c.text("whyThisLesson", draft.whyThisLesson, 200);
  c.text("learnerDecision", draft.learnerDecision, 200);
  c.text("teacherDecision", draft.teacherDecision, 240);

  // The brief's own maths is trusted (it came from verified answer keys); its numbers may be spoken.
  for (const item of brief.studentItems) {
    c.backedNumbers.add(item.questionNumber);
    for (const t of [item.expression, item.correctAnswer, item.studentAnswer]) for (const n of numbersIn(t)) c.backedNumbers.add(n);
  }

  c.scenes(draft.scenes);
  c.checkpoints(draft.checkpoints, draft.scenes ?? []);
  c.practice(draft.practice);

  const exit = draft.exit;
  if (!exit || !TASKS.has(exit.task)) c.fail("exit", "needs prompt, expression, task (factorise/expand/simplify) and answer");
  else {
    c.text("exit.prompt", exit.prompt, 140);
    // The exit page shows only the prompt, so it must contain the expression the student works on.
    if (typeof exit.prompt === "string" && typeof exit.expression === "string" && !normalizeMathText(exit.prompt).includes(normalizeMathText(exit.expression))) {
      c.fail("exit.prompt", `must include the expression itself, e.g. "Factorise ${exit.expression}."`);
    }
    if (c.math("exit.expression", exit.expression) && c.math("exit.answer", exit.answer)) {
      c.verdict("exit.answer", exit.task, exit.answer, exit.expression, "CORRECT", "the exit answer");
      const seen = [...expressionsUsed(draft), ...brief.studentItems.map((i) => i.expression)];
      c.claim("exit.expression", !seen.some((e) => equal(e, exit.expression)), "the exit item must be fresh: not used in the lesson, the practice, or the diagnostic");
    }
  }

  // Grounding: the lesson must work on at least one of the student's own diagnostic expressions.
  if (brief.studentItems.length) {
    const own = brief.studentItems.map((i) => i.expression);
    c.claim("scenes", expressionsUsed({ ...draft, practice: [] }).some((e) => own.some((o) => equal(e, o))), `use at least one of the student's own expressions (${own.join("; ")}) in the lesson`);
  }

  // Narration last: it may only use numbers the checked maths above contains.
  if (Array.isArray(draft.scenes)) c.narration(draft.scenes);

  const language = validateVideoLanguage([
    draft.title, draft.objective, draft.whyThisLesson, draft.learnerDecision, draft.teacherDecision,
    ...(draft.scenes ?? []).flatMap((s) => [s?.title, ...(s?.beats ?? []).map((b) => b?.say)]),
    ...(draft.checkpoints ?? []).flatMap((cp) => [cp?.prompt, cp?.spoken, ...(cp?.options ?? []).map((o) => o?.feedback)]),
  ].filter((t): t is string => typeof t === "string"));
  for (const e of language.errors ?? []) c.fail("language", e);

  return { ok: c.errors.length === 0, errors: c.errors, claimsChecked: c.claims };
}
