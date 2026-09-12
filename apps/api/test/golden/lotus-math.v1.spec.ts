import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import {
  evaluateArithmetic,
  questionFingerprints,
  verifyLotusResponse,
} from "../../src/lotus/lotus-math";

const bracketQuestion: LotusQuestion = {
  id: "q-brackets",
  phase: "EXPLORE",
  subtopic: "bracket structure",
  prompt: "Calculate 5 × (1 + 4 × 2).",
  type: "CONSTRUCTED_RESPONSE",
  asksForWorking: true,
  purpose: "Observe order of operations inside a bracket.",
  answerKey: {
    kind: "NUMERIC",
    canonicalAnswer: "45",
    expression: "5 * (1 + 4 * 2)",
    workedSolution: ["4 × 2 = 8", "1 + 8 = 9", "5 × 9 = 45"],
  },
};

function response(answer: string): LotusStudentResponse {
  return {
    answer,
    working: "4 × 2 = 8; 1 + 8 = 9; 5 × 9 = 45",
    confidence: 60,
    responseTimeMs: 30_000,
    didNotKnow: false,
  };
}

describe("Lotus arithmetic referee", () => {
  it("establishes the correct value for the expression that previously anchored the models", () => {
    assert.equal(evaluateArithmetic("5 × (1 + 4 × 2)"), 45);
    assert.equal(verifyLotusResponse(bracketQuestion, response("45")).status, "VERIFIED_CORRECT");
    assert.equal(verifyLotusResponse(bracketQuestion, response("B) 50")).status, "VERIFIED_INCORRECT");
  });

  it("recognizes exact repeats and number-swapped structural repeats", () => {
    const exact = questionFingerprints(bracketQuestion);
    const changedNumbers = questionFingerprints({
      ...bracketQuestion,
      id: "q-variant",
      prompt: "Calculate 6 × (2 + 3 × 4).",
      answerKey: {
        ...bracketQuestion.answerKey,
        canonicalAnswer: "84",
        expression: "6 * (2 + 3 * 4)",
      },
    });
    assert.notEqual(exact.exact, changedNumbers.exact);
    assert.equal(exact.structure, changedNumbers.structure);
  });
});
