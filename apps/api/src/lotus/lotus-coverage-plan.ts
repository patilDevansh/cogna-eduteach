import type { LotusQuestion } from "@cogna/shared";
import { crossCheckExpressionAgainstPrompt, normalizeQuestionAnswerKey, questionFingerprints } from "./lotus-math";
import { LOTUS_OPENERS, pickOpener } from "./lotus-openers";

// Restored from the last compiled build (dist/lotus/lotus-coverage-plan.js, 17 Sep 2026 21:59)
// after the source file went missing; behaviour is identical to that build.

const ADDITIONAL_ITEMS: Array<Omit<LotusQuestion, "id">> = [
  {
    phase: "EXPLORE", subtopic: "Signed multiplication", prompt: "Evaluate 7 − (−3) × 2. Show your steps.",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check signed multiplication within order of operations.",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "13", expression: "7-(-3)*2", workedSolution: ["−3 × 2 = −6", "7 − (−6) = 13"] },
  },
  {
    phase: "DIAGNOSE", subtopic: "Negative bracket multiplier", prompt: "Evaluate −4(2 − 7) + 3. Show your steps.",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check a negative multiplier and a later addition.",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "23", expression: "-4*(2-7)+3", workedSolution: ["2 − 7 = −5", "−4 × −5 = 20", "20 + 3 = 23"] },
  },
  {
    phase: "EXPLORE", subtopic: "Subtracting negatives", prompt: "Evaluate 15 − (−6) − 8. Show your steps.",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check subtraction of a negative independently of distribution.",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "13", expression: "15-(-6)-8", workedSolution: ["15 − (−6) = 21", "21 − 8 = 13"] },
  },
  {
    phase: "DIAGNOSE", subtopic: "Equation with brackets", prompt: "Solve 3(x − 4) = 18. Show your steps.",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check whether bracket operations transfer to solving a linear equation.",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "x = 10", workedSolution: ["3x − 12 = 18", "3x = 30", "x = 10"] },
  },
  {
    phase: "DIAGNOSE", subtopic: "Signed division in equations", prompt: "Solve −5x = 20. Show your steps.",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check direct signed division in an equation.",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "x = −4", workedSolution: ["x = 20 ÷ (−5)", "x = −4"] },
  },
  {
    phase: "DIAGNOSE", subtopic: "Subtracting an algebraic bracket", prompt: "Which expression is equal to 7 − (2x − 3)?",
    type: "MULTIPLE_CHOICE", options: ["4 − 2x", "10 − 2x", "7 − 2x − 3", "10 + 2x"], asksForWorking: false,
    purpose: "Check both sign changes when subtracting an algebraic bracket.",
    answerKey: { kind: "MULTIPLE_CHOICE", canonicalAnswer: "10 − 2x", workedSolution: ["7 − (2x − 3) = 7 − 2x + 3", "= 10 − 2x"] },
  },
  {
    phase: "CONFIRM", subtopic: "Equation with a subtracted bracket", prompt: "Solve 8 − (x − 2) = 13. Show your steps.",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check transfer from bracket subtraction to an equation.",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "x = −3", workedSolution: ["8 − x + 2 = 13", "10 − x = 13", "−x = 3", "x = −3"] },
  },
  {
    phase: "EXPLORE", subtopic: "Temperature word problem", prompt: "A temperature of −3°C rises by 8°C and then falls by 6°C. What is the final temperature?",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check transfer of signed-number arithmetic to a word problem.",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "−1", workedSolution: ["−3 + 8 = 5", "5 − 6 = −1°C"] },
  },
  {
    phase: "CONFIRM", subtopic: "Score word problem", prompt: "A quiz gives 5 points for each correct answer and subtracts 2 points for each wrong answer. What is the score for 3 correct and 4 wrong answers?",
    type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    purpose: "Check constructing and evaluating a two-term signed expression from words.",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "7", workedSolution: ["3 × 5 = 15", "4 × 2 = 8", "15 − 8 = 7"] },
  },
];

const COVERAGE_ORDER = [0, 8, 3, 11, 2, 14, 1, 9, 6, 12, 4, 15, 5, 10, 7, 13, 16];

export const LOTUS_COVERAGE_ITEMS: Array<Omit<LotusQuestion, "id">> = [...LOTUS_OPENERS, ...ADDITIONAL_ITEMS].map(normalizeQuestionAnswerKey);

if (LOTUS_COVERAGE_ITEMS.length !== 17 || new Set(COVERAGE_ORDER).size !== LOTUS_COVERAGE_ITEMS.length) {
  throw new Error("Lotus coverage plan must contain 17 distinct item slots.");
}
for (const item of LOTUS_COVERAGE_ITEMS) {
  const check = crossCheckExpressionAgainstPrompt(item);
  if (check.status === "MISMATCHED") throw new Error(`Invalid Lotus coverage item: ${item.prompt} — ${check.explanation}`);
  if (item.type === "MULTIPLE_CHOICE" && !item.options?.includes(item.answerKey.canonicalAnswer)) {
    throw new Error(`Lotus coverage item has no correct option: ${item.prompt}`);
  }
}
if (new Set(LOTUS_COVERAGE_ITEMS.map((item) => questionFingerprints(item).exact)).size !== LOTUS_COVERAGE_ITEMS.length) {
  throw new Error("Lotus coverage plan contains duplicate questions.");
}

export function buildLotusCoveragePlan(studentId: string): Array<Omit<LotusQuestion, "id">> {
  const opener = pickOpener(studentId);
  const rest = COVERAGE_ORDER.map((index) => LOTUS_COVERAGE_ITEMS[index]!)
    .filter((item) => questionFingerprints(item).exact !== questionFingerprints(opener).exact);
  return [opener, ...rest].slice(0, 16);
}
