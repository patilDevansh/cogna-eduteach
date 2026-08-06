import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { ParentStudentLink } from "@cogna/database";
import {
  assertStudentSafetySettingsShape,
  type ConceptMasteryBand,
  type MasteryTrendPoint,
  type PatternHistoryItem,
  type PracticeCalendarDay,
  type StudentSafetySettings,
} from "@cogna/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  aggregatePracticeCalendar,
  bandConceptMastery,
  bucketMasteryTrend,
  summarizePatternHistory,
} from "./parent-analytics.formulas";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parent-facing analytics for a single child — growth trend, current mastery
 * bands, practice consistency, and multi-week misconception pattern history.
 * Every method re-checks ParentStudentLink ownership; nothing here trusts a
 * bare studentId the way apps/api/src/students/ does. Aggregation math lives
 * in parent-analytics.formulas.ts (pure, unit-tested without a DB).
 */
@Injectable()
export class ParentAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireLink(parentId: string, studentId: string): Promise<ParentStudentLink> {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (!link || !link.canViewReports) {
      throw new UnauthorizedException("Parent cannot view analytics for this student.");
    }
    return link;
  }

  async getMasteryTrend(
    parentId: string,
    studentId: string,
    conceptId: string | undefined,
    weeks: number,
  ): Promise<MasteryTrendPoint[]> {
    await this.requireLink(parentId, studentId);
    const since = new Date(Date.now() - weeks * 7 * DAY_MS);
    const rows = await this.prisma.masteryHistory.findMany({
      where: { studentId, createdAt: { gte: since }, ...(conceptId ? { conceptId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return bucketMasteryTrend(rows);
  }

  async getConceptBands(parentId: string, studentId: string): Promise<ConceptMasteryBand[]> {
    await this.requireLink(parentId, studentId);
    const scores = await this.prisma.masteryScore.findMany({ where: { studentId } });
    return bandConceptMastery(scores);
  }

  async getPracticeCalendar(
    parentId: string,
    studentId: string,
    weeks: number,
  ): Promise<PracticeCalendarDay[]> {
    await this.requireLink(parentId, studentId);
    const since = new Date(Date.now() - weeks * 7 * DAY_MS);
    const sessions = await this.prisma.learningSession.findMany({
      where: { studentId, startedAt: { gte: since } },
      select: { startedAt: true, endedAt: true },
    });
    return aggregatePracticeCalendar(sessions);
  }

  async getPatternHistory(
    parentId: string,
    studentId: string,
    weeks: number,
  ): Promise<PatternHistoryItem[]> {
    await this.requireLink(parentId, studentId);
    const since = new Date(Date.now() - weeks * 7 * DAY_MS);
    const rows = await this.prisma.misconceptionRemediationStateHistory.findMany({
      where: { studentId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
    return summarizePatternHistory(rows);
  }

  async getSafetySettings(parentId: string, studentId: string): Promise<StudentSafetySettings> {
    await this.requireLink(parentId, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    return assertStudentSafetySettingsShape({
      aiAssistedPracticePaused: student.aiAssistedPracticePaused,
    });
  }

  async updateSafetySettings(
    parentId: string,
    studentId: string,
    input: { aiAssistedPracticePaused: boolean },
  ): Promise<StudentSafetySettings> {
    await this.requireLink(parentId, studentId);
    const student = await this.prisma.student.update({
      where: { id: studentId },
      data: { aiAssistedPracticePaused: input.aiAssistedPracticePaused },
    });
    return assertStudentSafetySettingsShape({
      aiAssistedPracticePaused: student.aiAssistedPracticePaused,
    });
  }
}
