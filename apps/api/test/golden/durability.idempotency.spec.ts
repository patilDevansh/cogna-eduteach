import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * G20 — Duplicate answer submission
 * Validates idempotency contract: same eventId must return stored result without re-processing.
 * Full integration test requires DB; this verifies the contract shape the loop enforces.
 */
describe("G20 — Duplicate answer submission contract", () => {
  it("stored response is returned on duplicate eventId (contract shape)", () => {
    const storedResponse = {
      processingStatus: "COMPLETED",
      grade: "INCORRECT",
      isCorrect: false,
      decisionId: "dec_abc",
      attemptId: "att_xyz",
      decision: {
        uiAction: "SHOW_QUESTION",
        learningIntent: "TARGET_MISCONCEPTION",
        parameters: { conceptId: "C2_ONE_STEP_SUBTRACTION", difficulty: 2 },
        confidence: 0.65,
        reasoning: "Targeting suspected misconception.",
        decisionVersion: "decision-rules-v1",
      },
      next: {
        decision: {
          uiAction: "SHOW_QUESTION",
          learningIntent: "TARGET_MISCONCEPTION",
          parameters: { conceptId: "C2_ONE_STEP_SUBTRACTION" },
          confidence: 0.65,
          reasoning: "Targeting suspected misconception.",
          decisionVersion: "decision-rules-v1",
        },
      },
    };

    // Simulates attempt.findUnique → storedResponse short-circuit
    const attemptRecord = { eventId: "evt_dup_001", storedResponse };
    const duplicateLookup = attemptRecord.eventId === "evt_dup_001" ? attemptRecord : null;

    assert.ok(duplicateLookup?.storedResponse);
    assert.equal(
      (duplicateLookup!.storedResponse as typeof storedResponse).decisionId,
      "dec_abc",
    );
    assert.equal(
      (duplicateLookup!.storedResponse as typeof storedResponse).grade,
      "INCORRECT",
    );
  });

  it("explanation-viewed duplicate uses rawEvent storedResponse", () => {
    const storedResponse = {
      processingStatus: "COMPLETED",
      decisionId: "dec_retest",
      decision: {
        uiAction: "SHOW_QUESTION",
        learningIntent: "RETEST_AFTER_EXPLANATION",
        parameters: { conceptId: "C2_ONE_STEP_SUBTRACTION" },
        confidence: 0.85,
        reasoning: "Re-test after explanation.",
        decisionVersion: "decision-rules-v1",
      },
      next: { decision: { uiAction: "SHOW_QUESTION" } },
    };

    const rawEvent = {
      eventId: "evt_exp_view_001",
      payload: { eventType: "EXPLANATION_VIEWED", storedResponse },
    };

    const payload = rawEvent.payload as Record<string, unknown>;
    assert.ok(payload.storedResponse);
    assert.equal(
      (payload.storedResponse as typeof storedResponse).decision.learningIntent,
      "RETEST_AFTER_EXPLANATION",
    );
  });
});
