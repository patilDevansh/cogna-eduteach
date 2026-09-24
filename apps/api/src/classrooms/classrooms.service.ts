import { randomBytes } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ClassroomAssignmentKind, ClassroomRunPhase, Prisma, UserRole } from "@cogna/database";
import { AccessActor, assertTeacher } from "../access/cogna-access";
import { PrismaService } from "../prisma/prisma.service";

const PHASE_KIND = {
  DIAGNOSTIC: ClassroomAssignmentKind.DIAGNOSTIC,
  TEACHING: ClassroomAssignmentKind.TEACHING,
  INDEPENDENT_EXIT: ClassroomAssignmentKind.INDEPENDENT_EXIT,
} as const;

@Injectable()
export class ClassroomsService {
  constructor(private readonly prisma: PrismaService) {}

  private async teacher(actor: AccessActor) {
    assertTeacher(actor);
    if (actor.role !== "teacher") throw new ForbiddenException("A teacher account is required.");
    const identityKey = `${actor.schoolId}:${actor.teacherEmail.toLowerCase()}`;
    const existing = await this.prisma.teacher.findUnique({ where: { identityKey } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: actor.teacherEmail, role: UserRole.TEACHER } });
      return tx.teacher.create({ data: { identityKey, userId: user.id, schoolId: actor.schoolId, name: actor.teacherEmail.split("@")[0]! } });
    });
  }

  private code() { return `CG-${randomBytes(3).toString("hex").toUpperCase()}`; }

  async listForTeacher(actor: AccessActor) {
    const teacher = await this.teacher(actor);
    return this.prisma.classroom.findMany({ where: { teacherId: teacher.id, archivedAt: null }, include: { _count: { select: { enrollments: true } }, runs: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
  }

  async create(actor: AccessActor, input: { name: string; grade: number; subjectId: string; joinCode?: string; isDemo?: boolean }) {
    const teacher = await this.teacher(actor);
    return this.prisma.classroom.create({ data: { teacherId: teacher.id, schoolId: teacher.schoolId, name: input.name.trim(), grade: input.grade, subjectId: input.subjectId.trim(), joinCode: (input.joinCode?.trim() || this.code()).toUpperCase(), isDemo: input.isDemo ?? false } });
  }

  async join(actor: AccessActor, input: { joinCode: string; rollNumber?: string; admissionNumber?: string }) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const classroom = await this.prisma.classroom.findUnique({ where: { joinCode: input.joinCode.trim().toUpperCase() } });
    if (!classroom || classroom.archivedAt) throw new NotFoundException("That class code was not found.");
    return this.prisma.classroomEnrollment.upsert({
      where: { classroomId_studentId: { classroomId: classroom.id, studentId: actor.studentId } },
      create: { classroomId: classroom.id, studentId: actor.studentId, rollNumber: input.rollNumber?.trim(), admissionNumber: input.admissionNumber?.trim() },
      update: { leftAt: null, rollNumber: input.rollNumber?.trim(), admissionNumber: input.admissionNumber?.trim() },
      include: { classroom: { select: { id: true, name: true, grade: true, subjectId: true, joinCode: true } } },
    });
  }

  private async ownedRun(actor: AccessActor, runId: string) {
    const teacher = await this.teacher(actor);
    const run = await this.prisma.classroomRun.findFirst({ where: { id: runId, classroom: { teacherId: teacher.id } }, include: { classroom: true } });
    if (!run) throw new NotFoundException("Classroom session not found.");
    return run;
  }

  async createRun(actor: AccessActor, classroomId: string, input: { title: string; topicId: string; config?: Record<string, unknown> }) {
    const teacher = await this.teacher(actor);
    const classroom = await this.prisma.classroom.findFirst({ where: { id: classroomId, teacherId: teacher.id, archivedAt: null } });
    if (!classroom) throw new NotFoundException("Classroom not found.");
    return this.prisma.classroomRun.create({ data: { classroomId, title: input.title.trim(), topicId: input.topicId.trim(), config: (input.config ?? {}) as Prisma.InputJsonValue } });
  }

  async launchPhase(actor: AccessActor, runId: string, phase: keyof typeof PHASE_KIND) {
    const run = await this.ownedRun(actor, runId);
    const enrollmentIds = (await this.prisma.classroomEnrollment.findMany({ where: { classroomId: run.classroomId, leftAt: null }, select: { id: true } })).map((row) => row.id);
    if (!enrollmentIds.length) throw new BadRequestException("Enroll at least one student before launching.");
    const kind = PHASE_KIND[phase];
    const prerequisites = phase === "TEACHING" ? ClassroomAssignmentKind.DIAGNOSTIC : phase === "INDEPENDENT_EXIT" ? ClassroomAssignmentKind.TEACHING : null;
    const previous = prerequisites ? await this.prisma.classroomAssignment.findMany({ where: { runId, kind: prerequisites, enrollmentId: { in: enrollmentIds } } }) : [];
    if (prerequisites && (previous.length !== enrollmentIds.length || previous.some((row) => row.status !== "COMPLETE"))) {
      throw new BadRequestException(phase === "TEACHING" ? "Wait for every enrolled student to complete the diagnostic before sending teaching." : "Wait for every student to complete personalized teaching before sending the independent exit check.");
    }
    const previousByEnrollment = new Map(previous.map((row) => [row.enrollmentId, row]));
    const newAssignments = enrollmentIds.map((enrollmentId) => {
        const prior = previousByEnrollment.get(enrollmentId);
        const payload = { ...(run.config as Record<string, unknown>), sourceAssignmentId: prior?.id, diagnosticSessionId: prior?.diagnosticSessionId, videoAssignmentId: prior?.videoAssignmentId } as Prisma.InputJsonValue;
        return { runId, enrollmentId, kind, status: "READY" as const, availableAt: new Date(), videoAssignmentId: prior?.videoAssignmentId, diagnosticSessionId: prior?.diagnosticSessionId, payload };
      });
    await this.prisma.$transaction([
      this.prisma.classroomAssignment.createMany({ data: newAssignments, skipDuplicates: true }),
      this.prisma.classroomRun.update({ where: { id: runId }, data: { phase: phase as ClassroomRunPhase, status: "LIVE", startedAt: run.startedAt ?? new Date() } }),
    ]);
    return this.report(actor, runId);
  }

  async assignmentsForStudent(actor: AccessActor) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    return this.prisma.classroomAssignment.findMany({ where: { enrollment: { studentId: actor.studentId, leftAt: null }, status: { in: ["READY", "IN_PROGRESS"] } }, include: { run: { include: { classroom: { select: { name: true, subjectId: true, grade: true } } } } }, orderBy: { availableAt: "asc" } });
  }

  private async ownedAssignment(actor: AccessActor, id: string) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const row = await this.prisma.classroomAssignment.findFirst({ where: { id, enrollment: { studentId: actor.studentId } } });
    if (!row) throw new NotFoundException("Assignment not found.");
    return row;
  }

  async startAssignment(actor: AccessActor, id: string) {
    const assignment = await this.ownedAssignment(actor, id);
    if (assignment.status === "COMPLETE") throw new BadRequestException("This assignment is already complete.");
    if (assignment.status !== "READY" && assignment.status !== "IN_PROGRESS") throw new BadRequestException("This assignment is not ready.");
    return this.prisma.classroomAssignment.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: assignment.startedAt ?? new Date() } });
  }

  async completeAssignment(actor: AccessActor, id: string, input: { diagnosticSessionId?: string; videoAssignmentId?: string; result: Record<string, unknown> }) {
    const assignment = await this.ownedAssignment(actor, id);
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    if (assignment.status === "COMPLETE") return assignment;
    let trustedResult: Record<string, unknown>;
    let diagnosticSessionId = assignment.diagnosticSessionId ?? input.diagnosticSessionId;
    let videoAssignmentId = assignment.videoAssignmentId ?? input.videoAssignmentId;
    if (assignment.kind === ClassroomAssignmentKind.DIAGNOSTIC) {
      if (!diagnosticSessionId) throw new BadRequestException("A completed Lotus diagnostic is required.");
      const lotus = await this.prisma.lotusSessionRecord.findUnique({ where: { sessionId: diagnosticSessionId } });
      if (!lotus || lotus.studentId !== actor.studentId || lotus.status !== "COMPLETE") throw new BadRequestException("The Lotus diagnostic is not complete for this student.");
      const payload = lotus.payload as Record<string, unknown>;
      const finalReport = (payload.finalReport ?? {}) as Record<string, unknown>;
      trustedResult = { outcome: finalReport.outcome, startingPoint: finalReport.startingPoint, observedStrengths: finalReport.observedStrengths, uncertainties: finalReport.uncertainAreas, audits: Array.isArray(payload.audits) ? payload.audits.length : 0 };
      if (videoAssignmentId) {
        const video = await this.prisma.personalizedVideoAssignment.findFirst({ where: { id: videoAssignmentId, studentId: actor.studentId, lotusSessionId: lotus.id } });
        if (!video) videoAssignmentId = undefined;
      }
    } else {
      if (!videoAssignmentId) throw new BadRequestException("A personalized teaching assignment is required.");
      const video = await this.prisma.personalizedVideoAssignment.findFirst({ where: { id: videoAssignmentId, studentId: actor.studentId } });
      if (!video) throw new BadRequestException("This personalized lesson belongs to a different student.");
      const eventKind = assignment.kind === ClassroomAssignmentKind.TEACHING ? "COMPLETED" : "INDEPENDENT_EXIT";
      const event = await this.prisma.personalizedVideoEvent.findFirst({ where: { assignmentId: video.id, studentId: actor.studentId, kind: eventKind }, orderBy: { createdAt: "desc" } });
      if (!event) throw new BadRequestException(assignment.kind === ClassroomAssignmentKind.TEACHING ? "Complete the personalized lesson before finishing this assignment." : "Submit the independent exit check before finishing this assignment.");
      if (assignment.kind === ClassroomAssignmentKind.TEACHING) {
        const rawScore = input.result?.gameScore;
        const gameScore = typeof rawScore === "number" && Number.isFinite(rawScore) ? Math.max(0, Math.min(300, Math.round(rawScore))) : 0;
        trustedResult = { lessonStatus: video.status, delivery: video.assetId ? "VIDEO" : "HTML_FALLBACK", watched: true, gameScore, gameMaxScore: 300 };
      } else {
        trustedResult = { prompt: event.exitPrompt, answer: event.exitAnswer, working: event.exitWorking, correct: event.exitCorrect, independent: true };
      }
    }
    const completed = await this.prisma.classroomAssignment.update({ where: { id }, data: { status: "COMPLETE", completedAt: new Date(), diagnosticSessionId, videoAssignmentId, result: trustedResult as Prisma.InputJsonValue } });
    const remaining = await this.prisma.classroomAssignment.count({ where: { runId: assignment.runId, kind: assignment.kind, status: { not: "COMPLETE" } } });
    if (remaining === 0 && assignment.kind === ClassroomAssignmentKind.DIAGNOSTIC) {
      await this.prisma.classroomRun.update({ where: { id: assignment.runId }, data: { phase: "CLASS_REPORT", status: "PAUSED" } });
    }
    if (remaining === 0 && assignment.kind === ClassroomAssignmentKind.INDEPENDENT_EXIT) {
      await this.prisma.classroomRun.update({ where: { id: assignment.runId }, data: { phase: "FINAL_REPORT", status: "COMPLETE", completedAt: new Date() } });
    }
    return completed;
  }

  async report(actor: AccessActor, runId: string) {
    const run = await this.ownedRun(actor, runId);
    const assignments = await this.prisma.classroomAssignment.findMany({ where: { runId }, include: { enrollment: { include: { student: { select: { id: true, name: true } } } } }, orderBy: { enrollment: { joinedAt: "asc" } } });
    const byKind = Object.values(ClassroomAssignmentKind).map((kind) => { const rows = assignments.filter((row) => row.kind === kind); return { kind, total: rows.length, ready: rows.filter((row) => row.status === "READY").length, inProgress: rows.filter((row) => row.status === "IN_PROGRESS").length, complete: rows.filter((row) => row.status === "COMPLETE").length }; });
    const results = assignments.map((row) => row.result).filter((value): value is Prisma.JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value)) as Array<Record<string, unknown>>;
    const tally = (field: string) => results.reduce<Record<string, number>>((acc, result) => { const value = result[field]; if (typeof value === "string" && value) acc[value] = (acc[value] ?? 0) + 1; return acc; }, {});
    const tallyList = (field: string) => results.reduce<Record<string, number>>((acc, result) => { const values = result[field]; if (Array.isArray(values)) for (const value of values) if (typeof value === "string" && value) acc[value] = (acc[value] ?? 0) + 1; return acc; }, {});
    const exitRows = assignments.filter((row) => row.kind === ClassroomAssignmentKind.INDEPENDENT_EXIT && row.status === "COMPLETE");
    const exitVerified = exitRows.filter((row) => Boolean((row.result as Record<string, unknown> | null)?.correct)).length;
    return {
      run,
      progress: byKind,
      summary: {
        enrolled: new Set(assignments.map((row) => row.enrollmentId)).size,
        diagnosticOutcomes: tally("outcome"),
        observedStrengths: tallyList("observedStrengths"),
        uncertaintyAreas: tallyList("uncertainties"),
        lessonDeliveries: tally("delivery"),
        independentExit: { completed: exitRows.length, verified: exitVerified, needsReview: exitRows.length - exitVerified },
      },
      students: assignments.map((row) => ({ assignmentId: row.id, studentId: row.enrollment.student.id, studentName: row.enrollment.student.name, kind: row.kind, status: row.status, result: row.result })),
    };
  }
}
