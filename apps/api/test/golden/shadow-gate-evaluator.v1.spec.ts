import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateGate,
  rowAgreement,
  percentile,
  MINIMUM_SAMPLE,
  type AuditRowLike,
} from "../../src/ai/shadow-gate-evaluator.formulas";

// All fixtures below are explicitly synthetic — they exist to prove the
// evaluator's arithmetic and verdict logic are correct, never to simulate a
// real pilot. The real gate (task 36 hitting the live, empty database) is
// what proves the tool doesn't lie when there's no real data.

function breakRow(ruleBreak: boolean, aiBreak: boolean, opts: Partial<AuditRowLike> = {}): AuditRowLike {
  return {
    ruleOutput: { suggestBreak: ruleBreak, minutes: null },
    aiOutput: { suggestBreak: aiBreak, minutes: 3, confidence: 0.8, reasoning: "x" },
    passed: true,
    failureReason: null,
    latencyMs: 500,
    ...opts,
  };
}

describe("percentile", () => {
  it("returns null for an empty array", () => {
    assert.equal(percentile([], 95), null);
  });
  it("returns the only value for a single-element array", () => {
    assert.equal(percentile([42], 95), 42);
  });
  it("returns a sane p95 for a known distribution", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    assert.equal(percentile(sorted, 95), 95);
  });
});

describe("rowAgreement — per-capability dispatch", () => {
  it("BREAK_ADVISOR: agrees when suggestBreak matches", () => {
    const r = rowAgreement("BREAK_ADVISOR", { suggestBreak: true }, { suggestBreak: true });
    assert.deepEqual(r, { agreedCount: 1, comparedCount: 1 });
  });

  it("BREAK_ADVISOR: disagrees when suggestBreak differs", () => {
    const r = rowAgreement("BREAK_ADVISOR", { suggestBreak: true }, { suggestBreak: false });
    assert.deepEqual(r, { agreedCount: 0, comparedCount: 1 });
  });

  it("QUESTION_RECOMMENDER: agrees when selectedIndex matches", () => {
    const r = rowAgreement("QUESTION_RECOMMENDER", { selectedIndex: 2 }, { selectedIndex: 2 });
    assert.deepEqual(r, { agreedCount: 1, comparedCount: 1 });
  });

  it("PRACTICE_RECOMMENDER: agrees on top-choice match only", () => {
    const r = rowAgreement(
      "PRACTICE_RECOMMENDER",
      { orderedConceptIds: ["A", "B", "C"] },
      { orderedConceptIds: ["A", "C", "B"] },
    );
    assert.deepEqual(r, { agreedCount: 1, comparedCount: 1 });
  });

  it("STUDENT_ANALYSIS: pools agreement across all concepts in the row", () => {
    const r = rowAgreement(
      "STUDENT_ANALYSIS",
      { directions: { C1: "IMPROVING", C2: "DECLINING" } },
      {
        conceptAssessments: [
          { conceptId: "C1", direction: "IMPROVING", confidence: 0.8, reasoning: "x" },
          { conceptId: "C2", direction: "STABLE", confidence: 0.6, reasoning: "y" },
        ],
      },
    );
    assert.deepEqual(r, { agreedCount: 1, comparedCount: 2 });
  });

  it("returns comparedCount=0 (not a disagreement) for malformed shapes", () => {
    assert.deepEqual(rowAgreement("BREAK_ADVISOR", { suggestBreak: "yes" }, { suggestBreak: true }), {
      agreedCount: 0,
      comparedCount: 0,
    });
    assert.deepEqual(rowAgreement("UNKNOWN_CAPABILITY", {}, {}), { agreedCount: 0, comparedCount: 0 });
  });
});

describe("evaluateGate — verdicts", () => {
  it("reports INSUFFICIENT_DATA below the minimum sample, even with perfect agreement", () => {
    const rows = Array.from({ length: MINIMUM_SAMPLE - 1 }, () => breakRow(true, true));
    const report = evaluateGate("BREAK_ADVISOR", rows);
    assert.equal(report.verdict, "INSUFFICIENT_DATA");
    assert.equal(report.meetsMinimumSample, false);
  });

  it("PASSes with enough samples, high agreement, no violations, latency in budget", () => {
    const rows = Array.from({ length: MINIMUM_SAMPLE }, () => breakRow(true, true, { latencyMs: 400 }));
    const report = evaluateGate("BREAK_ADVISOR", rows);
    assert.equal(report.verdict, "PASS");
    assert.equal(report.agreementRate, 1);
  });

  it("FAILs on agreement below the 80% threshold", () => {
    const agree = Array.from({ length: 20 }, () => breakRow(true, true));
    const disagree = Array.from({ length: 10 }, () => breakRow(true, false)); // 20/30 = 66.7%
    const report = evaluateGate("BREAK_ADVISOR", [...agree, ...disagree]);
    assert.equal(report.verdict, "FAIL");
    assert.ok(report.agreementRate! < 0.8);
    assert.ok(report.reasons.some((r) => r.includes("Agreement rate")));
  });

  it("FAILs on any forbidden-term violation, even with otherwise-perfect agreement", () => {
    const clean = Array.from({ length: MINIMUM_SAMPLE }, () => breakRow(true, true));
    const violation: AuditRowLike = {
      ruleOutput: { suggestBreak: true },
      aiOutput: null,
      passed: false,
      failureReason: "reasoning for C1 contains a forbidden term",
      latencyMs: 300,
    };
    const report = evaluateGate("BREAK_ADVISOR", [...clean, violation]);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.forbiddenTermViolations, 1);
    assert.ok(report.reasons.some((r) => r.includes("forbidden-term violation")));
  });

  it("FAILs on any bounds violation (illegal candidate index)", () => {
    const clean = Array.from({ length: MINIMUM_SAMPLE }, () => breakRow(true, true));
    const violation: AuditRowLike = {
      ruleOutput: { selectedIndex: 1 },
      aiOutput: null,
      passed: false,
      failureReason: "selectedIndex 9 is not a legal candidate (only 0..2 exist)",
      latencyMs: 300,
    };
    const report = evaluateGate("QUESTION_RECOMMENDER", [...clean, violation]);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.boundsViolations, 1);
  });

  it("FAILs on a permutation violation for the practice recommender", () => {
    const clean = Array.from({ length: MINIMUM_SAMPLE }, () => breakRow(true, true));
    const violation: AuditRowLike = {
      ruleOutput: { orderedConceptIds: ["A", "B"] },
      aiOutput: null,
      passed: false,
      failureReason: "orderedConceptIds is not a permutation of the 2 approved concepts",
      latencyMs: 300,
    };
    const report = evaluateGate("PRACTICE_RECOMMENDER", [...clean, violation]);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.boundsViolations, 1);
  });

  it("FAILs when p95 latency exceeds the capability's budget", () => {
    // 1/3 slow guarantees the outlier tail lands inside the 95th percentile
    // bucket regardless of exact interpolation method.
    const fast = Array.from({ length: 20 }, () => breakRow(true, true, { latencyMs: 100 }));
    const slow = Array.from({ length: 10 }, () => breakRow(true, true, { latencyMs: 9000 }));
    const report = evaluateGate("BREAK_ADVISOR", [...fast, ...slow]);
    assert.equal(report.verdict, "FAIL");
    assert.ok(report.reasons.some((r) => r.includes("latency")));
  });

  it("counts passRate independently of agreement — a row can fail to parse without being a disagreement", () => {
    const rows: AuditRowLike[] = [
      ...Array.from({ length: 25 }, () => breakRow(true, true)),
      ...Array.from({ length: 5 }, () => ({
        ruleOutput: { suggestBreak: true },
        aiOutput: null,
        passed: false,
        failureReason: "timeout after 2000ms",
        latencyMs: 2000,
      })),
    ];
    const report = evaluateGate("BREAK_ADVISOR", rows);
    assert.equal(report.sampleSize, 30);
    assert.equal(report.passRate, 25 / 30);
    // Only the 25 passed rows are eligible for agreement comparison, and they all agreed.
    assert.equal(report.agreementRate, 1);
  });
});
