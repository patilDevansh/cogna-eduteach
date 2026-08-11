import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchMisconceptionPattern } from "../../src/engines/diagnostic-engine/diagnostic-formulas";

// This pure function is shared by two callers that must never drift apart:
// DiagnosticEngineService (live, gated on grade === "INCORRECT") and the
// item-statistics refresh job's misconceptionHits tally (scheduled-jobs.service.ts).

describe("matchMisconceptionPattern", () => {
  const patterns = [
    { misconceptionId: "SIGN_HANDLING", answers: ["5", "x=5"] },
    { misconceptionId: "VARIABLE_COLLECTION_ERROR", answers: ["9/7", "x=9/7", "1.29"] },
  ];

  it("matches a plain numeric answer", () => {
    assert.equal(matchMisconceptionPattern(patterns, "5"), "SIGN_HANDLING");
  });

  it("matches an 'x=' prefixed answer against a plain pattern entry", () => {
    assert.equal(matchMisconceptionPattern(patterns, "x=5"), "SIGN_HANDLING");
  });

  it("matches case-insensitively and ignoring whitespace", () => {
    assert.equal(matchMisconceptionPattern(patterns, "  X = 5  "), "SIGN_HANDLING");
  });

  it("matches the second pattern in the list", () => {
    assert.equal(matchMisconceptionPattern(patterns, "9/7"), "VARIABLE_COLLECTION_ERROR");
  });

  it("returns null when nothing matches", () => {
    assert.equal(matchMisconceptionPattern(patterns, "42"), null);
  });

  it("returns null for an empty pattern list", () => {
    assert.equal(matchMisconceptionPattern([], "5"), null);
  });

  it("first matching pattern wins when answers could theoretically collide", () => {
    const overlapping = [
      { misconceptionId: "FIRST", answers: ["3"] },
      { misconceptionId: "SECOND", answers: ["3"] },
    ];
    assert.equal(matchMisconceptionPattern(overlapping, "3"), "FIRST");
  });
});
