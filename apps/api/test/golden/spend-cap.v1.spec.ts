import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpendCapExceededError, consumeBudget, resetBudgetForTests } from "../../src/ai/spend-cap";

describe("spend cap", () => {
  beforeEach(resetBudgetForTests);

  it("allows calls up to the cap, then fails closed", () => {
    const env = { OPENAI_DAILY_CALL_CAP: "2" };
    consumeBudget("openai", "OPENAI", env);
    consumeBudget("openai", "OPENAI", env);
    assert.throws(() => consumeBudget("openai", "OPENAI", env), SpendCapExceededError);
  });

  it("resets on the next UTC day", () => {
    const env = { OPENAI_DAILY_CALL_CAP: "1" };
    consumeBudget("openai", "OPENAI", env, new Date("2026-01-01T10:00:00Z"));
    assert.throws(() => consumeBudget("openai", "OPENAI", env, new Date("2026-01-01T23:59:00Z")));
    consumeBudget("openai", "OPENAI", env, new Date("2026-01-02T00:01:00Z"));
  });

  it("is unlimited in dev without a cap, capped at 5000 in production, and ignores malformed values", () => {
    for (let i = 0; i < 6000; i++) consumeBudget("dev", "DEV", {});
    for (let i = 0; i < 5000; i++) consumeBudget("prod", "PROD", { NODE_ENV: "production" });
    assert.throws(() => consumeBudget("prod", "PROD", { NODE_ENV: "production" }));
    consumeBudget("bad", "BAD", { BAD_DAILY_CALL_CAP: "abc" });
  });

  it("counts services separately", () => {
    const env = { OPENAI_DAILY_CALL_CAP: "1", ELEVENLABS_DAILY_CALL_CAP: "1" };
    consumeBudget("openai", "OPENAI", env);
    consumeBudget("elevenlabs", "ELEVENLABS", env);
  });
});
