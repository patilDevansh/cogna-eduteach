import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LotusModelService,
  LotusProviderUnavailableError,
  PROVIDER_OUTAGE_PROBE_MS,
  classifyProviderError,
} from "../../src/lotus/lotus-model.service";

const apiError = (status: number, message: string, code?: string) => Object.assign(new Error(message), { status, code });

/** A model service whose OpenAI client throws `failWith` (or answers) and counts calls. */
function serviceWith(failWith: () => Error | null) {
  let calls = 0;
  const openai = {
    isConfigured: true,
    getClient: () => ({
      responses: {
        create: async () => {
          calls += 1;
          const error = failWith();
          if (error) throw error;
          return { output_text: JSON.stringify({ ok: true }), usage: null };
        },
      },
    }),
  };
  const config = { get: (key: string) => (key === "LOTUS_EXPERIMENTAL_ENABLED" ? "true" : undefined) };
  const service = new LotusModelService(openai as never, config as never);
  return { service, calls: () => calls };
}

describe("provider outage classification", () => {
  it("treats no-credits and bad keys as account outages, and plain rate limits as transient", () => {
    assert.equal(classifyProviderError(apiError(429, "429 You have no credits remaining. Add credits…"))?.kind, "NO_CREDITS");
    assert.equal(classifyProviderError(apiError(429, "quota", "insufficient_quota"))?.kind, "NO_CREDITS");
    assert.equal(classifyProviderError(apiError(429, "exhausted", "credit_balance_exhausted"))?.kind, "NO_CREDITS");
    assert.equal(classifyProviderError(apiError(401, "Incorrect API key provided"))?.kind, "AUTH");
    assert.equal(classifyProviderError(apiError(429, "Rate limit reached for requests")), null);
    assert.equal(classifyProviderError(new Error("socket hang up")), null);
  });
});

describe("LotusModelService during an outage", () => {
  it("fails fast after the first refusal instead of spending more calls, and reports it in status", async () => {
    const { service, calls } = serviceWith(() => apiError(429, "429 You have no credits remaining."));
    await assert.rejects(service.solveBlind("q"), LotusProviderUnavailableError);
    await assert.rejects(service.solveBlind("q"), LotusProviderUnavailableError);
    await assert.rejects(service.solveBlind("q"), LotusProviderUnavailableError);
    assert.equal(calls(), 1, "only the first call should reach the provider");
    assert.equal(service.status.ready, false);
    assert.match(service.status.unavailableReason ?? "", /no credits/);
  });

  it("probes again after the window and clears the outage on success", async () => {
    let broke = true;
    const { service, calls } = serviceWith(() => (broke ? apiError(429, "429 You have no credits remaining.") : null));
    await assert.rejects(service.solveBlind("q"));
    broke = false;
    // Age the outage past the probe window rather than sleeping for a minute.
    (service as unknown as { outage: { at: number } }).outage.at -= PROVIDER_OUTAGE_PROBE_MS + 1;
    assert.deepEqual(await service.solveBlind("q"), { ok: true });
    assert.equal(calls(), 2);
    assert.equal(service.lastOutage, null);
    assert.equal(service.status.ready, true);
  });

  it("does not open an outage for an ordinary rate limit", async () => {
    const { service, calls } = serviceWith(() => apiError(429, "Rate limit reached for requests"));
    await assert.rejects(service.solveBlind("q"));
    await assert.rejects(service.solveBlind("q"));
    assert.equal(calls(), 2);
    assert.equal(service.activeOutage, null);
  });
});
