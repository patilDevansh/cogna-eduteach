import { Injectable } from "@nestjs/common";
import { REPORT_TEMPLATES_V1 } from "@cogna/shared";
import { ReportAudience, ReportTrigger } from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";

export interface SessionReportResult {
  id: string;
  revisionProposed: boolean;
}

@Injectable()
export class ReportGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generateSessionSummary(sessionId: string): Promise<SessionReportResult> {
    const session = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        attempts: { orderBy: { createdAt: "asc" } },
      },
    });

    const periodEnd = session.endedAt ?? new Date();
    const correct = session.attempts.filter((a) => a.isCorrect).length;
    const total = session.attempts.length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) / 100 : 0;

    const masteryHistory = await this.prisma.masteryHistory.findMany({
      where: {
        studentId: session.studentId,
        createdAt: { gte: session.startedAt, lte: periodEnd },
      },
      orderBy: { createdAt: "asc" },
    });

    const masteryChanges: Record<string, { from: number; to: number }> = {};
    for (const row of masteryHistory) {
      const existing = masteryChanges[row.conceptId];
      if (!existing) {
        masteryChanges[row.conceptId] = {
          from: row.previousValue,
          to: row.newValue,
        };
      } else {
        existing.to = row.newValue;
      }
    }

    const activeRemediation = await this.prisma.misconceptionRemediationState.findFirst({
      where: {
        studentId: session.studentId,
        state: { in: ["TARGETING", "EXPLANATION_REQUIRED", "RETESTING", "STILL_ACTIVE"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    const diagnosticFactors = await this.prisma.diagnosticFactor.findMany({
      where: {
        studentId: session.studentId,
        createdAt: { gte: session.startedAt, lte: periodEnd },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const structuredData = {
      sessionId,
      questionsAttempted: total,
      correctAnswers: correct,
      accuracy,
      conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
      masteryChanges,
      activeMisconception: activeRemediation?.misconceptionId ?? null,
      remediationState: activeRemediation?.state ?? null,
      diagnosticFactors: diagnosticFactors.map((f) => ({
        factorKey: f.factorKey,
        confidence: f.confidence,
        factorType: f.factorType,
      })),
    };

    const studentText = this.renderStudentSummary(structuredData);
    const parentText = this.renderParentSummary(structuredData);

    const studentReport = await this.prisma.report.create({
      data: {
        studentId: session.studentId,
        audience: ReportAudience.STUDENT,
        trigger: ReportTrigger.SESSION_ENDED,
        periodStart: session.startedAt,
        periodEnd,
        structuredData,
        renderedText: studentText,
        reportVersion: REPORT_TEMPLATES_V1,
      },
    });

    await this.prisma.report.create({
      data: {
        studentId: session.studentId,
        audience: ReportAudience.PARENT,
        trigger: ReportTrigger.SESSION_ENDED,
        periodStart: session.startedAt,
        periodEnd,
        structuredData,
        renderedText: parentText,
        reportVersion: REPORT_TEMPLATES_V1,
      },
    });

    return {
      id: studentReport.id,
      revisionProposed: activeRemediation?.state === "STILL_ACTIVE",
    };
  }

  private renderStudentSummary(data: {
    questionsAttempted: number;
    correctAnswers: number;
    accuracy: number;
    conceptId: string;
    masteryChanges: Record<string, { from: number; to: number }>;
    activeMisconception: string | null;
  }): string {
    const conceptLabel = data.conceptId.replace(/_/g, " ").toLowerCase();
    const masteryNote =
      Object.keys(data.masteryChanges).length > 0
        ? " Your mastery updated based on today's practice."
        : "";

    let revisit = "";
    if (data.activeMisconception) {
      revisit = ` Keep practicing ${data.activeMisconception.replace(/_/g, " ").toLowerCase()} next time.`;
    }

    return (
      `You answered ${data.correctAnswers} of ${data.questionsAttempted} questions correctly ` +
      `(${Math.round(data.accuracy * 100)}% accuracy) on ${conceptLabel}.${masteryNote}${revisit} ` +
      `Great effort — see you next session.`
    );
  }

  private renderParentSummary(data: {
    questionsAttempted: number;
    correctAnswers: number;
    accuracy: number;
    conceptId: string;
    activeMisconception: string | null;
    remediationState: string | null;
  }): string {
    const conceptLabel = data.conceptId.replace(/_/g, " ").toLowerCase();
    const lines = [
      `Your child practiced ${conceptLabel} today.`,
      `They answered ${data.correctAnswers} of ${data.questionsAttempted} correctly (${Math.round(data.accuracy * 100)}%).`,
    ];

    if (data.activeMisconception) {
      const label = data.activeMisconception.replace(/_/g, " ").toLowerCase();
      lines.push(`A possible area to revisit: ${label}.`);
      if (data.remediationState === "STILL_ACTIVE" || data.remediationState === "TARGETING") {
        lines.push("This pattern is still being confirmed — more practice will help.");
      }
    } else {
      lines.push("No repeated mistake patterns were flagged this session.");
    }

    lines.push("Suggested next step: a short 3-question practice tomorrow.");
    return lines.join(" ");
  }
}
