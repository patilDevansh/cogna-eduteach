import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { artSteps } from "../src/components/lotus-themes/art-steps";

describe("theme progress art", () => {
  it("draws one piece per question when the plan length is unknown", () => {
    assert.equal(artSteps(0, 10), 0);
    assert.equal(artSteps(6, 10), 6);
    assert.equal(artSteps(40, 10), 10);
  });

  it("spreads the art over the whole test and keeps the last piece for the finish", () => {
    const seen = Array.from({ length: 26 }, (_, answered) => artSteps(answered, 10, 25));
    assert.equal(seen[0], 0);
    assert.ok(seen.every((n, i) => i === 0 || n >= seen[i - 1]!), "never goes backwards");
    assert.ok(seen[20]! > seen[10]!, "still growing near the end");
    assert.equal(Math.max(...seen), 9, "the last piece waits for the finish");
    assert.equal(artSteps(25, 10, 25, true), 10);
  });

  it("draws everything when the test is complete, whatever was answered", () => {
    assert.equal(artSteps(7, 16, 25, true), 16);
    assert.equal(artSteps(0, 14, undefined, true), 14);
  });

  it("copes with a missing or silly plan length", () => {
    assert.equal(artSteps(5, 10, 0), 5);
    assert.equal(artSteps(30, 10, 25), 9);
  });
});
