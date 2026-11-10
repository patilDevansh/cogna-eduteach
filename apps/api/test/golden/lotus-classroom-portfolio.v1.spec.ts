/**
 * Golden Test Suite: Lotus Classroom Portfolio Aggregation & Teacher Brief
 * Target: apps/api/test/golden/lotus-classroom-portfolio.v1.spec.ts
 *
 * Requirements Covered (R5):
 * 1. Full classroom rollups across realistic student cohorts (25-30 student dossiers).
 * 2. Exact skill averages, band distributions (Critical: 1-2, Emerging: 3, Fluent: 4-5), and percentages.
 * 3. Deterministic identification of whole-class focus areas (criticalPercent >= 30% or lowest averages).
 * 4. Automated teacher brief narrative generation with pedagogical nuance and launchpad recommendations.
 * 5. Edge cases: Empty classrooms (0 enrolled), Enrolled students with 0 completed tests, Partial completion.
 * 6. Edge cases: Withdrawn students (leftAt !== null), Multiple sessions per student (latest completed session rule).
 * 7. Edge cases: Sparse / heterogeneous skill subsets without divide-by-zero or NaN.
 * 8. Controller authorization: Teacher token verification, School isolation, Student token rejection (403),
 *    Unauthenticated rejection (401), Non-existent classroom (404).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type {
  LotusClassroomPortfolio,
  LotusClassroomSkillAggregation,
  LotusCompetencyRating,
  LotusCompetencyStatus,
  LotusFinalReport,
  LotusSkillSummary,
} from "@cogna/shared";
import {
  issueTeacherToken,
  issueStudentToken,
  resolveActor,
  assertTeacher,
  type AccessActor,
} from "../../src/access/cogna-access";
import {
  LotusClassroomService,
  calculateClassroomPortfolio,
  type StudentReportEntry,
} from "../../src/lotus/lotus-classroom.service";
import { LotusController } from "../../src/lotus/lotus.controller";

process.env.COGNA_SESSION_SECRET = process.env.COGNA_SESSION_SECRET ?? "test-session-secret";
process.env.COGNA_JOB_WORKER_TOKEN = "test-worker-token";

// ---------------------------------------------------------------------------
// Helpers & Test Fixture Factories
// ---------------------------------------------------------------------------

function ratingStatusFor(rating: LotusCompetencyRating): LotusCompetencyStatus {
  switch (rating) {
    case 1:
      return "CRITICAL_BLOCKER";
    case 2:
      return "FRAGILE";
    case 3:
      return "EMERGING";
    case 4:
      return "FLUENT";
    case 5:
      return "ADVANCED_MASTERY";
  }
}

function makeSkillSummary(skillId: string, name: string, rating: LotusCompetencyRating): LotusSkillSummary {
  return {
    skillId,
    name,
    state: rating >= 4 ? "SECURE" : rating === 3 ? "OBSERVED" : "CONFIRMED",
    rating,
    ratingStatus: ratingStatusFor(rating),
    evidence: [`Rating ${rating} demonstration for ${skillId}`],
  };
}

function makeFinalReport(skills: Array<{ skillId: string; name: string; rating: LotusCompetencyRating }>): LotusFinalReport {
  return {
    board: "CBSE",
    outcome: skills.some((s) => s.rating <= 2) ? "SOLID_GAP" : "ADVANCEMENT",
    startingPoint: "Q1",
    startingZone: {
      moduleId: skills.some((s) => s.rating <= 2) ? "MOD_FACT_SIGNS_MEANING" : "MOD_FACT_ADVANCED_SYNTHESIS",
      moduleName: "Factorisation Launchpad",
      rationale: "Starting zone based on diagnostic evidence.",
      scaffoldingLevel: skills.some((s) => s.rating <= 2) ? "FOUNDATIONAL_REMEDIATION" : "INDEPENDENT",
      microInterventions: [],
    },
    observedStrengths: skills.filter((s) => s.rating >= 4).map((s) => s.name),
    uncertainAreas: skills.filter((s) => s.rating === 3).map((s) => s.name),
    evidenceSummary: ["Completed 15-question canonical diagnostic spine."],
    recommendedNextStep: "Proceed to module learning.",
    limitations: [],
    skills: skills.map((s) => makeSkillSummary(s.skillId, s.name, s.rating)),
  };
}

interface StudentSessionData {
  studentId: string;
  studentName: string;
  report: LotusFinalReport;
  startedAt?: Date;
  status?: string;
  leftAt?: Date | null;
}

function buildMockPrisma(args: {
  classroom: { id: string; teacherId: string; schoolId: string; name: string; archivedAt?: Date | null } | null;
  teacher?: { id: string; identityKey: string; schoolId: string };
  students: StudentSessionData[];
}) {
  const teacherRow = args.teacher ?? {
    id: args.classroom?.teacherId ?? "teacher-1",
    identityKey: `school-1:teacher@school.test`,
    schoolId: args.classroom?.schoolId ?? "school-1",
  };

  return {
    teacher: {
      findUnique: async ({ where }: { where: { identityKey: string } }) => {
        if (where.identityKey === teacherRow.identityKey) return teacherRow;
        return null;
      },
    },
    classroom: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (!args.classroom) return null;
        if (args.classroom.archivedAt && where.archivedAt === null) return null;
        if (where.id && where.id !== args.classroom.id) return null;
        if (where.schoolId && where.schoolId !== args.classroom.schoolId) return null;
        return args.classroom;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (!args.classroom || args.classroom.id !== where.id) return null;
        return args.classroom;
      },
    },
    classroomEnrollment: {
      findMany: async ({ where }: { where: { classroomId: string; leftAt?: null | object } }) => {
        if (!args.classroom || where.classroomId !== args.classroom.id) return [];
        return args.students
          .filter((s) => {
            if (where.leftAt === null && s.leftAt) return false;
            return true;
          })
          .map((s, idx) => ({
            id: `enrol-${idx + 1}`,
            classroomId: args.classroom!.id,
            studentId: s.studentId,
            rollNumber: `${idx + 1}`,
            admissionNumber: `ADM-${idx + 1}`,
            joinedAt: new Date("2026-01-01T00:00:00Z"),
            leftAt: s.leftAt ?? null,
            student: {
              id: s.studentId,
              name: s.studentName,
              deletedAt: null,
            },
          }));
      },
    },
    lotusSessionRecord: {
      findMany: async ({ where }: { where: { studentId: { in: string[] }; status?: string } }) => {
        const studentIds = new Set(where.studentId.in);
        return args.students
          .filter((s) => studentIds.has(s.studentId))
          .filter((s) => (where.status ? (s.status ?? "COMPLETE") === where.status : true))
          .map((s, idx) => ({
            id: `sess-${idx + 1}`,
            sessionId: `lotus-sess-${s.studentId}`,
            studentId: s.studentId,
            status: s.status ?? "COMPLETE",
            phase: "CONFIRM",
            startedAt: s.startedAt ?? new Date("2026-02-01T10:00:00Z"),
            endedAt: new Date("2026-02-01T10:25:00Z"),
            payload: {
              sessionId: `lotus-sess-${s.studentId}`,
              studentId: s.studentId,
              grade: 8,
              board: "CBSE",
              status: s.status ?? "COMPLETE",
              finalReport: s.report,
            },
          }));
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 28-Student Realistic Cohort Definition (Class 8-A)
// ---------------------------------------------------------------------------

const SKILL_NUMERIC = { skillId: "FAC_GCF_NUMERIC", name: "HCF of whole numbers" };
const SKILL_NEGATIVE = { skillId: "FAC_GCF_NEGATIVE", name: "Taking out a negative common factor" };
const SKILL_GROUP = { skillId: "FAC_GROUP_TERMS", name: "Grouping four terms into pairs" };
const SKILL_SQUARES = { skillId: "FAC_DIFF_SQUARES", name: "Difference of two squares" };
const SKILL_TRINOMIAL = { skillId: "FAC_MONIC_TRINOMIAL", name: "Factorising x² + bx + c" };

function generate28StudentCohort(): StudentSessionData[] {
  const students: StudentSessionData[] = [];

  // Group 1: Sarah Persona Group (6 students) - Careless/Prerequisite Sign Blocker
  // Strong on numeric & squares, blocked on negative GCF, emerging on trinomials
  const sarahRatings: Array<[LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating]> = [
    [5, 1, 4, 4, 3],
    [4, 2, 3, 5, 3],
    [5, 1, 4, 4, 2],
    [4, 2, 4, 4, 3],
    [5, 1, 3, 5, 2],
    [4, 2, 4, 4, 3],
  ];
  sarahRatings.forEach((ratings, i) => {
    students.push({
      studentId: `student_sarah_${i + 1}`,
      studentName: `Sarah Group Student ${i + 1}`,
      report: makeFinalReport([
        { ...SKILL_NUMERIC, rating: ratings[0] },
        { ...SKILL_NEGATIVE, rating: ratings[1] },
        { ...SKILL_GROUP, rating: ratings[2] },
        { ...SKILL_SQUARES, rating: ratings[3] },
        { ...SKILL_TRINOMIAL, rating: ratings[4] },
      ]),
    });
  });

  // Group 2: Kabir / Blitzer Group (5 students) - Ceiling Escalation / Advanced Mastery
  // 5/5 across all evaluated skills
  for (let i = 1; i <= 5; i++) {
    students.push({
      studentId: `student_kabir_${i}`,
      studentName: `Kabir Group Student ${i}`,
      report: makeFinalReport([
        { ...SKILL_NUMERIC, rating: 5 },
        { ...SKILL_NEGATIVE, rating: 5 },
        { ...SKILL_GROUP, rating: 5 },
        { ...SKILL_SQUARES, rating: 5 },
        { ...SKILL_TRINOMIAL, rating: 5 },
      ]),
    });
  }

  // Group 3: Meena / Aarav Group (8 students) - Emerging Grouping & Trinomial Fragility
  const meenaRatings: Array<[LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating]> = [
    [4, 3, 3, 3, 2],
    [4, 2, 3, 4, 2],
    [4, 3, 3, 3, 2],
    [4, 3, 3, 4, 3],
    [4, 2, 3, 3, 2],
    [3, 3, 3, 4, 2],
    [4, 2, 2, 4, 3],
    [4, 3, 3, 3, 2],
  ];
  meenaRatings.forEach((ratings, i) => {
    students.push({
      studentId: `student_meena_${i + 1}`,
      studentName: `Meena Group Student ${i + 1}`,
      report: makeFinalReport([
        { ...SKILL_NUMERIC, rating: ratings[0] },
        { ...SKILL_NEGATIVE, rating: ratings[1] },
        { ...SKILL_GROUP, rating: ratings[2] },
        { ...SKILL_SQUARES, rating: ratings[3] },
        { ...SKILL_TRINOMIAL, rating: ratings[4] },
      ]),
    });
  });

  // Group 4: Deepak Group (4 students) - Foundational Arithmetic / Acute Paralysis
  const deepakRatings: Array<[LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating]> = [
    [2, 1, 1, 1, 1],
    [1, 1, 1, 2, 1],
    [2, 1, 2, 1, 1],
    [2, 1, 1, 2, 1],
  ];
  deepakRatings.forEach((ratings, i) => {
    students.push({
      studentId: `student_deepak_${i + 1}`,
      studentName: `Deepak Group Student ${i + 1}`,
      report: makeFinalReport([
        { ...SKILL_NUMERIC, rating: ratings[0] },
        { ...SKILL_NEGATIVE, rating: ratings[1] },
        { ...SKILL_GROUP, rating: ratings[2] },
        { ...SKILL_SQUARES, rating: ratings[3] },
        { ...SKILL_TRINOMIAL, rating: ratings[4] },
      ]),
    });
  });

  // Group 5: Solid Core Group (5 students) - Typical Grade 8 Performance
  const solidRatings: Array<[LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating, LotusCompetencyRating]> = [
    [4, 3, 4, 4, 3],
    [4, 4, 3, 4, 3],
    [4, 3, 4, 4, 4],
    [4, 3, 4, 5, 3],
    [5, 4, 3, 4, 3],
  ];
  solidRatings.forEach((ratings, i) => {
    students.push({
      studentId: `student_solid_${i + 1}`,
      studentName: `Solid Core Student ${i + 1}`,
      report: makeFinalReport([
        { ...SKILL_NUMERIC, rating: ratings[0] },
        { ...SKILL_NEGATIVE, rating: ratings[1] },
        { ...SKILL_GROUP, rating: ratings[2] },
        { ...SKILL_SQUARES, rating: ratings[3] },
        { ...SKILL_TRINOMIAL, rating: ratings[4] },
      ]),
    });
  });

  return students;
}

// ---------------------------------------------------------------------------
// Golden Test Suites
// ---------------------------------------------------------------------------

describe("Golden Suite: Lotus Classroom Portfolio Aggregation (M5)", () => {
  const teacherActor: AccessActor = {
    role: "teacher",
    teacherEmail: "teacher@school.test",
    schoolId: "school-1",
  };

  describe("1. Pure Calculation Engine: calculateClassroomPortfolio", () => {
    it("rolls up 28 completed dossiers with exact skill averages, counts, and percentages", () => {
      const cohort = generate28StudentCohort();
      assert.equal(cohort.length, 28, "Cohort must have exactly 28 students");

      const studentReports: StudentReportEntry[] = cohort.map((s) => ({
        studentId: s.studentId,
        report: s.report,
      }));

      const portfolio = calculateClassroomPortfolio({
        classroomId: "class-8a",
        totalEnrolled: 28,
        studentReports,
      });

      // Verify Cohort Totals
      assert.equal(portfolio.classroomId, "class-8a");
      assert.equal(portfolio.totalEnrolled, 28);
      assert.equal(portfolio.completedTests, 28);
      assert.equal(portfolio.skills.length, 5);

      // 1. FAC_GCF_NUMERIC
      // Sum = 111, Avg = 111/28 = 3.964 -> 4.0
      // Critical (1-2) = 4 (14%), Emerging (3) = 1 (4%), Fluent (4-5) = 23 (82%)
      const numericSkill = portfolio.skills.find((s) => s.skillId === "FAC_GCF_NUMERIC");
      assert.ok(numericSkill, "FAC_GCF_NUMERIC must be aggregated");
      assert.equal(numericSkill.classAverage, 4.0);
      assert.equal(numericSkill.criticalCount, 4);
      assert.equal(numericSkill.emergingCount, 1);
      assert.equal(numericSkill.fluentCount, 23);
      assert.equal(numericSkill.criticalPercent, 14);
      assert.equal(numericSkill.emergingPercent, 4);
      assert.equal(numericSkill.fluentPercent, 82);
      assert.equal(numericSkill.criticalCount + numericSkill.emergingCount + numericSkill.fluentCount, 28);

      // 2. FAC_GCF_NEGATIVE
      // Sum = 76, Avg = 76/28 = 2.714 -> 2.7
      // Critical (1-2) = 13 (46%), Emerging (3) = 8 (29%), Fluent (4-5) = 7 (25%)
      const negativeSkill = portfolio.skills.find((s) => s.skillId === "FAC_GCF_NEGATIVE");
      assert.ok(negativeSkill, "FAC_GCF_NEGATIVE must be aggregated");
      assert.equal(negativeSkill.classAverage, 2.7);
      assert.equal(negativeSkill.criticalCount, 13);
      assert.equal(negativeSkill.emergingCount, 8);
      assert.equal(negativeSkill.fluentCount, 7);
      assert.equal(negativeSkill.criticalPercent, 46);
      assert.equal(negativeSkill.emergingPercent, 29);
      assert.equal(negativeSkill.fluentPercent, 25);
      assert.equal(negativeSkill.criticalCount + negativeSkill.emergingCount + negativeSkill.fluentCount, 28);

      // 3. FAC_GROUP_TERMS
      // Sum = 93, Avg = 93/28 = 3.321 -> 3.3
      // Critical (1-2) = 5 (18%), Emerging (3) = 11 (39%), Fluent (4-5) = 12 (43%)
      const groupSkill = portfolio.skills.find((s) => s.skillId === "FAC_GROUP_TERMS");
      assert.ok(groupSkill, "FAC_GROUP_TERMS must be aggregated");
      assert.equal(groupSkill.classAverage, 3.3);
      assert.equal(groupSkill.criticalCount, 5);
      assert.equal(groupSkill.emergingCount, 11);
      assert.equal(groupSkill.fluentCount, 12);
      assert.equal(groupSkill.criticalPercent, 18);
      assert.equal(groupSkill.emergingPercent, 39);
      assert.equal(groupSkill.fluentPercent, 43);

      // 4. FAC_DIFF_SQUARES
      // Sum = 106, Avg = 106/28 = 3.785 -> 3.8
      // Critical (1-2) = 4 (14%), Emerging (3) = 4 (14%), Fluent (4-5) = 20 (71%)
      const squaresSkill = portfolio.skills.find((s) => s.skillId === "FAC_DIFF_SQUARES");
      assert.ok(squaresSkill, "FAC_DIFF_SQUARES must be aggregated");
      assert.equal(squaresSkill.classAverage, 3.8);
      assert.equal(squaresSkill.criticalCount, 4);
      assert.equal(squaresSkill.emergingCount, 4);
      assert.equal(squaresSkill.fluentCount, 20);
      assert.equal(squaresSkill.criticalPercent, 14);
      assert.equal(squaresSkill.emergingPercent, 14);
      assert.equal(squaresSkill.fluentPercent, 71);

      // 5. FAC_MONIC_TRINOMIAL
      // Sum = 79, Avg = 79/28 = 2.821 -> 2.8
      // Critical (1-2) = 12 (43%), Emerging (3) = 10 (36%), Fluent (4-5) = 6 (21%)
      const trinomialSkill = portfolio.skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL");
      assert.ok(trinomialSkill, "FAC_MONIC_TRINOMIAL must be aggregated");
      assert.equal(trinomialSkill.classAverage, 2.8);
      assert.equal(trinomialSkill.criticalCount, 12);
      assert.equal(trinomialSkill.emergingCount, 10);
      assert.equal(trinomialSkill.fluentCount, 6);
      assert.equal(trinomialSkill.criticalPercent, 43);
      assert.equal(trinomialSkill.emergingPercent, 36);
      assert.equal(trinomialSkill.fluentPercent, 21);
    });
  });

  describe("2. Whole-Class Focus Areas Identification", () => {
    it("flags skills with criticalPercent >= 30% ordered by severity", () => {
      const cohort = generate28StudentCohort();
      const studentReports: StudentReportEntry[] = cohort.map((s) => ({
        studentId: s.studentId,
        report: s.report,
      }));

      const portfolio = calculateClassroomPortfolio({
        classroomId: "class-8a",
        totalEnrolled: 28,
        studentReports,
      });

      // In the 28-student cohort:
      // FAC_GCF_NEGATIVE has criticalPercent = 46% (>= 30%)
      // FAC_MONIC_TRINOMIAL has criticalPercent = 43% (>= 30%)
      // FAC_GROUP_TERMS (18%), FAC_DIFF_SQUARES (14%), FAC_GCF_NUMERIC (14%) are < 30%
      const focusAreas = portfolio.wholeClassFocusAreas;
      assert.equal(focusAreas.length, 2);
      assert.ok(
        focusAreas.some((f) => f === SKILL_NEGATIVE.name || f === SKILL_NEGATIVE.skillId),
        "Negative GCF must be identified as a whole-class focus area",
      );
      assert.ok(
        focusAreas.some((f) => f === SKILL_TRINOMIAL.name || f === SKILL_TRINOMIAL.skillId),
        "Trinomial factorisation must be identified as a whole-class focus area",
      );
      assert.ok(
        !focusAreas.some((f) => f === SKILL_NUMERIC.name || f === SKILL_NUMERIC.skillId),
        "High fluency numeric GCF must not be in focus areas",
      );
      assert.ok(
        !focusAreas.some((f) => f === SKILL_SQUARES.name || f === SKILL_SQUARES.skillId),
        "High fluency squares must not be in focus areas",
      );
    });

    it("returns empty focus areas when all skills have 0% critical and high average", () => {
      // All 10 students are blitzers (5/5 on everything)
      const blitzerStudents: StudentReportEntry[] = [];
      for (let i = 1; i <= 10; i++) {
        blitzerStudents.push({
          studentId: `blitzer_${i}`,
          report: makeFinalReport([
            { ...SKILL_NUMERIC, rating: 5 },
            { ...SKILL_NEGATIVE, rating: 5 },
            { ...SKILL_GROUP, rating: 5 },
          ]),
        });
      }

      const portfolio = calculateClassroomPortfolio({
        classroomId: "class-blitzer",
        totalEnrolled: 10,
        studentReports: blitzerStudents,
      });

      assert.equal(portfolio.wholeClassFocusAreas.length, 0, "No focus areas when entire class is fluent");
    });
  });

  describe("3. Teacher Brief Narrative Generation", () => {
    it("generates coherent plain-English narrative with counts, blockers, strengths, and launchpad guidance", () => {
      const cohort = generate28StudentCohort();
      const studentReports: StudentReportEntry[] = cohort.map((s) => ({
        studentId: s.studentId,
        report: s.report,
      }));

      const portfolio = calculateClassroomPortfolio({
        classroomId: "class-8a",
        totalEnrolled: 28,
        studentReports,
      });

      const brief = portfolio.teacherBrief;
      assert.ok(typeof brief === "string" && brief.length > 50, "Teacher brief must be a detailed narrative");

      // Verifies completion figures are communicated
      assert.match(brief, /28 of 28|28 students/i, "Brief must cite cohort completion count");

      // Verifies critical focus areas are called out
      assert.match(brief, /negative|sign|FAC_GCF_NEGATIVE/i, "Brief must call out sign/negative GCF blocker");
      assert.match(brief, /quadratic|trinomial|FAC_MONIC_TRINOMIAL|x² \+ bx \+ c/i, "Brief must call out trinomial factorisation blocker");

      // Verifies actionable Day 1 Launchpad recommendation
      assert.match(brief, /instruction|practice|launchpad|remediation|next step/i, "Brief must recommend actionable next steps");
    });
  });

  describe("4. Edge Cases: Empty Classrooms, Zero Completed, and Partial Completion", () => {
    it("handles empty classroom (0 enrolled students)", async () => {
      const prisma = buildMockPrisma({
        classroom: { id: "class-empty", teacherId: "teacher-1", schoolId: "school-1", name: "Empty Room" },
        students: [],
      });

      const service = new LotusClassroomService(prisma as never);
      const portfolio = await service.getClassroomPortfolio("class-empty", teacherActor);

      assert.equal(portfolio.totalEnrolled, 0);
      assert.equal(portfolio.completedTests, 0);
      assert.deepEqual(portfolio.skills, []);
      assert.deepEqual(portfolio.wholeClassFocusAreas, []);
      assert.match(portfolio.teacherBrief, /no students|empty|not enrolled/i);
    });

    it("handles classroom with 20 enrolled students but 0 completed diagnostic tests", async () => {
      const zeroCompletedStudents: StudentSessionData[] = [];
      for (let i = 1; i <= 20; i++) {
        zeroCompletedStudents.push({
          studentId: `s_${i}`,
          studentName: `Student ${i}`,
          status: "ACTIVE", // still active, no completed final report
          report: null as unknown as LotusFinalReport,
        });
      }

      const prisma = buildMockPrisma({
        classroom: { id: "class-in-progress", teacherId: "teacher-1", schoolId: "school-1", name: "Room 101" },
        students: zeroCompletedStudents,
      });

      const service = new LotusClassroomService(prisma as never);
      const portfolio = await service.getClassroomPortfolio("class-in-progress", teacherActor);

      assert.equal(portfolio.totalEnrolled, 20);
      assert.equal(portfolio.completedTests, 0);
      assert.deepEqual(portfolio.skills, []);
      assert.deepEqual(portfolio.wholeClassFocusAreas, []);
      assert.match(portfolio.teacherBrief, /0 of 20|no completed|in progress|not completed/i);
    });

    it("handles partial completion (12 completed out of 20 enrolled)", async () => {
      const partialStudents: StudentSessionData[] = [];
      // 12 completed students
      for (let i = 1; i <= 12; i++) {
        partialStudents.push({
          studentId: `s_done_${i}`,
          studentName: `Done Student ${i}`,
          status: "COMPLETE",
          report: makeFinalReport([
            { ...SKILL_NUMERIC, rating: 4 },
            { ...SKILL_NEGATIVE, rating: 2 },
          ]),
        });
      }
      // 8 active/uncompleted students
      for (let i = 1; i <= 8; i++) {
        partialStudents.push({
          studentId: `s_pending_${i}`,
          studentName: `Pending Student ${i}`,
          status: "ACTIVE",
          report: null as unknown as LotusFinalReport,
        });
      }

      const prisma = buildMockPrisma({
        classroom: { id: "class-partial", teacherId: "teacher-1", schoolId: "school-1", name: "Room 102" },
        students: partialStudents,
      });

      const service = new LotusClassroomService(prisma as never);
      const portfolio = await service.getClassroomPortfolio("class-partial", teacherActor);

      assert.equal(portfolio.totalEnrolled, 20);
      assert.equal(portfolio.completedTests, 12);
      assert.equal(portfolio.skills.length, 2);

      const neg = portfolio.skills.find((s) => s.skillId === "FAC_GCF_NEGATIVE");
      assert.ok(neg);
      assert.equal(neg.criticalCount, 12);
      assert.equal(neg.criticalPercent, 100);
      assert.match(portfolio.teacherBrief, /12 of 20/i);
    });
  });

  describe("5. Edge Cases: Withdrawn Students and Multiple Sessions", () => {
    it("excludes withdrawn students (leftAt !== null) from the active classroom portfolio", async () => {
      const activeStudent: StudentSessionData = {
        studentId: "student_active",
        studentName: "Active Student",
        report: makeFinalReport([{ ...SKILL_NUMERIC, rating: 5 }]),
        leftAt: null,
      };

      const withdrawnStudent: StudentSessionData = {
        studentId: "student_withdrawn",
        studentName: "Withdrawn Student",
        report: makeFinalReport([{ ...SKILL_NUMERIC, rating: 1 }]),
        leftAt: new Date("2026-01-15T00:00:00Z"), // Student withdrew from class
      };

      const prisma = buildMockPrisma({
        classroom: { id: "class-withdrawn", teacherId: "teacher-1", schoolId: "school-1", name: "Room 103" },
        students: [activeStudent, withdrawnStudent],
      });

      const service = new LotusClassroomService(prisma as never);
      const portfolio = await service.getClassroomPortfolio("class-withdrawn", teacherActor);

      // Only the active student should be included
      assert.equal(portfolio.totalEnrolled, 1);
      assert.equal(portfolio.completedTests, 1);
      const num = portfolio.skills.find((s) => s.skillId === "FAC_GCF_NUMERIC");
      assert.ok(num);
      assert.equal(num.classAverage, 5.0, "Withdrawn student rating must not pull down average");
      assert.equal(num.criticalCount, 0);
    });

    it("uses the latest completed session when a student has retaken the test", async () => {
      // Simulating a student with two completed sessions:
      // Session 1 (earlier): rating 1 (critical)
      // Session 2 (later): rating 4 (fluent)
      const olderReport = makeFinalReport([{ ...SKILL_NUMERIC, rating: 1 }]);
      const newerReport = makeFinalReport([{ ...SKILL_NUMERIC, rating: 4 }]);

      const prisma = {
        teacher: { findUnique: async () => ({ id: "t1", identityKey: "school-1:teacher@school.test", schoolId: "school-1" }) },
        classroom: {
          findFirst: async () => ({ id: "c-retake", teacherId: "t1", schoolId: "school-1", archivedAt: null }),
          findUnique: async () => ({ id: "c-retake", teacherId: "t1", schoolId: "school-1" }),
        },
        classroomEnrollment: {
          findMany: async () => [
            { id: "e1", studentId: "s1", leftAt: null, student: { id: "s1", name: "Retake Learner", deletedAt: null } },
          ],
        },
        lotusSessionRecord: {
          findMany: async () => [
            {
              id: "sess-newer",
              sessionId: "lotus-2",
              studentId: "s1",
              status: "COMPLETE",
              startedAt: new Date("2026-02-10T10:00:00Z"),
              payload: { sessionId: "lotus-2", status: "COMPLETE", finalReport: newerReport },
            },
            {
              id: "sess-older",
              sessionId: "lotus-1",
              studentId: "s1",
              status: "COMPLETE",
              startedAt: new Date("2026-02-01T10:00:00Z"),
              payload: { sessionId: "lotus-1", status: "COMPLETE", finalReport: olderReport },
            },
          ],
        },
      };

      const service = new LotusClassroomService(prisma as never);
      const portfolio = await service.getClassroomPortfolio("c-retake", teacherActor);

      assert.equal(portfolio.completedTests, 1);
      const skill = portfolio.skills.find((s) => s.skillId === "FAC_GCF_NUMERIC");
      assert.ok(skill);
      assert.equal(skill.classAverage, 4.0, "Must use the latest session report (4.0), not the older one (1.0)");
      assert.equal(skill.fluentCount, 1);
      assert.equal(skill.criticalCount, 0);
    });
  });

  describe("6. Edge Cases: Sparse and Heterogeneous Skill Subsets", () => {
    it("aggregates sparse skills evaluated on different subsets of students without divide-by-zero", () => {
      // 5 students tested on core + stretch skill FAC_FACTOR_FULLY
      // 5 students tested only on core skills
      const students: StudentReportEntry[] = [];
      for (let i = 1; i <= 5; i++) {
        students.push({
          studentId: `stretch_student_${i}`,
          report: makeFinalReport([
            { ...SKILL_NUMERIC, rating: 5 },
            { skillId: "FAC_FACTOR_FULLY", name: "Factorising fully", rating: 4 },
          ]),
        });
      }
      for (let i = 1; i <= 5; i++) {
        students.push({
          studentId: `standard_student_${i}`,
          report: makeFinalReport([
            { ...SKILL_NUMERIC, rating: 3 },
            // FAC_FACTOR_FULLY is not tested for standard students
          ]),
        });
      }

      const portfolio = calculateClassroomPortfolio({
        classroomId: "class-sparse",
        totalEnrolled: 10,
        studentReports: students,
      });

      assert.equal(portfolio.completedTests, 10);

      // FAC_GCF_NUMERIC evaluated on all 10 students
      const num = portfolio.skills.find((s) => s.skillId === "FAC_GCF_NUMERIC");
      assert.ok(num);
      assert.equal(num.criticalCount + num.emergingCount + num.fluentCount, 10);
      assert.equal(num.classAverage, 4.0); // (5*5 + 5*3) / 10 = 4.0

      // FAC_FACTOR_FULLY evaluated on only 5 stretch students
      const fully = portfolio.skills.find((s) => s.skillId === "FAC_FACTOR_FULLY");
      assert.ok(fully);
      assert.equal(fully.fluentCount, 5);
      assert.equal(fully.criticalCount, 0);
      assert.equal(fully.emergingCount, 0);
      assert.equal(fully.classAverage, 4.0); // 20 / 5 = 4.0, not divided by 10!
      assert.equal(fully.fluentPercent, 100); // all five students rated on this skill
      assert.ok(!Number.isNaN(fully.classAverage), "Average must not be NaN");
    });
  });

  describe("7. Controller Authorization and School Boundaries", () => {
    it("omits unrated skills and withholds readiness claims for completed but unrated reports", () => {
      const portfolio = calculateClassroomPortfolio({
        classroomId: "unrated", totalEnrolled: 2,
        studentReports: ["a", "b"].map(studentId => ({ studentId, report: makeFinalReport([
          { ...SKILL_NUMERIC, rating: undefined },
        ]) })),
      });
      assert.equal(portfolio.completedTests, 2);
      assert.deepEqual(portfolio.skills, []);
      assert.match(portfolio.teacherBrief, /0 students have rated results/);
      assert.match(portfolio.teacherBrief, /not enough rated evidence/);
      assert.doesNotMatch(portfolio.teacherBrief, /strong readiness|Proceed to independent/);
    });
    const validTeacherHeaders = {
      "x-cogna-teacher-token": issueTeacherToken("teacher@school.test", "school-1"),
    };

    const wrongSchoolTeacherHeaders = {
      "x-cogna-teacher-token": issueTeacherToken("teacher@other.test", "school-2"),
    };

    const studentHeaders = {
      "x-cogna-student-id": "student-1",
      "x-cogna-student-token": issueStudentToken("student-1"),
    };

    it("returns 200 OK with LotusClassroomPortfolio for authenticated teacher of the classroom", async () => {
      const cohort = generate28StudentCohort();
      const prisma = buildMockPrisma({
        classroom: { id: "class-8a", teacherId: "teacher-1", schoolId: "school-1", name: "Class 8-A" },
        students: cohort,
      });

      const service = new LotusClassroomService(prisma as never);
      const controller = new LotusController(null as never, null as never, service, null as never);

      const portfolio = await controller.classroomPortfolio(validTeacherHeaders, "class-8a");
      assert.equal(portfolio.classroomId, "class-8a");
      assert.equal(portfolio.totalEnrolled, 28);
      assert.equal(portfolio.completedTests, 28);
    });

    it("throws UnauthorizedException (401) when no credentials are provided", async () => {
      const service = new LotusClassroomService({} as never);
      const controller = new LotusController(null as never, null as never, service, null as never);

      await assert.rejects(
        () => controller.classroomPortfolio({}, "class-8a"),
        UnauthorizedException,
      );
    });

    it("throws ForbiddenException (403) when called with a student session token", async () => {
      const service = new LotusClassroomService({} as never);
      const controller = new LotusController(null as never, null as never, service, null as never);

      await assert.rejects(
        () => controller.classroomPortfolio(studentHeaders, "class-8a"),
        ForbiddenException,
      );
    });

    it("throws NotFoundException (404) or ForbiddenException (403) when teacher belongs to a different school", async () => {
      const prisma = buildMockPrisma({
        classroom: { id: "class-8a", teacherId: "teacher-1", schoolId: "school-1", name: "Class 8-A" },
        teacher: { id: "teacher-2", identityKey: "school-2:teacher@other.test", schoolId: "school-2" },
        students: [],
      });

      const service = new LotusClassroomService(prisma as never);
      const controller = new LotusController(null as never, null as never, service, null as never);

      await assert.rejects(
        () => controller.classroomPortfolio(wrongSchoolTeacherHeaders, "class-8a"),
        (err: unknown) => err instanceof NotFoundException || err instanceof ForbiddenException,
      );
    });

    it("throws NotFoundException (404) when classroomId does not exist or is archived", async () => {
      const prisma = buildMockPrisma({
        classroom: { id: "class-archived", teacherId: "teacher-1", schoolId: "school-1", name: "Archived Room", archivedAt: new Date() },
        students: [],
      });

      const service = new LotusClassroomService(prisma as never);
      const controller = new LotusController(null as never, null as never, service, null as never);

      await assert.rejects(
        () => controller.classroomPortfolio(validTeacherHeaders, "non-existent-id"),
        NotFoundException,
      );

      await assert.rejects(
        () => controller.classroomPortfolio(validTeacherHeaders, "class-archived"),
        NotFoundException,
      );
    });
  });
});
