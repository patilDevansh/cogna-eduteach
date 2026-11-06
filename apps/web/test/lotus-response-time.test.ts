import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lotusResponseTimeMs } from "../src/lib/lotus-response-time";
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
