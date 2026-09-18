import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import {
  computeCheckpoints,
  crossCheckExpressionAgainstPrompt,
  diagnoseBreakpoint,
  extractExpressionFromPrompt,
  normalizeQuestionAnswerKey,
} from "../../src/lotus/lotus-math";
import { LOTUS_OPENERS, pickOpener } from "../../src/lotus/lotus-openers";

function question(overrides: Partial<LotusQuestion["answerKey"]> = {}): LotusQuestion {
  return normalizeQuestionAnswerKey({
    id: "q1",
    phase: "EXPLORE",
    subtopic: "brackets",
    prompt: "Evaluate 3(4 - 7).",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "test",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "", expression: "3*(4-7)", workedSolution: [], ...overrides },
  });
}

function response(overrides: Partial<LotusStudentResponse> = {}): LotusStudentResponse {
  return { answer: "-9", working: "", confidence: 80, responseTimeMs: 10_000, didNotKnow: false, ...overrides };
}

describe("Lotus checkpoint derivation — never trusts the model's own steps", () => {
  it("derives intermediate values from the expression itself, ending with the final result", () => {
    const checkpoints = computeCheckpoints("3*(4-7)");
    assert.deepEqual(checkpoints, [-3, -9]);
  });

  it("normalizeQuestionAnswerKey attaches checkpoints alongside the recomputed canonical answer", () => {
    const q = question();
    assert.equal(q.answerKey.canonicalAnswer, "-9");
    assert.deepEqual(q.answerKey.checkpoints, [-3, -9]);
  });

  it("does not attach checkpoints for open-response questions", () => {
    const q = normalizeQuestionAnswerKey({
      id: "q2",
      phase: "EXPLORE",
      subtopic: "explain",
      prompt: "Explain why distribution works.",
      type: "EXPLAIN",
      asksForWorking: false,
      purpose: "test",
      answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "n/a", workedSolution: [] },
    });
    assert.equal(q.answerKey.checkpoints, undefined);
  });
});

describe("Lotus instant breakpoint diagnosis — arithmetic only, no AI call", () => {
  it("matches through all steps when the working follows the reference chain exactly", () => {
    const diagnosis = diagnoseBreakpoint(question(), response({ working: "4 - 7 = -3\n3 * -3 = -9" }));
    assert.equal(diagnosis.status, "MATCHED_THROUGH_ALL_STEPS");
  });

  it("matches when only the final answer is shown, skipping intermediate steps", () => {
    const diagnosis = diagnoseBreakpoint(question(), response({ working: "-9" }));
    assert.equal(diagnosis.status, "MATCHED_THROUGH_ALL_STEPS");
  });

  it("finds the first step where a failure-to-distribute error diverges from the reference chain", () => {
    // 3 × 4 - 7 = 5 — skipped distributing over the bracket entirely.
    const diagnosis = diagnoseBreakpoint(question(), response({ answer: "5", working: "3 * 4 = 12\n12 - 7 = 5" }));
    assert.equal(diagnosis.status, "DIVERGED");
    assert.equal(diagnosis.divergedAtStep, 1);
    assert.equal(diagnosis.expectedValue, -3);
    assert.equal(diagnosis.studentValue, 12);
  });

  it("finds a later divergence when the first step is correct but a sign error follows", () => {
    // 4 - 7 = -3 correct, then 3 * -3 = 9 (sign error) instead of -9.
    const diagnosis = diagnoseBreakpoint(question(), response({ answer: "9", working: "4 - 7 = -3\n3 * -3 = 9" }));
    assert.equal(diagnosis.status, "DIVERGED");
    assert.equal(diagnosis.divergedAtStep, 2);
    assert.equal(diagnosis.expectedValue, -9);
    assert.equal(diagnosis.studentValue, 9);
  });

  it("reports NO_WORKING when the student says they don't know", () => {
    const diagnosis = diagnoseBreakpoint(question(), response({ didNotKnow: true, working: "" }));
    assert.equal(diagnosis.status, "NO_WORKING");
  });

  it("reports NOT_DETERMINISTIC for a question with no checkpoints", () => {
    const openQuestion = normalizeQuestionAnswerKey({
      id: "q3",
      phase: "EXPLORE",
      subtopic: "explain",
      prompt: "Explain your reasoning.",
      type: "EXPLAIN",
      asksForWorking: true,
      purpose: "test",
      answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "n/a", workedSolution: [] },
    });
    const diagnosis = diagnoseBreakpoint(openQuestion, response({ working: "some reasoning" }));
    assert.equal(diagnosis.status, "NOT_DETERMINISTIC");
  });
});

describe("Lotus independent math cross-check — never trusts the expression on its own", () => {
  it("extracts a literal expression stated in the prompt, handling implicit multiplication and unicode operators", () => {
    assert.equal(extractExpressionFromPrompt("Evaluate 3(4 − 7). Show your steps."), "3*(4 - 7)");
    assert.equal(extractExpressionFromPrompt("Evaluate −2(5 − 8). Show your steps."), "-2*(5 - 8)");
    assert.equal(extractExpressionFromPrompt("Evaluate 10 − 2 × (3 − 6)."), "10 - 2 * (3 - 6)");
  });

  it("returns null rather than guessing when the prompt is a word problem", () => {
    assert.equal(
      extractExpressionFromPrompt("Write an expression for “5 less than 3 times a number x”, then evaluate it for x = 4."),
      null,
    );
  });

  it("matches when the prompt's wording and the answer key's expression agree", () => {
    const result = crossCheckExpressionAgainstPrompt(question());
    assert.equal(result.status, "MATCHED");
  });

  it("catches the dangerous case: same numbers, wrong structure — a missing bracket in the answer key", () => {
    // The prompt says 3(4 - 7) = -9, but the answer key was authored as
    // 3*4-7 = 5 — the bracket was dropped. Same numbers, wrong answer.
    // This is exactly the failure mode independent verification exists for.
    const broken = question({ expression: "3*4-7" });
    const result = crossCheckExpressionAgainstPrompt(broken);
    assert.equal(result.status, "MISMATCHED");
    assert.match(result.explanation, /5/);
    assert.match(result.explanation, /-9/);
  });

  it("abstains honestly (UNVERIFIABLE, not a pass) when the prompt has no literal expression to check against", () => {
    const wordProblem: LotusQuestion = normalizeQuestionAnswerKey({
      id: "q4",
      phase: "EXPLORE",
      subtopic: "expression interpretation",
      prompt: "Write an expression for 5 less than 3 times a number x, then evaluate it for x = 4.",
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: true,
      purpose: "test",
      answerKey: { kind: "NUMERIC", canonicalAnswer: "", expression: "3*4-5", workedSolution: [] },
    });
    const result = crossCheckExpressionAgainstPrompt(wordProblem);
    assert.equal(result.status, "UNVERIFIABLE");
  });
});

describe("Lotus opener bank — free, pre-validated first questions", () => {
  it("every opener has a deterministically computed canonical answer", () => {
    for (const opener of LOTUS_OPENERS) {
      if (opener.answerKey.kind === "NUMERIC") {
        assert.ok(opener.answerKey.expression, `${opener.prompt} is missing an expression`);
        assert.ok(opener.answerKey.checkpoints?.length, `${opener.prompt} is missing checkpoints`);
      }
    }
  });

  it("every opener independently cross-checks (module load itself would have thrown otherwise)", () => {
    for (const opener of LOTUS_OPENERS) {
      const result = crossCheckExpressionAgainstPrompt(opener);
      assert.notEqual(result.status, "MISMATCHED", `${opener.prompt}: ${result.explanation}`);
    }
  });

  it("spreads openers across more than one student deterministically", () => {
    const a = pickOpener("demo_aarav");
    const b = pickOpener("demo_meena");
    assert.ok(LOTUS_OPENERS.includes(a));
    assert.ok(LOTUS_OPENERS.includes(b));
    // Same student, same pick, every time — no state, no randomness.
    assert.equal(pickOpener("demo_aarav"), a);
  });
});
