import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  challengerClosurePrompt,
  gptDebatePrompt,
  independentPrompt,
  LOTUS_POLICY,
} from "../../src/lotus/lotus-prompts";

describe("Cogna Lotus experimental policy", () => {
  it("does not treat one response as stable mastery or weakness", () => {
    assert.match(LOTUS_POLICY, /One wrong answer is not a stable weakness/);
    assert.match(LOTUS_POLICY, /One correct answer is not mastery/);
  });

  it("keeps learner claims educational and evidence-linked", () => {
    assert.match(LOTUS_POLICY, /Never infer intelligence, personality, or fixed ability/);
    assert.match(LOTUS_POLICY, /Use only observable evidence/);
    assert.match(LOTUS_POLICY, /lack of opportunity to learn/);
  });

  it("forbids teaching while the diagnostic is gathering evidence", () => {
    assert.match(LOTUS_POLICY, /Do not teach, hint, reveal an answer/);
  });
});

describe("Cogna Lotus debate prompts", () => {
  const currentEvidence = {
    question: { prompt: "Evaluate 3 + 2 × 4" },
    response: { answer: "20", working: "5 × 4", confidence: 80 },
  };

  it("tells each first-pass model that it is independent", () => {
    const gpt = independentPrompt({
      role: "GPT primary",
      audits: [],
      currentQuestion: {
        id: "q1",
        phase: "EXPLORE",
        subtopic: "order of operations",
        prompt: "Evaluate 3 + 2 × 4",
        type: "CONSTRUCTED_RESPONSE",
        asksForWorking: true,
        purpose: "initial evidence",
        answerKey: {
          kind: "NUMERIC",
          canonicalAnswer: "11",
          expression: "3 + 2 * 4",
          workedSolution: ["2 × 4 = 8", "3 + 8 = 11"],
        },
      },
      currentResponse: {
        answer: "20",
        working: "5 × 4",
        confidence: 80,
        responseTimeMs: 20_000,
        didNotKnow: false,
      },
      elapsedSeconds: 20,
      answeredCount: 1,
      phase: "EXPLORE",
    });
    assert.match(gpt, /independent assessment/);
    assert.match(gpt, /You have not seen the other model/);
    assert.match(gpt, /3 \+ 2 × 4/);
    assert.match(gpt, /answerKey/);
  });

  it("gives the debate and closure the raw evidence, not only model summaries", () => {
    const debate = gptDebatePrompt({
      gpt: { proposedAction: "ASK" },
      challenger: { proposedAction: "ASK" },
      audits: [],
      currentEvidence,
      elapsedSeconds: 20,
      answeredCount: 1,
    });
    const closure = challengerClosurePrompt({
      gpt: { proposedAction: "ASK" },
      challenger: { proposedAction: "ASK" },
      debate: { revisedAction: "ASK" },
      audits: [],
      currentEvidence,
      elapsedSeconds: 20,
      answeredCount: 1,
    });
    assert.match(debate, /"answer":"20"/);
    assert.match(closure, /"working":"5 × 4"/);
  });

  it("requires uncertainty instead of forced consensus", () => {
    const closure = challengerClosurePrompt({
      gpt: {},
      challenger: {},
      debate: {},
      audits: [],
      elapsedSeconds: 100,
      answeredCount: 4,
    });
    assert.match(closure, /Preserve unresolved disagreement/);
    assert.match(closure, /prefer a fresh discriminating question/);
    assert.match(closure, /At 1200 seconds or 16 answered questions/);
    assert.match(closure, /selectionReason/);
  });
});
