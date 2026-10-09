/**
 * A class assignment has one Lotus session. A student who refreshes, opens a
 * second tab, or signs in on another device mid-test must get the same
 * session back, not a fresh test from question one. Runs against the real
 * local Postgres with the same local-only gate as the other Lotus database
 * specs.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, UserRole } from "@cogna/database";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";

function configuredLocalDatabaseUrl(): string {
  // CI sets DATABASE_URL (a throwaway local Postgres); on a dev machine it lives in packages/database/.env.
  if (process.env.DATABASE_URL) return localOnly(process.env.DATABASE_URL.trim());
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((candidate) => {
    try {
      return readFileSync(candidate, "utf8").includes("DATABASE_URL=");
    } catch {
      return false;
    }
  });
  if (!path) throw new Error("No local database configuration was found for the Lotus assignment-resume gate.");
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  const value = line?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("DATABASE_URL is blank in the local Lotus configuration.");
  return localOnly(value);
}

function localOnly(value: string): string {
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error("The Lotus assignment-resume gate only runs against a local development database.");
  }
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: configuredLocalDatabaseUrl() });
const tag = `lotus_resume_${Date.now()}`;
const userIds: string[] = [];
const services: LotusService[] = [];

function service(): LotusService {
  const created = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma);
  services.push(created);
  return created;
}

/** A teacher's class with one enrolled student and one diagnostic assignment per call. */
let studentId = "";
let enrollmentId = "";
let classroomId = "";
async function assignment(): Promise<string> {
  // One diagnostic per student per check, so each assignment gets its own check.
  const run = await prisma.classroomRun.create({ data: { classroomId, title: "Brackets check", topicId: "brackets", status: "LIVE" } });
  const row = await prisma.classroomAssignment.create({ data: { runId: run.id, enrollmentId, kind: "DIAGNOSTIC", status: "READY", availableAt: new Date() } });
  return row.id;
}

before(async () => {
  const parentUser = await prisma.user.create({ data: { clerkId: `${tag}_parent`, role: UserRole.PARENT, parent: { create: { name: "Resume parent" } } }, include: { parent: true } });
  const teacherUser = await prisma.user.create({ data: { clerkId: `${tag}_teacher`, role: UserRole.TEACHER, teacher: { create: { identityKey: `${tag}_teacher`, schoolId: tag, name: "Resume teacher" } } }, include: { teacher: true } });
  userIds.push(parentUser.id, teacherUser.id);
  const student = await prisma.student.create({ data: { primaryParentId: parentUser.parent!.id, name: "Resume student", accessCodeHash: `${tag}_code` } });
  studentId = student.id;
  const classroom = await prisma.classroom.create({ data: { teacherId: teacherUser.teacher!.id, schoolId: tag, name: "8A", grade: 8, subjectId: "math", joinCode: tag.slice(-12).toUpperCase() } });
  classroomId = classroom.id;
  enrollmentId = (await prisma.classroomEnrollment.create({ data: { classroomId, studentId } })).id;
});

after(async () => {
  services.forEach((s) => s.onModuleDestroy());
  await prisma.lotusSessionRecord.deleteMany({ where: { studentId } });
  // Users cascade to their parent and teacher; the student, class and its assignments go with them.
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Lotus — one session per class assignment", () => {
  it("starting the same assignment again returns the session already started", async () => {
    const id = await assignment();
    const first = await service().start(studentId, "BRACKETS", id);
    // A fresh service stands in for a restarted server: the session must come back from the database.
    const again = await service().start(studentId, "BRACKETS", id);
    assert.equal(again.sessionId, first.sessionId, "a refresh must resume, not restart");
    assert.equal(again.status, "ACTIVE");
    assert.equal(await prisma.lotusSessionRecord.count({ where: { studentId, payload: { path: ["classroomAssignmentId"], equals: id } } }), 1);
  });

  it("two tabs starting at the same moment share one session", async () => {
    const id = await assignment();
    const lotus = service();
    const [a, b] = await Promise.all([lotus.start(studentId, "BRACKETS", id), lotus.start(studentId, "BRACKETS", id)]);
    assert.equal(a.sessionId, b.sessionId);
    assert.equal(await prisma.lotusSessionRecord.count({ where: { studentId, payload: { path: ["classroomAssignmentId"], equals: id } } }), 1);
  });

  it("a different assignment, or no assignment, still gets its own session", async () => {
    const lotus = service();
    const one = await lotus.start(studentId, "BRACKETS", await assignment());
    const other = await lotus.start(studentId, "BRACKETS", await assignment());
    const practice = await lotus.start(studentId, "BRACKETS");
    const practiceAgain = await lotus.start(studentId, "BRACKETS");
    assert.notEqual(one.sessionId, other.sessionId);
    assert.notEqual(practice.sessionId, practiceAgain.sessionId, "self-practice outside a class keeps starting fresh");
  });

  it("another student's assignment id does not hand over that student's session", async () => {
    const id = await assignment();
    const owner = await service().start(studentId, "BRACKETS", id);
    const stranger = await service().start(`${tag}_stranger`, "BRACKETS", id);
    assert.notEqual(stranger.sessionId, owner.sessionId);
    await prisma.lotusSessionRecord.deleteMany({ where: { studentId: `${tag}_stranger` } });
  });

  it("the teacher's class report shows a test being taken as active, found through its step", async () => {
    const id = await assignment();
    await prisma.classroomAssignment.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
    const session = await service().start(studentId, "BRACKETS", id);
    const step = await prisma.classroomAssignment.findUniqueOrThrow({ where: { id } });
    const classReport = (new ClassroomsService(prisma as never) as unknown as {
      classReport: (classroomId: string, studentIds: string[] | null, rows: unknown[]) => Promise<{ students: Array<{ studentId: string; activity?: { state: string; answeredSoFar?: number; lastActiveAt: string | null } }> }>;
    }).classReport.bind(new ClassroomsService(prisma as never));
    const report = await classReport(classroomId, [studentId], [step]);
    const activity = report.students.find((r) => r.studentId === studentId)?.activity;
    assert.equal(activity?.state, "WORKING");
    assert.equal(activity?.answeredSoFar, 0);
    assert.ok(activity?.lastActiveAt && new Date(activity.lastActiveAt) >= new Date(session.startedAt));
  });
});
