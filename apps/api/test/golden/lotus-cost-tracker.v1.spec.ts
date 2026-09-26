/**
 * Lotus live-model cost telemetry: exact token accounting, and a dollar
 * figure that is only ever reported when a real price is configured for
 * the exact model string — never estimated for an unrecognised model.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LotusCostTracker, parseModelPricingFromEnv } from "../../src/lotus/lotus-cost-tracker";

describe("LotusCostTracker — token accounting always exact, cost only when priced", () => {
  it("starts empty", () => {
    const tracker = new LotusCostTracker();
    const snap = tracker.snapshot();
    assert.equal(snap.calls, 0);
    assert.equal(snap.totalTokens, 0);
    assert.equal(snap.totalCostUsd, 0);
    assert.deepEqual(snap.unpricedModels, []);
  });

  it("an unpriced model accumulates exact token counts but reports cost as null, not zero or a guess", () => {
    const tracker = new LotusCostTracker({});
    tracker.record("gpt-5.6-terra", "assessment", { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    tracker.record("gpt-5.6-terra", "assessment", { inputTokens: 200, outputTokens: 75, totalTokens: 275 });
    const snap = tracker.snapshot();
    assert.equal(snap.calls, 2);
    assert.equal(snap.totalInputTokens, 300);
    assert.equal(snap.totalOutputTokens, 125);
    assert.equal(snap.totalTokens, 425);
    assert.equal(snap.totalCostUsd, null, "no price configured for this model — cost must be null, never a fabricated figure");
    assert.deepEqual(snap.unpricedModels, ["gpt-5.6-terra"]);
    assert.equal(snap.byModel["gpt-5.6-terra"]!.costUsd, null);
  });

  it("a priced model computes an exact dollar figure from input/output rates", () => {
    const tracker = new LotusCostTracker({ "gpt-5.6-terra": { input: 2, output: 8 } }); // $/million tokens
    tracker.record("gpt-5.6-terra", "generation", { inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: 1_500_000 });
    const snap = tracker.snapshot();
    // 1M input tokens @ $2/M = $2; 0.5M output tokens @ $8/M = $4; total $6
    assert.equal(snap.totalCostUsd, 6);
    assert.deepEqual(snap.unpricedModels, []);
  });

  it("mixing a priced and an unpriced model withholds the OVERALL total rather than silently understating it, but keeps each model's own figure accurate", () => {
    const tracker = new LotusCostTracker({ "gpt-5.6-terra": { input: 2, output: 8 } });
    tracker.record("gpt-5.6-terra", "assessment", { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 }); // $2
    tracker.record("gpt-5.6-sol", "assessment", { inputTokens: 500, outputTokens: 500, totalTokens: 1000 }); // unpriced
    const snap = tracker.snapshot();
    assert.equal(snap.totalCostUsd, null, "the process-wide total must not silently omit an unpriced model's real spend");
    assert.equal(snap.byModel["gpt-5.6-terra"]!.costUsd, 2, "a model's own bucket is unaffected by a sibling model being unpriced");
    assert.equal(snap.byModel["gpt-5.6-sol"]!.costUsd, null);
    assert.deepEqual(snap.unpricedModels, ["gpt-5.6-sol"]);
  });

  it("breaks totals down by call kind as well as by model", () => {
    const tracker = new LotusCostTracker({});
    tracker.record("gpt-5.6-terra", "generation", { inputTokens: 10, outputTokens: 10, totalTokens: 20 });
    tracker.record("gpt-5.6-terra", "assessment", { inputTokens: 30, outputTokens: 30, totalTokens: 60 });
    tracker.record("gpt-5.6-sol", "assessment", { inputTokens: 5, outputTokens: 5, totalTokens: 10 });
    const snap = tracker.snapshot();
    assert.equal(snap.byKind["generation"]!.calls, 1);
    assert.equal(snap.byKind["assessment"]!.calls, 2);
    assert.equal(snap.byKind["assessment"]!.totalTokens, 70);
  });
});

describe("parseModelPricingFromEnv — operator-supplied pricing via LOTUS_MODEL_PRICING_JSON", () => {
  it("returns an empty table for unset/empty/malformed input, never throwing", () => {
    assert.deepEqual(parseModelPricingFromEnv(undefined), {});
    assert.deepEqual(parseModelPricingFromEnv(""), {});
    assert.deepEqual(parseModelPricingFromEnv("not json"), {});
    assert.deepEqual(parseModelPricingFromEnv("[1,2,3]"), {});
    assert.deepEqual(parseModelPricingFromEnv('"a string"'), {});
  });

  it("parses a valid pricing object", () => {
    const table = parseModelPricingFromEnv('{"gpt-5.6-terra":{"input":1.25,"output":10}}');
    assert.deepEqual(table, { "gpt-5.6-terra": { input: 1.25, output: 10 } });
  });

  it("drops entries with missing or non-numeric fields instead of producing a half-valid price", () => {
    const table = parseModelPricingFromEnv('{"good":{"input":1,"output":2},"bad1":{"input":"free"},"bad2":{"input":1},"bad3":5}');
    assert.deepEqual(table, { good: { input: 1, output: 2 } });
  });

  it("drops a negative price rather than accepting nonsense", () => {
    const table = parseModelPricingFromEnv('{"bad":{"input":-1,"output":2}}');
    assert.deepEqual(table, {});
  });
});
