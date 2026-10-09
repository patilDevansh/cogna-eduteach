/**
 * Parent ↔ school connections and the teacher's controls during a check,
 * against the real local Postgres (same local-only gate as the other
 * database specs): a parent claims a school-made student with the code from
 * school, hears when a check finishes or catch-up is set, and the teacher can
 * restart one student, pause, set a time limit, and remind latecomers.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient, UserRole } from "@cogna/database";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";
import { ClassroomEventsService, type StudentEvent } from "../../src/classrooms/classroom-events";
import { ParentsService } from "../../src/parents/parents.service";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";

function configuredLocalDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return localOnly(process.env.DATABASE_URL.trim());
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((candidate) => {
    try {
      return readFileSync(candidate, "utf8").includes("DATABASE_URL=");
    } catch {
      return false;
    }
  });
  if (!path) throw new Error("No local database configuration was found for the class-connections gate.");
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  const value = line?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("DATABASE_URL is blank in the local configuration.");
  return localOnly(value);
}

function localOnly(value: string): string {
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") throw new Error("The class-connections gate only runs against a local development database.");
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: configuredLocalDatabaseUrl() });
const tag = `classconn_${Date.now()}`;
const teacherEmail = `${tag}@school.test`;
const teacher = { role: "teacher", teacherEmail, schoolId: tag } as never;
const events = new ClassroomEventsService(prisma as never);
const classrooms = new ClassroomsService(prisma as never, undefined, events);
const parents = new ParentsService(prisma as never, {} as never, classrooms, {} as never);
const lotusServices: LotusService[] = [];
let classroomId = "";
let parentId = "";
let secondParentId = "";

before(async () => {
  const teacherUser = await prisma.user.create({ data: { clerkId: `${tag}_teacher`, role: UserRole.TEACHER, teacher: { create: { identityKey: `${tag}:${teacherEmail}`, schoolId: tag, name: "Ms Rao" } } }, include: { teacher: true } });
  classroomId = (await prisma.classroom.create({ data: { teacherId: teacherUser.teacher!.id, schoolId: tag, name: "8A", grade: 8, subjectId: "math", joinCode: tag.slice(-10).toUpperCase() } })).id;
  parentId = (await prisma.user.create({ data: { clerkId: `${tag}_parent`, role: UserRole.PARENT, parent: { create: { name: "Asha's parent" } } }, include: { parent: true } })).parent!.id;
  secondParentId = (await prisma.user.create({ data: { clerkId: `${tag}_parent2`, role: UserRole.PARENT, parent: { create: { name: "Someone else" } } }, include: { parent: true } })).parent!.id;
});

after(async () => {
  lotusServices.forEach((s) => s.onModuleDestroy());
  const students = await prisma.classroomEnrollment.findMany({ where: { classroomId }, select: { studentId: true } });
  const ids = students.map((s) => s.studentId);
  await prisma.lotusSessionRecord.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.consent.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.student.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { OR: [{ clerkId: { startsWith: tag } }, { clerkId: `school_roster:${tag}` }] } });
  await prisma.$disconnect();
});

async function importOne(name: string) {
  const { students } = await classrooms.importStudents(teacher, classroomId, [{ name }]);
  return students[0]!;
}

/** A finished Lotus diagnostic for this step, as the student's own session would leave it. */
async function finishedDiagnostic(studentId: string, classroomAssignmentId: string, outcome: string) {
  const sessionId = `${tag}_${classroomAssignmentId}`;
  await prisma.lotusSessionRecord.create({
    data: { sessionId, studentId, status: "COMPLETE", phase: "REPORT", startedAt: new Date(), endedAt: new Date(), payload: { classroomAssignmentId, topic: "BRACKETS", audits: [], finalReport: { outcome, skills: [] } } },
  });
  return sessionId;
}

async function liveCheck(config: Record<string, unknown> = {}) {
  const run = await classrooms.createRun(teacher, classroomId, { title: "Linear equations in one variable · Diagnostic", topicId: "linear-equations", config });
  await classrooms.launchPhase(teacher, run.id, "DIAGNOSTIC");
  return run.id;
}

async function stepFor(runId: string, studentId: string) {
  return prisma.classroomAssignment.findFirstOrThrow({ where: { runId, kind: "DIAGNOSTIC", enrollment: { studentId } } });
}

describe("a parent claims a school-made student", () => {
  it("with the code from the slip, however it is typed, once", async () => {
    const issued = await importOne("Asha Verma");
    assert.match(issued.parentCode, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const claimed = await parents.claimStudent(parentId, ` ${issued.parentCode.replace("-", "").toLowerCase()} `);
    assert.equal(claimed.id, issued.studentId);

    const student = await prisma.student.findUniqueOrThrow({ where: { id: issued.studentId } });
    assert.equal(student.primaryParentId, parentId);
    assert.equal(student.parentLinkCodeHash, null, "the code is spent");
    assert.ok(await prisma.parentStudentLink.findUnique({ where: { parentId_studentId: { parentId, studentId: issued.studentId } } }));
    assert.equal(await prisma.consent.count({ where: { parentId, studentId: issued.studentId, consentType: "PRACTICE_CONSENT" } }), 1, "claiming is the parent's consent");
    assert.ok((await parents.listStudents(parentId)).some((s) => s.id === issued.studentId));

    await assert.rejects(parents.claimStudent(secondParentId, issued.parentCode), NotFoundException, "a used code never works again");
    const row = (await classrooms.roster(teacher, classroomId)).find((r) => r.studentId === issued.studentId);
    assert.equal(row?.parentLinked, true);
    await assert.rejects(classrooms.issueParentCode(teacher, classroomId, issued.studentId), ForbiddenException, "the school can't hand a linked child to anyone else");
  });

  it("an expired code fails; a new one from the teacher works and replaces the old", async () => {
    const issued = await importOne("Ben Thomas");
    await prisma.student.update({ where: { id: issued.studentId }, data: { parentLinkCodeExpiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(parents.claimStudent(parentId, issued.parentCode), NotFoundException);
    assert.equal((await classrooms.roster(teacher, classroomId)).find((r) => r.studentId === issued.studentId)?.parentCodeActive, false);

    const fresh = await classrooms.issueParentCode(teacher, classroomId, issued.studentId);
    assert.notEqual(fresh.parentCode, issued.parentCode);
    await prisma.student.update({ where: { id: issued.studentId }, data: { parentLinkCodeExpiresAt: new Date(Date.now() + 86_400_000) } });
    await assert.rejects(parents.claimStudent(parentId, issued.parentCode), NotFoundException, "the old code stopped working");
    assert.equal((await parents.claimStudent(secondParentId, fresh.parentCode)).id, issued.studentId);
  });

  it("a wrong code gets the same answer as any other failure", async () => {
    await assert.rejects(parents.claimStudent(parentId, "AAAAA-BBBBB"), /didn't work/);
  });
});

describe("parents hear from school", () => {
  it("when their child finishes a check, once, and never the school's placeholder account", async () => {
    const issued = await importOne("Chitra Nair");
    await parents.claimStudent(parentId, issued.parentCode);
    const runId = await liveCheck();
    const step = await stepFor(runId, issued.studentId);
    const sessionId = await finishedDiagnostic(issued.studentId, step.id, "ADVANCEMENT");
    await classrooms.completeAssignment({ role: "student", studentId: issued.studentId } as never, step.id, { diagnosticSessionId: sessionId, result: {} });

    const notes = await prisma.parentNotification.findMany({ where: { studentId: issued.studentId } });
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.parentId, parentId);
    assert.equal(notes[0]!.kind, "CHECK_FINISHED");
    assert.match(notes[0]!.body, /^Chitra finished the diagnostic on linear equations in one variable: nothing to fix right now\.$/);

    const feed = await parents.listNotifications(parentId);
    assert.ok(feed.unread >= 1);
    assert.ok(feed.items.some((n) => n.studentName === "Chitra Nair"));
    await parents.markNotificationsRead(parentId);
    assert.equal((await parents.listNotifications(parentId)).unread, 0);
  });

  it("when the teacher sets their child a catch-up", async () => {
    const issued = await importOne("Dev Shah");
    await parents.claimStudent(parentId, issued.parentCode);
    await liveCheck({ kind: "CATCH_UP", studentIds: [issued.studentId] });
    const note = await prisma.parentNotification.findFirstOrThrow({ where: { studentId: issued.studentId, kind: "CATCH_UP_SET" } });
    assert.match(note.body, /Ms Rao set Dev a short catch-up on linear equations in one variable/);
  });
});

describe("the teacher's controls during a check", () => {
  it("restart one student: their test starts again, and the old session is neither resumed nor counted", async () => {
    const issued = await importOne("Esha Rao");
    const runId = await liveCheck();
    const step = await stepFor(runId, issued.studentId);
    const oldSession = await finishedDiagnostic(issued.studentId, step.id, "ADVANCEMENT");
    await classrooms.completeAssignment({ role: "student", studentId: issued.studentId } as never, step.id, { diagnosticSessionId: oldSession, result: {} });
    await new Promise((r) => setTimeout(r, 5));

    await classrooms.restartStudent(teacher, runId, issued.studentId);
    const steps = await prisma.classroomAssignment.findMany({ where: { runId, enrollment: { studentId: issued.studentId } } });
    assert.deepEqual(steps.map((s) => [s.kind, s.status]), [["DIAGNOSTIC", "READY"]], "lesson and final question cleared");

    const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma);
    lotusServices.push(lotus);
    const fresh = await lotus.start(issued.studentId, "BRACKETS", step.id);
    assert.notEqual(fresh.sessionId, oldSession, "a restarted student is not handed their old test");
    await assert.rejects(
      classrooms.completeAssignment({ role: "student", studentId: issued.studentId } as never, step.id, { diagnosticSessionId: oldSession, result: {} }),
      /restarted/,
    );
  });

  it("pause stops starting steps and Lotus answers; resume lets them carry on", async () => {
    const issued = await importOne("Farah Ali");
    const runId = await liveCheck();
    const step = await stepFor(runId, issued.studentId);
    const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma);
    lotusServices.push(lotus);
    const session = await lotus.start(issued.studentId, "BRACKETS", step.id);

    const report = await classrooms.setPaused(teacher, runId, true);
    assert.ok(report.controls.pausedAt);
    await assert.rejects(classrooms.startAssignment({ role: "student", studentId: issued.studentId } as never, step.id), ConflictException);
    await assert.rejects(
      lotus.answer(session.sessionId, issued.studentId, { answer: "1", working: "", confidence: 50, responseTimeMs: 3000, didNotKnow: false, questionId: session.currentQuestion!.id, submissionId: `${tag}_paused` }),
      /paused/,
    );

    assert.equal((await classrooms.setPaused(teacher, runId, false)).controls.pausedAt, null);
    const started = await classrooms.startAssignment({ role: "student", studentId: issued.studentId } as never, step.id);
    assert.equal(started.status, "IN_PROGRESS");
  });

  it("a time limit ends the check when it runs out, closing unfinished steps", async () => {
    const issued = await importOne("Gita Menon");
    const runId = await liveCheck();
    const report = await classrooms.setTimeLimit(teacher, runId, 15);
    assert.ok(Date.parse(report.controls.endsAt!) > Date.now() + 14 * 60_000);
    const run = await prisma.classroomRun.findUniqueOrThrow({ where: { id: runId } });
    await prisma.classroomRun.update({ where: { id: runId }, data: { config: { ...(run.config as object), endsAt: new Date(Date.now() - 1000).toISOString() } } });

    await classrooms.settleLiveChecks();
    assert.equal((await prisma.classroomRun.findUniqueOrThrow({ where: { id: runId } })).status, "COMPLETE");
    assert.equal((await stepFor(runId, issued.studentId)).status, "SKIPPED");
  });

  it("reminds students who haven't started, at most once a minute", async () => {
    const issued = await importOne("Hari Iyer");
    const runId = await liveCheck();
    const heard: StudentEvent[] = [];
    const stop = events.subscribeStudent(issued.studentId, (e) => heard.push(e));
    const first = await classrooms.nudgeNotStarted(teacher, runId);
    assert.ok(first.nudged >= 1);
    const again = await classrooms.nudgeNotStarted(teacher, runId);
    assert.equal(again.nudged, 0);
    assert.ok(again.alreadyReminded >= 1);
    await new Promise((r) => setTimeout(r, 600));
    stop();
    assert.deepEqual(heard.filter((e) => e.type === "nudge"), [{ type: "nudge", runId, title: "Linear equations in one variable · Diagnostic" }]);
    assert.ok((await stepFor(runId, issued.studentId)).payload && (((await stepFor(runId, issued.studentId)).payload as { nudgedAt?: string }).nudgedAt));
  });

  it("a late joiner gets the diagnostic in a teacher-advanced check too", async () => {
    const runId = await liveCheck({ autoAdvance: false });
    const late = await importOne("Isha Pillai");
    assert.equal((await stepFor(runId, late.studentId)).status, "READY");
  });
});
