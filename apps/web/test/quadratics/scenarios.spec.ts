/**
 * End-to-end regression test for all ten scripted demo paths (spec section
 * 11) — drives each scenario's exact inputs through the same classification
 * and tracker functions the live page uses, and asserts the terminal
 * evidence/outcome states are what the scenario's name promises. This is
 * the test that would catch a scenario silently drifting out of sync with
 * the diagnosis engine after a future change.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyExpansionAttempt,
  classifyFactorAttempt,
  expandedPoly,
  needsIntervention,
  needsProbe,
  recordMainAttempt,
  recordProbeAttempt,
} from "../../src/lib/quadratics/diagnosis";
import { MAIN_PROBLEM, PROBE_PROBLEM, TRANSFER_PROBLEM, SCENARIOS, getScenario } from "../../src/lib/quadratics/scenarios";
import { initialTracker, type DiagnosisTracker } from "../../src/lib/quadratics/types";

/** Mirrors the branching logic in the page component for MAIN_EXPANSION + PROBE. */
function driveMainAndProbe(scenarioId: Parameters<typeof getScenario>[0]) {
  const scenario = getScenario(scenarioId);
  let tracker: DiagnosisTracker = initialTracker();
  let sawIntervention = false;
  let sawProbe = false;

  const mainStep = scenario.steps.find((s) => (s.kind === "WORKED_LINES" && s.target === "MAIN_EXPANSION") || (s.kind === "STUCK" && s.target === "MAIN_EXPANSION"));
  assert.ok(mainStep, `${scenarioId}: expected a MAIN_EXPANSION step`);

  const mainHypothesis =
    mainStep.kind === "STUCK"
      ? "STRATEGY_SELECTION_DIFFICULTY"
      : mainStep.kind === "WORKED_LINES"
        ? classifyExpansionAttempt(mainStep.lines[mainStep.lines.length - 1], MAIN_PROBLEM).hypothesis
        : (() => {
            throw new Error("unreachable");
          })();
  tracker = recordMainAttempt(tracker, mainHypothesis);

  if (mainHypothesis !== "NONE") {
    if (needsProbe(tracker)) {
      sawProbe = true;
      const probeStep = scenario.steps.find((s) => s.kind === "ANSWER" && s.target === "PROBE");
      assert.ok(probeStep, `${scenarioId}: expected a PROBE step since needsProbe was true`);
      const probeHypothesis = classifyExpansionAttempt((probeStep as { input: string }).input, PROBE_PROBLEM).hypothesis;
      tracker = recordProbeAttempt(tracker, probeHypothesis);
    }
    if (needsIntervention(tracker)) sawIntervention = true;
  }

  return { tracker, sawIntervention, sawProbe };
}

describe("all ten scripted demo paths reach the state their name promises", () => {
  it("every SCENARIOS entry is reachable via getScenario", () => {
    for (const s of SCENARIOS) {
      assert.equal(getScenario(s.id).id, s.id);
    }
  });

  it("FULLY_CORRECT: no probe, no intervention", () => {
    const { sawProbe, sawIntervention } = driveMainAndProbe("FULLY_CORRECT");
    assert.equal(sawProbe, false);
    assert.equal(sawIntervention, false);
  });

  it("MISSING_CROSS_PRODUCTS: probe repeats the pattern, reaches intervention", () => {
    const { tracker, sawProbe, sawIntervention } = driveMainAndProbe("MISSING_CROSS_PRODUCTS");
    assert.equal(sawProbe, true);
    assert.equal(sawIntervention, true);
    assert.equal(tracker.evidenceState, "INTERVENTION_READY");
    assert.equal(tracker.hypothesis, "MISSING_CROSS_PRODUCTS");
  });

  it("APPARENT_SLIP_THEN_CORRECT_PROBE: probe is correct, treated as uncertain — no intervention", () => {
    const { tracker, sawProbe, sawIntervention } = driveMainAndProbe("APPARENT_SLIP_THEN_CORRECT_PROBE");
    assert.equal(sawProbe, true);
    assert.equal(sawIntervention, false);
    assert.equal(tracker.evidenceState, "UNCERTAIN");
  });

  it("X_SQUARED_MISREAD: probe repeats the pattern, reaches intervention", () => {
    const { tracker, sawIntervention } = driveMainAndProbe("X_SQUARED_MISREAD");
    assert.equal(sawIntervention, true);
    assert.equal(tracker.hypothesis, "UNRELIABLE_X_SQUARED");
  });

  it("COMBINING_LIKE_TERMS_DIFFICULTY: correct value both times, but uncombined — reaches intervention", () => {
    const { tracker, sawIntervention } = driveMainAndProbe("COMBINING_LIKE_TERMS_DIFFICULTY");
    assert.equal(sawIntervention, true);
    assert.equal(tracker.hypothesis, "COMBINING_LIKE_TERMS_GAP");
  });

  it("NEGATIVE_SIGN_DIFFICULTY: main problem is clean — no probe, no intervention needed there", () => {
    const { sawProbe, sawIntervention } = driveMainAndProbe("NEGATIVE_SIGN_DIFFICULTY");
    assert.equal(sawProbe, false);
    assert.equal(sawIntervention, false);
  });

  it("PRODUCT_SUM_CONFUSION: main problem is clean, difficulty is isolated to factorisation", () => {
    const { sawProbe, sawIntervention } = driveMainAndProbe("PRODUCT_SUM_CONFUSION");
    assert.equal(sawProbe, false);
    assert.equal(sawIntervention, false);
    const scenario = getScenario("PRODUCT_SUM_CONFUSION");
    const factorSteps = scenario.steps.filter((s) => s.kind === "FACTOR_ATTEMPT" && s.target === "FACTORISATION");
    assert.equal(factorSteps.length, 2, "expects a missed-sum attempt followed by a correct one");
    const first = factorSteps[0] as { p: number; q: number; writtenForm: string };
    const target = expandedPoly(MAIN_PROBLEM);
    assert.equal(classifyFactorAttempt(first, target, false), "SUM_CONDITION_MISSED");
    const second = factorSteps[1] as { p: number; q: number; writtenForm: string };
    assert.equal(classifyFactorAttempt(second, target, false), "INDEPENDENT_SUCCESS");
  });

  it('STUCK: skips the probe entirely and goes straight to support', () => {
    const { sawProbe, sawIntervention, tracker } = driveMainAndProbe("STUCK");
    assert.equal(sawProbe, false);
    assert.equal(sawIntervention, true);
    assert.equal(tracker.hypothesis, "STRATEGY_SELECTION_DIFFICULTY");
  });

  it("SUCCESSFUL_TRANSFER: an early slip resolves as uncertain, then transfer succeeds unaided", () => {
    const { tracker, sawIntervention } = driveMainAndProbe("SUCCESSFUL_TRANSFER");
    assert.equal(sawIntervention, false);
    assert.equal(tracker.evidenceState, "UNCERTAIN");
    const scenario = getScenario("SUCCESSFUL_TRANSFER");
    const transferStep = scenario.steps.find((s) => s.kind === "WORKED_LINES" && s.target === "TRANSFER_EXPANSION");
    assert.ok(transferStep && transferStep.kind === "WORKED_LINES");
    const c = classifyExpansionAttempt(transferStep.lines[transferStep.lines.length - 1], TRANSFER_PROBLEM);
    assert.equal(c.stepValidity, "VALID");
    const factorStep = scenario.steps.find((s) => s.kind === "FACTOR_ATTEMPT" && s.target === "TRANSFER_FACTOR");
    assert.ok(factorStep && factorStep.kind === "FACTOR_ATTEMPT");
    assert.equal(
      classifyFactorAttempt(factorStep, expandedPoly(TRANSFER_PROBLEM), false),
      "INDEPENDENT_SUCCESS",
    );
  });

  it("DIFFICULT_TRANSFER: taught example is clean, but the new expression trips on the same structural gap", () => {
    const { sawIntervention } = driveMainAndProbe("DIFFICULT_TRANSFER");
    assert.equal(sawIntervention, false);
    const scenario = getScenario("DIFFICULT_TRANSFER");
    const transferStep = scenario.steps.find((s) => s.kind === "WORKED_LINES" && s.target === "TRANSFER_EXPANSION");
    assert.ok(transferStep && transferStep.kind === "WORKED_LINES");
    const c = classifyExpansionAttempt(transferStep.lines[transferStep.lines.length - 1], TRANSFER_PROBLEM);
    assert.equal(c.stepValidity, "INVALID");
  });
});
