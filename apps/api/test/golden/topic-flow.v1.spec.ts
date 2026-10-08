import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { StudentRow } from "../../src/classrooms/class-report";
import { ClassTopicsService, nextTopic, openSkills } from "../../src/classrooms/class-topics.service";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";
import { checkKindOf, checkStudentIds, topicGrowth, topicReadiness, type CheckRows } from "../../src/classrooms/topic-flow";
import { findTopic, topicsForGrade } from "../../src/classrooms/topic-catalogue";

const row = (studentId: string, over: Partial<StudentRow> = {}): StudentRow => ({ studentId, name: studentId, stage: "DONE", stageStatus: "COMPLETE", progress: "PENDING", ...over });
const check = (kind: CheckRows["kind"], rows: StudentRow[], live = false): CheckRows => ({ runId: `${kind}-${rows.length}`, kind, live, rows });
const ten = Array.from({ length: 10 }, (_, i) => ({ studentId: `s${i}`, name: `S${i}` }));

describe("topic catalogue", () => {
  it("lists Class 8 in NCERT order, with Cogna checks on every chapter", () => {
    const topics = topicsForGrade(8);
    assert.deepEqual(topics.map((t) => t.chapter), topics.map((_, i) => i + 1));
    assert.ok(topics.every((t) => t.lotus));
    assert.equal(findTopic("linear-equations")?.lotus, "BRACKETS");
    assert.equal(findTopic("factorisation")?.lotus, "FACTORISATION");
    assert.deepEqual(topicsForGrade(5), []);
  });
});

describe("next topic", () => {
  const t = (chapter: number, status: string, doneAt: Date | null = null) => ({ chapter, status, doneAt });
  it("is the next upcoming chapter after the one being taught, not chapter 1", () => {
    assert.equal(nextTopic([t(1, "UPCOMING"), t(12, "TEACHING"), t(13, "UPCOMING")])?.chapter, 13);
  });
  it("after the last finished topic when nothing is being taught, and wraps to the earliest left", () => {
    assert.equal(nextTopic([t(1, "UPCOMING"), t(2, "DONE", new Date(5)), t(3, "UPCOMING")])?.chapter, 3);
    assert.equal(nextTopic([t(1, "UPCOMING"), t(12, "DONE", new Date(5)), t(13, "DONE", new Date(9))])?.chapter, 1);
  });
});

describe("check kinds", () => {
  it("treats checks from before kinds existed as diagnostics, for the whole class", () => {
    assert.equal(checkKindOf({ autoAdvance: true }), "DIAGNOSTIC");
    assert.equal(checkKindOf({ kind: "CATCH_UP" }), "CATCH_UP");
    assert.equal(checkStudentIds({}), null);
    assert.deepEqual(checkStudentIds({ studentIds: ["a"] }), ["a"]);
  });
});

describe("topic readiness", () => {
  it("before any check, suggests a diagnostic", () => {
    assert.equal(topicReadiness([], ten, "Factorisation").recommendation.action, "DIAGNOSTIC");
  });

  it("while a check runs, waits and counts who has finished", () => {
    const r = topicReadiness([check("DIAGNOSTIC", [row("s0", { progress: "NO_GAP", outcome: "ADVANCEMENT" }), row("s1", { stage: "DIAGNOSTIC", stageStatus: "IN_PROGRESS" }), row("s2", { stage: "LESSON", stageStatus: "READY", outcome: "SOLID_GAP" })], true)], ten, "Factorisation");
    assert.equal(r.recommendation.action, "WAIT");
    assert.match(r.recommendation.text, /2 of 3 finished the questions, 1 on their lesson now/);
  });

  it("after only a diagnostic, asks for the topic check (gaps before teaching are expected)", () => {
    const rows = ten.map((s, i) => row(s.studentId, i < 3 ? { progress: "NO_GAP" } : { outcome: "SOLID_GAP", progress: "NOT_YET" }));
    assert.equal(topicReadiness([check("DIAGNOSTIC", rows)], ten, "Factorisation").recommendation.action, "TOPIC_CHECK");
  });

  it("after the topic check, sends a catch-up to exactly the students still stuck", () => {
    const rows = ten.map((s, i) => row(s.studentId, i < 6 ? { progress: "IMPROVED" } : { outcome: "SOLID_GAP", progress: "NOT_YET", startingPoint: { skillId: "k", name: "Sign pairs" } }));
    const r = topicReadiness([check("TOPIC_CHECK", rows)], ten, "Factorisation");
    assert.equal(r.recommendation.action, "CATCH_UP");
    assert.deepEqual(r.recommendation.studentIds, ["s6", "s7", "s8", "s9"]);
    assert.equal(r.students[6]?.need, "Sign pairs");
  });

  it("moves on once 80% have understood, and names who still needs help", () => {
    const rows = ten.map((s, i) => row(s.studentId, i < 8 ? { progress: "NO_GAP" } : { progress: "NOT_YET", outcome: "SOLID_GAP" }));
    const r = topicReadiness([check("TOPIC_CHECK", rows)], ten, "Factorisation");
    assert.equal(r.recommendation.action, "MOVE_ON");
    assert.deepEqual(r.recommendation.studentIds, ["s8", "s9"]);
  });

  it("a catch-up result replaces the earlier one only for its own students", () => {
    const topicCheck = check("TOPIC_CHECK", ten.map((s, i) => row(s.studentId, i < 7 ? { progress: "IMPROVED" } : { progress: "NOT_YET", outcome: "SOLID_GAP" })));
    const catchUp = check("CATCH_UP", [row("s7", { progress: "IMPROVED" }), row("s8", { progress: "IMPROVED" })]);
    const r = topicReadiness([topicCheck, catchUp], ten, "Factorisation");
    assert.equal(r.counts.UNDERSTOOD, 9);
    assert.equal(r.students[9]?.status, "STUCK");
    assert.equal(r.recommendation.action, "MOVE_ON");
  });

  it("a student who never got a check is not checked, not stuck", () => {
    const r = topicReadiness([check("DIAGNOSTIC", [row("s0", { progress: "NO_GAP" }), row("s1", { stage: "JOINED", stageStatus: "WAITING" })])], ten.slice(0, 2), "Factorisation");
    assert.equal(r.students[1]?.status, "NOT_CHECKED");
  });
});

describe("topic growth", () => {
  const k = (skillId: string, state: string) => ({ skillId, name: skillId.toUpperCase(), state });
  it("compares the first and latest check: secure counts, skills fixed, skills still a gap", () => {
    const g = topicGrowth([
      { date: new Date(2), kind: "TOPIC_CHECK", skills: [k("a", "SECURE"), k("b", "SECURE"), k("c", "CONFIRMED")] },
      { date: new Date(1), kind: "DIAGNOSTIC", skills: [k("a", "SECURE"), k("b", "CONFIRMED"), k("c", "CONFIRMED")] },
    ]);
    assert.equal(g?.firstSecure, 1);
    assert.equal(g?.latestSecure, 2);
    assert.deepEqual(g?.fixed, ["B"]);
    assert.deepEqual(g?.stillWorking, ["C"]);
  });

  it("a catch-up that re-tests two skills doesn't make the others look lost", () => {
    const g = topicGrowth([
      { date: new Date(1), kind: "DIAGNOSTIC", skills: [k("a", "SECURE"), k("b", "SECURE"), k("c", "CONFIRMED"), k("d", "SUSPECTED")] },
      { date: new Date(2), kind: "CATCH_UP", skills: [k("c", "SECURE"), k("d", "SECURE")] },
    ]);
    assert.equal(g?.firstSecure, 2);
    assert.equal(g?.latestSecure, 4);
    assert.deepEqual(g?.fixed, ["C", "D"]);
    assert.deepEqual(g?.stillWorking, []);
  });

  it("one check is a starting point, not growth", () => {
    const g = topicGrowth([{ date: new Date(1), kind: "DIAGNOSTIC", skills: [k("a", "CONFIRMED")] }]);
    assert.equal(g?.checks, 1);
    assert.deepEqual(g?.fixed, []);
    assert.equal(topicGrowth([]), null);
  });
});

const teacherActor = { role: "teacher", teacherEmail: "teacher@school.test", schoolId: "school-1" } as const;

function topics(overrides: Record<string, unknown> = {}) {
  const launched: Array<{ where: unknown }> = [];
  const created: Array<{ data: Record<string, unknown> }> = [];
  const prisma: Record<string, unknown> = {
    teacher: { findUnique: async () => ({ id: "teacher-1", schoolId: "school-1" }) },
    classroom: { findFirst: async () => ({ id: "class-1", grade: 8, archivedAt: null }) },
    classroomTopic: {
      findMany: async () => [{ id: "t1", classroomId: "class-1", topicId: "factorisation", position: 12, status: "TEACHING" }, { id: "t2", classroomId: "class-1", topicId: "old-chapter", position: 13, status: "UPCOMING" }],
      updateMany: async () => ({ count: 0 }),
      update: async () => ({}),
      createMany: async () => ({ count: 0 }),
    },
    classroomRun: { findFirst: async (args: { where: { status?: string } }) => (args.where.status === "LIVE" ? null : { id: "run-1", classroomId: "class-1", status: "DRAFT", config: { studentIds: ["s9"] }, startedAt: null }), findMany: async () => [], create: async (args: { data: Record<string, unknown> }) => { created.push(args); return { id: "run-1", ...args.data }; }, update: async () => ({}) },
    classroomEnrollment: {
      count: async () => 1,
      findMany: async (args: { where: unknown }) => { launched.push(args); return [{ id: "enrol-9", student: { id: "s9", name: "S9" } }]; },
    },
    classroomAssignment: { findMany: async () => [], createMany: async () => ({}) },
    $transaction: async (ops: unknown[]) => ops,
    ...overrides,
  };
  const classrooms = new ClassroomsService(prisma as never);
  return { service: new ClassTopicsService(prisma as never, classrooms), launched, created };
}

describe("catch-up focus", () => {
  it("targets each student's open skills from their latest finished check, else its starting point", () => {
    const skill = (skillId: string, state: string) => ({ skillId, name: skillId, state });
    const first = check("DIAGNOSTIC", [row("s1", { outcome: "SOLID_GAP", skills: [skill("A", "CONFIRMED"), skill("B", "SECURE")] })]);
    const later = check("TOPIC_CHECK", [
      row("s1", { outcome: "SOLID_GAP", skills: [skill("A", "SECURE"), skill("C", "CONFIRMED"), skill("D", "SUSPECTED")] }),
      row("s2", { outcome: "INSUFFICIENT_OR_CONFLICTING", startingPoint: { skillId: "E", name: "E" }, skills: [skill("E", "SECURE")] }),
      row("s3", { stage: "JOINED" }),
    ]);
    assert.deepEqual(openSkills([first, later], ["s1", "s2", "s3"]), { s1: ["C", "D"], s2: ["E"] });
  });
});

describe("starting checks on a topic", () => {
  it("refuses a topic Cogna has no questions for", async () => {
    await assert.rejects(() => topics().service.startCheck(teacherActor, "class-1", "old-chapter", { kind: "DIAGNOSTIC" }), /doesn't have questions/);
  });

  it("refuses while another check is running in the class", async () => {
    const { service } = topics({ classroomRun: { findFirst: async () => ({ title: "Factorisation · Diagnostic" }) } });
    await assert.rejects(() => service.startCheck(teacherActor, "class-1", "factorisation", { kind: "TOPIC_CHECK" }), /still running/);
  });

  it("a catch-up needs students who are in the class", async () => {
    await assert.rejects(() => topics().service.startCheck(teacherActor, "class-1", "factorisation", { kind: "CATCH_UP", studentIds: [] }), BadRequestException);
    const { service } = topics({ classroomEnrollment: { count: async () => 0, findMany: async () => [] } });
    await assert.rejects(() => service.startCheck(teacherActor, "class-1", "factorisation", { kind: "CATCH_UP", studentIds: ["outsider"] }), /aren't in this class/);
  });

  it("a catch-up is created for its students and launched only to them", async () => {
    const { service, launched, created } = topics();
    await service.startCheck(teacherActor, "class-1", "factorisation", { kind: "CATCH_UP", studentIds: ["s9", "s9"] });
    assert.equal(created[0]?.data.title, "Factorisation · Catch-up");
    assert.deepEqual((created[0]?.data.config as { studentIds: string[] }).studentIds, ["s9"]);
    assert.ok((created[0]?.data.config as { focus?: unknown }).focus, "the catch-up records what to check each student on");
    const launchQuery = launched.find((q) => JSON.stringify(q.where).includes('"in"'));
    assert.ok(launchQuery, "launch is limited to the catch-up's students");
  });

  it("moving on is refused while a check on the topic is still running", async () => {
    const { service } = topics({ classroomRun: { findFirst: async () => ({ id: "run-live" }), findMany: async () => [] } });
    await assert.rejects(() => service.setStatus(teacherActor, "class-1", "factorisation", "done"), /still running/);
  });
});

describe("live check counts", () => {
  it("a student sent a check but who hasn't opened it is not checked yet, not working on it", () => {
    const r = topicReadiness([check("DIAGNOSTIC", [row("s0", { stage: "DIAGNOSTIC", stageStatus: "READY" }), row("s1", { stage: "DIAGNOSTIC", stageStatus: "IN_PROGRESS" })], true)], ten.slice(0, 2), "Factorisation");
    assert.equal(r.students[0]?.status, "NOT_CHECKED");
    assert.equal(r.students[1]?.status, "IN_PROGRESS");
    assert.match(r.recommendation.text, /0 of 2 finished the questions/);
  });
});
