import assert from "node:assert/strict";
import test from "node:test";
import { LotusLatencyPolicy } from "../../src/lotus/lotus-latency-policy";

test("Lotus balanced latency policy keeps the final critic stronger than parallel reads", () => {
  const policy = new LotusLatencyPolicy({});
  assert.equal(policy.mode, "balanced");
  assert.equal(policy.tuning("assessment", "primary").reasoningEffort, "low");
  assert.equal(policy.tuning("debate", "primary").reasoningEffort, "low");
  assert.equal(policy.tuning("closure", "challenger").reasoningEffort, "medium");
  assert.equal(policy.tuning("closure", "challenger").maxOutputTokens, 1200);
});

test("Lotus quality mode restores the conservative budgets for evaluation", () => {
  const policy = new LotusLatencyPolicy({ LOTUS_LATENCY_MODE: "quality" });
  assert.equal(policy.tuning("assessment", "primary").reasoningEffort, "medium");
  assert.equal(policy.tuning("closure", "challenger").reasoningEffort, "high");
  assert.equal(policy.tuning("closure", "challenger").maxOutputTokens, 3200);
});

test("Lotus policy accepts a bounded output override and stable cache keys", () => {
  const policy = new LotusLatencyPolicy({ LOTUS_MAX_OUTPUT_TOKENS: "900" });
  const tuning = policy.tuning("assessment", "gpt-5.6-terra");
  assert.equal(tuning.maxOutputTokens, 900);
  assert.equal(tuning.promptCacheKey, "cogna-lotus-v1:gpt-5.6-terra:assessment");
});
