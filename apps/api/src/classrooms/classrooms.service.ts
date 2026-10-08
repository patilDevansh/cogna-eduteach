import { randomBytes, randomInt } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ClassroomAssignmentKind, ClassroomRunPhase, Prisma, UserRole } from "@cogna/database";
import { AccessActor, assertTeacher } from "../access/cogna-access";
import { hashAccessCode } from "../parents/access-code";
import { PrismaService } from "../prisma/prisma.service";
import { PersonalizedVideosService } from "../personalized-videos/personalized-videos.service";
import { findTopic } from "./topic-catalogue";
import type { LotusQuestionAudit } from "@cogna/shared";
import { confirmedByDepth, foldLedger } from "../lotus/lotus-factorisation";
import { buildClassReport, type StudentEvidence } from "./class-report";
import { autoAdvanceEnabled, nextStage, stagesAfterDiagnostic } from "./pilot-flow";
import { checkKindOf, checkStudentIds, type CheckRows } from "./topic-flow";

const PHASE_KIND = {
  DIAGNOSTIC: ClassroomAssignmentKind.DIAGNOSTIC,
  TEACHING: ClassroomAssignmentKind.TEACHING,
  INDEPENDENT_EXIT: ClassroomAssignmentKind.INDEPENDENT_EXIT,
} as const;

/** Student sign-in codes made by the school: no look-alike characters (0/O, 1/I/L), 8 long. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_IMPORT = 300;

export interface RosterImportRow {
  name: string;
  rollNumber?: string;
}

/** Marks a step closed by removing the student, so rejoining can reopen exactly those steps. */
const REMOVED_FROM_CLASS = "removedFromClass";

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly videos?: PersonalizedVideosService,
  ) {}

  /**
   * A class diagnostic the student finished but whose page never reported back
   * (tab closed, network dropped, report page never opened): settle it from the
   * stored session, so the teacher, the parent and the student's own next step
   * all move on. Waits two minutes after the session ended, giving the
   * student's own report page the first go.
   */
  /**
   * The lesson and exit steps, settled the same way: the lesson's own record
   * says it was finished (or both exit questions were sealed), but the page's
   * call to mark the class step done never arrived. A lesson waits 30 minutes
   * after it was watched, because its practice comes after; an exit 2.
   */
  private async settleFinishedLessonSteps(where: Prisma.ClassroomAssignmentWhereInput): Promise<void> {
    const open = await this.prisma.classroomAssignment.findMany({
      where: { ...where, kind: { in: [ClassroomAssignmentKind.TEACHING, ClassroomAssignmentKind.INDEPENDENT_EXIT] }, status: { in: ["READY", "IN_PROGRESS"] }, videoAssignmentId: { not: null } },
      select: { id: true, kind: true, videoAssignmentId: true, enrollment: { select: { studentId: true } } },
      take: 60,
    });
    for (const assignment of open) {
      const studentId = assignment.enrollment.studentId;
      const video = await this.prisma.personalizedVideoAssignment.findFirst({ where: { id: assignment.videoAssignmentId!, studentId }, select: { id: true, script: true } });
      if (!video) continue;
      const events = await this.prisma.personalizedVideoEvent.findMany({ where: { assignmentId: video.id, studentId, kind: assignment.kind === ClassroomAssignmentKind.TEACHING ? "COMPLETED" : "INDEPENDENT_EXIT", createdAt: { lt: new Date(Date.now() - (assignment.kind === ClassroomAssignmentKind.TEACHING ? 30 : 2) * 60_000) } }, select: { exitItem: true } });
      const hasTransfer = Boolean((video.script as { transfer?: unknown } | null)?.transfer);
      const done = assignment.kind === ClassroomAssignmentKind.TEACHING ? events.length > 0 : events.some((e) => (e.exitItem ?? 0) === 0) && (!hasTransfer || events.some((e) => e.exitItem === 1));
      if (!done) continue;
      try {
        await this.completeAssignment({ role: "student", studentId } as AccessActor, assignment.id, { videoAssignmentId: video.id, result: {} });
      } catch (error) {
        this.logger.warn(`Could not settle class step ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** A live check whose every step is done or skipped is complete. */
  private async closeRunsWithNothingOpen(classroomId: string): Promise<void> {
    const live = await this.prisma.classroomRun.findMany({ where: { classroomId, status: "LIVE" }, select: { id: true } });
    for (const run of live) {
      const [all, open] = await Promise.all([
        this.prisma.classroomAssignment.count({ where: { runId: run.id } }),
        this.prisma.classroomAssignment.count({ where: { runId: run.id, status: { in: ["READY", "IN_PROGRESS", "WAITING"] } } }),
      ]);
      if (all > 0 && open === 0) await this.prisma.classroomRun.update({ where: { id: run.id }, data: { phase: "FINAL_REPORT", status: "COMPLETE", completedAt: new Date() } });
    }
  }

  private async settleFinishedDiagnostics(where: Prisma.ClassroomAssignmentWhereInput): Promise<void> {
    if (!this.videos) return;
    await this.settleFinishedLessonSteps(where);
    const open = await this.prisma.classroomAssignment.findMany({
      where: { ...where, kind: ClassroomAssignmentKind.DIAGNOSTIC, status: { in: ["READY", "IN_PROGRESS"] }, startedAt: { not: null } },
      select: { id: true, enrollment: { select: { studentId: true } } },
      take: 60,
    });
    for (const assignment of open) {
      const studentId = assignment.enrollment.studentId;
      const lotus = await this.prisma.lotusSessionRecord.findFirst({
        where: { studentId, status: "COMPLETE", endedAt: { lt: new Date(Date.now() - 2 * 60_000) }, payload: { path: ["classroomAssignmentId"], equals: assignment.id } },
        orderBy: { startedAt: "desc" },
      });
      if (!lotus) continue;
      const actor = { role: "student", studentId } as AccessActor;
      try {
        const lesson = await this.videos.createAssignment({ studentId, lotusSessionId: lotus.sessionId }, { actor });
        await this.completeAssignment(actor, assignment.id, { diagnosticSessionId: lotus.sessionId, videoAssignmentId: lesson.id, result: {} });
      } catch (error) {
        // Retried on the next read; the student's own report page may still finish it first.
        this.logger.warn(`Could not settle class diagnostic ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

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
    return this.prisma.classroom.findMany({ where: { teacherId: teacher.id, archivedAt: null }, include: { _count: { select: { enrollments: true } }, runs: { orderBy: { createdAt: "desc" }, take: 12 } }, orderBy: { createdAt: "desc" } });
  }

  async create(actor: AccessActor, input: { name: string; grade: number; subjectId: string; joinCode?: string; isDemo?: boolean }) {
    const teacher = await this.teacher(actor);
    return this.prisma.classroom.create({ data: { teacherId: teacher.id, schoolId: teacher.schoolId, name: input.name.trim(), grade: input.grade, subjectId: input.subjectId.trim(), joinCode: (input.joinCode?.trim() || this.code()).toUpperCase(), isDemo: input.isDemo ?? false } });
  }

  async rename(actor: AccessActor, classroomId: string, name: string) {
    const teacher = await this.teacher(actor);
    const owned = await this.prisma.classroom.count({ where: { id: classroomId, teacherId: teacher.id, archivedAt: null } });
    if (!owned) throw new NotFoundException("Classroom not found.");
    return this.prisma.classroom.update({ where: { id: classroomId }, data: { name: name.trim() } });
  }

  async ownedClassroom(actor: AccessActor, classroomId: string) {
    const teacher = await this.teacher(actor);
    const classroom = await this.prisma.classroom.findFirst({ where: { id: classroomId, teacherId: teacher.id, archivedAt: null } });
    if (!classroom) throw new NotFoundException("Classroom not found.");
    return classroom;
  }

  /** Students currently in a class, each with any of this teacher's other classes they are also in (usually a wrong code). */
  async roster(actor: AccessActor, classroomId: string) {
    const classroom = await this.ownedClassroom(actor, classroomId);
    const rosterParent = await this.prisma.parent.findFirst({ where: { user: { clerkId: `school_roster:${classroom.schoolId ?? "default"}` } }, select: { id: true } });
    const enrollments = await this.prisma.classroomEnrollment.findMany({
      where: { classroomId, leftAt: null },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            primaryParentId: true,
            classroomEnrollments: {
              where: { leftAt: null, classroomId: { not: classroomId }, classroom: { teacherId: classroom.teacherId, archivedAt: null } },
              select: { classroom: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return enrollments.map((row) => ({
      studentId: row.student.id,
      name: row.student.name,
      rollNumber: row.rollNumber,
      joinedAt: row.joinedAt,
      alsoIn: row.student.classroomEnrollments.map((other) => other.classroom),
      schoolIssuedCode: Boolean(rosterParent) && row.student.primaryParentId === rosterParent?.id,
    }));
  }

  /**
   * Takes a student out of a class: their finished work stays in past results, anything still
   * open is skipped and tagged, so rejoining the same running check reopens it (join()).
   */
  async removeStudent(actor: AccessActor, classroomId: string, studentId: string) {
    await this.ownedClassroom(actor, classroomId);
    const enrollment = await this.prisma.classroomEnrollment.findUnique({ where: { classroomId_studentId: { classroomId, studentId } } });
    if (!enrollment || enrollment.leftAt) throw new NotFoundException("That student is not in this class.");
    await this.prisma.$transaction([
      this.prisma.classroomAssignment.updateMany({ where: { enrollmentId: enrollment.id, status: { in: ["WAITING", "READY", "IN_PROGRESS"] } }, data: { status: "SKIPPED", result: { [REMOVED_FROM_CLASS]: true } } }),
      this.prisma.classroomEnrollment.update({ where: { id: enrollment.id }, data: { leftAt: new Date() } }),
    ]);
    // If they were the last one a running check was waiting on, the check is finished.
    await this.closeRunsWithNothingOpen(classroomId);
    return { removed: true };
  }

  /**
   * Creates student accounts from a class list and enrols them. Returns each new sign-in code once
   * (only its hash is stored), so the teacher can print or download them. School-made students
   * belong to one "school roster" parent account until a real parent is linked.
   */
  async importStudents(actor: AccessActor, classroomId: string, rows: RosterImportRow[]) {
    const classroom = await this.ownedClassroom(actor, classroomId);
    const cleaned = (Array.isArray(rows) ? rows : []).map((row) => ({
      name: String(row?.name ?? "").replace(/\s+/g, " ").trim(),
      rollNumber: String(row?.rollNumber ?? "").trim() || undefined,
    }));
    if (!cleaned.length) throw new BadRequestException("Add at least one student.");
    if (cleaned.length > MAX_IMPORT) throw new BadRequestException(`Add at most ${MAX_IMPORT} students at a time.`);
    const bad = cleaned.findIndex((row) => row.name.length < 2 || row.name.length > 80 || (row.rollNumber?.length ?? 0) > 40);
    if (bad >= 0) throw new BadRequestException(`Line ${bad + 1}: a name needs 2–80 characters and a roll number at most 40.`);

    const parentId = await this.rosterParentId(classroom.schoolId);
    const created: Array<{ studentId: string; name: string; rollNumber?: string; accessCode: string }> = [];
    const enrollmentIds: string[] = [];
    for (const row of cleaned) {
      const accessCode = await this.freshAccessCode();
      const { student, enrollment } = await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({ data: { primaryParentId: parentId, name: row.name, grade: classroom.grade, accessCodeHash: hashAccessCode(accessCode) } });
        const enrollment = await tx.classroomEnrollment.create({ data: { classroomId, studentId: student.id, rollNumber: row.rollNumber } });
        return { student, enrollment };
      });
      enrollmentIds.push(enrollment.id);
      created.push({ studentId: student.id, name: row.name, rollNumber: row.rollNumber, accessCode });
    }
    await this.giveRunningCheck(classroomId, enrollmentIds);
    return { classroom: { id: classroom.id, name: classroom.name, joinCode: classroom.joinCode }, students: created };
  }

  /** A new sign-in code for a school-made student in this class (lost slip). The old code stops working. */
  async resetAccessCode(actor: AccessActor, classroomId: string, studentId: string) {
    const classroom = await this.ownedClassroom(actor, classroomId);
    const enrollment = await this.prisma.classroomEnrollment.findUnique({
      where: { classroomId_studentId: { classroomId, studentId } },
      include: { student: { select: { name: true, primaryParentId: true } } },
    });
    if (!enrollment || enrollment.leftAt) throw new NotFoundException("That student is not in this class.");
    // Never take over a family's own account: only codes the school issued can be reset here.
    if (enrollment.student.primaryParentId !== (await this.rosterParentId(classroom.schoolId))) {
      throw new ForbiddenException("This student signs in with their family's code. Ask the parent to reset it.");
    }
    const accessCode = await this.freshAccessCode();
    await this.prisma.student.update({ where: { id: studentId }, data: { accessCodeHash: hashAccessCode(accessCode) } });
    return { studentId, name: enrollment.student.name, rollNumber: enrollment.rollNumber, accessCode };
  }

  private async rosterParentId(schoolId: string | null): Promise<string> {
    const key = `school_roster:${schoolId ?? "default"}`;
    const user = await this.prisma.user.upsert({ where: { clerkId: key }, create: { clerkId: key, role: UserRole.PARENT }, update: {} });
    const parent = await this.prisma.parent.upsert({ where: { userId: user.id }, create: { userId: user.id, name: "School roster" }, update: {} });
    return parent.id;
  }

  /** Codes are stored only as hashes and sign-in takes the first match, so a new code must be unused. */
  private async freshAccessCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      if (!(await this.prisma.student.count({ where: { accessCodeHash: hashAccessCode(code) } }))) return code;
    }
    throw new Error("Could not generate a unique sign-in code.");
  }

  async join(actor: AccessActor, input: { joinCode: string; rollNumber?: string; admissionNumber?: string }) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const classroom = await this.prisma.classroom.findUnique({ where: { joinCode: input.joinCode.trim().toUpperCase() } });
    if (!classroom || classroom.archivedAt) throw new NotFoundException("That class code was not found.");
    const enrollment = await this.prisma.classroomEnrollment.upsert({
      where: { classroomId_studentId: { classroomId: classroom.id, studentId: actor.studentId } },
      create: { classroomId: classroom.id, studentId: actor.studentId, rollNumber: input.rollNumber?.trim(), admissionNumber: input.admissionNumber?.trim() },
      update: { leftAt: null, rollNumber: input.rollNumber?.trim(), admissionNumber: input.admissionNumber?.trim() },
      include: { classroom: { select: { id: true, name: true, grade: true, subjectId: true, joinCode: true } } },
    });
    // Rejoining after being removed reopens the steps the removal closed, in checks still running.
    // Steps the pilot flow skipped on purpose (no gap found) carry no tag and stay skipped.
    await this.prisma.classroomAssignment.updateMany({
      where: { enrollmentId: enrollment.id, status: "SKIPPED", run: { status: "LIVE" }, result: { path: [REMOVED_FROM_CLASS], equals: true } },
      data: { status: "READY", result: Prisma.DbNull, availableAt: new Date() },
    });
    await this.giveRunningCheck(classroom.id, [enrollment.id]);
    // A second section of the same teacher is usually a mistyped code: tell the student so they can say so.
    const alsoIn = await this.prisma.classroom.findMany({
      where: { id: { not: classroom.id }, teacherId: classroom.teacherId, archivedAt: null, enrollments: { some: { studentId: actor.studentId, leftAt: null } } },
      select: { id: true, name: true },
    });
    return { ...enrollment, alsoIn };
  }

  /** Pilot: anyone who arrives while a quick check is running (joined late, or added from the class list) gets it straight away. */
  private async giveRunningCheck(classroomId: string, enrollmentIds: string[]) {
    if (!enrollmentIds.length) return;
    const live = await this.prisma.classroomRun.findFirst({ where: { classroomId, status: "LIVE" }, orderBy: { createdAt: "desc" } });
    if (!live || !autoAdvanceEnabled(live.config) || checkStudentIds(live.config)) return;
    if (!(await this.prisma.classroomAssignment.count({ where: { runId: live.id, kind: ClassroomAssignmentKind.DIAGNOSTIC } }))) return;
    await this.prisma.classroomAssignment.createMany({
      data: enrollmentIds.map((enrollmentId) => ({ runId: live.id, enrollmentId, kind: ClassroomAssignmentKind.DIAGNOSTIC, status: "READY" as const, availableAt: new Date(), payload: live.config as Prisma.InputJsonValue })),
      skipDuplicates: true,
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
    if (run.status === "COMPLETE" || run.status === "CANCELLED") throw new BadRequestException("This check has ended. Start a new one.");
    const only = checkStudentIds(run.config);
    const enrollmentIds = (await this.prisma.classroomEnrollment.findMany({ where: { classroomId: run.classroomId, leftAt: null, ...(only ? { studentId: { in: only } } : {}) }, select: { id: true } })).map((row) => row.id);
    if (!enrollmentIds.length) throw new BadRequestException("Enroll at least one student before launching.");
    const kind = PHASE_KIND[phase];
    const prerequisites = phase === "TEACHING" ? ClassroomAssignmentKind.DIAGNOSTIC : phase === "INDEPENDENT_EXIT" ? ClassroomAssignmentKind.TEACHING : null;
    const previous = prerequisites ? await this.prisma.classroomAssignment.findMany({ where: { runId, kind: prerequisites, enrollmentId: { in: enrollmentIds } } }) : [];
    if (prerequisites && !autoAdvanceEnabled(run.config) && (previous.length !== enrollmentIds.length || previous.some((row) => row.status !== "COMPLETE"))) {
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

  /** Teacher ends a check early: work already done stays in the results; every unfinished step is skipped. */
  async endRun(actor: AccessActor, runId: string) {
    const run = await this.ownedRun(actor, runId);
    if (run.status !== "COMPLETE" && run.status !== "CANCELLED") {
      await this.prisma.$transaction([
        this.prisma.classroomAssignment.updateMany({ where: { runId, status: { in: ["WAITING", "READY", "IN_PROGRESS"] } }, data: { status: "SKIPPED" } }),
        this.prisma.classroomRun.update({ where: { id: runId }, data: { phase: "FINAL_REPORT", status: "COMPLETE", completedAt: new Date() } }),
      ]);
    }
    return this.report(actor, runId);
  }

  async assignmentsForStudent(actor: AccessActor) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    await this.settleFinishedDiagnostics({ enrollment: { studentId: actor.studentId, leftAt: null } });
    return this.prisma.classroomAssignment.findMany({ where: { enrollment: { studentId: actor.studentId, leftAt: null, classroom: { archivedAt: null } }, status: { in: ["READY", "IN_PROGRESS"] } }, include: { run: { include: { classroom: { select: { id: true, name: true, subjectId: true, grade: true } } } } }, orderBy: { availableAt: "asc" } });
  }

  /** The signed-in student's own classes and where they are in each one's latest check. */
  async classesForStudent(actor: AccessActor) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    return this.forStudent(actor.studentId);
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
    if (assignment.status === "SKIPPED") throw new BadRequestException("This step is closed. Ask your teacher if that's a mistake.");
    let trustedResult: Record<string, unknown>;
    let diagnosticSessionId = assignment.diagnosticSessionId ?? input.diagnosticSessionId;
    let videoAssignmentId = assignment.videoAssignmentId ?? input.videoAssignmentId;
    if (assignment.kind === ClassroomAssignmentKind.DIAGNOSTIC) {
      if (!diagnosticSessionId) throw new BadRequestException("A completed Lotus diagnostic is required.");
      const lotus = await this.prisma.lotusSessionRecord.findUnique({ where: { sessionId: diagnosticSessionId } });
      if (!lotus || lotus.studentId !== actor.studentId || lotus.status !== "COMPLETE") throw new BadRequestException("The Lotus diagnostic is not complete for this student.");
      const payload = lotus.payload as Record<string, unknown>;
      // The diagnostic must be the one taken for this check: same assignment when it says, and the check's topic.
      if (payload.classroomAssignmentId && payload.classroomAssignmentId !== assignment.id) throw new BadRequestException("That diagnostic was taken for a different check.");
      const run = await this.prisma.classroomRun.findUnique({ where: { id: assignment.runId }, select: { topicId: true } });
      const wanted = run ? findTopic(run.topicId)?.lotus : undefined;
      if (wanted && (payload.topic ?? "BRACKETS") !== wanted) throw new BadRequestException("That diagnostic is on a different topic from this check.");
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
      // A two-question exit (lantern gate) is finished only when both are sealed.
      const exitEvents = assignment.kind === ClassroomAssignmentKind.TEACHING ? [] : await this.prisma.personalizedVideoEvent.findMany({ where: { assignmentId: video.id, studentId: actor.studentId, kind: "INDEPENDENT_EXIT" } });
      const hasTransfer = Boolean((video.script as { transfer?: unknown } | null)?.transfer);
      if (assignment.kind !== ClassroomAssignmentKind.TEACHING && hasTransfer && !exitEvents.some((e) => e.exitItem === 1)) {
        throw new BadRequestException("Answer both independent questions before finishing this assignment.");
      }
      if (assignment.kind === ClassroomAssignmentKind.TEACHING) {
        // Practice is read from the lesson's own server-side record, never from the browser.
        const script = (video.script ?? {}) as { practice?: { items?: unknown[] }; practiceAttempts?: Record<string, { tries: number; correct: boolean }> };
        const attempts = Object.values(script.practiceAttempts ?? {});
        trustedResult = {
          lessonStatus: video.status,
          delivery: (video.renderResult as { interactive?: boolean } | null)?.interactive ? "SLIDES" : video.assetId ? "VIDEO" : "HTML_FALLBACK",
          watched: true,
          practice: { total: script.practice?.items?.length ?? 0, attempted: attempts.length, correct: attempts.filter((a) => a.correct).length },
        };
      } else {
        trustedResult = exitResult(exitEvents);
      }
    }
    const completed = await this.prisma.classroomAssignment.update({ where: { id }, data: { status: "COMPLETE", completedAt: new Date(), diagnosticSessionId, videoAssignmentId, result: trustedResult as Prisma.InputJsonValue } });
    const next = await this.advance(completed, trustedResult);
    const remaining = await this.prisma.classroomAssignment.count({ where: { runId: assignment.runId, kind: assignment.kind, status: { not: "COMPLETE" } } });
    if (remaining === 0 && assignment.kind === ClassroomAssignmentKind.DIAGNOSTIC && !next && !(await this.isAutoRun(assignment.runId))) {
      await this.prisma.classroomRun.update({ where: { id: assignment.runId }, data: { phase: "CLASS_REPORT", status: "PAUSED" } });
    }
    // A run is complete when no student has a stage left to do (skipped stages count as done).
    const open = await this.prisma.classroomAssignment.count({ where: { runId: assignment.runId, status: { in: ["READY", "IN_PROGRESS", "WAITING"] } } });
    if (open === 0 && (assignment.kind === ClassroomAssignmentKind.INDEPENDENT_EXIT || (await this.isAutoRun(assignment.runId)))) {
      await this.prisma.classroomRun.update({ where: { id: assignment.runId }, data: { phase: "FINAL_REPORT", status: "COMPLETE", completedAt: new Date() } });
    }
    return { ...completed, next };
  }

  private async isAutoRun(runId: string): Promise<boolean> {
    const run = await this.prisma.classroomRun.findUnique({ where: { id: runId }, select: { config: true } });
    return autoAdvanceEnabled(run?.config);
  }

  /**
   * Pilot auto-advance: creates this student's next stage the moment one is
   * done (pilot-flow.ts). Returns the new assignment so the student's screen
   * can go straight on. A student with nothing to teach has the remaining
   * stages recorded as SKIPPED, with the reason.
   */
  private async advance(
    done: { id: string; runId: string; enrollmentId: string; kind: ClassroomAssignmentKind; diagnosticSessionId: string | null; videoAssignmentId: string | null },
    result: Record<string, unknown>,
  ): Promise<{ id: string; kind: ClassroomAssignmentKind } | null> {
    const run = await this.prisma.classroomRun.findUnique({ where: { id: done.runId } });
    const kind = nextStage(done.kind);
    if (!run || !kind || !autoAdvanceEnabled(run.config)) return null;
    const base = { runId: done.runId, enrollmentId: done.enrollmentId, diagnosticSessionId: done.diagnosticSessionId, videoAssignmentId: done.videoAssignmentId, payload: { ...(run.config as Record<string, unknown>), sourceAssignmentId: done.id } as Prisma.InputJsonValue };
    if (done.kind === ClassroomAssignmentKind.DIAGNOSTIC) {
      const lesson = done.videoAssignmentId ? await this.prisma.personalizedVideoAssignment.findUnique({ where: { id: done.videoAssignmentId }, select: { status: true } }) : null;
      const plan = stagesAfterDiagnostic({ outcome: result.outcome, lessonStatus: lesson ? lesson.status : "ABSTAINED" });
      if (plan.kind === "SKIP_REST") {
        await this.prisma.classroomAssignment.createMany({
          data: [ClassroomAssignmentKind.TEACHING, ClassroomAssignmentKind.INDEPENDENT_EXIT].map((k) => ({ ...base, kind: k, status: "SKIPPED" as const, completedAt: new Date(), result: { skipped: true, reason: plan.reason } as Prisma.InputJsonValue })),
          skipDuplicates: true,
        });
        return null;
      }
    }
    const created = await this.prisma.classroomAssignment.upsert({
      where: { runId_enrollmentId_kind: { runId: done.runId, enrollmentId: done.enrollmentId, kind } },
      create: { ...base, kind, status: "READY", availableAt: new Date() },
      update: {},
    });
    return { id: created.id, kind };
  }

  /** Loads each enrolled student's stored evidence and hands it to the pure aggregator (class-report.ts). */
  private async classReport(
    classroomId: string,
    studentIds: string[] | null,
    assignments: Array<{ enrollmentId: string; kind: ClassroomAssignmentKind; status: string; startedAt: Date | null; completedAt: Date | null; diagnosticSessionId: string | null; videoAssignmentId: string | null }>,
  ) {
    const enrollments = await this.prisma.classroomEnrollment.findMany({ where: { classroomId, leftAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) }, include: { student: { select: { id: true, name: true } } }, orderBy: { joinedAt: "asc" } });
    const sessionIds = [...new Set(assignments.map((a) => a.diagnosticSessionId).filter((v): v is string => Boolean(v)))];
    const videoIds = [...new Set(assignments.map((a) => a.videoAssignmentId).filter((v): v is string => Boolean(v)))];
    const [lotus, videos, exits] = await Promise.all([
      sessionIds.length ? this.prisma.lotusSessionRecord.findMany({ where: { sessionId: { in: sessionIds } } }) : [],
      videoIds.length ? this.prisma.personalizedVideoAssignment.findMany({ where: { id: { in: videoIds } }, select: { id: true, status: true, script: true, scriptSource: true } }) : [],
      videoIds.length ? this.prisma.personalizedVideoEvent.findMany({ where: { assignmentId: { in: videoIds }, kind: "INDEPENDENT_EXIT" }, orderBy: { createdAt: "desc" } }) : [],
    ]);
    const lotusBySession = new Map(lotus.map((r) => [r.sessionId, r]));
    const videoById = new Map(videos.map((v) => [v.id, v]));
    const evidence: StudentEvidence[] = enrollments.map((enrollment) => {
      const own = assignments.filter((a) => a.enrollmentId === enrollment.id);
      const sessionId = own.find((a) => a.diagnosticSessionId)?.diagnosticSessionId;
      const videoId = own.find((a) => a.videoAssignmentId)?.videoAssignmentId;
      const record = sessionId ? lotusBySession.get(sessionId) : undefined;
      const payload = (record?.payload ?? null) as { audits?: LotusQuestionAudit[]; finalReport?: { outcome?: string; skills?: Array<{ skillId: string; name: string; state: string }>; limitations?: string[] } } | null;
      const audits = payload?.audits ?? [];
      const video = videoId ? videoById.get(videoId) : undefined;
      const script = (video?.script ?? {}) as { lesson?: { title?: string }; practice?: { items?: unknown[] }; practiceAttempts?: Record<string, { tries: number; correct: boolean }>; animationKind?: string };
      const tries = Object.values(script.practiceAttempts ?? {});
      const exit = videoId ? exits.find((e) => e.assignmentId === videoId) : undefined;
      const last = audits.at(-1)?.createdAt;
      return {
        studentId: enrollment.student.id,
        name: enrollment.student.name,
        rollNumber: enrollment.rollNumber,
        assignments: own.map((a) => ({ kind: a.kind, status: a.status, startedAt: a.startedAt, completedAt: a.completedAt })),
        diagnostic: record?.status === "COMPLETE" && payload?.finalReport
          ? {
              outcome: payload.finalReport.outcome,
              startingSkillId: payload.finalReport.outcome === "SOLID_GAP" ? confirmedByDepth(foldLedger(audits))[0]?.skillId : undefined,
              skills: payload.finalReport.skills ?? [],
              answered: audits.length,
              correct: audits.filter((a) => a.verification?.status === "VERIFIED_CORRECT").length,
              minutes: last ? Math.max(1, Math.round((new Date(last).getTime() - record.startedAt.getTime()) / 60000)) : null,
              endedNote: payload.finalReport.limitations?.find((l) => /time limit|found the starting point/.test(l)),
            }
          : null,
        lesson: video
          ? {
              title: script.lesson?.title,
              status: video.status,
              authoredBy: video.scriptSource === "CONSTRAINED_AI" ? "AI" : "RECIPE",
              practice: { total: script.practice?.items?.length ?? 0, attempted: tries.length, correct: tries.filter((t) => t.correct).length },
            }
          : null,
        exit: exit ? (({ prompt, correct, items }) => ({ prompt, correct, items }))(exitResult(exits.filter((e) => e.assignmentId === videoId))) : null,
      };
    });
    return buildClassReport(evidence);
  }

  /** A student's classes and how they did on each class's latest check, for their parent. Only this student's row leaves here, never classmates'. */
  async forStudent(studentId: string) {
    await this.settleFinishedDiagnostics({ enrollment: { studentId, leftAt: null } });
    const enrollments = await this.prisma.classroomEnrollment.findMany({
      where: { studentId, leftAt: null, classroom: { archivedAt: null } },
      include: { classroom: { select: { id: true, name: true, grade: true, teacher: { select: { name: true } } } } },
      orderBy: { joinedAt: "asc" },
    });
    return Promise.all(enrollments.map(async ({ classroom }) => {
      const run = await this.prisma.classroomRun.findFirst({
        where: { classroomId: classroom.id, status: { in: ["LIVE", "COMPLETE"] } },
        orderBy: { createdAt: "desc" },
      });
      const row = run
        ? (await this.classReport(classroom.id, checkStudentIds(run.config), await this.prisma.classroomAssignment.findMany({ where: { runId: run.id } }))).students.find((s) => s.studentId === studentId)
        : undefined;
      return {
        classroomId: classroom.id,
        name: classroom.name,
        grade: classroom.grade,
        teacherName: classroom.teacher.name,
        check: run && row
          ? {
              title: run.title,
              live: run.status === "LIVE",
              date: run.startedAt ?? run.createdAt,
              stage: row.stage,
              stageStatus: row.stageStatus,
              progress: row.progress,
              need: row.startingPoint?.name ?? null,
              lessonTitle: row.lesson?.title ?? null,
              finalCorrect: row.exitCorrect ?? null,
            }
          : null,
      };
    }));
  }

  /** Every started check on a topic in this class, oldest first, with each student's row (catch-ups: their students only). */
  async checkRowsForTopic(classroomId: string, topicId: string): Promise<Array<CheckRows & { title: string; createdAt: Date; status: string }>> {
    await this.settleFinishedDiagnostics({ run: { classroomId, topicId, status: "LIVE" } });
    const runs = await this.prisma.classroomRun.findMany({
      where: { classroomId, topicId, status: { in: ["LIVE", "COMPLETE"] } },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(runs.map(async (run) => {
      const assignments = await this.prisma.classroomAssignment.findMany({ where: { runId: run.id } });
      const report = await this.classReport(classroomId, checkStudentIds(run.config), assignments);
      return { runId: run.id, kind: checkKindOf(run.config), live: run.status === "LIVE", title: run.title, createdAt: run.createdAt, status: run.status, rows: report.students };
    }));
  }

  async report(actor: AccessActor, runId: string) {
    const run = await this.ownedRun(actor, runId);
    await this.settleFinishedDiagnostics({ runId });
    const assignments = await this.prisma.classroomAssignment.findMany({ where: { runId }, include: { enrollment: { include: { student: { select: { id: true, name: true } } } } }, orderBy: { enrollment: { joinedAt: "asc" } } });
    const byKind = Object.values(ClassroomAssignmentKind).map((kind) => { const rows = assignments.filter((row) => row.kind === kind); return { kind, total: rows.length, ready: rows.filter((row) => row.status === "READY").length, inProgress: rows.filter((row) => row.status === "IN_PROGRESS").length, complete: rows.filter((row) => row.status === "COMPLETE").length }; });
    const results = assignments.map((row) => row.result).filter((value): value is Prisma.JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value)) as Array<Record<string, unknown>>;
    const tally = (field: string) => results.reduce<Record<string, number>>((acc, result) => { const value = result[field]; if (typeof value === "string" && value) acc[value] = (acc[value] ?? 0) + 1; return acc; }, {});
    const tallyList = (field: string) => results.reduce<Record<string, number>>((acc, result) => { const values = result[field]; if (Array.isArray(values)) for (const value of values) if (typeof value === "string" && value) acc[value] = (acc[value] ?? 0) + 1; return acc; }, {});
    const exitRows = assignments.filter((row) => row.kind === ClassroomAssignmentKind.INDEPENDENT_EXIT && row.status === "COMPLETE");
    const exitVerified = exitRows.filter((row) => Boolean((row.result as Record<string, unknown> | null)?.correct)).length;
    return {
      run,
      autoAdvance: autoAdvanceEnabled(run.config),
      classReport: await this.classReport(run.classroomId, checkStudentIds(run.config), assignments),
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

/**
 * The independent exit as the class sees it: one result across every exit
 * question (the main one and, when present, the transfer one). Correct only
 * when every question is right; the latest answer per question counts.
 */
function exitResult(events: Array<{ exitPrompt: string | null; exitAnswer: string | null; exitWorking: string | null; exitCorrect: boolean | null; exitItem?: number | null; createdAt: Date }>) {
  const latest = new Map<number, (typeof events)[number]>();
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) latest.set(e.exitItem ?? 0, e);
  const items = [...latest.entries()].sort(([a], [b]) => a - b).map(([, e]) => e);
  return {
    prompt: items.map((e) => e.exitPrompt).filter(Boolean).join(" · "),
    answer: items.map((e) => e.exitAnswer).filter(Boolean).join(" · "),
    working: items.map((e) => e.exitWorking).filter(Boolean).join(" · "),
    correct: items.length > 0 && items.every((e) => e.exitCorrect === true),
    items: items.map((e) => ({ prompt: e.exitPrompt, answer: e.exitAnswer, correct: e.exitCorrect })),
    independent: true,
  };
}
