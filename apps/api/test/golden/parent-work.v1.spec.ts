import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dueAtFor, minutesLeft, parentWork, taskState, type WorkStep, type WorkTask } from "../../src/classrooms/parent-work";
import { maskEmail, normalizeEmail, parentInviteEmail } from "../../src/classrooms/parent-invite";

const NOW = new Date("2026-10-12T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const step = (kind: WorkStep["kind"], status: WorkStep["status"], completedAt: Date | null = null): WorkStep => ({ kind, status, startedAt: status === "READY" ? null : daysAgo(3), completedAt });

function task(overrides: Partial<WorkTask> & Pick<WorkTask, "steps">): WorkTask {
  return { runId: "r1", title: "Factorisation · Catch-up", kind: "CATCH_UP", runStatus: "LIVE", launchedAt: daysAgo(2), dueAt: daysAgo(-1), ...overrides };
}

describe("parent work — has the child done their class checks?", () => {
  it("a check with every step complete or skipped is done; a skipped lesson is never missed work", () => {
    const t = task({ steps: [step("DIAGNOSTIC", "COMPLETE", daysAgo(1)), step("TEACHING", "SKIPPED"), step("INDEPENDENT_EXIT", "SKIPPED")] });
    assert.equal(taskState(t, NOW), "DONE");
    assert.deepEqual({ ...parentWork([t], NOW), next: null, openTasks: [] }, { windowDays: 30, total: 1, onTime: 1, late: 0, missed: 0, open: 0, next: null, openTasks: [] });
  });

  it("finished after the due date counts as late", () => {
    const t = task({ dueAt: daysAgo(2), steps: [step("DIAGNOSTIC", "COMPLETE", daysAgo(1.5)), step("TEACHING", "COMPLETE", daysAgo(1)), step("INDEPENDENT_EXIT", "COMPLETE", daysAgo(1))] });
    const w = parentWork([t], NOW);
    assert.equal(w.late, 1);
    assert.equal(w.onTime, 0);
  });

  it("not opened yet, started, and past the due date read differently", () => {
    assert.equal(taskState(task({ steps: [step("DIAGNOSTIC", "READY")] }), NOW), "NOT_STARTED");
    assert.equal(taskState(task({ steps: [step("DIAGNOSTIC", "COMPLETE", daysAgo(1)), step("TEACHING", "READY")] }), NOW), "STARTED");
    assert.equal(taskState(task({ dueAt: daysAgo(1), steps: [step("DIAGNOSTIC", "READY")] }), NOW), "OVERDUE");
  });

  it("a failed step is the teacher's to restart, never the child's fault", () => {
    assert.equal(taskState(task({ dueAt: daysAgo(1), steps: [step("DIAGNOSTIC", "FAILED")] }), NOW), "WITH_TEACHER");
  });

  it("a check the teacher ended before the child finished counts as missed; a cancelled one doesn't count", () => {
    const ended = task({ runStatus: "COMPLETE", steps: [step("DIAGNOSTIC", "READY")] });
    const cancelled = task({ runId: "r2", runStatus: "CANCELLED", steps: [step("DIAGNOSTIC", "READY")] });
    const w = parentWork([ended, cancelled], NOW);
    assert.equal(w.missed, 1);
    assert.equal(w.total, 1);
  });

  it("the next task is the open one due soonest, with an honest time estimate", () => {
    const later = task({ runId: "later", title: "Rational numbers · Topic check", kind: "TOPIC_CHECK", dueAt: daysAgo(-4), steps: [step("DIAGNOSTIC", "READY")] });
    const sooner = task({ runId: "sooner", dueAt: daysAgo(-1), steps: [step("DIAGNOSTIC", "COMPLETE", daysAgo(1)), step("TEACHING", "READY")] });
    const w = parentWork([later, sooner], NOW);
    assert.equal(w.next?.runId, "sooner");
    assert.equal(w.next?.minutesLeft, 15); // lesson 10 + final check 5
    assert.equal(w.openTasks[1]?.minutesLeft, 30); // whole check
    assert.equal(w.open, 2);
  });

  it("a check with no deadline sorts after those with one", () => {
    const none = task({ runId: "none", dueAt: null, launchedAt: daysAgo(5), steps: [step("DIAGNOSTIC", "READY")] });
    const due = task({ runId: "due", dueAt: daysAgo(-3), steps: [step("DIAGNOSTIC", "READY")] });
    assert.equal(parentWork([none, due], NOW).next?.runId, "due");
  });

  it("done checks older than the window drop out; open ones always count", () => {
    const old = task({ runId: "old", launchedAt: daysAgo(40), steps: [step("DIAGNOSTIC", "COMPLETE", daysAgo(39))] });
    const oldOpen = task({ runId: "oldOpen", launchedAt: daysAgo(40), dueAt: daysAgo(38), steps: [step("DIAGNOSTIC", "READY")] });
    const w = parentWork([old, oldOpen], NOW);
    assert.equal(w.total, 1);
    assert.equal(w.next?.state, "OVERDUE");
  });

  it("time left stops at a skipped step", () => {
    assert.equal(minutesLeft([step("DIAGNOSTIC", "COMPLETE", daysAgo(1)), step("TEACHING", "SKIPPED")]), 0);
  });

  it("checks are due two days after launch unless the teacher sets 1–30 days, or none", () => {
    const at = new Date("2026-10-10T09:00:00Z");
    assert.equal(dueAtFor({}, at)?.toISOString(), "2026-10-12T09:00:00.000Z");
    assert.equal(dueAtFor({ dueDays: 5 }, at)?.toISOString(), "2026-10-15T09:00:00.000Z");
    assert.equal(dueAtFor({ dueDays: 99 }, at)?.toISOString(), "2026-10-12T09:00:00.000Z");
    assert.equal(dueAtFor({ dueDays: null }, at), null);
  });
});

describe("parent invite email", () => {
  it("accepts real-looking addresses only, in lower case", () => {
    assert.equal(normalizeEmail("  Priya.Sharma@Gmail.com "), "priya.sharma@gmail.com");
    assert.equal(normalizeEmail("priya@gmail"), null);
    assert.equal(normalizeEmail("not an email"), null);
  });

  it("masks the address enough to spot a typo without revealing it", () => {
    assert.equal(maskEmail("priya.sharma@gmail.com"), "pr•••@gmail.com");
    assert.equal(maskEmail("ab@x.in"), "a•••@x.in");
  });

  it("carries the child's first name, class and teacher, never what they struggle with, and no link code", () => {
    const mail = parentInviteEmail({ to: "p@x.in", studentName: "Aarav Kumar", className: "Grade 8 B", teacherName: "Ms Sharma", webUrl: "https://cogna.in/" });
    assert.equal(mail.subject, "Aarav added you on Cogna");
    assert.match(mail.text, /https:\/\/cogna\.in\/parent\/dashboard/);
    assert.match(mail.text, /Grade 8 B with Ms Sharma/);
    assert.match(mail.text, /confirm your mobile number/);
    assert.doesNotMatch(mail.text, /Kumar/);
    assert.doesNotMatch(mail.text + mail.html, /code=|enter this code/i);
  });

  it("escapes names in the HTML", () => {
    const mail = parentInviteEmail({ to: "p@x.in", studentName: "<b>Aarav</b>", className: "8 & B", teacherName: "Ms Sharma", webUrl: "http://localhost:3000" });
    assert.doesNotMatch(mail.html, /<b>Aarav/);
    assert.match(mail.html, /8 &amp; B/);
  });
});
