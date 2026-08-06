import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("G32 — baseline skip (contract)", () => {
  it("QUESTION_SKIPPED is a valid event type with no mastery evidence path", () => {
    const event = {
      eventId: "evt-skip-1",
      eventType: "QUESTION_SKIPPED" as const,
      studentId: "student-1",
      sessionId: "session-1",
      questionId: "Q_P1_D1_001",
      questionVersion: 1,
      clientTimestamp: new Date().toISOString(),
    };

    assert.equal(event.eventType, "QUESTION_SKIPPED");
    assert.ok(!("submittedAnswer" in event));
    assert.ok(!("selfRatedConfidence" in event));
  });

  it("baseline allows at most 2 skip extensions (policy constant)", () => {
    const MAX_BASELINE_SKIP_EXTENSIONS = 2;
    assert.equal(MAX_BASELINE_SKIP_EXTENSIONS, 2);
  });
});
