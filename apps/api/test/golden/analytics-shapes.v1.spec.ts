import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  masteryValueToBand,
  isMasteryBand,
  assertMasteryTrendPointShape,
  assertConceptMasteryBandShape,
  assertPracticeCalendarDayShape,
  assertPatternHistoryItemShape,
  assertStudentSafetySettingsShape,
} from "@cogna/shared";

describe("masteryValueToBand", () => {
  it("bands just-started below 0.4", () => {
    assert.equal(masteryValueToBand(0), "JUST_STARTED");
    assert.equal(masteryValueToBand(0.39), "JUST_STARTED");
  });

  it("bands building from 0.4 to just under 0.75", () => {
    assert.equal(masteryValueToBand(0.4), "BUILDING");
    assert.equal(masteryValueToBand(0.74), "BUILDING");
  });

  it("bands strong from 0.75 up", () => {
    assert.equal(masteryValueToBand(0.75), "STRONG");
    assert.equal(masteryValueToBand(1), "STRONG");
  });

  it("every band output is a valid MasteryBand", () => {
    for (const v of [0, 0.2, 0.4, 0.6, 0.75, 0.9, 1]) {
      assert.equal(isMasteryBand(masteryValueToBand(v)), true);
    }
  });
});

describe("analytics payload shapes", () => {
  it("accepts a valid MasteryTrendPoint and rejects an out-of-range value", () => {
    const p = assertMasteryTrendPointShape({
      weekStart: "2026-07-06",
      conceptId: "C5_TWO_STEP_EQUATIONS",
      value: 0.62,
    });
    assert.equal(p.conceptId, "C5_TWO_STEP_EQUATIONS");
    assert.throws(() =>
      assertMasteryTrendPointShape({ weekStart: "2026-07-06", conceptId: "X", value: 1.4 }),
    );
  });

  it("accepts a valid ConceptMasteryBand and rejects an invalid band", () => {
    const b = assertConceptMasteryBandShape({
      conceptId: "C1_ONE_STEP_ADDITION",
      band: "STRONG",
      value: 0.88,
      lastPracticedAt: "2026-07-06T00:00:00.000Z",
    });
    assert.equal(b.band, "STRONG");
    assert.throws(() =>
      assertConceptMasteryBandShape({
        conceptId: "X",
        band: "ACED_IT",
        value: 0.9,
        lastPracticedAt: "2026-07-06T00:00:00.000Z",
      }),
    );
    assert.throws(() =>
      assertConceptMasteryBandShape({ conceptId: "X", band: "STRONG", value: 0.9 }),
    );
  });

  it("accepts a valid PracticeCalendarDay and rejects negative minutes", () => {
    const d = assertPracticeCalendarDayShape({
      date: "2026-07-10",
      minutes: 14,
      sessionCount: 1,
    });
    assert.equal(d.sessionCount, 1);
    assert.throws(() =>
      assertPracticeCalendarDayShape({ date: "2026-07-10", minutes: -1, sessionCount: 0 }),
    );
  });

  it("accepts a valid PatternHistoryItem and rejects an invalid status", () => {
    const item = assertPatternHistoryItemShape({
      misconceptionId: "SIGN_HANDLING",
      conceptId: "C5_TWO_STEP_EQUATIONS",
      status: "checking",
      firstSeenAt: "2026-06-29T00:00:00.000Z",
      lastSeenAt: "2026-07-12T00:00:00.000Z",
      occurrenceCount: 4,
    });
    assert.equal(item.status, "checking");
    assert.throws(() =>
      assertPatternHistoryItemShape({
        misconceptionId: "X",
        conceptId: "Y",
        status: "maybe",
        firstSeenAt: "2026-06-29T00:00:00.000Z",
        lastSeenAt: "2026-07-12T00:00:00.000Z",
        occurrenceCount: 1,
      }),
    );
  });

  it("accepts a valid StudentSafetySettings and rejects a non-boolean flag", () => {
    const s = assertStudentSafetySettingsShape({ aiAssistedPracticePaused: true });
    assert.equal(s.aiAssistedPracticePaused, true);
    assert.throws(() =>
      assertStudentSafetySettingsShape({ aiAssistedPracticePaused: "yes" }),
    );
  });
});
