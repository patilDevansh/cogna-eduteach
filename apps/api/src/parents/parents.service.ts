import { createHash, randomBytes } from "node:crypto";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

  async devSignup(input: { email: string; name: string }) {
    const clerkId = `dev_${createHash("sha256").update(input.email).digest("hex").slice(0, 16)}`;

    const user = await this.prisma.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        role: UserRole.PARENT,
        email: input.email,
      },
      update: { email: input.email },
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
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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

  async resolveParentId(headerParentId?: string): Promise<string> {
    if (headerParentId) {
      const parent = await this.prisma.parent.findUnique({
        where: { id: headerParentId },
      });
      if (parent) return parent.id;
    }

    const devParent = await this.prisma.parent.findFirst({
      where: { user: { clerkId: "dev_parent_clerk" } },
    });

    if (!devParent) {
      throw new NotFoundException("No parent account found. Run db:seed or sign up.");
    }

    return devParent.id;
  }
}
