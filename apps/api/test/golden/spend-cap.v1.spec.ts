import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { SpendCapExceededError, reserveBudget, resetBudgetForTests } from "../../src/ai/spend-cap";
import { createMeteredFetch, SPEND_CAP_ERROR_CODE } from "../../src/ai/openai-metering";
import { classifyProviderError } from "../../src/lotus/lotus-model.service";

describe("spend cap — calls", () => {
  beforeEach(resetBudgetForTests);

  it("allows calls up to the cap, then fails closed", async () => {
    const env = { OPENAI_DAILY_CALL_CAP: "2" };
    await reserveBudget("openai", "OPENAI", { env });
    await reserveBudget("openai", "OPENAI", { env });
    await assert.rejects(reserveBudget("openai", "OPENAI", { env }), SpendCapExceededError);
  });

  it("resets on the next UTC day", async () => {
    const env = { OPENAI_DAILY_CALL_CAP: "1" };
    await reserveBudget("openai", "OPENAI", { env, now: new Date("2026-01-01T10:00:00Z") });
    await assert.rejects(reserveBudget("openai", "OPENAI", { env, now: new Date("2026-01-01T23:59:00Z") }));
    await reserveBudget("openai", "OPENAI", { env, now: new Date("2026-01-02T00:01:00Z") });
  });

  it("is unlimited in dev without a cap, capped at 5000 in production, and ignores malformed values", async () => {
    for (let i = 0; i < 6000; i++) await reserveBudget("dev", "DEV", { env: {} });
    for (let i = 0; i < 5000; i++) await reserveBudget("prod", "PROD", { env: { NODE_ENV: "production" } });
    await assert.rejects(reserveBudget("prod", "PROD", { env: { NODE_ENV: "production" } }));
    await reserveBudget("bad", "BAD", { env: { BAD_DAILY_CALL_CAP: "abc" } });
  });

  it("counts services separately", async () => {
    const env = { OPENAI_DAILY_CALL_CAP: "1", ELEVENLABS_DAILY_CALL_CAP: "1" };
    await reserveBudget("openai", "OPENAI", { env });
    await reserveBudget("elevenlabs", "ELEVENLABS", { env });
  });
});

describe("spend cap — dollars", () => {
  beforeEach(resetBudgetForTests);
  const env = { OPENAI_DAILY_USD_CAP: "1" };

  it("refuses a call whose worst-case cost would cross the cap, even while earlier calls are in flight", async () => {
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.4 });
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.4 });
    await assert.rejects(reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.4 }), /spend cap/);
  });

  it("frees the unused part of a reservation once the real cost is known", async () => {
    const first = await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.9 });
    await assert.rejects(reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.2 }));
    await first.settle(0.1);
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.2 });
  });

  it("falls back to a per-process ledger when the shared one is down, rather than going uncapped", async () => {
    const { setSpendStore } = await import("../../src/ai/spend-cap");
    const broken = { tryReserve: async () => { throw new Error("db down"); }, adjust: async () => {}, today: async () => ({ calls: 0, usd: 0 }) };
    setSpendStore(broken);
    await reserveBudget("openai", "OPENAI", { env: { OPENAI_DAILY_CALL_CAP: "1" } });
    await assert.rejects(reserveBudget("openai", "OPENAI", { env: { OPENAI_DAILY_CALL_CAP: "1" } }), SpendCapExceededError);
  });
});

describe("spend cap — monthly dollars", () => {
  beforeEach(resetBudgetForTests);
  const env = { OPENAI_MONTHLY_USD_CAP: "1", OPENAI_DAILY_USD_CAP: "0.7" };

  it("adds days up across the month, so daily caps can't jointly overrun the balance", async () => {
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.6, now: new Date("2026-03-01T10:00:00Z") });
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.3, now: new Date("2026-03-02T10:00:00Z") });
    await assert.rejects(
      reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.3, now: new Date("2026-03-03T10:00:00Z") }),
      /monthly spend cap/,
    );
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.3, now: new Date("2026-04-01T00:01:00Z") });
  });

  it("does not charge the month for a call the daily cap refused", async () => {
    const now = new Date("2026-03-01T10:00:00Z");
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.6, now });
    await assert.rejects(reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.2, now }), /daily spend cap/);
    await reserveBudget("openai", "OPENAI", { env, estimateUsd: 0.4, now: new Date("2026-03-02T10:00:00Z") });
  });

  it("settles both the day and the month to the real cost", async () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const first = await reserveBudget("openai", "OPENAI", { env: { OPENAI_MONTHLY_USD_CAP: "1" }, estimateUsd: 0.9, now });
    await first.settle(0.1);
    await reserveBudget("openai", "OPENAI", { env: { OPENAI_MONTHLY_USD_CAP: "1" }, estimateUsd: 0.8, now });
  });
});

describe("metered OpenAI fetch", () => {
  beforeEach(resetBudgetForTests);
  const pricing = { "gpt-test": { input: 1, output: 10 } }; // $/million tokens

  function stubFetch(usage: Record<string, number>, calls: { n: number }) {
    return (async () => {
      calls.n += 1;
      return new Response(JSON.stringify({ id: "r", object: "response", output: [], usage }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("books each request at worst case and settles to the usage the response reports", async () => {
    const calls = { n: 0 };
    // Worst case of one call: 100k output tokens × $10/M = $1, plus prompt — over a $1.05 cap after one real call.
    const env = { OPENAI_DAILY_USD_CAP: "1.05" };
    const client = new OpenAI({
      apiKey: "test",
      maxRetries: 0,
      fetch: createMeteredFetch({ pricing, env, baseFetch: stubFetch({ input_tokens: 1000, output_tokens: 1000 }, calls) }),
    });
    const ask = () => client.responses.create({ model: "gpt-test", input: "hi", max_output_tokens: 100_000 });
    await ask(); // real cost $0.011, so the next worst case ($1.0x) still fits
    await ask();
    assert.equal(calls.n, 2);
  });

  it("refuses without reaching OpenAI, without SDK retries, as an error Lotus classifies as SPEND_CAP", async () => {
    const calls = { n: 0 };
    const client = new OpenAI({
      apiKey: "test",
      maxRetries: 2,
      fetch: createMeteredFetch({ pricing, env: { OPENAI_DAILY_CALL_CAP: "0" }, baseFetch: stubFetch({}, calls) }),
    });
    const error = await client.responses.create({ model: "gpt-test", input: "hi" }).catch((e: unknown) => e);
    assert.equal(calls.n, 0);
    assert.equal((error as { code?: string }).code, SPEND_CAP_ERROR_CODE);
    assert.equal(classifyProviderError(error)?.kind, "SPEND_CAP");
  });

  it("refuses an unpriced model when a dollar cap is set, so it can't slip past the cap", async () => {
    const calls = { n: 0 };
    const client = new OpenAI({
      apiKey: "test",
      maxRetries: 0,
      fetch: createMeteredFetch({ pricing, env: { OPENAI_DAILY_USD_CAP: "5" }, baseFetch: stubFetch({}, calls) }),
    });
    const error = await client.responses.create({ model: "gpt-unpriced", input: "hi" }).catch((e: unknown) => e);
    assert.equal(calls.n, 0);
    assert.match(String((error as Error).message), /no price/);
  });

  it("books text-to-speech against the dollar caps instead of letting it through free", async () => {
    const calls = { n: 0 };
    const audio = (async () => {
      calls.n += 1;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    }) as typeof fetch;
    // 200 characters → 1000 estimated audio tokens × $10/M = $0.01 each, never trued down (no usage block).
    const client = new OpenAI({
      apiKey: "test",
      maxRetries: 0,
      fetch: createMeteredFetch({ pricing, env: { OPENAI_MONTHLY_USD_CAP: "0.025" }, baseFetch: audio }),
    });
    const say = () => client.audio.speech.create({ model: "gpt-test", voice: "coral", input: "x".repeat(200) });
    await say();
    await say();
    const error = await say().catch((e: unknown) => e);
    assert.equal(calls.n, 2);
    assert.equal((error as { code?: string }).code, SPEND_CAP_ERROR_CODE);
  });

  it("refuses an unpriced speech model when only a monthly cap is set", async () => {
    const calls = { n: 0 };
    const client = new OpenAI({
      apiKey: "test",
      maxRetries: 0,
      fetch: createMeteredFetch({ pricing, env: { OPENAI_MONTHLY_USD_CAP: "5" }, baseFetch: stubFetch({}, calls) }),
    });
    const error = await client.audio.speech.create({ model: "tts-unpriced", voice: "coral", input: "hi" }).catch((e: unknown) => e);
    assert.equal(calls.n, 0);
    assert.match(String((error as Error).message), /no price/);
  });
});
