import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampBreakMinutes,
  agreesWithRule,
  buildBreakPrompts,
} from "../../src/engines/break-advisor/break-advisor.formulas";
import { assertBreakRecommendationShape } from "@cogna/shared";

describe("clampBreakMinutes", () => {
  it("passes through values already in range", () => {
    assert.equal(clampBreakMinutes(3), 3);
    assert.equal(clampBreakMinutes(10), 10);
    assert.equal(clampBreakMinutes(1), 1);
  });

  it("clamps values below 1 up to 1", () => {
    assert.equal(clampBreakMinutes(0), 1);
    assert.equal(clampBreakMinutes(-5), 1);
  });

  it("clamps values above 10 down to 10 — the AI can never suggest an unbounded break", () => {
    assert.equal(clampBreakMinutes(45), 10);
    assert.equal(clampBreakMinutes(1000), 10);
  });

  it("rounds fractional minutes", () => {
    assert.equal(clampBreakMinutes(4.6), 5);
  });

  it("falls back to the product default for non-finite input", () => {
    assert.equal(clampBreakMinutes(NaN), 3);
    assert.equal(clampBreakMinutes(Infinity), 3);
  });
});

describe("agreesWithRule", () => {
  it("agrees when both suggest a break", () => {
    assert.equal(agreesWithRule(true, true), true);
  });
  it("agrees when both suggest no break", () => {
    assert.equal(agreesWithRule(false, false), true);
  });
  it("disagrees when they differ", () => {
    assert.equal(agreesWithRule(true, false), false);
    assert.equal(agreesWithRule(false, true), false);
  });
});

describe("buildBreakPrompts", () => {
  it("includes every signal in the user prompt and the no-clinical-inference rule in the system prompt", () => {
    const { system, user } = buildBreakPrompts({
      sessionMinutes: 12.4,
      recentIncorrectStreak: 3,
      idleSpikeCount: 2,
      averageTimeIncreasing50Pct: true,
      ruleSuggestsBreak: true,
    });
    assert.match(user, /12\.4 minutes/);
    assert.match(user, /streak: 3/);
    assert.match(user, /Idle pauses.*: 2/);
    assert.match(user, /slower.*: yes/);
    assert.match(system, /Never infer mood, attention, motivation/);
  });
});

describe("BreakRecommendation contract", () => {
  it("accepts a valid recommendation", () => {
    const rec = assertBreakRecommendationShape({
      suggestBreak: true,
      minutes: 3,
      confidence: 0.8,
      reasoning: "Streak of wrong answers plus rising response times.",
    });
    assert.equal(rec.suggestBreak, true);
  });

  it("rejects a non-boolean suggestBreak", () => {
    assert.throws(() =>
      assertBreakRecommendationShape({
        suggestBreak: "yes",
        minutes: 3,
        confidence: 0.5,
        reasoning: "x",
      }),
    );
  });

  it("rejects out-of-range confidence", () => {
    assert.throws(() =>
      assertBreakRecommendationShape({
        suggestBreak: false,
        minutes: 3,
        confidence: 2,
        reasoning: "x",
      }),
    );
  });
});
