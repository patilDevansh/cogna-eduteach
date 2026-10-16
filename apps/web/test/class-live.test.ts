import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activityLine, applyActivity } from "../src/lib/class-live";
import type { ClassActivityEvent, ClassroomRunReport, PilotClassReport } from "../src/lib/api";

type Row = PilotClassReport["students"][number];

const T0 = Date.parse("2026-10-08T10:00:00Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function row(overrides: Partial<Row> = {}): Row {
  return {
    studentId: "s1",
    name: "Asha",
    stage: "DIAGNOSTIC",
    stageStatus: "IN_PROGRESS",
    progress: "PENDING",
    activity: { state: "WORKING", lastActiveAt: at(0), quietMinutes: 0, quietAfterMinutes: 3, answeredSoFar: 2 },
    ...overrides,
  };
}

function report(rows: Row[]): ClassroomRunReport {
  return { run: { id: "run-1" }, classReport: { students: rows } } as unknown as ClassroomRunReport;
}

const answered = (overrides: Partial<ClassActivityEvent> = {}): ClassActivityEvent => ({
  type: "activity", runId: "run-1", studentId: "s1", answeredSoFar: 3, lastActiveAt: at(1), testFinished: false, ...overrides,
});

describe("live class report — applying a student's answer without a reload", () => {
  it("updates that student's row: answers so far and last active", () => {
    const next = applyActivity(report([row(), row({ studentId: "s2", name: "Ben" })]), answered())!;
    assert.equal(next.classReport.students[0]!.activity?.answeredSoFar, 3);
    assert.equal(next.classReport.students[0]!.activity?.lastActiveAt, at(1));
    assert.equal(next.classReport.students[1]!.activity?.answeredSoFar, 2, "classmates untouched");
  });

  it("a quiet student who answers is working again", () => {
    const quiet = row({ activity: { state: "IDLE", lastActiveAt: at(-10), quietMinutes: 10, quietAfterMinutes: 3, answeredSoFar: 2 } });
    assert.equal(applyActivity(report([quiet]), answered())!.classReport.students[0]!.activity?.state, "WORKING");
  });

  it("a finished test shows as being filed", () => {
    assert.equal(applyActivity(report([row()]), answered({ testFinished: true }))!.classReport.students[0]!.activity?.state, "FILING");
  });

  it("an older update arriving late never rolls the row back", () => {
    const current = report([row({ activity: { state: "WORKING", lastActiveAt: at(5), quietMinutes: 0, quietAfterMinutes: 3, answeredSoFar: 6 } })]);
    assert.equal(applyActivity(current, answered({ lastActiveAt: at(4), answeredSoFar: 5 })), current);
  });

  it("asks for a reload when the row can't be patched from the event alone", () => {
    assert.equal(applyActivity(report([]), answered()), null, "student not on screen yet");
    assert.equal(applyActivity(report([row({ stageStatus: "READY", activity: undefined })]), answered()), null, "wasn't shown as mid-test");
  });

  it("ignores updates for a different check", () => {
    const current = report([row()]);
    assert.equal(applyActivity(current, answered({ runId: "run-2" })), current);
  });
});

describe("live class report — the line under a student's name", () => {
  it("counts minutes from the last action, so it stays current between reloads", () => {
    assert.deepEqual(activityLine(row(), T0 + 20_000), { text: "2 answered · Active now", quiet: false });
    assert.deepEqual(activityLine(row(), T0 + 2 * 60_000), { text: "2 answered · Active 2 min ago", quiet: false });
    assert.deepEqual(activityLine(row(), T0 + 3 * 60_000), { text: "2 answered · No activity for 3 min", quiet: true });
  });

  it("a test being filed never reads as quiet", () => {
    const filing = row({ activity: { state: "FILING", lastActiveAt: at(0), quietMinutes: 0, quietAfterMinutes: 3 } });
    assert.deepEqual(activityLine(filing, T0 + 30 * 60_000), { text: "Finished · filing result", quiet: false });
  });

  it("no line when the student isn't mid-step", () => {
    assert.equal(activityLine(row({ activity: undefined }), T0), null);
  });
});
