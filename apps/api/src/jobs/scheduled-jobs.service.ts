import { Injectable, Logger } from "@nestjs/common";
import { JobStatus, ReportTrigger } from "@cogna/database";
import { ReportGeneratorService } from "../engines/report-generator/report-generator.service";
import { RecommendationEngineService } from "../engines/recommendation-engine/recommendation-engine.service";
import { RevisionService } from "../revision/revision.service";
import { PrismaService } from "../prisma/prisma.service";
import { ContentDraftService } from "../content/content-draft.service";

const WEEKLY_REPORT_MAX_ATTEMPTS = 3;
const EMAIL_MAX_ATTEMPTS = 5;
const CONTENT_JOB_MAX_ATTEMPTS = 3;

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly workerId = `api-${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly revisionService: RevisionService,
    private readonly contentDrafts: ContentDraftService,
  ) {}

  async enqueueWeeklyReport(input: {
    studentId: string;
    periodStart: string;
    periodEnd: string;
    force?: boolean;
  }): Promise<{
    jobId: string;
    reportId?: string;
    status: "COMPLETED" | "PENDING";
    idempotencyKey: string;
  }> {
    const idempotencyKey = `${input.studentId}:${input.periodStart}:${input.periodEnd}`;

    const existing = await this.prisma.job.findUnique({
      where: {
        jobType_idempotencyKey: {
          jobType: "WEEKLY_REPORT",
          idempotencyKey,
        },
      },
    });

    if (existing?.status === JobStatus.COMPLETED && existing.resultRef && !input.force) {
      return {
        jobId: existing.id,
        reportId: existing.resultRef,
        status: "COMPLETED",
        idempotencyKey,
      };
    }

    const job =
      existing ??
      (await this.prisma.job.create({
        data: {
          jobType: "WEEKLY_REPORT",
          idempotencyKey,
          payload: input,
          status: JobStatus.PENDING,
        },
      }));

    // Process inline for parent request path (still off answer hot path).
    const result = await this.processWeeklyReportJob(job.id);
    return {
      jobId: job.id,
      reportId: result.reportId,
      status: result.status === "COMPLETED" ? "COMPLETED" : "PENDING",
      idempotencyKey,
    };
  }

  async enqueueEmailDelivery(input: {
    deliveryId: string;
    reportId: string;
    parentId: string;
    channel: string;
  }): Promise<{ jobId: string; deliveryId: string; status: string }> {
    const idempotencyKey = `${input.reportId}:${input.parentId}:${input.channel}`;

    const existing = await this.prisma.job.findUnique({
      where: {
        jobType_idempotencyKey: {
          jobType: "REPORT_EMAIL",
          idempotencyKey,
        },
      },
    });

    if (existing?.status === JobStatus.COMPLETED && existing.resultRef) {
      const delivery = await this.reportGenerator.processEmailDelivery(input.deliveryId);
      return {
        jobId: existing.id,
        deliveryId: delivery.deliveryId,
        status: delivery.status,
      };
    }

    const job =
      existing ??
      (await this.prisma.job.create({
        data: {
          jobType: "REPORT_EMAIL",
          idempotencyKey,
          payload: input,
          status: JobStatus.PENDING,
        },
      }));

    const result = await this.processEmailJob(job.id);
    return {
      jobId: job.id,
      deliveryId: result.deliveryId,
      status: result.status,
    };
  }

  async processWeeklyReportJob(jobId: string): Promise<{
    status: string;
    reportId?: string;
  }> {
    const job = await this.lockJob(jobId);
    if (!job) {
      const current = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      return { status: current.status, reportId: current.resultRef ?? undefined };
    }

    try {
      const payload = job.payload as {
        studentId: string;
        periodStart: string;
        periodEnd: string;
        force?: boolean;
      };

      const result = await this.reportGenerator.generateWeeklyReport(
        payload.studentId,
        new Date(payload.periodStart),
        new Date(payload.periodEnd),
        {
          force: payload.force,
          trigger: ReportTrigger.WEEKLY_REPORT_JOB,
        },
      );

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          resultRef: result.reportId,
          attemptCount: job.attemptCount + 1,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      return { status: "COMPLETED", reportId: result.reportId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptCount = job.attemptCount + 1;
      const permanent = attemptCount >= WEEKLY_REPORT_MAX_ATTEMPTS;
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: permanent ? JobStatus.FAILED_PERMANENT : JobStatus.FAILED_RETRYABLE,
          attemptCount,
          lastError: message,
          lockedAt: null,
          lockedBy: null,
          runAfter: permanent
            ? null
            : new Date(Date.now() + attemptCount * 60_000),
        },
      });
      this.logger.error(`WEEKLY_REPORT job ${jobId} failed: ${message}`);
      return { status: permanent ? "FAILED_PERMANENT" : "FAILED_RETRYABLE" };
    }
  }

  async processEmailJob(jobId: string): Promise<{
    status: string;
    deliveryId: string;
  }> {
    const job = await this.lockJob(jobId);
    if (!job) {
      const current = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      return {
        status: current.status,
        deliveryId: String((current.payload as { deliveryId?: string }).deliveryId ?? ""),
      };
    }

    const payload = job.payload as { deliveryId: string };
    try {
      const result = await this.reportGenerator.processEmailDelivery(payload.deliveryId);

      if (result.status === "SENT") {
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
            resultRef: result.deliveryId,
            attemptCount: job.attemptCount + 1,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
      } else {
        const attemptCount = job.attemptCount + 1;
        const permanent = attemptCount >= EMAIL_MAX_ATTEMPTS || result.status === "FAILED";
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: permanent ? JobStatus.FAILED_PERMANENT : JobStatus.FAILED_RETRYABLE,
            attemptCount,
            lastError: `email status=${result.status}`,
            lockedAt: null,
            lockedBy: null,
            runAfter: permanent
              ? null
              : new Date(Date.now() + Math.min(30, 2 ** attemptCount) * 60_000),
          },
        });
      }

      return { status: result.status, deliveryId: result.deliveryId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptCount = job.attemptCount + 1;
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status:
            attemptCount >= EMAIL_MAX_ATTEMPTS
              ? JobStatus.FAILED_PERMANENT
              : JobStatus.FAILED_RETRYABLE,
          attemptCount,
          lastError: message,
          lockedAt: null,
          lockedBy: null,
        },
      });
      throw err;
    }
  }

  async runWeeklyParentReports(): Promise<{ processed: number; mode: string }> {
    const parents = await this.prisma.parent.findMany({
      include: {
        primaryStudents: { where: { canViewReports: true }, include: { student: true } },
      },
      take: 100,
    });

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 7);

    let processed = 0;
    for (const parent of parents) {
      for (const link of parent.primaryStudents) {
        await this.enqueueWeeklyReport({
          studentId: link.studentId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
        processed++;
      }
    }

    return { processed, mode: "jobs_weekly_report" };
  }

  async runDailyRevisionPlans(): Promise<{ processed: number }> {
    const students = await this.prisma.student.findMany({
      where: { deletedAt: null },
      take: 100,
      select: { id: true },
    });

    let processed = 0;
    for (const student of students) {
      const proposals = await this.recommendationEngine.buildDailyProposals(student.id);
      await this.revisionService.applyProposals(student.id, proposals);
      processed++;
    }
    return { processed };
  }

  async retryFailedEmails(): Promise<{ retried: number }> {
    const jobs = await this.prisma.job.findMany({
      where: {
        jobType: "REPORT_EMAIL",
        status: JobStatus.FAILED_RETRYABLE,
        OR: [{ runAfter: null }, { runAfter: { lte: new Date() } }],
      },
      take: 20,
    });

    let retried = 0;
    for (const job of jobs) {
      await this.processEmailJob(job.id);
      retried++;
    }
    return { retried };
  }

  /** Refresh ItemStatistic rows from recent attempts (off hot path). */
  async refreshItemStatistics(limit = 50): Promise<{ refreshed: number }> {
    const questions = await this.prisma.question.findMany({
      where: { reviewStatus: "APPROVED" },
      take: limit,
      orderBy: { updatedAt: "desc" },
      select: { id: true, version: true },
    });

    let refreshed = 0;
    for (const q of questions) {
      const attempts = await this.prisma.attempt.findMany({
        where: { questionId: q.id, questionVersion: q.version },
        select: {
          grade: true,
          totalTimeMs: true,
          hintCount: true,
          submittedAnswer: true,
        },
      });
      if (attempts.length === 0) continue;

      const attemptCount = attempts.length;
      const correctRate =
        attempts.filter((a) => a.grade === "CORRECT").length / attemptCount;
      const avgTimeMs = Math.round(
        attempts.reduce((s, a) => s + (a.totalTimeMs ?? 0), 0) / attemptCount,
      );
      const hintRate =
        attempts.filter((a) => a.hintCount > 0).length / attemptCount;

      await this.prisma.itemStatistic.upsert({
        where: {
          questionId_questionVersion: {
            questionId: q.id,
            questionVersion: q.version,
          },
        },
        create: {
          questionId: q.id,
          questionVersion: q.version,
          attemptCount,
          correctRate,
          avgTimeMs,
          hintRate,
          misconceptionHits: {},
          discriminationScore: null,
        },
        update: {
          attemptCount,
          correctRate,
          avgTimeMs,
          hintRate,
        },
      });
      refreshed++;
    }
    return { refreshed };
  }

  // ─── MVP 3.0 — Content draft jobs ─────────────────────────────────────────

  /**
   * CONTENT_LLM_DRAFT job (stub).
   * Gate: CONTENT_LLM_DRAFTS_ENABLED=true required.
   * When enabled, calls LLM provider and creates ContentDraft with status=DRAFT.
   * Then enqueues CONTENT_VALIDATE job.
   */
  async processContentLlmDraftJob(jobId: string): Promise<{ status: string }> {
    const job = await this.lockJob(jobId);
    if (!job) {
      const current = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      return { status: current.status };
    }

    try {
      const payload = job.payload as {
        conceptId: string;
        difficulty: number;
        draftType: string;
        promptVersion?: string;
      };

      // Stub: In production, this would call the LLM provider
      // For now, just log that the job would run
      const contentLlmDraftsEnabled = process.env.CONTENT_LLM_DRAFTS_ENABLED === "true";
      if (!contentLlmDraftsEnabled) {
        throw new Error("CONTENT_LLM_DRAFTS_ENABLED=false; job cannot proceed");
      }

      this.logger.warn(
        `CONTENT_LLM_DRAFT job ${jobId} is a stub. LLM provider integration not yet implemented.`,
      );

      // Stub result: mark as completed with no-op
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          attemptCount: job.attemptCount + 1,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      return { status: "COMPLETED" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptCount = job.attemptCount + 1;
      const permanent = attemptCount >= CONTENT_JOB_MAX_ATTEMPTS;
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: permanent ? JobStatus.FAILED_PERMANENT : JobStatus.FAILED_RETRYABLE,
          attemptCount,
          lastError: message,
          lockedAt: null,
          lockedBy: null,
          runAfter: permanent
            ? null
            : new Date(Date.now() + attemptCount * 60_000),
        },
      });
      this.logger.error(`CONTENT_LLM_DRAFT job ${jobId} failed: ${message}`);
      return { status: permanent ? "FAILED_PERMANENT" : "FAILED_RETRYABLE" };
    }
  }

  /**
   * CONTENT_VALIDATE job.
   * Runs validation on a draft and updates status to VALIDATED or VALIDATION_FAILED.
   */
  async processContentValidateJob(jobId: string): Promise<{ status: string }> {
    const job = await this.lockJob(jobId);
    if (!job) {
      const current = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      return { status: current.status };
    }

    try {
      const payload = job.payload as { draftId: string };

      await this.contentDrafts.validateDraft({ draftId: payload.draftId });

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          resultRef: payload.draftId,
          attemptCount: job.attemptCount + 1,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      return { status: "COMPLETED" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptCount = job.attemptCount + 1;
      const permanent = attemptCount >= CONTENT_JOB_MAX_ATTEMPTS;
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: permanent ? JobStatus.FAILED_PERMANENT : JobStatus.FAILED_RETRYABLE,
          attemptCount,
          lastError: message,
          lockedAt: null,
          lockedBy: null,
          runAfter: permanent
            ? null
            : new Date(Date.now() + attemptCount * 60_000),
        },
      });
      this.logger.error(`CONTENT_VALIDATE job ${jobId} failed: ${message}`);
      return { status: permanent ? "FAILED_PERMANENT" : "FAILED_RETRYABLE" };
    }
  }

  private async lockJob(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return null;
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED_PERMANENT) {
      return null;
    }
    if (
      job.status !== JobStatus.PENDING &&
      job.status !== JobStatus.FAILED_RETRYABLE
    ) {
      return null;
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.RUNNING,
        lockedAt: new Date(),
        lockedBy: this.workerId,
      },
    });
  }
}
