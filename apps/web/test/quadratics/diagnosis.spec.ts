import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyExpansionAttempt,
  classifyFactorAttempt,
  expandedPoly,
  needsProbe,
  needsIntervention,
  recordMainAttempt,
  recordProbeAttempt,
  looksLikeSignIssue,
} from "../../src/lib/quadratics/diagnosis";
import { MAIN_PROBLEM, PROBE_PROBLEM, TRANSFER_PROBLEM } from "../../src/lib/quadratics/scenarios";
import { initialTracker } from "../../src/lib/quadratics/types";

describe("expandedPoly", () => {
  it("computes x^2+(p+q)x+pq for each fixed problem", () => {
    assert.deepEqual(expandedPoly(MAIN_PROBLEM), [15, 8, 1]);
    assert.deepEqual(expandedPoly(PROBE_PROBLEM), [8, 6, 1]);
    assert.deepEqual(expandedPoly(TRANSFER_PROBLEM), [-10, 3, 1]);
  });
});

describe("classifyExpansionAttempt — Stage 4 table, reproduced from the problem's own factors", () => {
  it("VALID + NONE for a fully correct, combined answer", () => {
    const c = classifyExpansionAttempt("x^2+8x+15", MAIN_PROBLEM);
    assert.equal(c.stepValidity, "VALID");
    assert.equal(c.hypothesis, "NONE");
  });

  it("VALID + NONE for a reordered but fully combined equivalent route", () => {
    const c = classifyExpansionAttempt("15+8x+x^2", MAIN_PROBLEM);
    assert.equal(c.stepValidity, "VALID");
    assert.equal(c.hypothesis, "NONE");
  });

  it("a distributive intermediate step is correctly VALID+correct-value but still flagged as not yet combined", () => {
    // x(x+5)+3(x+5) is algebraically correct and an accepted *step*, but its
    // two x-degree terms (5x, 3x) are still separate — same signal as
    // "x^2+3x+5x+15", by design: the classifier looks at structure, not at
    // which route produced it.
    const c = classifyExpansionAttempt("x(x+5)+3(x+5)", MAIN_PROBLEM);
    assert.equal(c.stepValidity, "VALID");
    assert.equal(c.hypothesis, "COMBINING_LIKE_TERMS_GAP");
  });

  it("MISSING_CROSS_PRODUCTS for x^2+15", () => {
    const c = classifyExpansionAttempt("x^2+15", MAIN_PROBLEM);
    assert.equal(c.stepValidity, "INVALID");
    assert.equal(c.hypothesis, "MISSING_CROSS_PRODUCTS");
  });

  it("UNRELIABLE_X_SQUARED for 2x+8x+15", () => {
    const c = classifyExpansionAttempt("2x+8x+15", MAIN_PROBLEM);
    assert.equal(c.hypothesis, "UNRELIABLE_X_SQUARED");
  });

  it("INCOMPLETE_DOUBLE_DISTRIBUTION for x^2+5x+15", () => {
    const c = classifyExpansionAttempt("x^2+5x+15", MAIN_PROBLEM);
    assert.equal(c.hypothesis, "INCOMPLETE_DOUBLE_DISTRIBUTION");
  });

  it("COMBINING_LIKE_TERMS_GAP for a correct-but-uncombined answer", () => {
    const c = classifyExpansionAttempt("x^2+3x+5x+15", MAIN_PROBLEM);
    assert.equal(c.stepValidity, "VALID");
    assert.equal(c.hypothesis, "COMBINING_LIKE_TERMS_GAP");
  });

  it("STRATEGY_SELECTION_DIFFICULTY for no meaningful attempt", () => {
    assert.equal(classifyExpansionAttempt("", MAIN_PROBLEM).hypothesis, "STRATEGY_SELECTION_DIFFICULTY");
    assert.equal(classifyExpansionAttempt("(x+3)(x+5)", MAIN_PROBLEM).hypothesis, "STRATEGY_SELECTION_DIFFICULTY");
  });

  it("a real but unrecognized wrong attempt is INVALID with hypothesis NONE, not strategy-selection-difficulty", () => {
    const c = classifyExpansionAttempt("x^2+3x+10", TRANSFER_PROBLEM); // sign slip, not a FOIL-family pattern
    assert.equal(c.stepValidity, "INVALID");
    assert.equal(c.hypothesis, "NONE");
  });

  it("generalizes the same three patterns to a different problem (probe)", () => {
    assert.equal(classifyExpansionAttempt("x^2+8", PROBE_PROBLEM).hypothesis, "MISSING_CROSS_PRODUCTS");
    assert.equal(classifyExpansionAttempt("2x+6x+8", PROBE_PROBLEM).hypothesis, "UNRELIABLE_X_SQUARED");
  });
});

describe("evidence-state machine — one error is never an immediate confirmed misconception", () => {
  it("a single wrong main attempt is only SUSPECTED", () => {
    const t = recordMainAttempt(initialTracker(), "MISSING_CROSS_PRODUCTS");
    assert.equal(t.evidenceState, "SUSPECTED");
    assert.equal(t.hypothesis, "MISSING_CROSS_PRODUCTS");
  });

  it("SUSPECTED requests exactly one probe, then no more", () => {
    const t = recordMainAttempt(initialTracker(), "MISSING_CROSS_PRODUCTS");
    assert.equal(needsProbe(t), true);
    const afterProbe = recordProbeAttempt(t, "MISSING_CROSS_PRODUCTS");
    assert.equal(needsProbe(afterProbe), false);
  });

  it("repeating the same error on the probe reaches INTERVENTION_READY", () => {
    const t = recordMainAttempt(initialTracker(), "MISSING_CROSS_PRODUCTS");
    const afterProbe = recordProbeAttempt(t, "MISSING_CROSS_PRODUCTS");
    assert.equal(afterProbe.evidenceState, "INTERVENTION_READY");
    assert.equal(needsIntervention(afterProbe), true);
  });

  it("a correct (or differently-wrong) probe treats the original error as a possible slip, not a pattern", () => {
    const t = recordMainAttempt(initialTracker(), "MISSING_CROSS_PRODUCTS");
    const afterProbe = recordProbeAttempt(t, "NONE");
    assert.equal(afterProbe.evidenceState, "UNCERTAIN");
    assert.equal(needsIntervention(afterProbe), false);
  });

  it("a stuck signal skips the probe and goes straight to support", () => {
    const t = recordMainAttempt(initialTracker(), "STRATEGY_SELECTION_DIFFICULTY");
    assert.equal(needsProbe(t), false);
    assert.equal(needsIntervention(t), true);
  });

  it("a fully correct main attempt needs neither a probe nor an intervention", () => {
    const t = recordMainAttempt(initialTracker(), "NONE");
    assert.equal(needsProbe(t), false);
    assert.equal(needsIntervention(t), false);
  });
});

describe("classifyFactorAttempt — Stage 7 table, all five outcomes", () => {
  const target = expandedPoly(MAIN_PROBLEM); // [15, 8, 1]

  it("SUM_CONDITION_MISSED when the product is right but the sum isn't", () => {
    assert.equal(classifyFactorAttempt({ p: 1, q: 15, writtenForm: "(x+1)(x+15)" }, target, false), "SUM_CONDITION_MISSED");
  });

  it("FACTOR_FLUENCY_DIFFICULTY when the pair doesn't even hit the product", () => {
    assert.equal(classifyFactorAttempt({ p: 2, q: 6, writtenForm: "(x+2)(x+6)" }, target, false), "FACTOR_FLUENCY_DIFFICULTY");
  });

  it("SYMBOLIC_CONSTRUCTION_UNRELIABLE when the right numbers are written as an invalid form", () => {
    assert.equal(classifyFactorAttempt({ p: 3, q: 5, writtenForm: "3x+5x" }, target, false), "SYMBOLIC_CONSTRUCTION_UNRELIABLE");
  });

  it("INDEPENDENT_SUCCESS for a correct pair and form with no intervention seen", () => {
    assert.equal(classifyFactorAttempt({ p: 3, q: 5, writtenForm: "(x+3)(x+5)" }, target, false), "INDEPENDENT_SUCCESS");
  });

  it("SUPPORTED_SUCCESS for the same correct attempt after the area model was shown", () => {
    assert.equal(classifyFactorAttempt({ p: 3, q: 5, writtenForm: "(x+3)(x+5)" }, target, true), "SUPPORTED_SUCCESS");
  });
});

describe("looksLikeSignIssue", () => {
  it("true when magnitudes match but a sign differs", () => {
    assert.equal(looksLikeSignIssue([10, 3, 1], [-10, 3, 1]), true);
  });
  it("false when a magnitude itself is wrong", () => {
    assert.equal(looksLikeSignIssue([-10, 0, 1], [-10, 3, 1]), false);
  });
  it("false for an exact match (no sign difference at all)", () => {
    assert.equal(looksLikeSignIssue([-10, 3, 1], [-10, 3, 1]), false);
  });
});
