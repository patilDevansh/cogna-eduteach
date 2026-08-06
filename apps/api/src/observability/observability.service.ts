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
  approvedContentGaps: number;
  // MVP 3.0 — Experiment metrics
  experimentMetrics: {
    totalAssignments: number;
    armCounts: Record<string, number>;
    stickyReuseRate: number | null;
  };
  // MVP 3.0 — Draft funnel metrics
  draftFunnelMetrics: {
    DRAFT: number;
    VALIDATING: number;
    VALIDATED: number;
    VALIDATION_FAILED: number;
    PENDING_REVIEW: number;
    REVIEW_REJECTED: number;
    APPROVED_PROMOTED: number;
  };
  // MVP 3.0 — Shadow mode stats
  shadowModeStats: {
    shadowScoreCount: number;
    liveScoreCount: number;
  };
  vendors: {
    posthogEnabled: boolean;
    sentryEnabled: boolean;
  };
  alerts: {
    thresholds: AlertThresholds;
    status: AlertStatus;
  };
  generatedAt: string;
}

export interface AlertThresholds {
  apiErrorRatePct: number;
  fallbackDecisionRatePct: number;
  reportDeliveryFailurePct: number;
  minApprovedQuestions: number;
  // MVP 3.0 — Safety thresholds
  nonApprovedServeAttempts: number;
  hotPathLlmCallsAllowed: number;
}

export interface AlertStatus {
  approvedContentBelowPilot: boolean;
  jobFailuresElevated: boolean;
  observabilityVendorsReady: boolean;
  // MVP 3.0 — Safety alerts
  nonApprovedContentServed: boolean;
  hotPathLlmDetected: boolean;
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
      // MVP 3.0 — Experiment metrics
      experimentAssignments,
      // MVP 3.0 — Draft funnel
      draftsByStatus,
      // MVP 3.0 — Shadow mode
      candidateScores,
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
      // Experiment assignments
      this.prisma.experimentAssignment.findMany({
        select: { arm: true, studentId: true },
      }),
      // Draft funnel
      this.prisma.contentDraft.groupBy({
        by: ["status"],
        _count: true,
      }),
      // Candidate scores
      this.prisma.candidateActionScore.findMany({
        select: { shadow: true },
      }),
    ]);

    const approvedConceptIds = new Set(conceptsWithApproved.map((c) => c.conceptId));
    const approvedContentGaps = conceptsWithQuestions.filter(
      (c) => !approvedConceptIds.has(c.conceptId),
    ).length;

    // MVP 3.0 — Experiment metrics
    const armCounts: Record<string, number> = {};
    for (const assignment of experimentAssignments) {
      armCounts[assignment.arm] = (armCounts[assignment.arm] ?? 0) + 1;
    }
    const experimentMetrics = {
      totalAssignments: experimentAssignments.length,
      armCounts,
      stickyReuseRate: null, // Stub: compute from session reuse
    };

    // MVP 3.0 — Draft funnel
    const draftFunnelMetrics: PilotDashboardResponse["draftFunnelMetrics"] = {
      DRAFT: 0,
      VALIDATING: 0,
      VALIDATED: 0,
      VALIDATION_FAILED: 0,
      PENDING_REVIEW: 0,
      REVIEW_REJECTED: 0,
      APPROVED_PROMOTED: 0,
    };
    for (const group of draftsByStatus) {
      if (group.status in draftFunnelMetrics) {
        draftFunnelMetrics[group.status as keyof typeof draftFunnelMetrics] =
          group._count;
      }
    }

    // MVP 3.0 — Shadow mode stats
    const shadowScoreCount = candidateScores.filter((s) => s.shadow).length;
    const liveScoreCount = candidateScores.filter((s) => !s.shadow).length;
    const shadowModeStats = { shadowScoreCount, liveScoreCount };

    const thresholds = this.getAlertThresholds();
    const alerts: AlertStatus = {
      approvedContentBelowPilot: approved < thresholds.minApprovedQuestions,
      jobFailuresElevated:
        jobRetryable + jobPermanent > 0 && attemptsRecent24h > 0,
      observabilityVendorsReady: this.posthogEnabled || this.sentryEnabled,
      // MVP 3.0 — Safety alerts (stubs: detect from logs or instrumentation)
      nonApprovedContentServed: false, // Stub: monitor from answer hot path
      hotPathLlmDetected: false, // Stub: monitor from Tx1–Tx4 instrumentation
    };

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
      experimentMetrics,
      draftFunnelMetrics,
      shadowModeStats,
      vendors: {
        posthogEnabled: this.posthogEnabled,
        sentryEnabled: this.sentryEnabled,
      },
      alerts: {
        thresholds,
        status: alerts,
      },
      generatedAt: now.toISOString(),
    };
  }

  getAlertThresholds(): AlertThresholds {
    return {
      apiErrorRatePct: 2,
      fallbackDecisionRatePct: 5,
      reportDeliveryFailurePct: 10,
      minApprovedQuestions: 200,
      // MVP 3.0 — Safety thresholds
      nonApprovedServeAttempts: 0, // Must be zero
      hotPathLlmCallsAllowed: 0, // Must be zero
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

  // ─── MVP 3.0 — Safety alerts ──────────────────────────────────────────────

  /**
   * Alert if non-APPROVED content attempted to be served to a student.
   * P0 violation — must be zero in production.
   * Stub: logs alert; real implementation would emit to alerting system.
   */
  alertNonApprovedContentAttempt(context: {
    questionId?: string;
    reviewStatus?: string;
    studentId: string;
    sessionId: string;
  }): void {
    this.logger.error(
      JSON.stringify({
        event: "alert.non_approved_content_attempt",
        severity: "P0",
        ...context,
      }),
    );
    if (this.sentryEnabled) {
      this.captureException(
        new Error("Non-APPROVED content attempted to be served"),
        context,
      );
    }
  }

  /**
   * Alert if LLM invoked on answer hot path (Tx1–Tx4).
   * P0 violation — must be zero in production.
   * Stub: logs alert; real implementation would emit to alerting system.
   */
  alertHotPathLlmCall(context: {
    studentId: string;
    sessionId: string;
    transactionStage: string;
    callsite?: string;
  }): void {
    this.logger.error(
      JSON.stringify({
        event: "alert.hot_path_llm_call",
        severity: "P0",
        ...context,
      }),
    );
    if (this.sentryEnabled) {
      this.captureException(new Error("LLM invoked on answer hot path"), context);
    }
  }
}
