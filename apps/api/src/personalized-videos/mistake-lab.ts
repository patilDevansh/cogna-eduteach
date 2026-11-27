import { algebraicallyEqual, normalizeMathText } from "../lotus/lotus-algebra";
import { pretty } from "./micro-lessons";

/**
 * Evidence → the inputs of "Your answer, as a field" (lesson 4 of the Algebraic expressions Rive lab,
 * prototypes/rive-algebraic-expressions-module/l4.luau), with no model in the loop.
 *
 * The lesson draws the child's own answer to (v + n)² as pieces of a square field, so what the answer left
 * out shows as empty land. It is only offered when the exact algebra engine confirms the answer IS one of the
 * two mistakes it draws; anything else returns null and the child keeps the ordinary lessons.
 *
 * `help` is how much the lesson does for the child (1 watch, 2 together, 3 solo). The rule is deliberately
 * simple and versioned; it is a starting policy to measure against later independent checks, not a finding.
 */

export const MISTAKE_LAB_POLICY = "mistake-lab-help.v1";

export type MistakeLabMistake = "SQUARE_DISTRIBUTES" | "MIDDLE_NOT_DOUBLED";

export interface MistakeLabInputs {
  lesson: 4;
  mineV: string;
  mineN: number;
  /** The child's answer, as they wrote it, tidied for the screen. */
  mineSaid: string;
  mineMistake: MistakeLabMistake;
  help: 1 | 2 | 3;
  policy: typeof MISTAKE_LAB_POLICY;
}

export interface MistakeLabHistory {
  /** A lesson on this skill has already ended in a failed final check. */
  lessonFailedBefore?: boolean;
}

export function mistakeLabInputs(expression: string, studentAnswer: string, history: MistakeLabHistory = {}): MistakeLabInputs | null {
  const item = /^\(([a-z])\+([1-7])\)\^2$/.exec(normalizeMathText(expression));
  if (!item) return null;
  const v = item[1];
  const n = Number(item[2]);

  let mistake: MistakeLabMistake;
  try {
    if (algebraicallyEqual(studentAnswer, `${v}^2 + ${n * n}`)) mistake = "SQUARE_DISTRIBUTES";
    else if (algebraicallyEqual(studentAnswer, `${v}^2 + ${n}*${v} + ${n * n}`)) mistake = "MIDDLE_NOT_DOUBLED";
    else return null;
  } catch {
    return null; // an answer the checker cannot read is not evidence of either mistake
  }

  // Already wrote a middle term (just one strip) → solo; no middle term at all → together.
  // A lesson on this skill that already failed → one level more help.
  const base = mistake === "MIDDLE_NOT_DOUBLED" ? 3 : 2;
  const help = Math.max(1, base - (history.lessonFailedBefore ? 1 : 0)) as 1 | 2 | 3;

  return { lesson: 4, mineV: v, mineN: n, mineSaid: pretty(normalizeMathText(studentAnswer)), mineMistake: mistake, help, policy: MISTAKE_LAB_POLICY };
}
