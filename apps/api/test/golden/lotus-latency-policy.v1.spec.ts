import assert from "node:assert/strict";
import test from "node:test";
import { LotusLatencyPolicy } from "../../src/lotus/lotus-latency-policy";
import { LotusModelService } from "../../src/lotus/lotus-model.service";

test("Lotus balanced latency policy keeps the final critic stronger than parallel reads", () => {
  const policy = new LotusLatencyPolicy({});
  assert.equal(policy.mode, "balanced");
  assert.equal(policy.tuning("assessment", "primary").reasoningEffort, "low");
  assert.equal(policy.tuning("debate", "primary").reasoningEffort, "low");
  assert.equal(policy.tuning("closure", "challenger").reasoningEffort, "medium");
  assert.equal(policy.tuning("closure", "challenger").maxOutputTokens, 1200);
  assert.equal(policy.tuning("closure", "challenger").timeoutMs, 25_000);
});

test("Lotus quality mode restores the conservative budgets for evaluation", () => {
  const policy = new LotusLatencyPolicy({ LOTUS_LATENCY_MODE: "quality" });
  assert.equal(policy.tuning("assessment", "primary").reasoningEffort, "medium");
  assert.equal(policy.tuning("closure", "challenger").reasoningEffort, "high");
  assert.equal(policy.tuning("closure", "challenger").maxOutputTokens, 3200);
  assert.equal(policy.tuning("closure", "challenger").timeoutMs, 45_000);
});

test("Lotus policy accepts a bounded output override and stable cache keys", () => {
  const policy = new LotusLatencyPolicy({ LOTUS_MAX_OUTPUT_TOKENS: "900" });
  const tuning = policy.tuning("assessment", "gpt-5.6-terra");
  assert.equal(tuning.maxOutputTokens, 900);
  assert.equal(tuning.promptCacheKey, "cogna-lotus-v1:gpt-5.6-terra:assessment");
});

test("Lotus policy accepts only a safe per-model timeout and protects question writing", () => {
  const policy = new LotusLatencyPolicy({ LOTUS_MODEL_TIMEOUT_MS: "12000" });
  assert.equal(policy.tuning("assessment", "primary").timeoutMs, 12_000);
  assert.equal(policy.tuning("generation", "primary").timeoutMs, 45_000);
  assert.equal(new LotusLatencyPolicy({ LOTUS_MODEL_TIMEOUT_MS: "1000" }).modelTimeoutMs, 25_000);
});

test("LotusModelService forwards the configured model timeout into its latency policy", () => {
  const config = {
    get: (key: string) => key === "LOTUS_MODEL_TIMEOUT_MS" ? "12000" : undefined,
  };
  const openai = { isConfigured: true };
  const service = new LotusModelService(openai as never, config as never);
  const latency = (service as unknown as { latency: LotusLatencyPolicy }).latency;
  assert.equal(latency.tuning("assessment", "test-model").timeoutMs, 12_000);
  assert.equal(latency.tuning("generation", "test-model").timeoutMs, 45_000);
});
