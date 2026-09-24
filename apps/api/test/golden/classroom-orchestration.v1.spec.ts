import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";

const teacherActor = { role: "teacher", teacherEmail: "teacher@school.test", schoolId: "school-1" } as const;
const studentActor = { role: "student", studentId: "student-1" } as const;

function service(overrides: Record<string, unknown> = {}) {
  const prisma = {
    teacher: { findUnique: async () => ({ id: "teacher-1", schoolId: "school-1" }) },
    classroom: { findUnique: async () => ({ id: "class-1", joinCode: "MATH-8A", archivedAt: null }), findMany: async () => [] },
    classroomEnrollment: { findMany: async () => [{ id: "enrol-1" }], upsert: async (args: unknown) => args },
    classroomRun: { findFirst: async () => ({ id: "run-1", classroomId: "class-1", classroom: { id: "class-1" } }), update: async (args: unknown) => args },
    classroomAssignment: { findMany: async () => [], createMany: async (args: unknown) => args, findFirst: async () => null, update: async (args: unknown) => args, count: async () => 0 },
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

  it("requires every diagnostic before teaching is released", async () => {
    const classrooms = service({
      classroomAssignment: {
        findMany: async () => [{ id: "diagnostic-1", enrollmentId: "enrol-1", status: "IN_PROGRESS" }],
      },
    });
    await assert.rejects(() => classrooms.launchPhase(teacherActor, "run-1", "TEACHING"), BadRequestException);
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

  it("moves the run to a class report after the last diagnostic completes", async () => {
    let runUpdate: unknown;
    const classrooms = service({
      classroomAssignment: {
        findFirst: async () => ({ id: "a1", runId: "run-1", kind: "DIAGNOSTIC", status: "IN_PROGRESS" }),
        update: async (args: unknown) => args,
        count: async () => 0,
      },
      lotusSessionRecord: { findUnique: async () => ({ id: "lotus-row", studentId: "student-1", status: "COMPLETE", payload: { finalReport: { outcome: "ADVANCEMENT", observedStrengths: [], uncertainAreas: [] }, audits: [] } }) },
      classroomRun: { update: async (args: unknown) => { runUpdate = args; return args; } },
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
      classroomRun: { update: async (args: { data: Record<string, unknown> }) => { runUpdate = args; return args; } },
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
