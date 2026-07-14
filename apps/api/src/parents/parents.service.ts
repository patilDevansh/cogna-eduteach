import { createHash, randomBytes } from "node:crypto";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ReportAudience, UserRole } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { ReportGeneratorService } from "../engines/report-generator/report-generator.service";
import { ClerkAuthService } from "./clerk-auth.service";

function normalizeAccessCode(code: string): string {
  return code.trim().toLowerCase();
}

function hashAccessCode(code: string): string {
  return createHash("sha256").update(normalizeAccessCode(code)).digest("hex");
}

function generateAccessCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportGenerator: ReportGeneratorService,
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
      where: { parentId },
      include: { student: true },
    });

    return links.map((l) => ({
      id: l.student.id,
      name: l.student.name,
      grade: l.student.grade,
      curriculum: l.student.curriculum,
    }));
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

  async studentLogin(accessCode: string) {
    const hash = hashAccessCode(accessCode);
    const student = await this.prisma.student.findFirst({
      where: { accessCodeHash: hash, deletedAt: null },
    });

    if (!student) {
      throw new UnauthorizedException("Invalid access code.");
    }

    return {
      studentId: student.id,
      name: student.name,
      grade: student.grade,
    };
  }

  async resolveParentId(
    headerParentId?: string,
    authHeader?: string,
  ): Promise<string> {
    try {
      return await this.clerkAuth.resolveParentId(authHeader, headerParentId);
    } catch {
      throw new NotFoundException("No parent account found. Run db:seed or sign up.");
    }
  }

  clerkEnabled(): boolean {
    return this.clerkAuth.isEnabled();
  }
}
