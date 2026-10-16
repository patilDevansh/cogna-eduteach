import { createHash, randomBytes } from "node:crypto";
import { hashAccessCode } from "./access-code";
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma, ReportAudience, UserRole } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { ReportGeneratorService } from "../engines/report-generator/report-generator.service";
import { ClerkAuthService } from "./clerk-auth.service";
import {
  DEMO_STUDENT_NAME,
  DEMO_STUDENT_TEMPLATE_ID,
  isDemoFreshStudentPerLoginEnabled,
} from "../engines/diagnostic-v2/demo-student";
import { issueStudentToken } from "../access/cogna-access";
import { ClassTopicsService } from "../classrooms/class-topics.service";
import { ClassroomsService } from "../classrooms/classrooms.service";
import {
  hashPhoneCode,
  maskPhone,
  newPhoneCode,
  normalizePhone,
  PHONE_CODE_MAX_ATTEMPTS,
  PHONE_CODE_MAX_SENDS,
  PHONE_CODE_MINUTES,
  PHONE_CODE_WINDOW_MINUTES,
  sendPhoneCode as textPhoneCode,
} from "./phone";
import { setConsent } from "./consent";

export { hashAccessCode };

function generateAccessCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

const MAX_PENDING_REQUESTS = 5;

function tryIssueStudentToken(studentId: string): string | undefined {
  try {
    return issueStudentToken(studentId);
  } catch {
    return undefined;
  }
}

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly classrooms: ClassroomsService,
    private readonly topics: ClassTopicsService,
  ) {}

  /** Seeded pilot parent (links to Demo Student via db:seed). */
  async getSeededDemoParent() {
    const parent = await this.prisma.parent.findFirst({
      where: { user: { clerkId: "dev_parent_clerk" } },
      include: { user: true },
    });
    if (!parent) return null;
    return {
      parentId: parent.id,
      email: parent.user.email ?? "parent@demo.cogna.local",
      name: parent.name,
    };
  }

  async devSignup(input: { email: string; name: string }) {
    const email = input.email.trim().toLowerCase();
    if (email === "parent@demo.cogna.local") {
      const seeded = await this.getSeededDemoParent();
      if (seeded) return seeded;
    }

    const clerkId = `dev_${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;

    const user = await this.prisma.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        role: UserRole.PARENT,
        email,
      },
      update: { email },
    });

    const parent = await this.prisma.parent.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        name: input.name,
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      update: { name: input.name },
    });

    return { parentId: parent.id, email: input.email, name: input.name };
  }

  async listStudents(parentId: string) {
    const links = await this.prisma.parentStudentLink.findMany({
      where: { parentId, student: { deletedAt: null } },
      include: { student: { include: { _count: { select: { classroomEnrollments: { where: { leftAt: null } } } } } } },
    });
    const first = (name: string) => name.trim().split(/\s+/)[0]!.toLowerCase();
    const fromSchool = links.filter((l) => l.source !== "FAMILY");

    return links.map((l) => {
      // A child this parent added at home, with the same first name as a child linked from school
      // and not in any class themselves, is probably the same child added twice.
      const twin = l.source === "FAMILY" && !l.student.duplicateDismissedAt && !l.student._count.classroomEnrollments
        ? fromSchool.find((s) => first(s.student.name) === first(l.student.name))
        : undefined;
      return {
        id: l.student.id,
        name: l.student.name,
        grade: l.student.grade,
        curriculum: l.student.curriculum,
        fromSchool: l.source !== "FAMILY",
        ...(twin ? { sameAsSchoolChild: { id: twin.student.id, name: twin.student.name } } : {}),
      };
    });
  }

  /**
   * The parent's answer to "is this the same child as the one from school?". Same: the copy they
   * added at home is hidden (kept, not erased) so the child has one record and signs in with the
   * school's code. Different: we stop asking.
   */
  async resolveDuplicate(parentId: string, studentId: string, input: { same?: boolean; schoolChildId?: string }) {
    const [home, school] = await Promise.all([
      this.prisma.parentStudentLink.findUnique({ where: { parentId_studentId: { parentId, studentId } }, include: { student: { select: { primaryParentId: true, deletedAt: true } } } }),
      input.schoolChildId ? this.prisma.parentStudentLink.findUnique({ where: { parentId_studentId: { parentId, studentId: input.schoolChildId } } }) : null,
    ]);
    if (!home || home.source !== "FAMILY" || home.student.primaryParentId !== parentId || home.student.deletedAt) {
      throw new NotFoundException("That isn't a child you added yourself.");
    }
    if (input.same) {
      if (!school || school.source === "FAMILY") throw new BadRequestException("Choose the child from school to keep.");
      if (await this.prisma.classroomEnrollment.count({ where: { studentId, leftAt: null } })) {
        throw new BadRequestException("The child you added is in a class too. Ask the teacher which record to keep.");
      }
      await this.prisma.student.update({ where: { id: studentId }, data: { deletedAt: new Date() } });
    } else {
      await this.prisma.student.update({ where: { id: studentId }, data: { duplicateDismissedAt: new Date() } });
    }
    return this.listStudents(parentId);
  }

  /**
   * A parent stops following a child they were linked to through school. That withdraws their
   * consent; the school still decides about class use. They can agree again from the same page.
   */
  async leaveSchoolChild(parentId: string, studentId: string) {
    const link = await this.prisma.parentStudentLink.findUnique({ where: { parentId_studentId: { parentId, studentId } } });
    if (!link) throw new NotFoundException("That child isn't linked to you.");
    if (link.source === "FAMILY") throw new BadRequestException("You added this child yourself, so there's no school link to remove.");
    await this.prisma.$transaction(async (tx) => {
      await tx.parentStudentLink.delete({ where: { parentId_studentId: { parentId, studentId } } });
      await setConsent(tx, parentId, studentId, "PRACTICE_DECLINED");
    });
    await this.pingClasses(studentId);
    return this.listStudents(parentId);
  }

  /** The parent's phone, if they've proved they hold it, and whether they get texts. */
  async getPhone(parentId: string) {
    const parent = await this.prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { phone: true, phoneVerifiedAt: true, textUpdates: true } });
    return { phone: parent.phoneVerifiedAt ? parent.phone : null, textUpdates: parent.textUpdates };
  }

  async setTextUpdates(parentId: string, on: boolean) {
    await this.prisma.parent.update({ where: { id: parentId }, data: { textUpdates: on } });
    return this.getPhone(parentId);
  }

  /** Tells the teacher pages of this student's classes that who follows them has changed. */
  private async pingClasses(studentId: string) {
    const enrolments = await this.prisma.classroomEnrollment.findMany({ where: { studentId, leftAt: null }, select: { classroomId: true } });
    this.classrooms.parentsChanged(enrolments.map((e) => e.classroomId));
  }

  /** Texts a one-time code to the number, rate-limited per parent and per number. */
  async sendPhoneCode(parentId: string, input: string) {
    const phone = normalizePhone(input);
    if (!phone) throw new BadRequestException("That doesn't look like a mobile number. Type the 10-digit number, or include the country code.");
    const since = new Date(Date.now() - PHONE_CODE_WINDOW_MINUTES * 60_000);
    const [mine, forNumber] = await Promise.all([
      this.prisma.phoneVerificationCode.count({ where: { parentId, createdAt: { gte: since } } }),
      this.prisma.phoneVerificationCode.count({ where: { phone, createdAt: { gte: since } } }),
    ]);
    if (mine >= PHONE_CODE_MAX_SENDS || forNumber >= PHONE_CODE_MAX_SENDS) {
      throw new HttpException(`Too many codes asked for. Wait ${PHONE_CODE_WINDOW_MINUTES} minutes and try again.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = newPhoneCode();
    await this.prisma.phoneVerificationCode.create({
      data: { parentId, phone, codeHash: hashPhoneCode(parentId, phone, code), expiresAt: new Date(Date.now() + PHONE_CODE_MINUTES * 60_000) },
    });
    const sent = await textPhoneCode(phone, code);
    return { phone, masked: maskPhone(phone), expiresInMinutes: PHONE_CODE_MINUTES, ...sent };
  }

  /**
   * Checks the texted code and gives this account the number. A number belongs to one account: if
   * another account held it, that account loses it and the children it found through it, because
   * whoever proves they hold the phone now is who the school's record points to.
   */
  async verifyPhone(parentId: string, input: string, code: string) {
    const phone = normalizePhone(input);
    if (!phone) throw new BadRequestException("That doesn't look like a mobile number.");
    const pending = await this.prisma.phoneVerificationCode.findFirst({
      where: { parentId, phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException("That code has expired. Ask for a new one.");
    if (pending.attempts >= PHONE_CODE_MAX_ATTEMPTS) throw new BadRequestException("Too many tries. Ask for a new code.");
    if (pending.codeHash !== hashPhoneCode(parentId, phone, String(code ?? ""))) {
      await this.prisma.phoneVerificationCode.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException("That code didn't match. Check the text and try again.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.phoneVerificationCode.update({ where: { id: pending.id }, data: { usedAt: new Date() } });
      const previous = await tx.parent.findFirst({ where: { phone, id: { not: parentId } }, select: { id: true } });
      if (previous) {
        const links = await tx.parentStudentLink.findMany({ where: { parentId: previous.id, source: "PHONE" }, select: { studentId: true } });
        await tx.parentStudentLink.deleteMany({ where: { parentId: previous.id, source: "PHONE" } });
        await tx.consent.updateMany({ where: { parentId: previous.id, studentId: { in: links.map((l) => l.studentId) }, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.parent.update({ where: { id: previous.id }, data: { phone: null, phoneVerifiedAt: null } });
      }
      // A new number: links made through the old one no longer apply.
      const current = await tx.parent.findUniqueOrThrow({ where: { id: parentId }, select: { phone: true } });
      if (current.phone && current.phone !== phone) await this.dropPhoneLinks(tx, parentId, current.phone);
      await tx.parent.update({ where: { id: parentId }, data: { phone, phoneVerifiedAt: new Date() } });
    });
    return { phone, children: await this.schoolChildren(parentId) };
  }

  /** Every child whose school record lists this parent's verified phone, and whether they've said yes. */
  async schoolChildren(parentId: string) {
    const { phone } = await this.getPhone(parentId);
    if (!phone) return [];
    const [matches, declined] = await Promise.all([
      this.prisma.studentGuardianPhone.findMany({
        where: { phone, student: { deletedAt: null } },
        orderBy: { createdAt: "asc" },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              parentLinks: { where: { parentId }, select: { parentId: true } },
              classroomEnrollments: { where: { leftAt: null }, take: 1, orderBy: { joinedAt: "desc" }, select: { classroom: { select: { name: true, teacher: { select: { name: true } } } } } },
            },
          },
        },
      }),
      this.prisma.consent.findMany({ where: { parentId, consentType: "PRACTICE_DECLINED", revokedAt: null }, select: { studentId: true } }),
    ]);
    const no = new Set(declined.map((d) => d.studentId));
    return matches.map((m) => {
      const classroom = m.student.classroomEnrollments[0]?.classroom;
      return {
        studentId: m.student.id,
        name: m.student.name,
        relationship: m.relationship,
        className: classroom?.name ?? null,
        teacherName: classroom?.teacher.name ?? null,
        status: m.student.parentLinks.length ? ("LINKED" as const) : no.has(m.student.id) ? ("DECLINED" as const) : ("WAITING" as const),
      };
    });
  }

  /**
   * The parent's answer for a child the school listed with their phone. Yes links the child and
   * records consent for the practice they do in class; no records that, so the teacher can follow up.
   */
  async answerSchoolChild(parentId: string, studentId: string, agree: boolean) {
    const { phone } = await this.getPhone(parentId);
    if (!phone) throw new ForbiddenException("Confirm your phone number first.");
    const match = await this.prisma.studentGuardianPhone.findUnique({
      where: { studentId_phone: { studentId, phone } },
      include: { student: { select: { deletedAt: true } } },
    });
    if (!match || match.student.deletedAt) throw new NotFoundException("This child isn't listed with your phone number.");
    await this.prisma.$transaction(async (tx) => {
      if (agree) {
        await tx.parentStudentLink.upsert({
          where: { parentId_studentId: { parentId, studentId } },
          create: { parentId, studentId, relationship: match.relationship, canViewReports: true, source: "PHONE" },
          update: { canViewReports: true },
        });
        await tx.learnerProfile.upsert({ where: { studentId }, create: { studentId }, update: {} });
        await setConsent(tx, parentId, studentId, "PRACTICE_CONSENT");
      } else {
        await tx.parentStudentLink.deleteMany({ where: { parentId, studentId, source: "PHONE" } });
        await setConsent(tx, parentId, studentId, "PRACTICE_DECLINED");
      }
    });
    await this.pingClasses(studentId);
    return this.schoolChildren(parentId);
  }

  /**
   * For a parent whose phone isn't on the school's record: asks the class teacher to link their
   * child. Sending it is the parent's consent; the teacher picks the student and approves.
   */
  async requestLink(parentId: string, input: { joinCode?: string; childName?: string; rollNumber?: string }) {
    const childName = String(input.childName ?? "").replace(/\s+/g, " ").trim();
    const rollNumber = String(input.rollNumber ?? "").trim() || null;
    if (childName.length < 2 || childName.length > 80 || (rollNumber?.length ?? 0) > 40) {
      throw new BadRequestException("Type your child's name as the school has it (2–80 characters).");
    }
    const classroom = await this.prisma.classroom.findUnique({ where: { joinCode: String(input.joinCode ?? "").trim().toUpperCase() } });
    if (!classroom || classroom.archivedAt) throw new NotFoundException("That class code wasn't found. Check it with your child or the teacher.");
    const pending = await this.prisma.parentLinkRequest.findMany({ where: { parentId, status: "PENDING" }, select: { classroomId: true, childName: true } });
    const same = pending.some((r) => r.classroomId === classroom.id && r.childName.toLowerCase() === childName.toLowerCase());
    if (!same) {
      if (pending.length >= MAX_PENDING_REQUESTS) throw new BadRequestException("You have several requests waiting already. The teacher will answer them soon.");
      await this.prisma.parentLinkRequest.create({ data: { parentId, classroomId: classroom.id, childName, rollNumber } });
      this.classrooms.parentsChanged([classroom.id]);
    }
    return this.listLinkRequests(parentId);
  }

  async listLinkRequests(parentId: string) {
    const rows = await this.prisma.parentLinkRequest.findMany({
      where: { parentId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { classroom: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, childName: r.childName, rollNumber: r.rollNumber, className: r.classroom.name, status: r.status, createdAt: r.createdAt }));
  }

  /** Links found through a phone this parent no longer holds. */
  private async dropPhoneLinks(tx: Prisma.TransactionClient, parentId: string, oldPhone: string) {
    const listed = await tx.studentGuardianPhone.findMany({ where: { phone: oldPhone }, select: { studentId: true } });
    const ids = listed.map((l) => l.studentId);
    await tx.parentStudentLink.deleteMany({ where: { parentId, source: "PHONE", studentId: { in: ids } } });
    await tx.consent.updateMany({ where: { parentId, studentId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Updates from school, newest first, across all of this parent's children. */
  async listNotifications(parentId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.parentNotification.findMany({
        where: { parentId, student: { deletedAt: null } },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { student: { select: { name: true } } },
      }),
      this.prisma.parentNotification.count({ where: { parentId, readAt: null, student: { deletedAt: null } } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({ id: n.id, studentId: n.studentId, studentName: n.student.name, kind: n.kind, title: n.title, body: n.body, createdAt: n.createdAt, read: Boolean(n.readAt) })),
    };
  }

  async markNotificationsRead(parentId: string) {
    const { count } = await this.prisma.parentNotification.updateMany({ where: { parentId, readAt: null }, data: { readAt: new Date() } });
    return { marked: count };
  }

  async createStudent(
    parentId: string,
    input: { name: string; grade?: number },
  ) {
    const parent = await this.prisma.parent.findUniqueOrThrow({
      where: { id: parentId },
    });

    const accessCode = generateAccessCode();

    const student = await this.prisma.student.create({
      data: {
        primaryParentId: parent.id,
        name: input.name,
        grade: input.grade ?? 8,
        accessCodeHash: hashAccessCode(accessCode),
      },
    });

    await this.prisma.parentStudentLink.create({
      data: {
        parentId: parent.id,
        studentId: student.id,
        relationship: "parent",
        canViewReports: true,
      },
    });

    await this.prisma.learnerProfile.create({
      data: { studentId: student.id },
    });

    await this.prisma.consent.create({
      data: {
        parentId: parent.id,
        studentId: student.id,
        consentType: "PRACTICE_CONSENT",
        grantedAt: new Date(),
      },
    });

    return {
      studentId: student.id,
      name: student.name,
      accessCode,
    };
  }

  async regenerateAccessCode(parentId: string, studentId: string) {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (!link) {
      throw new UnauthorizedException("Student not linked to this parent.");
    }
    // A child the school added signs in with the school's code; only their teacher resets it.
    if (link.source !== "FAMILY") {
      throw new ForbiddenException("Your child's sign-in code comes from school. Ask their teacher for a new one.");
    }

    const accessCode = generateAccessCode();
    await this.prisma.student.update({
      where: { id: studentId },
      data: { accessCodeHash: hashAccessCode(accessCode) },
    });

    return { studentId, accessCode };
  }

  async getStudentSummary(parentId: string, studentId: string): Promise<{
    studentId: string;
    reportId: string;
    renderedText: string;
    structuredData: unknown;
    createdAt: Date;
  }> {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });

    if (!link || !link.canViewReports) {
      throw new UnauthorizedException("Parent cannot view reports for this student.");
    }

    const report = await this.reportGenerator.getLatestReport(
      studentId,
      ReportAudience.PARENT,
    );

    if (!report) {
      throw new NotFoundException("No parent summary report found yet.");
    }

    return {
      studentId,
      reportId: report.id,
      renderedText: report.renderedText,
      structuredData: report.structuredData,
      createdAt: report.createdAt,
    };
  }

  async getWeeklySummary(
    parentId: string,
    studentId: string,
  ): Promise<{
    studentId: string;
    reportId: string;
    structuredSummary: unknown;
    renderedText: string;
    periodStart: string;
    periodEnd: string;
  }> {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });

    if (!link || !link.canViewReports) {
      throw new UnauthorizedException("Parent cannot view reports for this student.");
    }

    const report = await this.reportGenerator.getLatestWeeklyReport(studentId);
    if (!report) {
      throw new NotFoundException("No weekly parent report found yet.");
    }

    return {
      studentId,
      reportId: report.id,
      structuredSummary: report.structuredData,
      renderedText: report.renderedText,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
    };
  }

  /** What a parent sees for one child: their classes (own results only) and their recent personal lessons. */
  async getOverview(parentId: string, studentId: string) {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
      include: { student: { select: { id: true, name: true, grade: true } } },
    });
    if (!link || !link.canViewReports) {
      throw new UnauthorizedException("Parent cannot view reports for this student.");
    }

    const [classes, lessons, checksDone, lastCheck, growth, work] = await Promise.all([
      this.classrooms.forStudent(studentId),
      this.prisma.personalizedVideoAssignment.findMany({
        where: { studentId, status: { in: ["READY", "FALLBACK"] } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          learningObjective: true,
          script: true,
          events: { select: { kind: true, exitCorrect: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
      }),
      this.prisma.lotusSessionRecord.count({ where: { studentId, status: "COMPLETE" } }),
      this.prisma.lotusSessionRecord.findFirst({ where: { studentId }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      this.topics.growthForStudent(studentId),
      this.classrooms.workForStudent(studentId),
    ]);

    const lessonRows = lessons.map((l) => {
      const exit = l.events.find((e) => e.kind === "INDEPENDENT_EXIT");
      return {
        id: l.id,
        title: (l.script as { lesson?: { title?: string } } | null)?.lesson?.title ?? l.learningObjective,
        date: l.createdAt,
        finished: l.events.some((e) => e.kind === "COMPLETED"),
        finalCorrect: exit ? exit.exitCorrect : null,
      };
    });
    const lastActive = [lastCheck?.startedAt, ...lessons.flatMap((l) => l.events.map((e) => e.createdAt))]
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      student: link.student,
      classes,
      lessons: lessonRows,
      totals: { checksDone, lessonsFinished: lessonRows.filter((l) => l.finished).length },
      lastActive,
      growth,
      work,
    };
  }

  async getBillingStatus(parentId: string) {
    const parent = await this.prisma.parent.findUniqueOrThrow({
      where: { id: parentId },
    });

    return {
      status: "stub",
      subscriptionStatus: parent.subscriptionStatus,
      trialEndsAt: parent.trialEndsAt,
      message: "Payment integration post-MVP. Trial fields active for pilot.",
      paymentProvider: null,
    };
  }

  async inviteSecondaryParent(
    parentId: string,
    studentId: string,
    input: { email: string; relationship?: string },
  ) {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });

    if (!link) {
      throw new UnauthorizedException("Parent is not linked to this student.");
    }

    return {
      status: "stub",
      invitedEmail: input.email,
      relationship: input.relationship ?? "guardian",
      message:
        "Multi-parent invite recorded (stub). Full invite email flow is post-MVP.",
    };
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkAuth: ClerkAuthService,
  ) {}

  async studentLogin(accessCode: string, opts?: { reuseTemplate?: boolean }) {
    const hash = hashAccessCode(accessCode);
    const student = await this.prisma.student.findFirst({
      where: { accessCodeHash: hash, deletedAt: null },
    });

    if (!student) {
      throw new UnauthorizedException("Invalid access code.");
    }

    const isTemplate = student.id === DEMO_STUDENT_TEMPLATE_ID;
    if (isTemplate && isDemoFreshStudentPerLoginEnabled() && !opts?.reuseTemplate) {
      const clone = await this.mintDemoStudentClone(student);
      return {
        studentId: clone.id,
        name: clone.name,
        grade: clone.grade,
        sessionToken: tryIssueStudentToken(clone.id),
      };
    }

    return {
      studentId: student.id,
      name: student.name,
      grade: student.grade,
      sessionToken: tryIssueStudentToken(student.id),
    };
  }

  async listDemoRuns() {
    if (!isDemoFreshStudentPerLoginEnabled() && process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    const clones = await this.prisma.student.findMany({
      where: { id: { startsWith: "demo_" }, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { diagnosticV2Sessions: true } },
      },
    });
    return clones.map((c, i) => ({
      studentId: c.id,
      name: c.name,
      runLabel: `Demo Student ${i + 1}`,
      createdAt: c.createdAt.toISOString(),
      sessionCount: c._count.diagnosticV2Sessions,
    }));
  }

  private async mintDemoStudentClone(template: {
    id: string;
    primaryParentId: string;
    grade: number;
    curriculum: string;
  }) {
    const id = `demo_${randomBytes(12).toString("hex")}`;
    const accessCodeHash = hashAccessCode(`demo-clone-${id}-${randomBytes(8).toString("hex")}`);

    const clone = await this.prisma.student.create({
      data: {
        id,
        primaryParentId: template.primaryParentId,
        name: DEMO_STUDENT_NAME,
        grade: template.grade,
        curriculum: template.curriculum,
        accessCodeHash,
      },
    });

    const link = await this.prisma.parentStudentLink.findUnique({
      where: {
        parentId_studentId: { parentId: template.primaryParentId, studentId: template.id },
      },
    });
    if (link) {
      // The parent follows only the latest demo run; older runs stay listed in dev/demo-runs.
      await this.prisma.parentStudentLink.deleteMany({
        where: { parentId: template.primaryParentId, studentId: { startsWith: "demo_" } },
      });
      await this.prisma.parentStudentLink.create({
        data: {
          parentId: template.primaryParentId,
          studentId: clone.id,
          relationship: link.relationship,
          canViewReports: link.canViewReports,
        },
      });
    }

    return clone;
  }

  async resolveParentId(
    headerParentId?: string,
    authHeader?: string,
  ): Promise<string> {
    try {
      return await this.clerkAuth.resolveParentId(authHeader, headerParentId);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error; // "sign in", not "no account"
      throw new NotFoundException("No parent account found. Run db:seed or sign up.");
    }
  }

  clerkEnabled(): boolean {
    return this.clerkAuth.isEnabled();
  }
}
