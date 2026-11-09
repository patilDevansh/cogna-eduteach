import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessActor } from "../access/cogna-access";
import { assertTeacher } from "../access/cogna-access";
import type {
  LotusClassroomPortfolio,
  LotusClassroomSkillAggregation,
  LotusCompetencyRating,
  LotusFinalReport,
  LotusSessionView,
  LotusSkillSummary,
} from "@cogna/shared";

export interface StudentReportEntry {
  studentId: string;
  report: LotusFinalReport;
}

/**
 * Pure calculation of classroom portfolio aggregation from completed student reports.
 * Zero database or network dependencies — 100% deterministic for testing.
 */
export function calculateClassroomPortfolio(params: {
  classroomId: string;
  totalEnrolled: number;
  studentReports: StudentReportEntry[];
}): LotusClassroomPortfolio {
  const { classroomId, totalEnrolled, studentReports } = params;
  const completedTests = studentReports.length;

  if (completedTests === 0) {
    return {
      classroomId,
      totalEnrolled,
      completedTests: 0,
      skills: [],
      wholeClassFocusAreas: [],
      teacherBrief:
        totalEnrolled === 0
          ? "No students are currently enrolled in this classroom."
          : `0 of ${totalEnrolled} enrolled students have completed the diagnostic. Aggregated skill metrics and teacher brief will generate as diagnostics are completed.`,
    };
  }

  // 1. Collect skills preserving discovery order
  const skillMap = new Map<string, { skillId: string; name: string; ratings: number[] }>();

  for (const entry of studentReports) {
    const skills = entry.report.skills ?? [];
    for (const skill of skills) {
      if (!skillMap.has(skill.skillId)) {
        skillMap.set(skill.skillId, {
          skillId: skill.skillId,
          name: skill.name,
          ratings: [],
        });
      }
      if (typeof skill.rating === "number" && skill.rating >= 1 && skill.rating <= 5) {
        skillMap.get(skill.skillId)!.ratings.push(skill.rating);
      }
    }
  }

  // 2. Compute per-skill aggregations
  const skills: LotusClassroomSkillAggregation[] = [];

  for (const [skillId, meta] of skillMap.entries()) {
    const ratings = meta.ratings;
    const criticalCount = ratings.filter((r) => r === 1 || r === 2).length;
    const emergingCount = ratings.filter((r) => r === 3).length;
    const fluentCount = ratings.filter((r) => r === 4 || r === 5).length;

    const classAverage =
      ratings.length > 0
        ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
        : 0;

    const criticalPercent = Math.round((criticalCount / completedTests) * 100);
    const emergingPercent = Math.round((emergingCount / completedTests) * 100);
    const fluentPercent = Math.round((fluentCount / completedTests) * 100);

    skills.push({
      skillId,
      name: meta.name,
      classAverage,
      criticalCount,
      emergingCount,
      fluentCount,
      criticalPercent,
      emergingPercent,
      fluentPercent,
    });
  }

  // 3. Determine wholeClassFocusAreas
  const evaluatedSkills = skills.filter((s) => s.criticalCount + s.emergingCount + s.fluentCount > 0);
  const highCritical = evaluatedSkills
    .filter((s) => s.criticalPercent >= 30)
    .sort((a, b) => b.criticalPercent - a.criticalPercent || a.classAverage - b.classAverage);

  let wholeClassFocusAreas: string[];
  if (highCritical.length > 0) {
    wholeClassFocusAreas = highCritical.slice(0, 3).map((s) => s.name);
  } else {
    // Fallback to lowest average skills if any are below 3.5
    const lowAverage = evaluatedSkills
      .filter((s) => s.classAverage < 3.5 && s.criticalCount + s.emergingCount > 0)
      .sort((a, b) => a.classAverage - b.classAverage || b.criticalCount - a.criticalCount);
    wholeClassFocusAreas = lowAverage.slice(0, 2).map((s) => s.name);
  }

  // 4. Generate automated teacher brief
  let studentCritical = 0;
  let studentEmerging = 0;
  let studentFluent = 0;

  for (const entry of studentReports) {
    const studentRatings = (entry.report.skills ?? [])
      .map((s) => s.rating)
      .filter((r): r is LotusCompetencyRating => typeof r === "number");

    if (studentRatings.some((r) => r === 1 || r === 2)) {
      studentCritical++;
    } else if (studentRatings.some((r) => r === 3)) {
      studentEmerging++;
    } else if (studentRatings.length > 0 && studentRatings.every((r) => r >= 4)) {
      studentFluent++;
    }
  }

  const fluentPct = Math.round((studentFluent / completedTests) * 100);
  const emergingPct = Math.round((studentEmerging / completedTests) * 100);
  const criticalPct = Math.round((studentCritical / completedTests) * 100);

  const briefParts: string[] = [];
  briefParts.push(`${completedTests} of ${totalEnrolled} enrolled students have completed the diagnostic.`);
  briefParts.push(
    `Overall distribution: ${studentFluent} fluent (${fluentPct}%), ${studentEmerging} emerging (${emergingPct}%), and ${studentCritical} critical (${criticalPct}%).`,
  );

  if (wholeClassFocusAreas.length > 0) {
    briefParts.push(`Whole-class focus should center on: ${wholeClassFocusAreas.join(", ")}.`);
    briefParts.push(
      `Recommended next step: Dedicate 10–15 minutes of whole-class instruction to ${wholeClassFocusAreas[0]} before advancing to independent practice.`,
    );
  } else {
    briefParts.push("No critical whole-class blockers identified; the class demonstrates strong readiness.");
    briefParts.push("Recommended next step: Proceed to independent practice and Class 9/10 stretch challenges.");
  }

  const teacherBrief = briefParts.join(" ");

  return {
    classroomId,
    totalEnrolled,
    completedTests,
    skills,
    wholeClassFocusAreas,
    teacherBrief,
  };
}

@Injectable()
export class LotusClassroomService {
  constructor(private readonly prisma: PrismaService) {}

  async getClassroomPortfolio(
    classroomId: string,
    actor: AccessActor,
  ): Promise<LotusClassroomPortfolio> {
    assertTeacher(actor);
    if (actor.role !== "teacher") throw new ForbiddenException("A teacher account is required.");

    // Verify teacher owns classroom
    const identityKey = `${actor.schoolId}:${actor.teacherEmail.toLowerCase()}`;
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: classroomId,
        teacher: { identityKey },
        schoolId: actor.schoolId,
        archivedAt: null,
      },
      select: { id: true, name: true },
    });

    if (!classroom) {
      throw new NotFoundException("Classroom not found.");
    }

    // 1. Find all active student enrollments
    const enrollments = await this.prisma.classroomEnrollment.findMany({
      where: {
        classroomId,
        leftAt: null,
        student: { deletedAt: null },
      },
      select: {
        studentId: true,
      },
    });

    const totalEnrolled = enrollments.length;
    if (totalEnrolled === 0) {
      return calculateClassroomPortfolio({
        classroomId,
        totalEnrolled: 0,
        studentReports: [],
      });
    }

    const studentIds = enrollments.map((e) => e.studentId);

    // 2. Query completed sessions for enrolled students
    const records = await this.prisma.lotusSessionRecord.findMany({
      where: {
        studentId: { in: studentIds },
        status: "COMPLETE",
      },
      orderBy: {
        startedAt: "desc",
      },
      select: {
        studentId: true,
        payload: true,
      },
    });

    // 3. Deduplicate: pick the latest completed report per student
    const studentReportMap = new Map<string, LotusFinalReport>();

    for (const record of records) {
      if (studentReportMap.has(record.studentId)) continue;
      const payload = record.payload as unknown as Partial<LotusSessionView> | null;
      if (payload?.finalReport && Array.isArray(payload.finalReport.skills)) {
        studentReportMap.set(record.studentId, payload.finalReport);
      }
    }

    const studentReports: StudentReportEntry[] = Array.from(studentReportMap.entries()).map(
      ([studentId, report]) => ({ studentId, report }),
    );

    // 4. Delegate to pure calculation engine
    return calculateClassroomPortfolio({
      classroomId,
      totalEnrolled,
      studentReports,
    });
  }
}
