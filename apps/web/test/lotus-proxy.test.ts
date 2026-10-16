import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forwardToLotus, LotusUpstreamTimeout, LotusUpstreamUnavailable, lotusTimeoutMs } from "../src/lib/lotus-proxy";

/** A fake upstream whose reply is a stream we control. */
function upstream(behaviour: "ok" | "headers-hang" | "body-stalls" | "refused"): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    const aborted = () => new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    if (behaviour === "refused") throw new TypeError("fetch failed: ECONNREFUSED");
    if (behaviour === "headers-hang") return aborted();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"sessionId":"s1",'));
        if (behaviour === "ok") {
          controller.enqueue(new TextEncoder().encode('"status":"ACTIVE"}'));
          controller.close();
        } else {
          // The rest of the JSON never arrives: the stall the student saw.
          signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        }
      },
    });
    return new Response(body, { status: 201, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("Lotus proxy: a stalled reply never strands the student", () => {
  it("passes a normal reply through whole", async () => {
    const r = await forwardToLotus("http://api/lotus/x", { method: "POST" }, { timeoutMs: 500, fetchImpl: upstream("ok") });
    assert.equal(r.status, 201);
    assert.equal(r.contentType, "application/json");
    assert.deepEqual(JSON.parse(r.body), { sessionId: "s1", status: "ACTIVE" });
  });

  it("gives up on an upstream that never sends headers", async () => {
    const t0 = Date.now();
    await assert.rejects(() => forwardToLotus("http://api/lotus/x", { method: "POST" }, { timeoutMs: 200, fetchImpl: upstream("headers-hang") }), LotusUpstreamTimeout);
    assert.ok(Date.now() - t0 < 1500);
  });

  it("gives up on a body that stops half way (instead of streaming a stall to the browser)", async () => {
    const t0 = Date.now();
    await assert.rejects(() => forwardToLotus("http://api/lotus/x", { method: "POST" }, { timeoutMs: 200, fetchImpl: upstream("body-stalls") }), LotusUpstreamTimeout);
    assert.ok(Date.now() - t0 < 1500);
  });

  it("reports an unreachable API as unavailable, not as a timeout", async () => {
    await assert.rejects(() => forwardToLotus("http://api/lotus/x", { method: "GET" }, { timeoutMs: 500, fetchImpl: upstream("refused") }), LotusUpstreamUnavailable);
  });

  it("allows answers longer than other calls", () => {
    assert.ok(lotusTimeoutMs("POST", ["sessions", "s1", "answers"]) > lotusTimeoutMs("GET", ["sessions", "s1"]));
  });
});
