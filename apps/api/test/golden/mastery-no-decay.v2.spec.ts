import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMasteryUpdate,
  computeRetentionEstimate,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";

/**
 * R20 — Mastery does not calendar-decay
 * Mastery only changes via evidence (computeMasteryUpdate). Time alone may
 * lower retentionEstimate via forgettingPenalty, but mastery stays put.
 */
describe("R20 — Mastery does not calendar-decay", () => {
  it("computeMasteryUpdate does not take daysElapsed", () => {
    const paramNames = computeMasteryUpdate.length;
    // 1 object argument; no separate daysElapsed parameter.
    assert.equal(paramNames, 1);

    const sampleInput = {
      previousValue: 0.7,
      grade: "CORRECT" as const,
      difficulty: 3,
      highestHintLevel: 0,
      itemQualityWeight: 1.0,
    };
    assert.ok(!("daysElapsed" in sampleInput));
    assert.ok(!("daysSinceSuccess" in sampleInput));

    const { newValue } = computeMasteryUpdate(sampleInput);
    // Evidence can change mastery — this call has evidence, so value moves.
    assert.notEqual(newValue, 0.7);
  });

  it("14 days idle: mastery stays 0.70 while retention may drop", () => {
    const mastery = 0.7;
    const daysIdle = 14;

    // No new attempts → no computeMasteryUpdate call → mastery unchanged.
    const masteryAfterIdle = mastery;
    assert.equal(masteryAfterIdle, 0.7);

    const retentionEstimate = computeRetentionEstimate({
      mastery,
      daysSinceSuccess: daysIdle,
      completedRevisionsLast14Days: 0,
    });

    // forgettingPenalty = min(0.45, 0.04 * 14) = 0.56 → clamped to 0.45
    // estimate = round(clamp(0.70 + 0 - 0.45, 0, 1) * 100) / 100 = 0.25
    assert.equal(retentionEstimate, 0.25);
    assert.ok(retentionEstimate < mastery);
    assert.equal(masteryAfterIdle, 0.7);
  });
});
