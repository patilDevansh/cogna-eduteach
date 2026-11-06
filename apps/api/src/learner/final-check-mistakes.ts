/**
 * What a wrong lesson final check shows, named the way the diagnostic names mistakes, so the memory
 * knows which misconception survived the lesson (not only that the answer was wrong). Code only: an
 * answer is named only when one of the algebra engine's readings explains it exactly.
 */
import { parsePair, parseTrinomial } from "@cogna/lesson-video";
import type { AuthoredTask } from "@cogna/shared";
import { classifyFactorisation, readCommonFactor } from "../lotus/lotus-algebra";
import { unfinishedCode } from "../lotus/lotus-factorisation";

export function finalCheckMistake(task: AuthoredTask, expression: string, answer: string): string | undefined {
  if (task !== "factorise") return undefined;
  const verdict = classifyFactorisation(answer, expression);
  if (verdict === "CORRECT" || verdict === "UNREADABLE") return undefined;
  if (verdict === "UNFINISHED") return unfinishedCode(answer);
  const commonFactor = readCommonFactor(answer, expression)?.mistake;
  if (commonFactor) return commonFactor;
  // x² + bx + c: the pair's numbers and signs say which part went wrong.
  const t = parseTrinomial(expression);
  const pair = t && parsePair(answer, t.v);
  if (!t || !pair) return undefined;
  const [p, q] = pair;
  const product = p * q === t.c;
  const sum = p + q === t.b;
  if (Math.abs(p * q) === Math.abs(t.c) && Math.abs(p + q) === Math.abs(t.b) && !(product && sum)) return "SIGN_PAIR_ERROR";
  if (product && !sum) return "WRONG_FACTOR_PAIR_SUM";
  if (sum && !product) return "WRONG_FACTOR_PAIR_PRODUCT";
  return undefined;
}
