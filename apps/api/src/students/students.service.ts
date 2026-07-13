import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ReportAudience } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { RevisionService } from "../revision/revision.service";
import { ReportGeneratorService } from "../engines/report-generator/report-generator.service";
import { RecommendationEngineService } from "../engines/recommendation-engine/recommendation-engine.service";
import { RetentionService } from "../retention/retention.service";
import { ScheduledJobsService } from "../jobs/scheduled-jobs.service";

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly revisionService: RevisionService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly retentionService: RetentionService,
    private readonly jobs: ScheduledJobsService,
  ) {}

  async getProfile(studentId: string): Promise<unknown> {
    return this.prisma.learnerProfile.findUniqueOrThrow({
      where: { studentId },
    });
  }

  async getMastery(studentId: string): Promise<unknown> {
    return this.prisma.masteryScore.findMany({
      where: { studentId },
      include: { concept: true },
    });
  }

  async getRevisionQueue(studentId: string) {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    return this.revisionService.listQueue(studentId);
  }

  async getRevisionPlan(studentId: string) {
    return this.revisionService.getRevisionPlan(studentId);
  }

  async getRetention(studentId: string) {
    return this.retentionService.listEstimates(studentId);
  }

  async recomputeRetention(studentId: string) {
    return this.retentionService.recomputeForStudent(studentId);
  }

  async seedRetentionFixture(
    studentId: string,
    body: {
      conceptId: string;
      mastery: number;
      daysSinceSuccess: number;
      completedRevisionsLast14Days?: number;
    },
  ) {
    const estimate = await this.retentionService.upsertFixture(studentId, body);
    const proposals = await this.recommendationEngine.buildDailyProposals(studentId);
    await this.revisionService.applyProposals(studentId, proposals);
    return estimate;
  }

  async listExplanationOutcomes(studentId: string) {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    return this.prisma.explanationOutcome.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async getLatestReport(studentId: string, audience: ReportAudience): Promise<{
    id: string;
    audience: ReportAudience;
    trigger: string;
    renderedText: string;
    structuredData: unknown;
    createdAt: Date;
  }> {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const report = await this.reportGenerator.getLatestReport(studentId, audience);
    if (!report) {
      throw new NotFoundException(`No ${audience} report found for student.`);
    }
    return {
      id: report.id,
      audience: report.audience,
      trigger: report.trigger,
      renderedText: report.renderedText,
      structuredData: report.structuredData,
      createdAt: report.createdAt,
    };
  }

  async requestWeeklyReport(
    studentId: string,
    body: {
      periodStart: string;
      periodEnd: string;
      requestId?: string;
      force?: boolean;
    },
  ) {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const result = await this.jobs.enqueueWeeklyReport({
      studentId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      force: body.force,
    });
    return {
      reportId: result.reportId,
      status: result.status,
      idempotencyKey: result.idempotencyKey,
      jobId: result.jobId,
      requestId: body.requestId,
    };
  }

  async emailReportDelivery(
    studentId: string,
    body: { reportId: string; parentId?: string; channel?: "EMAIL" | "IN_APP" },
  ) {
    const delivery = await this.reportGenerator.requestEmailDelivery({
      studentId,
      reportId: body.reportId,
      parentId: body.parentId,
      channel: body.channel,
    });

    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
    });
    const parentId = body.parentId ?? student.primaryParentId;
    const channel = body.channel ?? "EMAIL";

    const processed = await this.jobs.enqueueEmailDelivery({
      deliveryId: delivery.deliveryId,
      reportId: body.reportId,
      parentId,
      channel,
    });

    return {
      deliveryId: processed.deliveryId,
      status: processed.status,
      jobId: processed.jobId,
    };
  }

  async emailLatestReport(
    studentId: string,
    audience: ReportAudience = ReportAudience.PARENT,
  ): Promise<{ status: string; reportId: string; message: string; deliveryId?: string }> {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
    });

    const report = await this.reportGenerator.getLatestReport(studentId, audience);
    if (!report) {
      throw new NotFoundException(`No ${audience} report found for student.`);
    }

    const result = await this.emailReportDelivery(studentId, {
      reportId: report.id,
      parentId: student.primaryParentId,
      channel: "EMAIL",
    });

    this.logger.log(
      JSON.stringify({
        event: "reports.email_requested",
        studentId,
        reportId: report.id,
        deliveryId: result.deliveryId,
        status: result.status,
      }),
    );

    return {
      status: result.status,
      reportId: report.id,
      deliveryId: result.deliveryId,
      message: "Email delivery processed via jobs stub. In-app report remains the source of truth.",
    };
  }

  studentEmailAccountsStatus() {
    return {
      status: "not_available",
      message:
        "Student email/password accounts are post-MVP. Access-code login is the supported path.",
      supportedLogin: "access_code",
    };
  }
}
