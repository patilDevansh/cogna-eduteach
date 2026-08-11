import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ReviewStatus, type ParentStudentLink } from "@cogna/database";
import {
  assertConfidenceCalibrationSummaryShape,
  assertStudentSafetySettingsShape,
  type ConceptMasteryBand,
  type ConfidenceCalibration,
  type ConfidenceCalibrationSummary,
  type MasteryTrendPoint,
  type PatternHistoryExample,
  type PatternHistoryItem,
  type PracticeCalendarDay,
  type StudentSafetySettings,
} from "@cogna/shared";
import { PrismaService } from "../prisma/prisma.service";
import { matchMisconceptionPattern, type MisconceptionPattern } from "../engines/diagnostic-engine/diagnostic-formulas";
import {
  aggregatePracticeCalendar,
  bandConceptMastery,
  bucketMasteryTrend,
  enrichPatternHistoryItems,
  summarizePatternHistory,
} from "./parent-analytics.formulas";

const VALID_CALIBRATIONS: ConfidenceCalibration[] = [
  "possibly_overconfident",
  "possibly_underconfident",
  "reasonably_calibrated",
  "unknown",
];

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
    const items = summarizePatternHistory(rows);
    if (items.length === 0) return items;

    const misconceptionIds = [...new Set(items.map((i) => i.misconceptionId))];
    const conceptIds = [...new Set(items.map((i) => i.conceptId))];

    // Same lenient reviewStatus set explanation-engine.service.ts already uses
    // for live explanation-serving — PENDING_REVIEW content is still shown
    // (never to APPROVED-only, which would hide everything authored this pass).
    const explanationRows = await this.prisma.explanation.findMany({
      where: {
        misconceptionId: { in: misconceptionIds },
        reviewStatus: { in: [ReviewStatus.APPROVED, ReviewStatus.PENDING_REVIEW] },
      },
      orderBy: { version: "desc" },
    });
    const explanationByMisconception = new Map<string, string>();
    for (const e of explanationRows) {
      if (e.misconceptionId && !explanationByMisconception.has(e.misconceptionId)) {
        explanationByMisconception.set(e.misconceptionId, e.content);
      }
    }

    // One concrete recent wrong attempt per (misconceptionId, conceptId), matched
    // via the same shared matchMisconceptionPattern the live diagnostic pipeline
    // uses — so the spotlight example is never invented, only ever something the
    // student actually submitted.
    const wrongAttempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        grade: "INCORRECT",
        createdAt: { gte: since },
        question: { conceptId: { in: conceptIds } },
      },
      select: {
        submittedAnswer: true,
        question: { select: { conceptId: true, stem: true, misconceptionPatterns: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const exampleByKey = new Map<string, PatternHistoryExample>();
    for (const a of wrongAttempts) {
      const patterns = (a.question.misconceptionPatterns as MisconceptionPattern[] | null) ?? [];
      const matched = matchMisconceptionPattern(patterns, a.submittedAnswer);
      if (!matched) continue;
      const key = `${matched}|${a.question.conceptId}`;
      if (!exampleByKey.has(key)) {
        exampleByKey.set(key, { stem: a.question.stem, submittedAnswer: a.submittedAnswer });
      }
    }

    return enrichPatternHistoryItems(items, explanationByMisconception, exampleByKey);
  }

  /** The diagnostic engine's own confidenceCalibration label, stored on LearnerProfile —
   * exposed as-is, not recomputed, so this can never drift from what the engine believes. */
  async getConfidenceCalibration(
    parentId: string,
    studentId: string,
  ): Promise<ConfidenceCalibrationSummary> {
    await this.requireLink(parentId, studentId);
    const profile = await this.prisma.learnerProfile.findUnique({ where: { studentId } });
    const raw = profile?.confidenceCalibration;
    const calibration: ConfidenceCalibration = (VALID_CALIBRATIONS as string[]).includes(raw ?? "")
      ? (raw as ConfidenceCalibration)
      : "unknown";
    return assertConfidenceCalibrationSummaryShape({ calibration });
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
