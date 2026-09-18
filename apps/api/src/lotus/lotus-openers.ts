import type { LotusQuestion } from "@cogna/shared";
import { crossCheckExpressionAgainstPrompt, normalizeQuestionAnswerKey } from "./lotus-math";

/**
 * A student's very first Lotus question has no prior evidence to
 * personalize from — asking the AI to "personalize" it is personalizing
 * against nothing. These are validated once, at build time, and served for
 * free: no model call, no wait, and nothing to verify at request time
 * because it was already verified here. Kept small (not one fixed
 * question) so students sitting side by side do not see an identical
 * screen, and spread across the coverage spine so whichever one is served
 * still gives the diagnostic a useful first probe.
 */
const OPENERS: Array<Omit<LotusQuestion, "id">> = [
  {
    phase: "EXPLORE",
    subtopic: "Order of operations",
    prompt: "Evaluate 3 + 4 × 2. Show your steps.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: order of operations before any bracket is involved.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "11",
      expression: "3+4*2",
      workedSolution: ["4 × 2 = 8", "3 + 8 = 11"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Signed bracket expansion",
    prompt: "Evaluate 3(4 − 7). Show your steps.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: distributing a positive multiplier over a signed bracket.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "-9",
      expression: "3*(4-7)",
      workedSolution: ["4 − 7 = −3", "3 × −3 = −9"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Signed number arithmetic",
    prompt: "What is −5 + 8 − 2?",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: the signed-number foundation brackets are built on.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "1",
      expression: "-5+8-2",
      workedSolution: ["−5 + 8 = 3", "3 − 2 = 1"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Equivalence and structural meaning",
    prompt: "Which is equal to 2(x + 5)?",
    type: "MULTIPLE_CHOICE",
    options: ["2x + 5", "2x + 10", "x + 10", "2x + 7"],
    asksForWorking: false,
    purpose: "Opening breadth probe: recognising distribution structurally, without arithmetic to lean on.",
    answerKey: {
      kind: "MULTIPLE_CHOICE",
      canonicalAnswer: "2x + 10",
      workedSolution: ["Distribute the 2 across both terms: 2 × x and 2 × 5.", "2x + 10"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Grouping and brackets",
    prompt: "Evaluate (6 − 9) × (2 − 5). Show your steps.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: two signed brackets multiplied together.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "9",
      expression: "(6-9)*(2-5)",
      workedSolution: ["6 − 9 = −3", "2 − 5 = −3", "−3 × −3 = 9"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Signed bracket expansion",
    prompt: "Evaluate −2(5 − 8). Show your steps.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: distributing a negative multiplier over a signed bracket.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "6",
      expression: "-2*(5-8)",
      workedSolution: ["5 − 8 = −3", "−2 × −3 = 6"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Expression interpretation",
    prompt: "Write an expression for “5 less than 3 times a number x”, then evaluate it for x = 4.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: constructing an expression from words before evaluating it.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "7",
      expression: "3*4-5",
      workedSolution: ["3x − 5", "3 × 4 = 12", "12 − 5 = 7"],
    },
  },
  {
    phase: "EXPLORE",
    subtopic: "Order of operations",
    prompt: "Evaluate 10 − 2 × (3 − 6). Show your steps.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Opening breadth probe: order of operations combined with a signed bracket.",
    answerKey: {
      kind: "NUMERIC",
      canonicalAnswer: "16",
      expression: "10-2*(3-6)",
      workedSolution: ["3 − 6 = −3", "2 × −3 = −6", "10 − −6 = 16"],
    },
  },
];

export const LOTUS_OPENERS: Array<Omit<LotusQuestion, "id">> = OPENERS.map(normalizeQuestionAnswerKey);

// A misconfigured opener must fail at boot, in dev/CI, never at runtime for
// a real student — this is exactly the "unchecked AI-generated math item"
// the architecture forbids showing, just hand-authored instead of AI-authored.
for (const opener of LOTUS_OPENERS) {
  const crossCheck = crossCheckExpressionAgainstPrompt(opener);
  if (crossCheck.status === "MISMATCHED") {
    throw new Error(`Lotus opener bank has an unverified question: "${opener.prompt}" — ${crossCheck.explanation}`);
  }
}

/**
 * Deterministic-ish spread across the bank so repeated starts don't always
 * collide, without needing any state. Not a security control — see
 * lotus.service's redaction of currentQuestion for what actually keeps the
 * answer key away from the browser.
 */
export function pickOpener(studentId: string): Omit<LotusQuestion, "id"> {
  let hash = 0;
  for (let i = 0; i < studentId.length; i += 1) {
    hash = (hash * 31 + studentId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % LOTUS_OPENERS.length;
  return LOTUS_OPENERS[index]!;
}
