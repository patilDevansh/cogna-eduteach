import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classNotice } from "../src/lib/class-steps";

const NOW = Date.parse("2026-10-08T10:00:00Z");
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const step = (config: Record<string, unknown>, payload: Record<string, unknown> = {}, status = "READY") =>
  ({ status, payload, run: { id: "run-1", title: "Check", topicId: "t", config, classroom: { id: "c", name: "8A", grade: 8, subjectId: "math" } } }) as never;

describe("what a student sees about their teacher's controls", () => {
  it("paused wins over everything, and hides the start button", () => {
    const notice = classNotice(step({ pausedAt: iso(-1), endsAt: iso(10) }, { nudgedAt: iso(-1) }), NOW);
    assert.equal(notice?.paused, true);
    assert.match(notice!.text, /paused/);
  });

  it("a recent reminder says the teacher is waiting, with the time left", () => {
    const notice = classNotice(step({ endsAt: iso(12) }, { nudgedAt: iso(-2) }), NOW);
    assert.equal(notice?.paused, false);
    assert.match(notice!.text, /^Your teacher is waiting for you to start\. Ends at .+ \(12 min left\)\.$/);
  });

  it("a reminder fades after ten minutes, or once the student has started", () => {
    assert.equal(classNotice(step({}, { nudgedAt: iso(-11) }), NOW), null);
    assert.equal(classNotice(step({}, { nudgedAt: iso(-1) }, "IN_PROGRESS"), NOW), null);
  });

  it("nothing to say when the teacher hasn't done anything", () => {
    assert.equal(classNotice(step({}), NOW), null);
    assert.equal(classNotice(step({ endsAt: iso(-1) }), NOW), null, "a passed end time is the server's to act on");
  });
});
