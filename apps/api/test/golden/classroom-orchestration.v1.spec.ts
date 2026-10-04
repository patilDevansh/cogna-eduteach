import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";

const teacherActor = { role: "teacher", teacherEmail: "teacher@school.test", schoolId: "school-1" } as const;
const studentActor = { role: "student", studentId: "student-1" } as const;

function service(overrides: Record<string, unknown> = {}) {
  const prisma = {
    teacher: { findUnique: async () => ({ id: "teacher-1", schoolId: "school-1" }) },
    classroom: { findUnique: async () => ({ id: "class-1", joinCode: "MATH-8A", archivedAt: null }), findMany: async () => [] },
    classroomEnrollment: { findMany: async () => [{ id: "enrol-1", rollNumber: null, student: { id: "s1", name: "A" } }], upsert: async (args: unknown) => args },
    classroomRun: { findFirst: async () => ({ id: "run-1", classroomId: "class-1", classroom: { id: "class-1" } }), update: async (args: unknown) => args },
    classroomAssignment: { findMany: async () => [], createMany: async (args: unknown) => args, findFirst: async () => null, update: async (args: unknown) => args, updateMany: async (args: unknown) => args, count: async () => 0 },
    lotusSessionRecord: { findUnique: async () => null },
    personalizedVideoAssignment: { findFirst: async () => null },
    personalizedVideoEvent: { findFirst: async () => null },
    $transaction: async (actions: Array<Promise<unknown>>) => Promise.all(actions),
    ...overrides,
  };
  return new ClassroomsService(prisma as never);
}

describe("production classroom orchestration", () => {
  it("rejects class joining by a teacher actor", async () => {
    await assert.rejects(() => service().join(teacherActor, { joinCode: "MATH-8A" }), ForbiddenException);
  });

  it("in teacher-gated mode, requires every diagnostic before teaching is released", async () => {
    const classrooms = service({
      classroomRun: { findFirst: async () => ({ id: "run-1", classroomId: "class-1", config: { autoAdvance: false }, classroom: { id: "class-1" } }) },
      classroomAssignment: {
        findMany: async () => [{ id: "diagnostic-1", enrollmentId: "enrol-1", status: "IN_PROGRESS" }],
      },
    });
    await assert.rejects(() => classrooms.launchPhase(teacherActor, "run-1", "TEACHING"), BadRequestException);
  });

  it("in pilot mode (the default), a student's next stage opens as soon as they finish one", async () => {
    const created: Array<Record<string, unknown>> = [];
    const classrooms = service({
      classroomRun: { findUnique: async () => ({ id: "run-1", config: {} }), findFirst: async () => null, update: async (args: unknown) => args },
      classroomAssignment: {
        findFirst: async () => ({ id: "t1", runId: "run-1", enrollmentId: "enrol-1", kind: "TEACHING", status: "IN_PROGRESS", diagnosticSessionId: "lotus-1", videoAssignmentId: "video-1" }),
        update: async (args: { data: Record<string, unknown> }) => ({ id: "t1", runId: "run-1", enrollmentId: "enrol-1", kind: "TEACHING", diagnosticSessionId: "lotus-1", videoAssignmentId: "video-1", ...args.data }),
        upsert: async (args: { create: Record<string, unknown> }) => { created.push(args.create); return { id: "x1", ...args.create }; },
        count: async () => 1,
      },
      personalizedVideoAssignment: { findFirst: async () => ({ id: "video-1", status: "READY", script: { practice: { items: [1, 2, 3, 4] }, practiceAttempts: { p1: { tries: 1, correct: true } } } }) },
      personalizedVideoEvent: { findFirst: async () => ({ id: "ev-1" }) },
    });
    const done = await classrooms.completeAssignment(studentActor, "t1", { result: {} }) as { next: { kind: string } | null; result: { practice: { correct: number } } };
    assert.equal(done.next?.kind, "INDEPENDENT_EXIT");
    assert.equal(created[0]?.status, "READY");
    assert.equal(done.result.practice.correct, 1, "practice is read from the server record");
  });

  it("lets a signed student join by code without exposing another student's enrollment", async () => {
    let received: Record<string, unknown> | undefined;
    const classrooms = service({
      classroomEnrollment: {
        findMany: async () => [{ id: "enrol-1" }],
        upsert: async (args: Record<string, unknown>) => { received = args; return { id: "enrol-1" }; },
      },
    });
    await classrooms.join(studentActor, { joinCode: "math-8a", rollNumber: "12" });
    assert.deepEqual((received?.where as { classroomId_studentId: unknown }).classroomId_studentId, { classroomId: "class-1", studentId: "student-1" });
  });

  it("aggregates diagnostic and independent-exit evidence separately", async () => {
    const rows = [
      { id: "a1", enrollmentId: "e1", kind: "DIAGNOSTIC", status: "COMPLETE", result: { outcome: "TARGETED_REMEDIATION" }, enrollment: { joinedAt: new Date(), student: { id: "s1", name: "A" } } },
      { id: "a2", enrollmentId: "e1", kind: "TEACHING", status: "COMPLETE", result: { delivery: "VIDEO", gameScore: 300 }, enrollment: { joinedAt: new Date(), student: { id: "s1", name: "A" } } },
      { id: "a3", enrollmentId: "e1", kind: "INDEPENDENT_EXIT", status: "COMPLETE", result: { correct: true }, enrollment: { joinedAt: new Date(), student: { id: "s1", name: "A" } } },
    ];
    const classrooms = service({ classroomAssignment: { findMany: async () => rows } });
    const report = await classrooms.report(teacherActor, "run-1") as { summary: { diagnosticOutcomes: Record<string, number>; independentExit: { verified: number } }; progress: Array<{ kind: string; complete: number }> };
    assert.equal(report.summary.diagnosticOutcomes.TARGETED_REMEDIATION, 1);
    assert.equal(report.summary.independentExit.verified, 1);
    assert.equal(report.progress.find(row => row.kind === "TEACHING")?.complete, 1);
  });

  it("uses the unique run, enrollment, and kind key when a stage is relaunched", async () => {
    let createArgs: { data?: Array<Record<string, unknown>>; skipDuplicates?: boolean } | undefined;
    const classrooms = service({ classroomAssignment: {
      findMany: async () => [],
      createMany: async (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => { createArgs = args; return args; },
    } });
    await classrooms.launchPhase(teacherActor, "run-1", "DIAGNOSTIC");
    assert.equal(createArgs?.skipDuplicates, true);
    assert.deepEqual(createArgs?.data?.[0] && { runId: createArgs.data[0].runId, enrollmentId: createArgs.data[0].enrollmentId, kind: createArgs.data[0].kind }, { runId: "run-1", enrollmentId: "enrol-1", kind: "DIAGNOSTIC" });
  });

  it("queries ready work through the signed student's own enrollment only", async () => {
    let where: unknown;
    const classrooms = service({ classroomAssignment: {
      findMany: async (args: { where: unknown }) => { where = args.where; return []; },
    } });
    await classrooms.assignmentsForStudent(studentActor);
    assert.deepEqual((where as { enrollment: unknown }).enrollment, { studentId: "student-1", leftAt: null });
  });

  it("in teacher-gated mode, moves the run to a class report after the last diagnostic completes", async () => {
    let runUpdate: unknown;
    const classrooms = service({
      classroomAssignment: {
        findFirst: async () => ({ id: "a1", runId: "run-1", kind: "DIAGNOSTIC", status: "IN_PROGRESS" }),
        update: async (args: unknown) => args,
        count: async () => 0,
      },
      lotusSessionRecord: { findUnique: async () => ({ id: "lotus-row", studentId: "student-1", status: "COMPLETE", payload: { finalReport: { outcome: "ADVANCEMENT", observedStrengths: [], uncertainAreas: [] }, audits: [] } }) },
      classroomRun: { findUnique: async () => ({ id: "run-1", config: { autoAdvance: false } }), update: async (args: unknown) => { runUpdate = args; return args; } },
    });
    await classrooms.completeAssignment(studentActor, "a1", { diagnosticSessionId: "lotus-1", result: { outcome: "ADVANCEMENT" } });
    assert.deepEqual(runUpdate, { where: { id: "run-1" }, data: { phase: "CLASS_REPORT", status: "PAUSED" } });
  });

  it("publishes the final report after the last independent exit completes", async () => {
    let runUpdate: { data?: Record<string, unknown> } | undefined;
    const classrooms = service({
      classroomAssignment: {
        findFirst: async () => ({ id: "a3", runId: "run-1", kind: "INDEPENDENT_EXIT", status: "IN_PROGRESS", videoAssignmentId: "video-1" }),
        update: async (args: unknown) => args,
        count: async () => 0,
      },
      personalizedVideoAssignment: { findFirst: async () => ({ id: "video-1", studentId: "student-1" }) },
      personalizedVideoEvent: { findFirst: async () => ({ exitPrompt: "Solve x", exitAnswer: "2", exitWorking: "x=2", exitCorrect: true }) },
      classroomRun: { findUnique: async () => ({ id: "run-1", config: {} }), update: async (args: { data: Record<string, unknown> }) => { runUpdate = args; return args; } },
    });
    await classrooms.completeAssignment(studentActor, "a3", { result: { correct: true } });
    assert.equal(runUpdate?.data?.phase, "FINAL_REPORT");
    assert.equal(runUpdate?.data?.status, "COMPLETE");
    assert.ok(runUpdate?.data?.completedAt instanceof Date);
  });

  it("rejects a client claim when the persisted Lotus diagnostic is incomplete", async () => {
    const classrooms = service({
      classroomAssignment: { findFirst: async () => ({ id: "a1", runId: "run-1", kind: "DIAGNOSTIC", status: "IN_PROGRESS" }) },
      lotusSessionRecord: { findUnique: async () => ({ id: "lotus-row", studentId: "student-1", status: "ACTIVE", payload: {} }) },
    });
    await assert.rejects(() => classrooms.completeAssignment(studentActor, "a1", { diagnosticSessionId: "lotus-1", result: { outcome: "ADVANCEMENT" } }), BadRequestException);
  });

  it("rejects a teaching completion without a persisted video-completed event", async () => {
    const classrooms = service({
      classroomAssignment: { findFirst: async () => ({ id: "a2", runId: "run-1", kind: "TEACHING", status: "IN_PROGRESS", videoAssignmentId: "video-1" }) },
      personalizedVideoAssignment: { findFirst: async () => ({ id: "video-1", studentId: "student-1", status: "READY", assetId: "asset-1" }) },
      personalizedVideoEvent: { findFirst: async () => null },
    });
    await assert.rejects(() => classrooms.completeAssignment(studentActor, "a2", { videoAssignmentId: "video-1", result: { gameScore: 300 } }), BadRequestException);
  });

  it("rejects an independent-exit client claim without persisted exit evidence", async () => {
    const classrooms = service({
      classroomAssignment: { findFirst: async () => ({ id: "a3", runId: "run-1", kind: "INDEPENDENT_EXIT", status: "IN_PROGRESS", videoAssignmentId: "video-1" }) },
      personalizedVideoAssignment: { findFirst: async () => ({ id: "video-1", studentId: "student-1", status: "READY", assetId: "asset-1" }) },
      personalizedVideoEvent: { findFirst: async () => null },
    });
    await assert.rejects(() => classrooms.completeAssignment(studentActor, "a3", { videoAssignmentId: "video-1", result: { correct: true, independent: true } }), BadRequestException);
  });
});

describe("teacher class management", () => {
  const ownedClass = { findFirst: async () => ({ id: "class-1", teacherId: "teacher-1", archivedAt: null }) };

  it("renames only the teacher's own class, trimming the name", async () => {
    let data: unknown;
    const classrooms = service({ classroom: { count: async () => 1, update: async (args: { data: unknown }) => { data = args.data; return args; } } });
    await classrooms.rename(teacherActor, "class-1", "  Grade 8 · Section B  ");
    assert.deepEqual(data, { name: "Grade 8 · Section B" });
    await assert.rejects(() => service({ classroom: { count: async () => 0 } }).rename(teacherActor, "class-9", "X class"), NotFoundException);
  });

  it("ending a check skips every unfinished step and marks the check complete", async () => {
    const calls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    const classrooms = service({
      classroomRun: {
        findFirst: async () => ({ id: "run-1", classroomId: "class-1", status: "LIVE", config: {}, classroom: { id: "class-1" } }),
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { calls.push(args); return args; },
      },
      classroomAssignment: { findMany: async () => [], updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { calls.push(args); return args; } },
    });
    await classrooms.endRun(teacherActor, "run-1");
    assert.deepEqual(calls[0], { where: { runId: "run-1", status: { in: ["WAITING", "READY", "IN_PROGRESS"] } }, data: { status: "SKIPPED" } });
    assert.equal(calls[1]?.data.status, "COMPLETE");
  });

  it("an ended check stays ended: no second close, no relaunch", async () => {
    let touched = false;
    const ended = { findFirst: async () => ({ id: "run-1", classroomId: "class-1", status: "COMPLETE", config: {}, classroom: { id: "class-1" } }), update: async () => { touched = true; } };
    await service({ classroomRun: ended }).endRun(teacherActor, "run-1");
    assert.equal(touched, false);
    await assert.rejects(() => service({ classroomRun: ended }).launchPhase(teacherActor, "run-1", "DIAGNOSTIC"), BadRequestException);
  });

  it("a student cannot finish a step that was closed", async () => {
    const classrooms = service({ classroomAssignment: { findFirst: async () => ({ id: "a1", runId: "run-1", kind: "DIAGNOSTIC", status: "SKIPPED" }) } });
    await assert.rejects(() => classrooms.completeAssignment(studentActor, "a1", { result: {} }), BadRequestException);
  });

  it("the roster flags students who are also in another of the same teacher's classes", async () => {
    let otherWhere: Record<string, unknown> | undefined;
    const classrooms = service({
      classroom: ownedClass,
      classroomEnrollment: {
        findMany: async (args: { include: { student: { select: { classroomEnrollments: { where: Record<string, unknown> } } } } }) => {
          otherWhere = args.include.student.select.classroomEnrollments.where;
          return [{ rollNumber: "8A-03", joinedAt: new Date(0), student: { id: "s3", name: "Rohan", classroomEnrollments: [{ classroom: { id: "class-2", name: "Section B" } }] } }];
        },
      },
    });
    const roster = await classrooms.roster(teacherActor, "class-1");
    assert.deepEqual(roster[0]?.alsoIn, [{ id: "class-2", name: "Section B" }]);
    assert.deepEqual(otherWhere, { leftAt: null, classroomId: { not: "class-1" }, classroom: { teacherId: "teacher-1", archivedAt: null } });
  });

  it("another teacher's class has no roster and no remove", async () => {
    const notMine = service({ classroom: { findFirst: async () => null } });
    await assert.rejects(() => notMine.roster(teacherActor, "class-9"), NotFoundException);
    await assert.rejects(() => notMine.removeStudent(teacherActor, "class-9", "s1"), NotFoundException);
  });

  it("removing a student tags their open steps so a rejoin can reopen them", async () => {
    const calls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    const record = async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { calls.push(args); return args; };
    const classrooms = service({
      classroom: ownedClass,
      classroomEnrollment: { findUnique: async () => ({ id: "enrol-3", leftAt: null }), update: record },
      classroomAssignment: { updateMany: record },
    });
    await classrooms.removeStudent(teacherActor, "class-1", "s3");
    assert.deepEqual(calls[0], { where: { enrollmentId: "enrol-3", status: { in: ["WAITING", "READY", "IN_PROGRESS"] } }, data: { status: "SKIPPED", result: { removedFromClass: true } } });
    assert.ok(calls[1]?.data.leftAt instanceof Date);
    const gone = service({ classroom: ownedClass, classroomEnrollment: { findUnique: async () => ({ id: "enrol-3", leftAt: new Date() }) } });
    await assert.rejects(() => gone.removeStudent(teacherActor, "class-1", "s3"), NotFoundException);
  });

  it("rejoining reopens only removal-closed steps in running checks, and names the other classes", async () => {
    let reopen: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
    const classrooms = service({
      classroom: {
        findUnique: async () => ({ id: "class-1", teacherId: "teacher-1", joinCode: "MATH-8A", archivedAt: null }),
        findMany: async () => [{ id: "class-2", name: "Section B" }],
      },
      classroomEnrollment: { upsert: async () => ({ id: "enrol-3" }) },
      classroomAssignment: { updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { reopen = args; return args; } },
      classroomRun: { findFirst: async () => null },
    });
    const joined = await classrooms.join(studentActor, { joinCode: "MATH-8A" }) as { alsoIn: unknown };
    assert.deepEqual(reopen?.where, { enrollmentId: "enrol-3", status: "SKIPPED", run: { status: "LIVE" }, result: { path: ["removedFromClass"], equals: true } });
    assert.equal(reopen?.data.status, "READY");
    assert.deepEqual(joined.alsoIn, [{ id: "class-2", name: "Section B" }]);
  });
});
