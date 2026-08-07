import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { REPORT_TEMPLATES_V1, REPORT_TEMPLATES_V2 } from "@cogna/shared";
import {
  ReportAudience,
  ReportDeliveryChannel,
  ReportDeliveryStatus,
  ReportTrigger,
} from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";
import { RecommendationEngineService } from "../recommendation-engine/recommendation-engine.service";
import { ReportGeneratorAgentService } from "./report-generator-agent.service";

export interface SessionReportResult {
  id: string;
}

export interface WeeklyReportResult {
  reportId: string;
  status: "COMPLETED" | "PENDING";
  idempotencyKey: string;
}

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendationEngine: RecommendationEngineService,
    /** Optional so golden tests that construct the service with null deps still exercise templates. */
    @Optional() private readonly reportAgent?: ReportGeneratorAgentService,
  ) {}

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

    // AI polish slots in only at render — structuredData assembly above is untouched.
    const studentRule = this.renderStudentSummary(structuredData);
    const parentRule = this.renderParentSummary(structuredData);
    const studentText =
      (await this.tryPolish("STUDENT", session.studentId, sessionId, structuredData, studentRule)) ??
      studentRule;
    const parentText =
      (await this.tryPolish("PARENT", session.studentId, sessionId, structuredData, parentRule)) ??
      parentRule;

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

    // INTERNAL stays template-only in D.v1 — machine string is already precise.
    await this.prisma.report.create({
      data: {
        studentId: session.studentId,
        audience: ReportAudience.INTERNAL,
        trigger: ReportTrigger.SESSION_ENDED,
        periodStart: session.startedAt,
        periodEnd,
        structuredData: {
          ...structuredData,
          internalNote: "Diagnostic snapshot for dev/admin review only.",
        },
        renderedText: this.renderInternalSummary(structuredData),
        reportVersion: REPORT_TEMPLATES_V1,
      },
    });

    return {
      id: studentReport.id,
    };
  }

  async generateWeeklyReport(
    studentId: string,
    periodStart: Date,
    periodEnd: Date,
    options?: { force?: boolean; trigger?: ReportTrigger },
  ): Promise<WeeklyReportResult> {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });

    const idempotencyKey = `${studentId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
    const trigger = options?.trigger ?? ReportTrigger.PARENT_REQUESTED_REPORT;

    if (!options?.force) {
      const existing = await this.prisma.report.findFirst({
        where: {
          studentId,
          audience: ReportAudience.PARENT,
          trigger: {
            in: [
              ReportTrigger.WEEKLY_REPORT_JOB,
              ReportTrigger.PARENT_REQUESTED_REPORT,
              ReportTrigger.DAILY_REPORT_JOB,
            ],
          },
          periodStart,
          periodEnd,
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return {
          reportId: existing.id,
          status: "COMPLETED",
          idempotencyKey,
        };
      }
    }

    const sessions = await this.prisma.learningSession.findMany({
      where: {
        studentId,
        status: "ENDED",
        endedAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      include: { question: { select: { conceptId: true } } },
    });

    const questionsAttempted = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect).length;
    const accuracy =
      questionsAttempted > 0 ? Math.round((correct / questionsAttempted) * 100) / 100 : 0;

    const conceptsPracticed = [
      ...new Set(attempts.map((a) => a.question.conceptId).filter(Boolean)),
    ];

    const masteryHistory = await this.prisma.masteryHistory.findMany({
      where: {
        studentId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { createdAt: "asc" },
    });

    const masteryChangesMap = new Map<
      string,
      { conceptId: string; from: number; to: number; confidence: number }
    >();
    for (const row of masteryHistory) {
      const existing = masteryChangesMap.get(row.conceptId);
      if (!existing) {
        masteryChangesMap.set(row.conceptId, {
          conceptId: row.conceptId,
          from: row.previousValue,
          to: row.newValue,
          confidence: 0.7,
        });
      } else {
        existing.to = row.newValue;
      }
    }

    const remediations = await this.prisma.misconceptionRemediationState.findMany({
      where: {
        studentId,
        state: { in: ["TARGETING", "EXPLANATION_REQUIRED", "RETESTING", "STILL_ACTIVE"] },
      },
    });

    const activePatterns = [];
    for (const rem of remediations) {
      const factor = await this.prisma.diagnosticFactor.findFirst({
        where: {
          studentId,
          factorType: "MISCONCEPTION",
          factorKey: rem.misconceptionId,
        },
        orderBy: { createdAt: "desc" },
      });
      const confidence = factor?.confidence ?? 0;
      activePatterns.push({
        misconceptionId: rem.misconceptionId,
        confidence,
        uncertainty:
          confidence < 0.6
            ? "still gathering evidence"
            : "A pattern we are checking based on recent practice.",
      });
    }

    const weeklyPlan = await this.recommendationEngine.buildWeeklyPlan(studentId);
    const revisionPlan = weeklyPlan.retentionConceptIds.map((conceptId) => ({
      conceptId,
      reason: "Retention review due soon",
      questionCount: 2,
    }));
    for (const path of weeklyPlan.misconceptionPaths.slice(0, 1)) {
      revisionPlan.push({
        conceptId: path,
        reason: "Pattern being checked",
        questionCount: 3,
      });
    }

    const weakEvidence =
      questionsAttempted < 4 ||
      activePatterns.every((p) => p.confidence < 0.6) ||
      masteryChangesMap.size === 0;

    const structuredData = {
      studentId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      sessionsCompleted: sessions.length,
      questionsAttempted,
      accuracy,
      conceptsPracticed,
      masteryChanges: [...masteryChangesMap.values()],
      activePatterns,
      revisionPlan,
      parentActions: [
        "Ask your child to explain one problem they practiced this week in their own words.",
        "Keep practice sessions short — about 10–15 minutes.",
      ],
      weakEvidence,
    };

    const weeklyRule = this.renderWeeklyParentReport(structuredData);
    const renderedText =
      (await this.tryPolish("WEEKLY_PARENT", studentId, undefined, structuredData, weeklyRule)) ??
      weeklyRule;

    const report = await this.prisma.report.create({
      data: {
        studentId,
        audience: ReportAudience.PARENT,
        trigger,
        periodStart,
        periodEnd,
        structuredData,
        renderedText,
        reportVersion: REPORT_TEMPLATES_V2,
      },
    });

    return {
      reportId: report.id,
      status: "COMPLETED",
      idempotencyKey,
    };
  }

  async requestEmailDelivery(input: {
    reportId: string;
    parentId?: string;
    channel?: "EMAIL" | "IN_APP";
    studentId: string;
  }): Promise<{
    deliveryId: string;
    status: "PENDING" | "SENT" | "FAILED" | "RETRYING";
  }> {
    const report = await this.prisma.report.findUnique({ where: { id: input.reportId } });
    if (!report || report.studentId !== input.studentId) {
      throw new NotFoundException("Report not found for student.");
    }

    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: input.studentId },
    });
    const parentId = input.parentId ?? student.primaryParentId;
    const channel =
      input.channel === "IN_APP"
        ? ReportDeliveryChannel.IN_APP
        : ReportDeliveryChannel.EMAIL;

    const existing = await this.prisma.reportDelivery.findFirst({
      where: { reportId: input.reportId, parentId, channel },
      orderBy: { createdAt: "desc" },
    });

    if (existing && existing.status === ReportDeliveryStatus.SENT) {
      return { deliveryId: existing.id, status: "SENT" };
    }
    if (existing && existing.status === ReportDeliveryStatus.RETRYING) {
      return { deliveryId: existing.id, status: "RETRYING" };
    }

    const delivery =
      existing &&
      (existing.status === ReportDeliveryStatus.PENDING ||
        existing.status === ReportDeliveryStatus.FAILED)
        ? existing
        : await this.prisma.reportDelivery.create({
            data: {
              reportId: input.reportId,
              parentId,
              channel,
              status: ReportDeliveryStatus.PENDING,
              attemptCount: 0,
            },
          });

    return { deliveryId: delivery.id, status: "PENDING" };
  }

  /**
   * Stub email provider: logs and marks SENT.
   * Set EMAIL_DELIVERY_FAIL=true to simulate failure for retry tests.
   */
  async processEmailDelivery(deliveryId: string): Promise<{
    deliveryId: string;
    status: "SENT" | "FAILED" | "RETRYING";
  }> {
    const delivery = await this.prisma.reportDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { report: true },
    });

    if (delivery.status === ReportDeliveryStatus.SENT) {
      return { deliveryId, status: "SENT" };
    }

    const forceFail = process.env.EMAIL_DELIVERY_FAIL === "true";
    const attemptCount = delivery.attemptCount + 1;

    if (forceFail) {
      const permanent = attemptCount >= 5;
      const status = permanent
        ? ReportDeliveryStatus.FAILED
        : ReportDeliveryStatus.RETRYING;
      await this.prisma.reportDelivery.update({
        where: { id: deliveryId },
        data: {
          status,
          attemptCount,
          lastAttemptAt: new Date(),
          error: "EMAIL_DELIVERY_FAIL stub forced failure",
        },
      });
      this.logger.warn(
        JSON.stringify({
          event: "reports.email_failed",
          deliveryId,
          attemptCount,
          status,
        }),
      );
      return {
        deliveryId,
        status: permanent ? "FAILED" : "RETRYING",
      };
    }

    this.logger.log(
      JSON.stringify({
        event: "reports.email_stub",
        deliveryId,
        reportId: delivery.reportId,
        parentId: delivery.parentId,
        channel: delivery.channel,
        message: "Would email parent report (stub — no SMTP provider)",
      }),
    );

    await this.prisma.reportDelivery.update({
      where: { id: deliveryId },
      data: {
        status: ReportDeliveryStatus.SENT,
        attemptCount,
        lastAttemptAt: new Date(),
        providerMessageId: `stub-${deliveryId}`,
        error: null,
      },
    });

    return { deliveryId, status: "SENT" };
  }

  async getLatestReport(studentId: string, audience: ReportAudience): Promise<{
    id: string;
    audience: ReportAudience;
    trigger: string;
    renderedText: string;
    structuredData: unknown;
    createdAt: Date;
    periodStart?: Date;
    periodEnd?: Date;
  } | null> {
    return this.prisma.report.findFirst({
      where: { studentId, audience },
      orderBy: { createdAt: "desc" },
    });
  }

  async getLatestWeeklyReport(studentId: string): Promise<{
    id: string;
    studentId: string;
    audience: ReportAudience;
    trigger: ReportTrigger;
    periodStart: Date;
    periodEnd: Date;
    structuredData: unknown;
    renderedText: string;
    reportVersion: string;
    createdAt: Date;
  } | null> {
    return this.prisma.report.findFirst({
      where: {
        studentId,
        audience: ReportAudience.PARENT,
        trigger: {
          in: [
            ReportTrigger.WEEKLY_REPORT_JOB,
            ReportTrigger.PARENT_REQUESTED_REPORT,
            ReportTrigger.DAILY_REPORT_JOB,
          ],
        },
        reportVersion: REPORT_TEMPLATES_V2,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Slot-in polish: returns AI text when served, else null (caller keeps template).
   * Never throws into the report create path.
   */
  private async tryPolish(
    audience: "STUDENT" | "PARENT" | "WEEKLY_PARENT",
    studentId: string,
    sessionId: string | undefined,
    structuredData: unknown,
    ruleText: string,
  ): Promise<string | null> {
    if (!this.reportAgent) return null;
    try {
      return await this.reportAgent.polishSummary({
        audience,
        studentId,
        sessionId,
        structuredData,
        ruleText,
      });
    } catch (err) {
      this.logger.warn(
        `REPORT_GENERATOR polish failed for ${audience}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private renderWeeklyParentReport(data: {
    sessionsCompleted: number;
    questionsAttempted: number;
    accuracy: number;
    conceptsPracticed: string[];
    masteryChanges: Array<{ conceptId: string; from: number; to: number }>;
    activePatterns: Array<{ misconceptionId: string; confidence: number; uncertainty: string }>;
    revisionPlan: Array<{ conceptId: string; reason: string; questionCount: number }>;
    parentActions: string[];
    weakEvidence: boolean;
  }): string {
    const lines: string[] = [];
    lines.push(
      `This week your child completed ${data.sessionsCompleted} practice session(s) ` +
        `and attempted ${data.questionsAttempted} question(s) ` +
        `(${Math.round(data.accuracy * 100)}% accuracy).`,
    );

    if (data.conceptsPracticed.length > 0) {
      lines.push(
        `Concepts worked on: ${data.conceptsPracticed.map(labelize).join(", ")}.`,
      );
    }

    if (data.masteryChanges.length > 0) {
      const improved = data.masteryChanges.filter((m) => m.to > m.from);
      if (improved.length > 0) {
        lines.push(
          `Evidence suggests improvement on: ${improved.map((m) => labelize(m.conceptId)).join(", ")}.`,
        );
      }
    } else if (data.weakEvidence) {
      lines.push("Still gathering evidence on mastery changes.");
    }

    if (data.activePatterns.length > 0) {
      for (const p of data.activePatterns) {
        if (p.confidence < 0.6 || data.weakEvidence) {
          lines.push(
            `A pattern we are checking (${labelize(p.misconceptionId)}) — still gathering evidence.`,
          );
        } else {
          lines.push(
            `A pattern we are checking: ${labelize(p.misconceptionId)}.`,
          );
        }
      }
    } else {
      lines.push("No firm misconception labels this week — still gathering evidence where needed.");
    }

    if (data.revisionPlan.length > 0) {
      const seen = new Set<string>();
      const unique = data.revisionPlan.filter((r) => {
        if (seen.has(r.conceptId)) return false;
        seen.add(r.conceptId);
        return true;
      });
      lines.push(
        `Next short practice: ${unique
          .map((r) => `${labelize(r.conceptId)} (${r.questionCount} questions)`)
          .join("; ")}.`,
      );
    }

    lines.push(`How you can help: ${data.parentActions[0]}`);
    return lines.join(" ");
  }

  private renderStudentSummary(data: {
    questionsAttempted: number;
    correctAnswers: number;
    accuracy: number;
    conceptId: string;
    masteryChanges: Record<string, { from: number; to: number }>;
    activeMisconception: string | null;
  }): string {
    const conceptLabel = labelize(data.conceptId);
    const masteryNote =
      Object.keys(data.masteryChanges).length > 0
        ? " Your mastery updated based on today's practice."
        : "";

    let revisit = "";
    if (data.activeMisconception) {
      revisit = ` Keep practicing ${labelize(data.activeMisconception)} next time.`;
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
    const conceptLabel = labelize(data.conceptId);
    const lines = [
      `Your child practiced ${conceptLabel} today.`,
      `They answered ${data.correctAnswers} of ${data.questionsAttempted} correctly (${Math.round(data.accuracy * 100)}%).`,
    ];

    if (data.activeMisconception) {
      lines.push(`A pattern we are checking: ${labelize(data.activeMisconception)}.`);
      if (data.remediationState === "STILL_ACTIVE" || data.remediationState === "TARGETING") {
        lines.push("Still gathering evidence — more practice will help.");
      }
    } else {
      lines.push("No repeated mistake patterns were flagged this session.");
    }

    lines.push("Suggested next step: a short 3-question practice tomorrow.");
    return lines.join(" ");
  }

  private renderInternalSummary(data: {
    sessionId: string;
    questionsAttempted: number;
    correctAnswers: number;
    accuracy: number;
    conceptId: string;
    activeMisconception: string | null;
    remediationState: string | null;
    diagnosticFactors: Array<{ factorKey: string | null; confidence: number; factorType: string }>;
  }): string {
    const factors = data.diagnosticFactors
      .map((f) => `${f.factorKey ?? "unknown"}@${f.confidence.toFixed(2)}`)
      .join(", ");

    return [
      `[INTERNAL] session=${data.sessionId}`,
      `accuracy=${data.accuracy} (${data.correctAnswers}/${data.questionsAttempted})`,
      `concept=${data.conceptId}`,
      `remediation=${data.remediationState ?? "none"}`,
      `misconception=${data.activeMisconception ?? "none"}`,
      `factors=${factors || "none"}`,
    ].join(" | ");
  }
}

function labelize(id: string): string {
  const CONCEPT_LABELS: Record<string, string> = {
    P1_INTEGER_ADD_SUB: "adding and subtracting integers",
    P2_NEGATIVE_OPS: "working with negatives",
    P3_VARIABLES_CONSTANTS: "variables and constants",
    P4_SIMPLE_EXPRESSIONS: "simple expressions",
    P5_EQUALITY_BALANCE: "keeping equations balanced",
    C1_ONE_STEP_ADDITION: "one-step addition equations",
    C2_ONE_STEP_SUBTRACTION: "one-step subtraction equations",
    C3_ONE_STEP_MULTIPLICATION: "one-step multiplication equations",
    C4_ONE_STEP_DIVISION: "one-step division equations",
    C5_TWO_STEP_EQUATIONS: "two-step equations",
    C6_SIMPLE_WORD_PROBLEMS: "word problems",
    SIGN_HANDLING: "sign handling",
    OPERATION_CHOICE: "choosing the operation",
    BALANCE_ERROR: "keeping both sides balanced",
    VARIABLE_MISREAD: "reading the variable",
  };
  return CONCEPT_LABELS[id] ?? id.replace(/_/g, " ").toLowerCase();
}
