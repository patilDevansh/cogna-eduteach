import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validInteractionContext, type StudentInteractionContext } from "@cogna/shared";
import { assertInteractionContext, assertSameInteractionSubmission } from "../../src/learning-evidence/interaction-context";
import { resolveLotusResponse } from "../../src/lotus/lotus-interactions";
export function context(source: "EXERCISE" | "LOTUS" = "EXERCISE", questionId = "context-question"): StudentInteractionContext {
  return { schemaVersion: 1, observationId: "observation-123456789", source, questionId, questionVersion: source === "EXERCISE" ? 1 : null, format: "TYPED_ANSWER", presentedAt: new Date().toISOString(), timing: { basis: "CLIENT_ITEM_MOUNT", elapsedMs: 3000, firstInputMs: null, hiddenMs: 400, visibilityChanges: 2, complete: true }, revisionsAfterFirstInput: 0, confidence: { status: "NOT_ASKED", value: null, scale: source === "EXERCISE" ? "ONE_TO_FIVE" : "ZERO_TO_HUNDRED" }, technical: { offlineMs: 0, offlineTransitions: 0, pageReloaded: false } };
}
describe("interaction context v1 service boundary", () => {
  it("accepts legacy absence but rejects null or malformed context", () => {
    assert.doesNotThrow(() => assertInteractionContext(undefined, "EXERCISE", "q", 1, null));
    for (const value of [null, {}, { ...context(), extra: "keystrokes" }, { ...context(), timing: { ...context().timing, hiddenMs: 4000 } }, { ...context(), confidence: { status: "NOT_ASKED", value: 60, scale: "ZERO_TO_HUNDRED" } }]) assert.equal(validInteractionContext(value), false);
  });
  it("binds question, source, version and actual reported confidence", () => {
    const c = context();
    assert.doesNotThrow(() => assertInteractionContext(c, "EXERCISE", c.questionId, 1, null));
    assert.throws(() => assertInteractionContext(c, "EXERCISE", "other", 1, null));
    assert.throws(() => assertInteractionContext(c, "LOTUS", c.questionId, null, 60));
    assert.throws(() => assertInteractionContext(c, "EXERCISE", c.questionId, 2, null));
    const reported = { ...c, confidence: { status: "REPORTED_BEFORE_ANSWER", value: 4, scale: "ONE_TO_FIVE" } };
    assert.throws(() => assertInteractionContext(reported, "EXERCISE", c.questionId, 1, 5));
    assert.doesNotThrow(() => assertInteractionContext(reported, "EXERCISE", c.questionId, 1, 4));
  });
  it("keeps legacy Lotus 60 explicitly unreported in new context", () => {
    const c = context("LOTUS");
    assert.doesNotThrow(() => assertInteractionContext(c, "LOTUS", c.questionId, null, 60));
    assert.equal(c.confidence.value, null);
  });
  it("replays reordered identical objects but rejects changed or omitted new evidence", () => {
    const prior = { answer: "x", interactionContext: context() };
    assert.doesNotThrow(() => assertSameInteractionSubmission(prior, { interactionContext: prior.interactionContext, answer: "x" }));
    assert.doesNotThrow(() => assertSameInteractionSubmission({ ...prior, storedResponse: { grade: "CORRECT" } }, prior));
    assert.throws(() => assertSameInteractionSubmission(prior, { ...prior, answer: "y" }));
    assert.throws(() => assertSameInteractionSubmission(prior, { answer: "x" }));
    assert.doesNotThrow(() => assertSameInteractionSubmission({ answer: "legacy" }, { answer: "legacy" }));
  });
  it("a Lotus time capped at the on-screen time still tells a changed resend from an identical one", () => {
    const question = { id: "q1", answerKey: {} } as never;
    const sent = { answer: "x", working: "", responseTimeMs: 5000, didNotKnow: false, submissionId: "s1", questionId: "q1", interactionContext: context("LOTUS", "q1") };
    const stored = resolveLotusResponse(question, sent);
    assert.equal(stored.responseTimeMs, 3000);
    assert.doesNotThrow(() => assertSameInteractionSubmission(stored, resolveLotusResponse(question, sent)));
    assert.throws(() => assertSameInteractionSubmission(stored, resolveLotusResponse(question, { ...sent, responseTimeMs: 4000 })));
    assert.equal(resolveLotusResponse(question, { ...sent, responseTimeMs: 1000, reportedResponseTimeMs: 9 } as never).reportedResponseTimeMs, undefined);
  });
});
