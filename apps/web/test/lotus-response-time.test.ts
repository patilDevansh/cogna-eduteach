import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validInteractionContext } from "@cogna/shared";
import { lotusResponseTimeMs } from "../src/lib/lotus-response-time";
import { snapshotWithoutLiveObservation } from "../src/lib/interaction-observation";
describe("lotus writing time", () => {
  it("uses the item-shown clock, not the page start", () => {
    assert.equal(lotusResponseTimeMs({ itemElapsedMs: 44941, confidenceWaitMs: 0, fallbackMs: 180000 }), 44941);
  });
  it("excludes the confidence prompt wait", () => {
    assert.equal(lotusResponseTimeMs({ itemElapsedMs: 30000, confidenceWaitMs: 5000, fallbackMs: 99999 }), 25000);
  });
  it("falls back only when there is no item clock, never negative", () => {
    assert.equal(lotusResponseTimeMs({ itemElapsedMs: undefined, confidenceWaitMs: 0, fallbackMs: 7000 }), 7000);
    assert.equal(lotusResponseTimeMs({ itemElapsedMs: 100, confidenceWaitMs: 500, fallbackMs: 0 }), 0);
  });
});

describe("every submit carries an interaction record", () => {
  const identity = { source: "LOTUS", questionId: "q2", questionVersion: null, format: "TYPED" } as const;
  it("a submit with no live observation still has a valid, honestly partial record measured from first render", () => {
    const ctx = snapshotWithoutLiveObservation(identity, 1000, { status: "REPORTED_BEFORE_ANSWER", value: 60, scale: "ZERO_TO_HUNDRED" }, () => 31000);
    assert.equal(validInteractionContext(ctx), true);
    assert.equal(ctx.timing.elapsedMs, 30000);
    assert.equal(ctx.timing.complete, false);
    assert.deepEqual(ctx.confidence, { status: "REPORTED_BEFORE_ANSWER", value: 60, scale: "ZERO_TO_HUNDRED" });
  });
  it("a skipped or unasked confidence carries no value", () => {
    const ctx = snapshotWithoutLiveObservation(identity, null, { status: "SKIPPED", value: null, scale: "ZERO_TO_HUNDRED" }, () => 5);
    assert.equal(validInteractionContext(ctx), true);
    assert.equal(ctx.confidence.value, null);
  });
});
