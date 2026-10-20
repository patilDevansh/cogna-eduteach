import { randomBytes, randomInt } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
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
import { ClassroomEventsService } from "./classroom-events";
import { catchUpSetUpdate, checkFinishedUpdate, linkApprovedUpdate, UPDATE_TEXT, type ParentUpdate } from "./parent-updates";
import { normalizePhone, sendSms, updateText } from "../parents/phone";
import { setConsent } from "../parents/consent";
import { dueAtFor, parentWork, type StepKind, type StepStatus, type WorkTask } from "./parent-work";
import { INVITE_COOLDOWN_MINUTES, INVITE_DAILY_LIMIT, maskEmail, normalizeEmail, parentInviteEmail } from "./parent-invite";
import { MailService } from "../mail/mail.service";
import { allowedWebOrigins } from "../web-origins";
import { isProductionLike } from "../access/cogna-access";

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
  /** Parents' or guardians' mobiles from the school's records. */
  phones?: string[];
}

/** Phones the school can list for one student: mother, father, and a couple of guardians. */
const MAX_GUARDIAN_PHONES = 4;

const RELATIONSHIPS = new Set(["mother", "father", "guardian"]);

/** Normalised, de-duplicated phones, or a teacher-readable error naming the bad one. */
function guardianPhonesOrThrow(raw: string[], where: string): string[] {
  const phones: string[] = [];
  for (const value of raw.filter((v) => v.trim())) {
    const phone = normalizePhone(value);
    if (!phone) throw new BadRequestException(`${where}: "${value}" isn't a mobile number. Use the 10-digit number, or include the country code.`);
    if (!phones.includes(phone)) phones.push(phone);
  }
  if (phones.length > MAX_GUARDIAN_PHONES) throw new BadRequestException(`${where}: at most ${MAX_GUARDIAN_PHONES} phone numbers per student.`);
  return phones;
}

/** Marks a step closed by removing the student, so rejoining can reopen exactly those steps. */
const REMOVED_FROM_CLASS = "removedFromClass";

/** How long a finished diagnostic waits for its lesson before it completes without one. */
const LESSON_GRACE_MS = 2 * 60_000;

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);
  /** Diagnostic steps being settled right now (settleFinishedDiagnostics). */
  private readonly settling = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly videos?: PersonalizedVideosService,
    @Optional() private readonly events?: ClassroomEventsService,
    @Optional() private readonly mail?: MailService,
  ) {}

  /** Tells open pages what changed: the class's teacher page, and these students' home pages. */
  private notify(classroomId: string, change: { runId?: string; roster?: boolean; studentIds?: string[] }): void {
    if (!this.events) return;
    if (change.roster) this.events.classChanged(classroomId, { type: "roster" });
    this.events.classChanged(classroomId, { type: "progress", runId: change.runId });
    if (change.studentIds?.length) this.events.studentsChanged(change.studentIds);
  }

  private async notifyRun(runId: string, studentIds?: string[]): Promise<void> {
    if (!this.events) return;
    const run = await this.prisma.classroomRun.findUnique({ where: { id: runId }, select: { classroomId: true } });
    if (run) this.notify(run.classroomId, { runId, studentIds });
  }

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
      // No grace period: the trusted result is read from the server's own records, so the
      // browser has nothing to add, and the teacher should see the step done straight away.
      const events = await this.prisma.personalizedVideoEvent.findMany({ where: { assignmentId: video.id, studentId, kind: assignment.kind === ClassroomAssignmentKind.TEACHING ? "COMPLETED" : "INDEPENDENT_EXIT" }, select: { exitItem: true } });
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

  /**
   * Settles every running check's finished-but-unreported steps. Run in the
   * background (ClassroomSettleWorker), so a closed tab is filed even when no
   * one has a class page open.
   */
  async settleLiveChecks(): Promise<void> {
    // Check by check: each pass looks at a bounded number of open steps, and one
    // big check's unfinished steps must not crowd out another check's finished ones.
    const live = await this.prisma.classroomRun.findMany({ where: { status: "LIVE" }, select: { id: true, classroomId: true, status: true, config: true } });
    for (const run of live) {
      await this.settleFinishedDiagnostics({ runId: run.id });
      // A check whose time limit has passed ends, after its finished work is filed.
      const endsAt = runEndsAt(run.config);
      if (endsAt && Date.parse(endsAt) <= Date.now()) await this.closeRun(run);
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
      if (all > 0 && open === 0) {
        await this.prisma.classroomRun.update({ where: { id: run.id }, data: { phase: "FINAL_REPORT", status: "COMPLETE", completedAt: new Date() } });
        this.notify(classroomId, { runId: run.id });
      }
    }
  }

  /**
   * Completes every class diagnostic whose Lotus session has finished, on the next read by
   * anyone (teacher poll, student home, parent), so no step waits on the student's browser.
   * The lesson is created first, because a diagnostic completed without one skips the
   * student's lesson; if creating it keeps failing, the step completes without it after
   * LESSON_GRACE_MS so the teacher is never left waiting.
   */
  private async settleFinishedDiagnostics(where: Prisma.ClassroomAssignmentWhereInput): Promise<void> {
    if (!this.videos) return;
    await this.settleFinishedLessonSteps(where);
    const open = await this.prisma.classroomAssignment.findMany({
      where: { ...where, kind: ClassroomAssignmentKind.DIAGNOSTIC, status: { in: ["READY", "IN_PROGRESS"] } },
      select: { id: true, status: true, availableAt: true, enrollment: { select: { studentId: true } } },
      take: 60,
    });
    for (const assignment of open) {
      // The background pass and a page load can reach the same step at once: one lesson per diagnostic.
      if (this.settling.has(assignment.id)) continue;
      // Claimed before the first await, so a second pass sees it taken; released in `finally` on every path.
      this.settling.add(assignment.id);
      const studentId = assignment.enrollment.studentId;
      const actor = { role: "student", studentId } as AccessActor;
      try {
        // ponytail: one query per open diagnostic; only students mid-check are open, so this stays small. Batch it if classes grow past ~60.
        const lotus = await this.prisma.lotusSessionRecord.findFirst({
          // A session from before the teacher restarted this student doesn't count.
          where: { studentId, payload: { path: ["classroomAssignmentId"], equals: assignment.id }, ...(assignment.availableAt ? { startedAt: { gte: assignment.availableAt } } : {}) },
          orderBy: { startedAt: "desc" },
          select: { sessionId: true, status: true, startedAt: true, endedAt: true },
        });
        if (!lotus) continue;
        if (lotus.status !== "COMPLETE") {
          // Started, even if the browser's "started" call never arrived: the teacher sees them as checking.
          if (assignment.status === "READY") {
            await this.prisma.classroomAssignment.updateMany({ where: { id: assignment.id, status: "READY" }, data: { status: "IN_PROGRESS", startedAt: lotus.startedAt } });
          }
          continue;
        }
        let videoAssignmentId: string | undefined;
        try {
          videoAssignmentId = (await this.videos.createAssignment({ studentId, lotusSessionId: lotus.sessionId }, { actor })).id;
        } catch (error) {
          const ended = lotus.endedAt?.getTime() ?? 0;
          const noGap = await this.lotusOutcome(lotus.sessionId) === "ADVANCEMENT";
          if (!noGap && Date.now() - ended < LESSON_GRACE_MS) {
            this.logger.warn(`Lesson for class diagnostic ${assignment.id} not ready yet, retrying: ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }
        }
        await this.completeAssignment(actor, assignment.id, { diagnosticSessionId: lotus.sessionId, videoAssignmentId, result: {} });
      } catch (error) {
        this.logger.warn(`Could not settle class diagnostic ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.settling.delete(assignment.id);
      }
    }
  }

  private async lotusOutcome(sessionId: string): Promise<unknown> {
    const record = await this.prisma.lotusSessionRecord.findUnique({ where: { sessionId }, select: { payload: true } });
    return ((record?.payload as { finalReport?: { outcome?: unknown } } | null)?.finalReport ?? {}).outcome;
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
            guardianPhones: { orderBy: { createdAt: "asc" }, select: { phone: true, relationship: true } },
            parentLinks: { select: { source: true, parent: { select: { id: true, name: true, phone: true, phoneVerifiedAt: true } } } },
            classroomEnrollments: {
              where: { leftAt: null, classroomId: { not: classroomId }, classroom: { teacherId: classroom.teacherId, archivedAt: null } },
              select: { classroom: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    const studentIds = enrollments.map((row) => row.student.id);
    const declines = await this.prisma.consent.findMany({ where: { studentId: { in: studentIds }, consentType: "PRACTICE_DECLINED", revokedAt: null }, select: { studentId: true, parentId: true } });
    const holders = await this.prisma.parent.findMany({
      where: { phone: { in: enrollments.flatMap((row) => row.student.guardianPhones.map((g) => g.phone)) }, phoneVerifiedAt: { not: null } },
      select: { id: true, phone: true },
    });
    const holderOf = new Map(holders.map((h) => [h.phone, h.id]));
    return enrollments.map((row) => {
      const parents = row.student.parentLinks.filter((link) => link.parent.id !== rosterParent?.id);
      return {
        studentId: row.student.id,
        name: row.student.name,
        rollNumber: row.rollNumber,
        joinedAt: row.joinedAt,
        alsoIn: row.student.classroomEnrollments.map((other) => other.classroom),
        // Made by the school: the school manages sign-in codes and who the parents are.
        schoolIssuedCode: Boolean(rosterParent) && row.student.primaryParentId === rosterParent?.id,
        parentLinked: parents.length > 0,
        guardians: row.student.guardianPhones.map((g) => {
          const holder = holderOf.get(g.phone);
          const status = holder && parents.some((p) => p.parent.id === holder) ? "LINKED"
            : holder && declines.some((d) => d.studentId === row.student.id && d.parentId === holder) ? "DECLINED"
              : "WAITING";
          return { phone: g.phone, relationship: g.relationship, status };
        }),
        parents: parents.map((p) => ({ parentId: p.parent.id, name: p.parent.name, phone: p.parent.phoneVerifiedAt ? p.parent.phone : null, source: p.source })),
      };
    });
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
    this.notify(classroomId, { roster: true, studentIds: [studentId] });
    return { removed: true };
  }

  /**
   * Creates student accounts from a class list and enrols them. Returns each new sign-in code once
   * (only its hash is stored), so the teacher can print or download them. School-made students
   * belong to one "school roster" parent account until a real parent is linked.
   */
  async importStudents(actor: AccessActor, classroomId: string, rows: RosterImportRow[], schoolConsent = false) {
    const classroom = await this.ownedClassroom(actor, classroomId);
    if (!schoolConsent) throw new BadRequestException("Confirm the school has consent to use Cogna for these students.");
    const cleaned = (Array.isArray(rows) ? rows : []).map((row) => ({
      name: String(row?.name ?? "").replace(/\s+/g, " ").trim(),
      rollNumber: String(row?.rollNumber ?? "").trim() || undefined,
      rawPhones: (Array.isArray(row?.phones) ? row.phones : []).map((phone) => String(phone ?? "").trim()).filter(Boolean),
    }));
    if (!cleaned.length) throw new BadRequestException("Add at least one student.");
    if (cleaned.length > MAX_IMPORT) throw new BadRequestException(`Add at most ${MAX_IMPORT} students at a time.`);
    const bad = cleaned.findIndex((row) => row.name.length < 2 || row.name.length > 80 || (row.rollNumber?.length ?? 0) > 40);
    if (bad >= 0) throw new BadRequestException(`Line ${bad + 1}: a name needs 2–80 characters and a roll number at most 40.`);
    const withPhones = cleaned.map((row, index) => ({ ...row, phones: guardianPhonesOrThrow(row.rawPhones, `Line ${index + 1}`) }));

    const parentId = await this.rosterParentId(classroom.schoolId);
    const created: Array<{ studentId: string; name: string; rollNumber?: string; accessCode: string; phones: number }> = [];
    const enrollmentIds: string[] = [];
    for (const row of withPhones) {
      const accessCode = await this.freshAccessCode();
      const { student, enrollment } = await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({ data: { primaryParentId: parentId, name: row.name, grade: classroom.grade, accessCodeHash: hashAccessCode(accessCode) } });
        const enrollment = await tx.classroomEnrollment.create({ data: { classroomId, studentId: student.id, rollNumber: row.rollNumber } });
        if (row.phones.length) await tx.studentGuardianPhone.createMany({ data: row.phones.map((phone) => ({ studentId: student.id, phone })) });
        // The school's consent covers class use until a parent answers for themselves.
        await tx.consent.create({ data: { parentId, studentId: student.id, consentType: "SCHOOL_CONSENT" } });
        return { student, enrollment };
      });
      enrollmentIds.push(enrollment.id);
      created.push({ studentId: student.id, name: row.name, rollNumber: row.rollNumber, accessCode, phones: row.phones.length });
    }
    await this.giveRunningCheck(classroomId, enrollmentIds);
    this.notify(classroomId, { roster: true });
    return { classroom: { id: classroom.id, name: classroom.name, joinCode: classroom.joinCode }, students: created };
  }

  /** A new sign-in code for a school-made student in this class (lost slip). The old code stops working. */
  async resetAccessCode(actor: AccessActor, classroomId: string, studentId: string) {
    const enrollment = await this.schoolHeldEnrollment(actor, classroomId, studentId, "This student signs in with their family's code. Ask the parent to reset it.");
    const accessCode = await this.freshAccessCode();
    await this.prisma.student.update({ where: { id: studentId }, data: { accessCodeHash: hashAccessCode(accessCode) } });
    return { studentId, name: enrollment.student.name, rollNumber: enrollment.rollNumber, accessCode };
  }

  /**
   * A student in this class whom the school made (so the school manages their sign-in and parents).
   * Never a family's own account: the family decides those.
   */
  private async schoolHeldEnrollment(actor: AccessActor, classroomId: string, studentId: string, familyMessage = "This student was added by their family, who manage who can see them.") {
    const classroom = await this.ownedClassroom(actor, classroomId);
    const enrollment = await this.prisma.classroomEnrollment.findUnique({
      where: { classroomId_studentId: { classroomId, studentId } },
      include: { student: { select: { name: true, primaryParentId: true } } },
    });
    if (!enrollment || enrollment.leftAt) throw new NotFoundException("That student is not in this class.");
    const rosterParentId = await this.rosterParentId(classroom.schoolId);
    if (enrollment.student.primaryParentId !== rosterParentId) throw new ForbiddenException(familyMessage);
    return { ...enrollment, classroom, rosterParentId };
  }

  /**
   * The parents' phones on the school's record for a student. A parent who verifies a listed number
   * sees the child; taking a number off unlinks whoever linked through it.
   */
  async setGuardianPhones(actor: AccessActor, classroomId: string, studentId: string, input: Array<{ phone?: string; relationship?: string }>) {
    await this.schoolHeldEnrollment(actor, classroomId, studentId);
    const rows = Array.isArray(input) ? input : [];
    const phones = guardianPhonesOrThrow(rows.map((r) => String(r?.phone ?? "")), "That list");
    const relationshipOf = new Map(rows.map((r) => [normalizePhone(String(r?.phone ?? "")), RELATIONSHIPS.has(String(r?.relationship)) ? String(r?.relationship) : "guardian"]));
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.studentGuardianPhone.findMany({ where: { studentId }, select: { phone: true } });
      const removed = before.map((b) => b.phone).filter((phone) => !phones.includes(phone));
      if (removed.length) {
        const gone = await tx.parent.findMany({ where: { phone: { in: removed } }, select: { id: true } });
        await this.unlinkParents(tx, studentId, gone.map((g) => g.id), "PHONE");
      }
      await tx.studentGuardianPhone.deleteMany({ where: { studentId } });
      if (phones.length) await tx.studentGuardianPhone.createMany({ data: phones.map((phone) => ({ studentId, phone, relationship: relationshipOf.get(phone) ?? "guardian" })) });
    });
    this.notify(classroomId, { roster: true });
    return (await this.roster(actor, classroomId)).find((row) => row.studentId === studentId);
  }

  /**
   * Unlinks a parent from a school-made student (a wrong link, or a family change). Their number
   * comes off the record too, so they can't link straight back; the teacher can add it again.
   */
  async unlinkParent(actor: AccessActor, classroomId: string, studentId: string, parentId: string) {
    await this.schoolHeldEnrollment(actor, classroomId, studentId);
    await this.prisma.$transaction(async (tx) => {
      await this.unlinkParents(tx, studentId, [parentId]);
      const parent = await tx.parent.findUnique({ where: { id: parentId }, select: { phone: true } });
      if (parent?.phone) await tx.studentGuardianPhone.deleteMany({ where: { studentId, phone: parent.phone } });
    });
    this.notify(classroomId, { roster: true });
    return (await this.roster(actor, classroomId)).find((row) => row.studentId === studentId);
  }

  private async unlinkParents(tx: Prisma.TransactionClient, studentId: string, parentIds: string[], source?: string) {
    if (!parentIds.length) return;
    await tx.parentStudentLink.deleteMany({ where: { studentId, parentId: { in: parentIds }, ...(source ? { source } : {}) } });
    await tx.consent.updateMany({ where: { studentId, parentId: { in: parentIds }, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Parents waiting for this teacher to link their child, with the likeliest students first. */
  async linkRequests(actor: AccessActor, classroomId: string) {
    await this.ownedClassroom(actor, classroomId);
    const requests = await this.prisma.parentLinkRequest.findMany({
      where: { classroomId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { parent: { select: { name: true, phone: true, phoneVerifiedAt: true } } },
    });
    if (!requests.length) return [];
    const roster = await this.roster(actor, classroomId);
    const words = (name: string) => new Set(name.toLowerCase().split(/\s+/).filter(Boolean));
    return requests.map((r) => {
      const asked = words(r.childName);
      const suggestions = roster
        .filter((row) => row.schoolIssuedCode)
        .map((row) => ({ row, score: (r.rollNumber && row.rollNumber === r.rollNumber ? 10 : 0) + [...words(row.name)].filter((w) => asked.has(w)).length }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((m) => ({ studentId: m.row.studentId, name: m.row.name, rollNumber: m.row.rollNumber }));
      return {
        id: r.id,
        parentName: r.parent.name,
        parentPhone: r.parent.phoneVerifiedAt ? r.parent.phone : null,
        childName: r.childName,
        rollNumber: r.rollNumber,
        createdAt: r.createdAt,
        suggestions,
      };
    });
  }

  /**
   * Links the parent to the student the teacher chose. The parent consented when they asked; their
   * verified number joins the school's record, so the record stays the source of truth.
   */
  async approveLinkRequest(actor: AccessActor, classroomId: string, requestId: string, studentId: string) {
    const request = await this.prisma.parentLinkRequest.findFirst({ where: { id: requestId, classroomId, status: "PENDING" }, include: { parent: { select: { phone: true, phoneVerifiedAt: true } } } });
    if (!request) throw new NotFoundException("That request has already been answered.");
    const { classroom } = await this.schoolHeldEnrollment(actor, classroomId, studentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.parentStudentLink.upsert({
        where: { parentId_studentId: { parentId: request.parentId, studentId } },
        create: { parentId: request.parentId, studentId, relationship: "parent", canViewReports: true, source: "TEACHER_APPROVED" },
        update: { canViewReports: true },
      });
      await tx.learnerProfile.upsert({ where: { studentId }, create: { studentId }, update: {} });
      await setConsent(tx, request.parentId, studentId, "PRACTICE_CONSENT");
      if (request.parent.phone && request.parent.phoneVerifiedAt) {
        await tx.studentGuardianPhone.upsert({ where: { studentId_phone: { studentId, phone: request.parent.phone } }, create: { studentId, phone: request.parent.phone }, update: {} });
      }
      await tx.parentLinkRequest.update({ where: { id: request.id }, data: { status: "APPROVED", studentId, decidedAt: new Date() } });
    });
    this.notify(classroomId, { roster: true });
    const [student, teacher] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: studentId }, select: { name: true } }),
      this.prisma.teacher.findUnique({ where: { id: classroom.teacherId }, select: { name: true } }),
    ]);
    await this.tellParents(studentId, linkApprovedUpdate({ requestId: request.id, className: classroom.name, studentName: student?.name ?? request.childName, teacherName: teacher?.name ?? "The teacher" }), [request.parentId]);
    return this.linkRequests(actor, classroomId);
  }

  async declineLinkRequest(actor: AccessActor, classroomId: string, requestId: string) {
    await this.ownedClassroom(actor, classroomId);
    const { count } = await this.prisma.parentLinkRequest.updateMany({ where: { id: requestId, classroomId, status: "PENDING" }, data: { status: "DECLINED", decidedAt: new Date() } });
    if (!count) throw new NotFoundException("That request has already been answered.");
    return this.linkRequests(actor, classroomId);
  }

  /**
   * Adds updates to the dashboards of a student's parents. Never the school's placeholder
   * account, never twice for the same event, and never a reason for the class action to fail.
   */
  private async tellParents(studentId: string, update: ParentUpdate, onlyParentIds?: string[]): Promise<void> {
    try {
      const links = await this.prisma.parentStudentLink.findMany({
        where: { studentId, canViewReports: true, parent: { user: { NOT: { clerkId: { startsWith: "school_roster:" } } } }, ...(onlyParentIds ? { parentId: { in: onlyParentIds } } : {}) },
        select: { parentId: true },
      });
      if (!links.length) return;
      await this.prisma.parentNotification.createMany({
        data: links.map((link) => ({ parentId: link.parentId, studentId, kind: update.kind, title: update.title, body: update.body, dedupeKey: update.dedupeKey })),
        skipDuplicates: true,
      });
      await this.textParents(studentId, update, links.map((l) => l.parentId));
    } catch (error) {
      this.logger.warn(`Could not add a parent update for ${studentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Texts the update to each parent with a verified phone who hasn't turned texts off. Each update is
   * claimed before it is sent, so a repeated event never texts twice. The send isn't awaited: a slow
   * SMS provider must not slow down the student's class step.
   */
  private async textParents(studentId: string, update: ParentUpdate, parentIds: string[]): Promise<void> {
    const due = await this.prisma.parentNotification.findMany({
      where: { studentId, dedupeKey: update.dedupeKey, textedAt: null, parentId: { in: parentIds }, parent: { textUpdates: true, phoneVerifiedAt: { not: null } } },
      select: { id: true, parent: { select: { phone: true } }, student: { select: { name: true } } },
    });
    for (const n of due) {
      const claimed = await this.prisma.parentNotification.updateMany({ where: { id: n.id, textedAt: null }, data: { textedAt: new Date() } });
      if (claimed.count && n.parent.phone) void sendSms(n.parent.phone, updateText(n.student.name, UPDATE_TEXT[update.kind]));
    }
  }

  /** Teacher pages showing these classes refresh their roster and parent requests. */
  parentsChanged(classroomIds: string[]): void {
    for (const classroomId of new Set(classroomIds)) this.notify(classroomId, { roster: true });
  }

  /** Once a student has nothing left to do in a check, their parents hear how it went. */
  private async tellParentsIfFinished(runId: string, enrollmentId: string): Promise<void> {
    try {
      const open = await this.prisma.classroomAssignment.count({ where: { runId, enrollmentId, status: { in: ["WAITING", "READY", "IN_PROGRESS"] } } });
      if (open > 0) return;
      const run = await this.prisma.classroomRun.findUnique({ where: { id: runId }, include: { classroom: { select: { id: true, name: true } } } });
      const enrollment = await this.prisma.classroomEnrollment.findUnique({ where: { id: enrollmentId }, select: { studentId: true } });
      if (!run || !enrollment) return;
      const assignments = await this.prisma.classroomAssignment.findMany({ where: { runId, enrollmentId } });
      const row = (await this.classReport(run.classroomId, [enrollment.studentId], assignments)).students[0];
      if (row) await this.tellParents(enrollment.studentId, checkFinishedUpdate({ runId, className: run.classroom.name, checkTitle: run.title, row }));
    } catch (error) {
      // The student's step is already recorded; a missed parent update must not undo that.
      this.logger.warn(`Could not prepare a parent update for run ${runId}: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  async join(actor: AccessActor, input: { joinCode: string; rollNumber?: string; admissionNumber?: string; parentEmail?: string }) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const parentEmail = input.parentEmail?.trim() ? normalizeEmail(input.parentEmail) : null;
    if (input.parentEmail?.trim() && !parentEmail) throw new BadRequestException("That parent email doesn't look right. Check it, or leave it empty.");
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
    this.notify(classroom.id, { roster: true, studentIds: [actor.studentId] });
    // A second section of the same teacher is usually a mistyped code: tell the student so they can say so.
    const alsoIn = await this.prisma.classroom.findMany({
      where: { id: { not: classroom.id }, teacherId: classroom.teacherId, archivedAt: null, enrollments: { some: { studentId: actor.studentId, leftAt: null } } },
      select: { id: true, name: true },
    });
    const parentInvite = parentEmail ? await this.sendParentInvite(actor.studentId, parentEmail, classroom.id) : undefined;
    return { ...enrollment, alsoIn, parentInvite };
  }

  /** Whether this student's family is linked, and where an invite last went (masked), so the join page knows whether to ask. */
  async parentInviteStatus(actor: AccessActor) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const student = await this.prisma.student.findUnique({ where: { id: actor.studentId }, select: { parentInviteEmail: true, parentInviteSentAt: true } });
    if (!student) throw new NotFoundException("Student not found.");
    const linked = await this.familyLinked(actor.studentId);
    return { linked, invitedTo: !linked && student.parentInviteEmail ? maskEmail(student.parentInviteEmail) : null, sentAt: linked ? null : student.parentInviteSentAt };
  }

  /** True once any parent or guardian (not the school's placeholder account) can see this student. */
  private async familyLinked(studentId: string): Promise<boolean> {
    const links = await this.prisma.parentStudentLink.count({
      where: { studentId, canViewReports: true, parent: { user: { NOT: { clerkId: { startsWith: "school_roster:" } } } } },
    });
    return links > 0;
  }

  /** A student asks Cogna to email their parent an invite (on its own, after joining). */
  async inviteParent(actor: AccessActor, input: { email?: string; classroomId?: string }) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const email = normalizeEmail(input.email);
    if (!email) throw new BadRequestException("That email doesn't look right.");
    return this.sendParentInvite(actor.studentId, email, input.classroomId);
  }

  /**
   * Emails the parent an invite to sign in to Cogna. It carries no code and links nothing by itself:
   * the parent links by confirming the phone the school has on record, or by asking the teacher to
   * approve them. Only until a family has linked; rate-limited so no one can use Cogna to flood an
   * inbox. Never fails the caller.
   */
  private async sendParentInvite(studentId: string, email: string, classroomId?: string): Promise<{ status: "SENT" | "NOT_CONFIGURED" | "FAILED" | "ALREADY_LINKED" | "TOO_SOON" | "DAILY_LIMIT"; invitedTo?: string }> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { name: true, parentInviteSentAt: true, parentInviteCount: true } });
    if (!student) throw new NotFoundException("Student not found.");
    if (await this.familyLinked(studentId)) return { status: "ALREADY_LINKED" };
    const now = new Date();
    const since = student.parentInviteSentAt ? now.getTime() - student.parentInviteSentAt.getTime() : Infinity;
    if (since < INVITE_COOLDOWN_MINUTES * 60_000) return { status: "TOO_SOON" };
    const count = since < 86_400_000 ? student.parentInviteCount : 0;
    if (count >= INVITE_DAILY_LIMIT) return { status: "DAILY_LIMIT" };
    // In production with no mailbox set up, say so rather than record an invite nobody receives.
    if (!this.mail?.configured() && isProductionLike()) return { status: "NOT_CONFIGURED" };

    const enrollment = await this.prisma.classroomEnrollment.findFirst({
      where: { studentId, leftAt: null, ...(classroomId ? { classroomId } : {}) },
      orderBy: { joinedAt: "desc" },
      select: { classroom: { select: { name: true, teacher: { select: { name: true } } } } },
    });
    await this.prisma.student.update({
      where: { id: studentId },
      data: { parentInviteEmail: email, parentInviteSentAt: now, parentInviteCount: count + 1 },
    });
    const message = parentInviteEmail({
      to: email,
      studentName: student.name,
      className: enrollment?.classroom.name ?? "their class",
      teacherName: enrollment?.classroom.teacher.name ?? "their teacher",
      webUrl: allowedWebOrigins()[0] ?? "http://localhost:3000",
    });
    const status = this.mail ? await this.mail.send(message) : "NOT_CONFIGURED";
    return { status, invitedTo: maskEmail(email) };
  }

  /** Pilot: anyone who arrives while a quick check is running (joined late, or added from the class list) gets it straight away. */
  private async giveRunningCheck(classroomId: string, enrollmentIds: string[]) {
    if (!enrollmentIds.length) return;
    const live = await this.prisma.classroomRun.findFirst({ where: { classroomId, status: "LIVE" }, orderBy: { createdAt: "desc" } });
    // A teacher-advanced check only takes newcomers while it is still on its diagnostic.
    if (!live || checkStudentIds(live.config) || (!autoAdvanceEnabled(live.config) && live.phase !== "DIAGNOSTIC")) return;
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
    const enrolled = await this.prisma.classroomEnrollment.findMany({ where: { classroomId: run.classroomId, leftAt: null, ...(only ? { studentId: { in: only } } : {}) }, select: { id: true, studentId: true, student: { select: { name: true } } } });
    const enrollmentIds = enrolled.map((row) => row.id);
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
      this.prisma.classroomRun.update({ where: { id: runId }, data: { phase: phase as ClassroomRunPhase, status: "LIVE", startedAt: run.startedAt ?? new Date(), dueAt: run.startedAt ? run.dueAt : dueAtFor(run.config, new Date()) } }),
    ]);
    this.notify(run.classroomId, { runId, studentIds: enrolled.map((row) => row.studentId) });
    if (phase === "DIAGNOSTIC" && checkKindOf(run.config) === "CATCH_UP") {
      const teacher = await this.teacher(actor);
      for (const row of enrolled) {
        await this.tellParents(row.studentId, catchUpSetUpdate({ runId, className: run.classroom.name, checkTitle: run.title, studentId: row.studentId, studentName: row.student.name, teacherName: teacher.name }));
      }
    }
    return this.report(actor, runId);
  }

  /** Teacher ends a check early: work already done stays in the results; every unfinished step is skipped. */
  async endRun(actor: AccessActor, runId: string) {
    const run = await this.ownedRun(actor, runId);
    await this.closeRun(run);
    return this.report(actor, runId);
  }

  /** Ends a check: by the teacher, or when its time limit runs out. */
  private async closeRun(run: { id: string; classroomId: string; status: string }): Promise<void> {
    if (run.status === "COMPLETE" || run.status === "CANCELLED") return;
    await this.prisma.$transaction([
      this.prisma.classroomAssignment.updateMany({ where: { runId: run.id, status: { in: ["WAITING", "READY", "IN_PROGRESS"] } }, data: { status: "SKIPPED" } }),
      this.prisma.classroomRun.update({ where: { id: run.id }, data: { phase: "FINAL_REPORT", status: "COMPLETE", completedAt: new Date() } }),
    ]);
    const students = await this.prisma.classroomEnrollment.findMany({ where: { classroomId: run.classroomId, leftAt: null }, select: { studentId: true } });
    this.notify(run.classroomId, { runId: run.id, studentIds: students.map((row) => row.studentId) });
  }

  /**
   * Starts one student's check again: their diagnostic is reopened and their lesson and final
   * question are cleared. Lotus ignores any session started before this (see LotusService.start).
   */
  async restartStudent(actor: AccessActor, runId: string, studentId: string) {
    const run = await this.ownedRun(actor, runId);
    if (run.status === "COMPLETE" || run.status === "CANCELLED") throw new BadRequestException("This check has ended. Start a new one.");
    const enrollment = await this.prisma.classroomEnrollment.findUnique({ where: { classroomId_studentId: { classroomId: run.classroomId, studentId } } });
    if (!enrollment || enrollment.leftAt) throw new NotFoundException("That student is not in this class.");
    const diagnostic = await this.prisma.classroomAssignment.findUnique({ where: { runId_enrollmentId_kind: { runId, enrollmentId: enrollment.id, kind: ClassroomAssignmentKind.DIAGNOSTIC } } });
    if (!diagnostic) throw new BadRequestException("This student hasn't been sent this check.");
    const restartedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.classroomAssignment.deleteMany({ where: { runId, enrollmentId: enrollment.id, kind: { not: ClassroomAssignmentKind.DIAGNOSTIC } } }),
      this.prisma.classroomAssignment.update({
        where: { id: diagnostic.id },
        data: {
          status: "READY", startedAt: null, completedAt: null, diagnosticSessionId: null, videoAssignmentId: null, result: Prisma.DbNull, availableAt: restartedAt,
          payload: { ...((diagnostic.payload ?? {}) as Record<string, unknown>), restartedAt: restartedAt.toISOString() } as Prisma.InputJsonValue,
        },
      }),
    ]);
    this.notify(run.classroomId, { runId, studentIds: [studentId] });
    return this.report(actor, runId);
  }

  /** Pauses a running check: no step can be started and no Lotus answer is taken until it resumes. */
  async setPaused(actor: AccessActor, runId: string, paused: boolean) {
    const run = await this.ownedRun(actor, runId);
    if (run.status === "COMPLETE" || run.status === "CANCELLED") throw new BadRequestException("This check has ended.");
    const config = { ...((run.config ?? {}) as Record<string, unknown>) };
    if (paused) config.pausedAt = new Date().toISOString();
    else delete config.pausedAt;
    await this.prisma.classroomRun.update({ where: { id: runId }, data: { config: config as Prisma.InputJsonValue } });
    await this.notifyEveryone(run.classroomId, runId);
    return this.report(actor, runId);
  }

  /** Gives a running check an end time, minutes from now (or none). The background pass ends it then. */
  async setTimeLimit(actor: AccessActor, runId: string, minutes: number | null) {
    const run = await this.ownedRun(actor, runId);
    if (run.status === "COMPLETE" || run.status === "CANCELLED") throw new BadRequestException("This check has ended.");
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) throw new BadRequestException("Choose a time limit between 1 and 180 minutes.");
    const config = { ...((run.config ?? {}) as Record<string, unknown>) };
    if (minutes === null) delete config.endsAt;
    else config.endsAt = new Date(Date.now() + minutes * 60_000).toISOString();
    await this.prisma.classroomRun.update({ where: { id: runId }, data: { config: config as Prisma.InputJsonValue } });
    await this.notifyEveryone(run.classroomId, runId);
    return this.report(actor, runId);
  }

  /**
   * Reminds students who haven't started their step. Their open pages show it at once, and it
   * stays on their home page for a while. A student reminded in the last minute is left alone.
   */
  async nudgeNotStarted(actor: AccessActor, runId: string) {
    const run = await this.ownedRun(actor, runId);
    if (run.status !== "LIVE") throw new BadRequestException("Only a running check can send reminders.");
    if (runPausedAt(run.config)) throw new BadRequestException("Resume the check before sending reminders.");
    const waiting = await this.prisma.classroomAssignment.findMany({ where: { runId, status: "READY", startedAt: null }, select: { id: true, payload: true, enrollment: { select: { studentId: true } } } });
    const now = Date.now();
    const due = waiting.filter((row) => {
      const last = Date.parse(String((row.payload as { nudgedAt?: unknown } | null)?.nudgedAt ?? ""));
      return !Number.isFinite(last) || now - last >= 60_000;
    });
    for (const row of due) {
      await this.prisma.classroomAssignment.update({ where: { id: row.id }, data: { payload: { ...((row.payload ?? {}) as Record<string, unknown>), nudgedAt: new Date(now).toISOString() } as Prisma.InputJsonValue } });
    }
    const studentIds = [...new Set(due.map((row) => row.enrollment.studentId))];
    this.events?.nudgeStudents(studentIds, { runId, title: run.title });
    return { nudged: studentIds.length, alreadyReminded: waiting.length - due.length };
  }

  private async notifyEveryone(classroomId: string, runId: string): Promise<void> {
    const students = await this.prisma.classroomEnrollment.findMany({ where: { classroomId, leftAt: null }, select: { studentId: true } });
    this.notify(classroomId, { runId, studentIds: students.map((row) => row.studentId) });
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
    const run = await this.prisma.classroomRun.findUnique({ where: { id: assignment.runId }, select: { config: true } });
    if (runPausedAt(run?.config)) throw new ConflictException(PAUSED_MESSAGE);
    const started = await this.prisma.classroomAssignment.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: assignment.startedAt ?? new Date() } });
    if (assignment.status !== "IN_PROGRESS") await this.notifyRun(assignment.runId);
    return started;
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
      if (assignment.availableAt && lotus.startedAt < assignment.availableAt) throw new BadRequestException("Your teacher restarted this check. Start it again from your class page.");
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
          delivery: (video.script as { format?: string } | null)?.format === "SHORT" ? "SHORT" : video.assetId ? "VIDEO" : "HTML_FALLBACK",
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
    await this.notifyRun(assignment.runId, [actor.studentId]);
    await this.tellParentsIfFinished(assignment.runId, assignment.enrollmentId);
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
    assignments: Array<{ id: string; enrollmentId: string; kind: ClassroomAssignmentKind; status: string; availableAt?: Date | null; startedAt: Date | null; completedAt: Date | null; diagnosticSessionId: string | null; videoAssignmentId: string | null }>,
  ) {
    const enrollments = await this.prisma.classroomEnrollment.findMany({ where: { classroomId, leftAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) }, include: { student: { select: { id: true, name: true } } }, orderBy: { joinedAt: "asc" } });
    const sessionIds = [...new Set(assignments.map((a) => a.diagnosticSessionId).filter((v): v is string => Boolean(v)))];
    const videoIds = [...new Set(assignments.map((a) => a.videoAssignmentId).filter((v): v is string => Boolean(v)))];
    // A diagnostic being taken is not linked to its step until it is done: find its session through the step id it carries.
    const takingIds = assignments.filter((a) => a.kind === ClassroomAssignmentKind.DIAGNOSTIC && !a.diagnosticSessionId && (a.status === "READY" || a.status === "IN_PROGRESS")).map((a) => a.id);
    const [lotus, videos, exits, taking, lastEvents] = await Promise.all([
      sessionIds.length ? this.prisma.lotusSessionRecord.findMany({ where: { sessionId: { in: sessionIds } } }) : [],
      videoIds.length ? this.prisma.personalizedVideoAssignment.findMany({ where: { id: { in: videoIds } }, select: { id: true, status: true, script: true, scriptSource: true, updatedAt: true } }) : [],
      videoIds.length ? this.prisma.personalizedVideoEvent.findMany({ where: { assignmentId: { in: videoIds }, kind: "INDEPENDENT_EXIT" }, orderBy: { createdAt: "desc" } }) : [],
      takingIds.length
        ? this.prisma.lotusSessionRecord.findMany({ where: { OR: takingIds.map((id) => ({ payload: { path: ["classroomAssignmentId"], equals: id } })) }, select: { status: true, startedAt: true, payload: true }, orderBy: { startedAt: "asc" } })
        : [],
      videoIds.length ? this.prisma.personalizedVideoEvent.groupBy({ by: ["assignmentId"], where: { assignmentId: { in: videoIds } }, _max: { createdAt: true } }) : [],
    ]);
    const lotusBySession = new Map(lotus.map((r) => [r.sessionId, r]));
    const videoById = new Map(videos.map((v) => [v.id, v]));
    // Oldest first, so the latest session for a step wins; one from before a restart doesn't count.
    const availableAt = new Map(assignments.map((a) => [a.id, a.availableAt ?? null]));
    const takingByAssignment = new Map(
      taking
        .map((r) => [String((r.payload as { classroomAssignmentId?: unknown }).classroomAssignmentId), r] as const)
        .filter(([id, r]) => { const since = availableAt.get(id); return !since || r.startedAt >= since; }),
    );
    const lastEventByVideo = new Map(lastEvents.map((e) => [e.assignmentId, e._max.createdAt]));
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
      const takingStep = own.find((a) => a.kind === ClassroomAssignmentKind.DIAGNOSTIC && !a.diagnosticSessionId);
      const live = takingStep ? takingByAssignment.get(takingStep.id) : undefined;
      const liveAudits = ((live?.payload ?? {}) as { audits?: LotusQuestionAudit[] }).audits ?? [];
      const lastActiveAt = latest([
        ...own.flatMap((a) => [a.startedAt, a.completedAt]),
        last, live?.startedAt, liveAudits.at(-1)?.createdAt,
        video?.updatedAt, videoId ? lastEventByVideo.get(videoId) : undefined,
      ]);
      return {
        studentId: enrollment.student.id,
        name: enrollment.student.name,
        rollNumber: enrollment.rollNumber,
        assignments: own.map((a) => ({ kind: a.kind, status: a.status, startedAt: a.startedAt, completedAt: a.completedAt })),
        diagnostic: record?.status === "COMPLETE" && payload?.finalReport
          ? {
              outcome: payload.finalReport.outcome,
              ...(() => {
                const start = payload.finalReport.outcome === "SOLID_GAP" ? confirmedByDepth(foldLedger(audits))[0] : undefined;
                return { startingSkillId: start?.skillId, startingNotLearned: Boolean(start?.confirmedBySupport) };
              })(),
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
        lastActiveAt,
        ...(live ? { testFinished: live.status === "COMPLETE", answeredSoFar: liveAudits.length } : {}),
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

  /** The child's class checks as parent tasks: done on time, late, or still open and when it's due (parent-work.ts). */
  async workForStudent(studentId: string, now = new Date()) {
    const steps = await this.prisma.classroomAssignment.findMany({
      where: { enrollment: { studentId }, run: { status: { in: ["LIVE", "PAUSED", "COMPLETE"] }, startedAt: { not: null } } },
      select: { kind: true, status: true, startedAt: true, completedAt: true, run: { select: { id: true, title: true, config: true, status: true, startedAt: true, dueAt: true } } },
    });
    const byRun = new Map<string, WorkTask>();
    for (const step of steps) {
      const run = step.run;
      const task = byRun.get(run.id) ?? { runId: run.id, title: run.title, kind: checkKindOf(run.config), runStatus: run.status, launchedAt: run.startedAt!, dueAt: run.dueAt, steps: [] };
      task.steps.push({ kind: step.kind as StepKind, status: step.status as StepStatus, startedAt: step.startedAt, completedAt: step.completedAt });
      byRun.set(run.id, task);
    }
    return parentWork([...byRun.values()], now);
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
      controls: { pausedAt: runPausedAt(run.config), endsAt: runEndsAt(run.config) },
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

export const PAUSED_MESSAGE = "Your teacher has paused the class. You can carry on when they resume.";

/** When the teacher paused this check, or null while it runs. */
export function runPausedAt(config: unknown): string | null {
  const value = (config as { pausedAt?: unknown } | null)?.pausedAt;
  return typeof value === "string" && value ? value : null;
}

/** When this check ends by itself, or null without a time limit. */
export function runEndsAt(config: unknown): string | null {
  const value = (config as { endsAt?: unknown } | null)?.endsAt;
  return typeof value === "string" && value ? value : null;
}

/** The most recent of some timestamps (Dates or ISO strings), or null when there are none. */
function latest(values: Array<Date | string | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    const at = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(at.getTime()) && (!best || at > best)) best = at;
  }
  return best;
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
