import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mondayOf,
  bucketMasteryTrend,
  bandConceptMastery,
  aggregatePracticeCalendar,
  summarizePatternHistory,
  enrichPatternHistoryItems,
  clampWeeks,
} from "../../src/parents/parent-analytics.formulas";

describe("mondayOf", () => {
  it("returns the same date for a Monday", () => {
    assert.equal(mondayOf(new Date("2026-07-06T10:00:00.000Z")), "2026-07-06");
  });

  it("rolls a Sunday back to the preceding Monday", () => {
    assert.equal(mondayOf(new Date("2026-07-12T23:59:00.000Z")), "2026-07-06");
  });

  it("rolls a Wednesday back to that week's Monday", () => {
    assert.equal(mondayOf(new Date("2026-07-08T00:00:00.000Z")), "2026-07-06");
  });
});

describe("bucketMasteryTrend", () => {
  it("keeps the last value written per (week, concept)", () => {
    const points = bucketMasteryTrend([
      { conceptId: "C5_TWO_STEP_EQUATIONS", newValue: 0.3, createdAt: new Date("2026-07-06T09:00:00.000Z") },
      { conceptId: "C5_TWO_STEP_EQUATIONS", newValue: 0.45, createdAt: new Date("2026-07-08T09:00:00.000Z") },
      { conceptId: "C5_TWO_STEP_EQUATIONS", newValue: 0.6, createdAt: new Date("2026-07-13T09:00:00.000Z") },
    ]);
    assert.equal(points.length, 2);
    assert.equal(points[0]!.weekStart, "2026-07-06");
    assert.equal(points[0]!.value, 0.45); // last write in week 1 wins
    assert.equal(points[1]!.weekStart, "2026-07-13");
    assert.equal(points[1]!.value, 0.6);
  });

  it("keeps concepts separate within the same week", () => {
    const points = bucketMasteryTrend([
      { conceptId: "A", newValue: 0.2, createdAt: new Date("2026-07-06T09:00:00.000Z") },
      { conceptId: "B", newValue: 0.9, createdAt: new Date("2026-07-06T10:00:00.000Z") },
    ]);
    assert.equal(points.length, 2);
    assert.deepEqual(
      points.map((p) => p.conceptId).sort(),
      ["A", "B"],
    );
  });

  it("returns an empty array for no rows", () => {
    assert.deepEqual(bucketMasteryTrend([]), []);
  });
});

describe("bandConceptMastery", () => {
  it("bands each concept independently", () => {
    const bands = bandConceptMastery([
      { conceptId: "A", value: 0.2, updatedAt: new Date("2026-07-06T00:00:00.000Z"), evidenceCount: 2 },
      { conceptId: "B", value: 0.5, updatedAt: new Date("2026-07-10T00:00:00.000Z"), evidenceCount: 6 },
      { conceptId: "C", value: 0.9, updatedAt: new Date("2026-07-14T00:00:00.000Z"), evidenceCount: 20 },
    ]);
    assert.deepEqual(
      bands.map((b) => b.band),
      ["JUST_STARTED", "BUILDING", "STRONG"],
    );
  });

  it("carries each concept's own updatedAt through as lastPracticedAt", () => {
    const bands = bandConceptMastery([
      { conceptId: "A", value: 0.2, updatedAt: new Date("2026-07-06T00:00:00.000Z"), evidenceCount: 2 },
      { conceptId: "B", value: 0.5, updatedAt: new Date("2026-07-14T00:00:00.000Z"), evidenceCount: 6 },
    ]);
    const mostRecent = [...bands].sort((a, b) =>
      b.lastPracticedAt.localeCompare(a.lastPracticedAt),
    )[0];
    assert.equal(mostRecent?.conceptId, "B");
  });

  it("carries evidenceCount through unchanged", () => {
    const bands = bandConceptMastery([
      { conceptId: "A", value: 0.6, updatedAt: new Date("2026-07-06T00:00:00.000Z"), evidenceCount: 9 },
    ]);
    assert.equal(bands[0]?.evidenceCount, 9);
  });
});

describe("aggregatePracticeCalendar", () => {
  it("sums minutes and counts sessions per day", () => {
    const days = aggregatePracticeCalendar([
      { startedAt: new Date("2026-07-10T09:00:00.000Z"), endedAt: new Date("2026-07-10T09:12:00.000Z") },
      { startedAt: new Date("2026-07-10T18:00:00.000Z"), endedAt: new Date("2026-07-10T18:08:00.000Z") },
      { startedAt: new Date("2026-07-11T09:00:00.000Z"), endedAt: new Date("2026-07-11T09:05:00.000Z") },
    ]);
    assert.equal(days.length, 2);
    assert.equal(days[0]!.date, "2026-07-10");
    assert.equal(days[0]!.minutes, 20);
    assert.equal(days[0]!.sessionCount, 2);
    assert.equal(days[1]!.minutes, 5);
  });

  it("counts an in-progress session (no endedAt) as zero minutes, not dropped", () => {
    const days = aggregatePracticeCalendar([
      { startedAt: new Date("2026-07-10T09:00:00.000Z"), endedAt: null },
    ]);
    assert.equal(days.length, 1);
    assert.equal(days[0]!.minutes, 0);
    assert.equal(days[0]!.sessionCount, 1);
  });

  it("returns an empty array for no sessions", () => {
    assert.deepEqual(aggregatePracticeCalendar([]), []);
  });
});

describe("summarizePatternHistory", () => {
  it("marks a misconception resolved only if its most recent transition is RESOLVED", () => {
    const items = summarizePatternHistory([
      { misconceptionId: "SIGN_HANDLING", conceptId: "C5", toState: "TARGETING", createdAt: new Date("2026-06-01T00:00:00.000Z") },
      { misconceptionId: "SIGN_HANDLING", conceptId: "C5", toState: "EXPLANATION_REQUIRED", createdAt: new Date("2026-06-05T00:00:00.000Z") },
      { misconceptionId: "SIGN_HANDLING", conceptId: "C5", toState: "RESOLVED", createdAt: new Date("2026-06-10T00:00:00.000Z") },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.status, "resolved");
    assert.equal(items[0]!.occurrenceCount, 3);
    assert.equal(items[0]!.firstSeenAt, "2026-06-01T00:00:00.000Z");
    assert.equal(items[0]!.lastSeenAt, "2026-06-10T00:00:00.000Z");
  });

  it("marks a misconception still checking if its latest state is not RESOLVED", () => {
    const items = summarizePatternHistory([
      { misconceptionId: "INVERSE_OPERATION", conceptId: "C2", toState: "TARGETING", createdAt: new Date("2026-07-01T00:00:00.000Z") },
      { misconceptionId: "INVERSE_OPERATION", conceptId: "C2", toState: "STILL_ACTIVE", createdAt: new Date("2026-07-08T00:00:00.000Z") },
    ]);
    assert.equal(items[0]!.status, "checking");
  });

  it("keeps different misconceptions on the same concept separate", () => {
    const items = summarizePatternHistory([
      { misconceptionId: "A", conceptId: "C5", toState: "TARGETING", createdAt: new Date("2026-07-01T00:00:00.000Z") },
      { misconceptionId: "B", conceptId: "C5", toState: "RESOLVED", createdAt: new Date("2026-07-02T00:00:00.000Z") },
    ]);
    assert.equal(items.length, 2);
  });

  it("returns most-recently-active misconception first", () => {
    const items = summarizePatternHistory([
      { misconceptionId: "OLD", conceptId: "C1", toState: "RESOLVED", createdAt: new Date("2026-06-01T00:00:00.000Z") },
      { misconceptionId: "NEW", conceptId: "C2", toState: "TARGETING", createdAt: new Date("2026-07-01T00:00:00.000Z") },
    ]);
    assert.equal(items[0]!.misconceptionId, "NEW");
  });
});

describe("enrichPatternHistoryItems", () => {
  const baseItem = {
    misconceptionId: "SIGN_HANDLING",
    conceptId: "C2_ONE_STEP_SUBTRACTION",
    status: "checking" as const,
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-10T00:00:00.000Z",
    occurrenceCount: 3,
  };

  it("attaches both explanation and example when both are available", () => {
    const [enriched] = enrichPatternHistoryItems(
      [baseItem],
      new Map([["SIGN_HANDLING", "Undo by adding, not subtracting."]]),
      new Map([["SIGN_HANDLING|C2_ONE_STEP_SUBTRACTION", { stem: "Solve: x - 7 = 11", submittedAnswer: "4" }]]),
    );
    assert.equal(enriched.explanation, "Undo by adding, not subtracting.");
    assert.deepEqual(enriched.example, { stem: "Solve: x - 7 = 11", submittedAnswer: "4" });
  });

  it("omits explanation when none is authored for this misconception, without throwing", () => {
    const [enriched] = enrichPatternHistoryItems([baseItem], new Map(), new Map());
    assert.equal(enriched.explanation, undefined);
    assert.equal(enriched.example, undefined);
    // still a valid item — everything else survives untouched
    assert.equal(enriched.misconceptionId, "SIGN_HANDLING");
    assert.equal(enriched.occurrenceCount, 3);
  });

  it("keys the example lookup by BOTH misconceptionId and conceptId — a same-misconception example on a different concept must not leak in", () => {
    const [enriched] = enrichPatternHistoryItems(
      [baseItem],
      new Map(),
      new Map([["SIGN_HANDLING|SOME_OTHER_CONCEPT", { stem: "irrelevant", submittedAnswer: "x" }]]),
    );
    assert.equal(enriched.example, undefined);
  });
});

describe("clampWeeks", () => {
  it("falls back when the param is missing or invalid", () => {
    assert.equal(clampWeeks(undefined, 6), 6);
    assert.equal(clampWeeks("not-a-number", 6), 6);
    assert.equal(clampWeeks("-3", 6), 6);
    assert.equal(clampWeeks("0", 6), 6);
  });

  it("passes through a valid value, rounded", () => {
    assert.equal(clampWeeks("4.6", 6), 5);
  });

  it("caps at 26 weeks", () => {
    assert.equal(clampWeeks("500", 6), 26);
  });
});
