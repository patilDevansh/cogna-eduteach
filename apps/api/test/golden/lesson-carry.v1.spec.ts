import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carry, tokenize } from "@cogna/lesson-video";

/** Carry decides which terms travel between two lines of a lesson. It must never invent a match. */
describe("lesson carry", () => {
  const match = (prev: string, next: string) => {
    const a = tokenize(prev), b = tokenize(next);
    return carry(a, b).map((from, i) => `${b[i]}<${from < 0 ? "new" : a[from]}`).filter((s) => !s.startsWith(" "));
  };

  it("carries the 5 across the equals sign and makes the minus new", () => {
    assert.deepEqual(match("2x + 5 = 11", "2x = 11 − 5"), ["2<2", "x<x", "=<=", "11<11", "−<new", "5<5"]);
  });

  it("uses each source term once and matches only identical text", () => {
    const a = tokenize("3(x + 4)"), b = tokenize("3x + 3 × 4");
    const from = carry(a, b);
    const sources = from.filter((i) => i >= 0);
    assert.equal(new Set(sources).size, sources.length);
    from.forEach((src, i) => { if (src >= 0) assert.equal(a[src], b[i]); });
    assert.equal(from[b.lastIndexOf("3")], -1, "the second 3 has no second source, so it is new");
  });

  it("treats a wholly different line as all new", () => {
    assert.deepEqual(carry(tokenize("12"), tokenize("x + y")).filter((i) => i >= 0), []);
  });
});
