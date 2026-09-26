import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "@cogna/shared";
import { HealthController } from "../../src/health.controller";

describe("rate limiter", () => {
  it("blocks over max within the window, keys independently, and reopens after the window", () => {
    let t = 0;
    const hit = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
    assert.equal(hit("a").ok, true);
    assert.equal(hit("a").ok, true);
    const blocked = hit("a");
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
    assert.equal(hit("b").ok, true);
    t = 1001;
    assert.equal(hit("a").ok, true);
  });
});

describe("/health", () => {
  it("does not leak the demo login in production or staging", () => {
    const original = { NODE_ENV: process.env.NODE_ENV, COGNA_ENV: process.env.COGNA_ENV };
    try {
      process.env.NODE_ENV = "production";
      const prod = new HealthController().check() as Record<string, unknown>;
      assert.equal("devAccessCode" in prod, false);
      assert.equal("devStudentId" in prod, false);
      process.env.NODE_ENV = "development";
      process.env.COGNA_ENV = "staging";
      assert.equal("devAccessCode" in (new HealthController().check() as object), false);
    } finally {
      for (const [k, v] of Object.entries(original)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
