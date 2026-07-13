import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JobStatus, ReviewStatus } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";

export interface PilotDashboardResponse {
  sessionsToday: number;
  attemptsRecent24h: number;
  answerLatencyP50Ms: number | null;
  answerLatencyP95Ms: number | null;
  failureRetryableCount: number;
  jobFailureCounts: {
    FAILED_RETRYABLE: number;
    FAILED_PERMANENT: number;
  };
  questionCounts: {
    APPROVED: number;
    PENDING_REVIEW: number;
    DRAFT: number;
    RETIRED: number;
  };
  /** Concepts that have bank items but zero APPROVED questions. */
  approvedContentGaps: number;
  vendors: {
    posthogEnabled: boolean;
    sentryEnabled: boolean;
  };
  generatedAt: string;
}

/**
 * Minimal observability hooks — activates PostHog/Sentry when env vars are set.
 * MVP: structured logs only; vendor SDKs are optional stubs.
 * Pilot dashboard aggregates Prisma counters for ops visibility.
 */
@Injectable()
export class ObservabilityService implements OnModuleInit {
  private readonly logger = new Logger(ObservabilityService.name);
  private posthogEnabled = false;
  private sentryEnabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const posthogKey = this.config.get<string>("NEXT_PUBLIC_POSTHOG_KEY");
    const sentryDsn = this.config.get<string>("SENTRY_DSN");

    if (posthogKey) {
      this.posthogEnabled = true;
      this.logger.log(
        JSON.stringify({
          event: "observability.posthog",
          status: "stub_ready",
          host: this.config.get("NEXT_PUBLIC_POSTHOG_HOST") ?? "https://app.posthog.com",
        }),
      );
    }

    if (sentryDsn) {
      this.sentryEnabled = true;
      this.logger.log(
        JSON.stringify({ event: "observability.sentry", status: "stub_ready" }),
      );
    }
  }

  async getPilotDashboard(): Promise<PilotDashboardResponse> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      sessionsToday,
      attemptsRecent24h,
      jobRetryable,
      jobPermanent,
      approved,
      pending,
      draft,
      retired,
      conceptsWithQuestions,
      conceptsWithApproved,
    ] = await Promise.all([
      this.prisma.learningSession.count({
        where: { startedAt: { gte: startOfToday } },
      }),
      this.prisma.attempt.count({
        where: { createdAt: { gte: last24h } },
      }),
      this.prisma.job.count({
        where: { status: JobStatus.FAILED_RETRYABLE },
      }),
      this.prisma.job.count({
        where: { status: JobStatus.FAILED_PERMANENT },
      }),
      this.prisma.question.count({
        where: { reviewStatus: ReviewStatus.APPROVED },
      }),
      this.prisma.question.count({
        where: { reviewStatus: ReviewStatus.PENDING_REVIEW },
      }),
      this.prisma.question.count({
        where: { reviewStatus: ReviewStatus.DRAFT },
      }),
      this.prisma.question.count({
        where: { reviewStatus: ReviewStatus.RETIRED },
      }),
      this.prisma.question.findMany({
        select: { conceptId: true },
        distinct: ["conceptId"],
      }),
      this.prisma.question.findMany({
        where: { reviewStatus: ReviewStatus.APPROVED },
        select: { conceptId: true },
        distinct: ["conceptId"],
      }),
    ]);

    const approvedConceptIds = new Set(conceptsWithApproved.map((c) => c.conceptId));
    const approvedContentGaps = conceptsWithQuestions.filter(
      (c) => !approvedConceptIds.has(c.conceptId),
    ).length;

    return {
      sessionsToday,
      attemptsRecent24h,
      // Latency percentiles not instrumented yet — stable null stubs for pilot UI.
      answerLatencyP50Ms: null,
      answerLatencyP95Ms: null,
      failureRetryableCount: jobRetryable,
      jobFailureCounts: {
        FAILED_RETRYABLE: jobRetryable,
        FAILED_PERMANENT: jobPermanent,
      },
      questionCounts: {
        APPROVED: approved,
        PENDING_REVIEW: pending,
        DRAFT: draft,
        RETIRED: retired,
      },
      approvedContentGaps,
      vendors: {
        posthogEnabled: this.posthogEnabled,
        sentryEnabled: this.sentryEnabled,
      },
      generatedAt: now.toISOString(),
    };
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (this.posthogEnabled) {
      this.logger.debug(
        JSON.stringify({ event: "posthog.capture", name: event, properties }),
      );
    }
  }

  captureException(error: unknown, context?: Record<string, unknown>): void {
    if (this.sentryEnabled) {
      this.logger.warn(
        JSON.stringify({
          event: "sentry.captureException",
          message: error instanceof Error ? error.message : String(error),
          context,
        }),
      );
    }
  }

  isPosthogEnabled(): boolean {
    return this.posthogEnabled;
  }

  isSentryEnabled(): boolean {
    return this.sentryEnabled;
  }
}
