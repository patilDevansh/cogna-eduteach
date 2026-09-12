import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  AnswerSubmittedEvent,
  AnswerSubmittedResponse,
  ExplanationViewedEvent,
  ExplanationViewedResponse,
  Grade,
  HintRequestedEvent,
  LearningDecision,
  PracticeNextResponse,
  QuestionSkippedEvent,
  QuestionSkippedResponse,
} from "@cogna/shared";
import { BASELINE_SLOT_COUNT } from "@cogna/shared";
import {
  LearningIntent,
  Prisma,
  ProcessingStatus,
  UiAction,
  type Attempt,
  type LearningSession,
  type RemediationState,
} from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { GraderService } from "../grading/grader.service";
import { DiagnosticEngineService } from "../engines/diagnostic-engine/diagnostic-engine.service";
import { DecisionEngineService } from "../engines/decision-engine/decision-engine.service";
import { QuestionGeneratorService } from "../engines/question-generator/question-generator.service";
import { ExplanationEngineService } from "../engines/explanation-engine/explanation-engine.service";
import { LiveTeachingAgentService } from "../engines/live-teaching/live-teaching-agent.service";
import { BreakAdvisorAgentService } from "../engines/break-advisor/break-advisor-agent.service";
import { RevisionService } from "../revision/revision.service";
import { ConceptCacheService } from "../engines/concept-cache/concept-cache.service";
import {
  isExplanationEffective,
  isIdleSpike,
  inferConfidenceFromBehavior,
} from "../engines/diagnostic-engine/diagnostic-formulas";
import { DIAGNOSTIC_RULES_V2 } from "@cogna/shared";

@Injectable()
export class LearningLoopService {
  private readonly logger = new Logger(LearningLoopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grader: GraderService,
    private readonly diagnostic: DiagnosticEngineService,
    private readonly decisionEngine: DecisionEngineService,
    private readonly questionGenerator: QuestionGeneratorService,
    private readonly explanationEngine: ExplanationEngineService,
    private readonly revisionService: RevisionService,
    private readonly liveTeaching: LiveTeachingAgentService,
    private readonly breakAdvisor: BreakAdvisorAgentService,
    private readonly conceptCache: ConceptCacheService,
  ) {}

  async processAnswer(event: AnswerSubmittedEvent): Promise<AnswerSubmittedResponse> {
    const loopStarted = Date.now();
    let stageStarted = loopStarted;
    const logStage = (stage: string, extra?: Record<string, unknown>) => {
      const latencyMs = Date.now() - stageStarted;
      this.logger.log(
        JSON.stringify({
          event: "learning_loop.stage",
          stage,
          latencyMs,
          eventId: event.eventId,
          sessionId: event.sessionId,
          ...extra,
        }),
      );
      stageStarted = Date.now();
    };

    const existing = await this.prisma.attempt.findUnique({
      where: { eventId: event.eventId },
    });

    if (existing?.storedResponse) {
      logStage("tx0_idempotent_hit", { totalMs: Date.now() - loopStarted });
      return existing.storedResponse as unknown as AnswerSubmittedResponse;
    }

    const session = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: event.sessionId },
    });

    if (session.studentId !== event.studentId) {
      throw new NotFoundException("Session not found for student.");
    }

    const question = await this.prisma.question.findUniqueOrThrow({
      where: {
        id_version: { id: event.questionId, version: event.questionVersion },
      },
    });

    let attempt: Attempt;
    let grade: Grade;
    let isCorrect: boolean;

    if (existing) {
      attempt = existing;
      grade = existing.grade as Grade;
      isCorrect = existing.isCorrect;
    } else {
      const accepted = question.acceptedAnswers as string[];
      grade = this.grader.grade(event.submittedAnswer, accepted);
      isCorrect = grade === "CORRECT";

      // Student's own recent pace — the baseline the passive confidence proxy compares against.
      const paceHistory = await this.prisma.attempt.findMany({
        where: { studentId: event.studentId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { totalTimeMs: true },
      });
      const studentAverageTimeMs =
        paceHistory.length >= 3
          ? paceHistory.reduce((sum, a) => sum + a.totalTimeMs, 0) / paceHistory.length
          : null;
      const inferredConfidence = inferConfidenceFromBehavior({
        totalTimeMs: event.totalTimeMs,
        studentAverageTimeMs,
        hintCount: event.hintCount,
        answerChangedBeforeSubmit: event.answerChangedBeforeSubmit,
      });

      // Tx1 — evidence (durable even if later stages fail)
      await this.prisma.rawEvent.upsert({
        where: { eventId: event.eventId },
        create: {
          eventId: event.eventId,
          eventType: event.eventType,
          studentId: event.studentId,
          sessionId: event.sessionId,
          payload: event as unknown as object,
        },
        update: {},
      });

      attempt = await this.prisma.attempt.upsert({
        where: { eventId: event.eventId },
        create: {
          eventId: event.eventId,
          studentId: event.studentId,
          sessionId: event.sessionId,
          questionId: event.questionId,
          questionVersion: event.questionVersion,
          submittedAnswer: event.submittedAnswer,
          grade,
          isCorrect,
          timeToFirstResponseMs: event.timeToFirstResponseMs,
          totalTimeMs: event.totalTimeMs,
          idleTimeMs: event.idleTimeMs,
          attemptNumber: event.attemptNumber,
          hintCount: event.hintCount,
          highestHintLevel: event.highestHintLevel,
          selfRatedConfidence: event.selfRatedConfidence ?? undefined,
          inferredConfidence,
          answerChangedBeforeSubmit: event.answerChangedBeforeSubmit,
          processingStatus: ProcessingStatus.GRADED,
        },
        update: {},
      });
    }

    logStage("tx1_graded", { grade, isCorrect, attemptId: attempt.id });

    const needsDiagnostic =
      attempt.processingStatus === ProcessingStatus.GRADED ||
      attempt.processingStatus === ProcessingStatus.FAILED_RETRYABLE;

    if (needsDiagnostic) {
      try {
        await this.diagnostic.diagnose({
          studentId: event.studentId,
          attemptId: attempt.id,
          question,
          grade,
          submittedAnswer: event.submittedAnswer,
          highestHintLevel: event.highestHintLevel,
          selfRatedConfidence: event.selfRatedConfidence,
        });

        attempt = await this.prisma.attempt.update({
          where: { id: attempt.id },
          data: { processingStatus: ProcessingStatus.PROFILE_UPDATED },
        });
        logStage("tx2_diagnostic", { attemptId: attempt.id });
      } catch {
        logStage("tx2_diagnostic_failed", { attemptId: attempt.id });
        await this.prisma.attempt.update({
          where: { id: attempt.id },
          data: { processingStatus: ProcessingStatus.FAILED_RETRYABLE },
        });

        throw new ServiceUnavailableException({
          code: "FAILED_RETRYABLE",
          processingStatus: "FAILED_RETRYABLE",
          attemptId: attempt.id,
          grade,
          isCorrect,
        });
      }
    }

    const recentAttempts = await this.prisma.attempt.findMany({
      where: { sessionId: event.sessionId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentCorrectStreak = this.streak(recentAttempts, true);
    const recentIncorrectStreak = this.streak(recentAttempts, false);

    let remediation = await this.prisma.misconceptionRemediationState.findFirst({
      where: { studentId: event.studentId, conceptId: question.conceptId },
      orderBy: { updatedAt: "desc" },
    });

    // RETESTING + correct → RESOLVED (G11) + explanation outcome (R06)
    if (
      isCorrect &&
      remediation?.state === "RETESTING" &&
      event.highestHintLevel <= 1
    ) {
      await this.prisma.misconceptionRemediationState.update({
        where: {
          studentId_misconceptionId_conceptId: {
            studentId: event.studentId,
            misconceptionId: remediation.misconceptionId,
            conceptId: remediation.conceptId,
          },
        },
        data: {
          state: "RESOLVED",
          consecutiveCorrect: { increment: 1 },
        },
      });
      await this.recordRemediationTransition(
        event.studentId,
        remediation.misconceptionId,
        remediation.conceptId,
        remediation.state,
        "RESOLVED",
      );
      remediation = { ...remediation, state: "RESOLVED" };
      await this.completeExplanationOutcome({
        studentId: event.studentId,
        sessionId: event.sessionId,
        conceptId: question.conceptId,
        misconceptionId: remediation.misconceptionId,
        retestAttemptId: attempt.id,
        grade: "CORRECT",
        highestHintLevel: event.highestHintLevel,
      });
    } else if (!isCorrect && remediation?.state === "RETESTING") {
      await this.completeExplanationOutcome({
        studentId: event.studentId,
        sessionId: event.sessionId,
        conceptId: question.conceptId,
        misconceptionId: remediation.misconceptionId,
        retestAttemptId: attempt.id,
        grade: "INCORRECT",
        highestHintLevel: event.highestHintLevel,
      });
    }

    const activeFactor = await this.prisma.diagnosticFactor.findFirst({
      where: {
        studentId: event.studentId,
        factorType: "MISCONCEPTION",
        conceptId: question.conceptId,
      },
      orderBy: { createdAt: "desc" },
    });

    const misconceptionId =
      remediation?.misconceptionId ?? activeFactor?.factorKey ?? undefined;
    const misconceptionConfidence = this.resolveMisconceptionConfidence(
      activeFactor?.confidence,
      remediation?.state,
    );

    const dueRevision = await this.prisma.revisionQueueItem.findFirst({
      where: {
        studentId: event.studentId,
        status: "PENDING",
        dueAt: { lte: new Date() },
      },
      orderBy: { priority: "desc" },
    });

    const prereqMastery = await this.getWeakestPrereqMastery(
      event.studentId,
      question.conceptId,
    );
    const hasPrereqQuestions = await this.hasPrereqQuestions(question.conceptId);

    // After each baseline answer, the next question comes from the following blueprint slot.
    const sessionForNext = this.sessionForNextBaselineQuestion(session);

    const decisionExtras = await this.buildDecisionExtras({
      studentId: event.studentId,
      session: sessionForNext,
      conceptId: question.conceptId,
      recentIncorrectStreak,
      sessionAttempts: recentAttempts,
    });

    let decision: LearningDecision;
    let usedFallback = false;
    try {
      decision = await this.decisionEngine.decide({
        session: sessionForNext,
        recentCorrectStreak,
        recentIncorrectStreak,
        activeMisconceptionId: misconceptionId,
        misconceptionConfidence,
        remediationState: remediation?.state,
        dueRevision: dueRevision ?? undefined,
        prerequisiteMastery: prereqMastery,
        hasPrereqQuestions,
        ...decisionExtras,
      });
    } catch {
      decision = this.decisionEngine.fallbackDecision(sessionForNext);
      usedFallback = true;
    }

    logStage("tx3_decided", {
      uiAction: decision.uiAction,
      learningIntent: decision.learningIntent,
      fallbackGenerated: decision.fallbackGenerated ?? usedFallback,
    });

    if (decision.fallbackGenerated || usedFallback) {
      this.logger.warn(
        JSON.stringify({
          event: "learning_loop.fallback",
          eventId: event.eventId,
          sessionId: event.sessionId,
          uiAction: decision.uiAction,
          learningIntent: decision.learningIntent,
        }),
      );
    }

    // TARGETING with 2+ failed targeted attempts → EXPLANATION_REQUIRED (G10)
    if (
      !isCorrect &&
      remediation?.state === "TARGETING" &&
      (remediation.targetedAttemptCount ?? 0) >= 2
    ) {
      await this.prisma.misconceptionRemediationState.update({
        where: {
          studentId_misconceptionId_conceptId: {
            studentId: event.studentId,
            misconceptionId: remediation.misconceptionId,
            conceptId: remediation.conceptId,
          },
        },
        data: { state: "EXPLANATION_REQUIRED" },
      });
      await this.recordRemediationTransition(
        event.studentId,
        remediation.misconceptionId,
        remediation.conceptId,
        remediation.state,
        "EXPLANATION_REQUIRED",
      );
      decision = await this.decisionEngine.decide({
        session: sessionForNext,
        recentCorrectStreak,
        recentIncorrectStreak,
        activeMisconceptionId: remediation.misconceptionId,
        misconceptionConfidence,
        remediationState: "EXPLANATION_REQUIRED",
      });
    }

    // RETESTING failed → back to EXPLANATION_REQUIRED or STILL_ACTIVE (G12)
    if (
      !isCorrect &&
      remediation?.state === "RETESTING"
    ) {
      const cycles = remediation.explanationCycleCount ?? 0;
      const nextState = cycles < 2 ? "EXPLANATION_REQUIRED" : "STILL_ACTIVE";
      await this.prisma.misconceptionRemediationState.update({
        where: {
          studentId_misconceptionId_conceptId: {
            studentId: event.studentId,
            misconceptionId: remediation.misconceptionId,
            conceptId: remediation.conceptId,
          },
        },
        data: { state: nextState },
      });
      await this.recordRemediationTransition(
        event.studentId,
        remediation.misconceptionId,
        remediation.conceptId,
        remediation.state,
        nextState,
      );
      if (nextState === "EXPLANATION_REQUIRED") {
        decision = await this.decisionEngine.decide({
          session: sessionForNext,
          recentCorrectStreak,
          recentIncorrectStreak,
          activeMisconceptionId: remediation.misconceptionId,
          misconceptionConfidence,
          remediationState: "EXPLANATION_REQUIRED",
        });
      }
    }

    // Shadow-mode only — fire-and-forget, never changes the decision above.
    this.breakAdvisor.evaluateInBackground(event.studentId, event.sessionId, {
      sessionMinutes: (Date.now() - sessionForNext.startedAt.getTime()) / 60000,
      recentIncorrectStreak,
      idleSpikeCount: decisionExtras.idleSpikeCount,
      averageTimeIncreasing50Pct: false,
      ruleSuggestsBreak: decision.uiAction === "SUGGEST_BREAK",
    });

    const savedDecision = await this.prisma.learningDecision.create({
      data: {
        studentId: event.studentId,
        sessionId: event.sessionId,
        attemptId: attempt.id,
        uiAction: decision.uiAction as UiAction,
        learningIntent: decision.learningIntent as LearningIntent,
        contentStyle: decision.contentStyle
          ? (decision.contentStyle as Prisma.InputJsonValue)
          : undefined,
        parameters: decision.parameters as unknown as Prisma.InputJsonValue,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        decisionVersion: decision.decisionVersion,
        fallbackGenerated: decision.fallbackGenerated ?? false,
      },
    });

    if (
      (decision.learningIntent === "EXECUTE_DUE_REVISION" ||
        decision.learningIntent === "RETENTION_REVIEW") &&
      decision.parameters.revisionItemId
    ) {
      await this.revisionService.markInProgress(decision.parameters.revisionItemId);
    }

    const next = await this.resolveContent(
      decision,
      event.studentId,
      event.sessionId,
      sessionForNext,
    );

    await this.persistSelectionReasoning(savedDecision.id, next.studentMessage);

    logStage("tx4_content_resolved", {
      uiAction: next.decision.uiAction,
      hasPayload: Boolean(next.payload),
    });

    const sessionUpdate: {
      questionCount?: { increment: number };
      activeConceptId: string | undefined;
      activeDifficulty: number | undefined;
      baselineSlotIndex?: { increment: number };
      breakSuggestedAt?: Date;
    } = {
      activeConceptId: decision.parameters.conceptId,
      activeDifficulty: decision.parameters.difficulty ?? session.activeDifficulty,
    };

    if (
      decision.uiAction === "SHOW_QUESTION" ||
      decision.uiAction === "SHOW_EXPLANATION"
    ) {
      sessionUpdate.questionCount = { increment: 1 };
    }

    if (decision.uiAction === "SUGGEST_BREAK") {
      sessionUpdate.breakSuggestedAt = new Date();
    }

    if (session.sessionMode === "BASELINE" && decision.uiAction === "SHOW_QUESTION") {
      sessionUpdate.baselineSlotIndex = { increment: 1 };
    }

    await this.prisma.learningSession.update({
      where: { id: session.id },
      data: sessionUpdate,
    });

    if (
      isCorrect &&
      (decision.learningIntent === "EXECUTE_DUE_REVISION" ||
        decision.learningIntent === "RETENTION_REVIEW") &&
      decision.parameters.revisionItemId
    ) {
      await this.revisionService.markCompleted(decision.parameters.revisionItemId);
    }

    const response: AnswerSubmittedResponse = {
      processingStatus: "COMPLETED",
      grade,
      isCorrect,
      decision,
      decisionId: savedDecision.id,
      attemptId: attempt.id,
      next,
    };

    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        processingStatus: ProcessingStatus.COMPLETED,
        storedResponse: response as unknown as object,
      },
    });

    logStage("completed", { totalMs: Date.now() - loopStarted });

    return response;
  }

  async processExplanationViewed(
    event: ExplanationViewedEvent,
  ): Promise<ExplanationViewedResponse> {
    const existing = await this.prisma.rawEvent.findUnique({
      where: { eventId: event.eventId },
    });

    if (existing?.payload) {
      const payload = existing.payload as Record<string, unknown>;
      if (payload.storedResponse) {
        return payload.storedResponse as ExplanationViewedResponse;
      }
    }

    const session = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: event.sessionId },
    });

    if (session.studentId !== event.studentId) {
      throw new NotFoundException("Session not found for student.");
    }

    await this.prisma.rawEvent.upsert({
      where: { eventId: event.eventId },
      create: {
        eventId: event.eventId,
        eventType: event.eventType,
        studentId: event.studentId,
        sessionId: event.sessionId,
        payload: event as unknown as object,
      },
      update: {},
    });

    const remediation = await this.prisma.misconceptionRemediationState.findFirst({
      where: {
        studentId: event.studentId,
        conceptId: event.conceptId ?? session.activeConceptId ?? undefined,
        state: "EXPLANATION_REQUIRED",
      },
      orderBy: { updatedAt: "desc" },
    });

    if (remediation) {
      await this.prisma.misconceptionRemediationState.update({
        where: {
          studentId_misconceptionId_conceptId: {
            studentId: event.studentId,
            misconceptionId: remediation.misconceptionId,
            conceptId: remediation.conceptId,
          },
        },
        data: {
          state: "RETESTING",
          explanationCycleCount: { increment: 1 },
        },
      });
    }

    await this.recordExplanationViewedOutcome({
      studentId: event.studentId,
      sessionId: event.sessionId,
      explanationId: event.explanationId ?? "unknown",
      conceptId:
        event.conceptId ??
        remediation?.conceptId ??
        session.activeConceptId ??
        "C2_ONE_STEP_SUBTRACTION",
      misconceptionId:
        event.misconceptionId ?? remediation?.misconceptionId ?? undefined,
      viewedEventId: event.eventId,
    });

    const decision = await this.decisionEngine.decide({
      session,
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId:
        event.misconceptionId ?? remediation?.misconceptionId ?? undefined,
      remediationState: "RETESTING",
      breakSuggestedThisSession: Boolean(session.breakSuggestedAt),
    });

    const savedDecision = await this.prisma.learningDecision.create({
      data: {
        studentId: event.studentId,
        sessionId: event.sessionId,
        uiAction: decision.uiAction as UiAction,
        learningIntent: decision.learningIntent as LearningIntent,
        contentStyle: decision.contentStyle
          ? (decision.contentStyle as Prisma.InputJsonValue)
          : undefined,
        parameters: decision.parameters as unknown as Prisma.InputJsonValue,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        decisionVersion: decision.decisionVersion,
        fallbackGenerated: decision.fallbackGenerated ?? false,
      },
    });

    const next = await this.resolveContent(decision, event.studentId, event.sessionId, session);

    await this.persistSelectionReasoning(savedDecision.id, next.studentMessage);

    const response: ExplanationViewedResponse = {
      processingStatus: "COMPLETED",
      decision,
      decisionId: savedDecision.id,
      next,
    };

    await this.prisma.rawEvent.update({
      where: { eventId: event.eventId },
      data: {
        payload: {
          ...(event as unknown as object),
          storedResponse: response,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return response;
  }

  async processHint(event: HintRequestedEvent) {
    const session = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: event.sessionId },
    });

    const lastAttempt = await this.prisma.attempt.findFirst({
      where: { sessionId: event.sessionId, questionId: event.questionId },
      orderBy: { createdAt: "desc" },
    });

    // Hints are often requested before any attempt exists. Count prior
    // HINT_REQUESTED events for this session+question so the ladder advances.
    const priorHintEvents = await this.prisma.rawEvent.findMany({
      where: {
        sessionId: event.sessionId,
        eventType: "HINT_REQUESTED",
      },
      select: { payload: true },
    });
    const priorForQuestion = priorHintEvents.filter((row) => {
      const payload = row.payload as { questionId?: string };
      return payload.questionId === event.questionId;
    });

    const currentLevel = Math.max(
      priorForQuestion.length,
      lastAttempt?.highestHintLevel ?? 0,
    );

    const questionVersion =
      (event as { questionVersion?: number }).questionVersion ??
      lastAttempt?.questionVersion ??
      1;

    const hint = await this.explanationEngine.getNextHint(
      event.questionId,
      questionVersion,
      currentLevel,
    );

    await this.prisma.rawEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        studentId: event.studentId,
        sessionId: event.sessionId,
        payload: {
          ...(event as unknown as object),
          hintLevel: hint.level,
        },
      },
    });

    return {
      hint,
      decision: {
        uiAction: "SHOW_HINT" as const,
        learningIntent: "CONCEPT_REINFORCEMENT" as const,
        parameters: {
          conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
          hintLevel: hint.level,
        },
        confidence: 1,
        reasoning: "Student-requested hint.",
        decisionVersion: "decision-rules-v1",
      },
      payload: { level: hint.level, content: hint.content },
    };
  }

  /**
   * Post-hoc explicit confidence tap — the fused, non-blocking "sure / not
   * sure / guessing" chip shown on the adaptive-practice feedback screen,
   * fired after the answer (and its passively inferred confidence) have
   * already been submitted and graded. Only updates the stored rating so
   * future calibration windows pick it up; does not re-run diagnostics for
   * this attempt.
   */
  async updateAttemptConfidence(
    attemptId: string,
    studentId: string,
    selfRatedConfidence: number,
  ): Promise<{ attemptId: string; selfRatedConfidence: number }> {
    const attempt = await this.prisma.attempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    if (attempt.studentId !== studentId) {
      throw new NotFoundException("Attempt not found for student.");
    }

    const updated = await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { selfRatedConfidence },
    });

    return { attemptId: updated.id, selfRatedConfidence: updated.selfRatedConfidence! };
  }

  async processSkip(event: QuestionSkippedEvent): Promise<QuestionSkippedResponse> {
    const existing = await this.prisma.rawEvent.findUnique({
      where: { eventId: event.eventId },
    });

    if (existing?.payload) {
      const payload = existing.payload as Record<string, unknown>;
      if (payload.storedResponse) {
        return payload.storedResponse as QuestionSkippedResponse;
      }
    }

    const session = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: event.sessionId },
    });

    if (session.studentId !== event.studentId) {
      throw new NotFoundException("Session not found for student.");
    }

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("Session is not active.");
    }

    await this.prisma.question.findUniqueOrThrow({
      where: {
        id_version: { id: event.questionId, version: event.questionVersion },
      },
    });

    if (session.sessionMode === "BASELINE") {
      const priorSkips = await this.prisma.rawEvent.count({
        where: { sessionId: event.sessionId, eventType: "QUESTION_SKIPPED" },
      });
      if (priorSkips >= 2) {
        throw new BadRequestException(
          "Maximum baseline skip extensions reached (2).",
        );
      }
    }

    await this.prisma.rawEvent.upsert({
      where: { eventId: event.eventId },
      create: {
        eventId: event.eventId,
        eventType: event.eventType,
        studentId: event.studentId,
        sessionId: event.sessionId,
        payload: event as unknown as object,
      },
      update: {},
    });

    const recentAttempts = await this.prisma.attempt.findMany({
      where: { sessionId: event.sessionId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentCorrectStreak = this.streak(recentAttempts, true);
    const recentIncorrectStreak = this.streak(recentAttempts, false);

    const sessionForNext = this.sessionForNextBaselineQuestion(session);

    let decision: LearningDecision;
    try {
      decision = await this.decisionEngine.decide({
        session: sessionForNext,
        recentCorrectStreak,
        recentIncorrectStreak,
      });
    } catch {
      decision = this.decisionEngine.fallbackDecision(sessionForNext);
    }

    const savedDecision = await this.prisma.learningDecision.create({
      data: {
        studentId: event.studentId,
        sessionId: event.sessionId,
        uiAction: decision.uiAction as UiAction,
        learningIntent: decision.learningIntent as LearningIntent,
        contentStyle: decision.contentStyle
          ? (decision.contentStyle as Prisma.InputJsonValue)
          : undefined,
        parameters: decision.parameters as unknown as Prisma.InputJsonValue,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        decisionVersion: decision.decisionVersion,
        fallbackGenerated: decision.fallbackGenerated ?? false,
        inputSnapshot: { trigger: "QUESTION_SKIPPED", questionId: event.questionId },
      },
    });

    const next = await this.resolveContent(
      decision,
      event.studentId,
      event.sessionId,
      sessionForNext,
    );

    await this.persistSelectionReasoning(savedDecision.id, next.studentMessage);

    const sessionUpdate: {
      baselineSlotIndex?: { increment: number };
      activeConceptId?: string;
      activeDifficulty?: number;
    } = {
      activeConceptId: decision.parameters.conceptId,
      activeDifficulty: decision.parameters.difficulty ?? session.activeDifficulty,
    };

    if (session.sessionMode === "BASELINE" && decision.uiAction === "SHOW_QUESTION") {
      sessionUpdate.baselineSlotIndex = { increment: 1 };
    }

    await this.prisma.learningSession.update({
      where: { id: session.id },
      data: sessionUpdate,
    });

    const response: QuestionSkippedResponse = {
      processingStatus: "COMPLETED",
      decision,
      decisionId: savedDecision.id,
      next,
    };

    await this.prisma.rawEvent.update({
      where: { eventId: event.eventId },
      data: {
        payload: {
          ...(event as unknown as object),
          storedResponse: response,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return response;
  }

  async getNextForSession(sessionId: string, studentId: string): Promise<PracticeNextResponse> {
    const session = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (session.studentId !== studentId) {
      throw new NotFoundException("Session not found.");
    }

    const remediation = await this.prisma.misconceptionRemediationState.findFirst({
      where: { studentId, conceptId: session.activeConceptId ?? undefined },
      orderBy: { updatedAt: "desc" },
    });

    const activeFactor = remediation
      ? await this.prisma.diagnosticFactor.findFirst({
          where: {
            studentId,
            factorType: "MISCONCEPTION",
            factorKey: remediation.misconceptionId,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const dueRevision = await this.revisionService.findDue(studentId);
    const sessionAttempts = await this.prisma.attempt.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    const decisionExtras = await this.buildDecisionExtras({
      studentId,
      session,
      conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
      recentIncorrectStreak: 0,
      sessionAttempts,
    });

    const decision = await this.decisionEngine.decide({
      session,
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId: remediation?.misconceptionId,
      misconceptionConfidence: this.resolveMisconceptionConfidence(
        activeFactor?.confidence,
        remediation?.state,
      ),
      remediationState: remediation?.state,
      dueRevision: dueRevision ?? undefined,
      ...decisionExtras,
    });

    if (
      decision.learningIntent === "EXECUTE_DUE_REVISION" &&
      decision.parameters.revisionItemId
    ) {
      await this.revisionService.markInProgress(decision.parameters.revisionItemId);
    }

    return this.resolveContent(decision, studentId, sessionId, session);
  }

  private async persistSelectionReasoning(
    decisionId: string,
    selectionReasoning?: string,
  ): Promise<void> {
    if (!selectionReasoning) return;

    const existing = await this.prisma.learningDecision.findUnique({
      where: { id: decisionId },
      select: { inputSnapshot: true },
    });

    const prior =
      existing?.inputSnapshot && typeof existing.inputSnapshot === "object"
        ? (existing.inputSnapshot as Record<string, unknown>)
        : {};

    await this.prisma.learningDecision.update({
      where: { id: decisionId },
      data: {
        inputSnapshot: {
          ...prior,
          selectionReasoning,
        },
      },
    });
  }

  private async getWeakestPrereqMastery(
    studentId: string,
    conceptId: string,
  ): Promise<number> {
    const prereqs = await this.prisma.conceptPrerequisite.findMany({
      where: { conceptId },
    });
    if (prereqs.length === 0) return 1;

    const scores = await this.prisma.masteryScore.findMany({
      where: {
        studentId,
        conceptId: { in: prereqs.map((p) => p.prerequisiteId) },
      },
    });

    if (scores.length === 0) return 0.5;
    return Math.min(...scores.map((s) => s.value));
  }

  private async hasPrereqQuestions(conceptId: string): Promise<boolean> {
    const prereqs = await this.prisma.conceptPrerequisite.findMany({
      where: { conceptId },
      take: 1,
    });
    if (!prereqs[0]) return false;

    const count = await this.prisma.question.count({
      where: {
        conceptId: prereqs[0].prerequisiteId,
        reviewStatus: "APPROVED",
      },
    });
    return count > 0;
  }

  private resolveMisconceptionConfidence(
    factorConfidence: number | undefined | null,
    remediationState?: string | null,
  ): number {
    if (factorConfidence && factorConfidence > 0) {
      return factorConfidence;
    }
    if (remediationState === "TARGETING" || remediationState === "EXPLANATION_REQUIRED") {
      return 0.65;
    }
    return 0;
  }

  private async resolveContent(
    decision: LearningDecision,
    studentId: string,
    sessionId: string,
    session?: { sessionMode: string; baselineSlotIndex: number },
  ): Promise<PracticeNextResponse> {
    // Scoped to the student across sessions (not just this session) so a
    // question already served yesterday doesn't come right back today.
    const recent = await this.prisma.attempt.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { questionId: true },
    });
    const recentQuestionIds = recent.map((a) => a.questionId);

    if (decision.uiAction === "SHOW_QUESTION") {
      // Parent-controlled safety toggle: never even shadow-generate for a paused student.
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { aiAssistedPracticePaused: true },
      });
      // Shadow generate+verify in parallel with bank select; prefer bank unless serve+pass.
      const generatedPromise = student?.aiAssistedPracticePaused
        ? Promise.resolve(null)
        : this.liveTeaching.tryGenerateShadow({
            decision,
            sessionId,
            studentId,
          });

      try {
        const bankPromise = this.questionGenerator.selectForDecision(
          decision,
          recentQuestionIds,
          {
            baselineSlotIndex:
              session?.sessionMode === "BASELINE"
                ? session.baselineSlotIndex
                : decision.parameters.baselineSlotIndex,
          },
        );

        const [bankResult, generated] = await Promise.all([
          bankPromise,
          generatedPromise.catch(() => null),
        ]);

        if (generated) {
          return {
            decision,
            payload: generated,
            studentMessage: "Let's try this one.",
          };
        }

        return {
          decision,
          payload: bankResult.question,
          studentMessage: bankResult.reasoning,
        };
      } catch (err) {
        // Still await shadow so logs emit even when bank fails.
        await generatedPromise.catch(() => null);
        if (
          err instanceof NotFoundException &&
          (err.message === "NO_ELIGIBLE_QUESTION" ||
            err.message.includes("NO_ELIGIBLE_QUESTION") ||
            err.message === "NO_APPROVED_CONTENT" ||
            err.message.includes("NO_APPROVED_CONTENT"))
        ) {
          const endDecision: LearningDecision = {
            uiAction: "END_SESSION",
            learningIntent: "STANDARD_PRACTICE",
            parameters: decision.parameters,
            confidence: 0.8,
            reasoning: err.message.includes("NO_APPROVED_CONTENT")
              ? "No APPROVED content available; ending session safely."
              : "No eligible questions; ending session safely.",
            decisionVersion: decision.decisionVersion,
          };
          return {
            decision: endDecision,
            studentMessage: "No more questions available right now. Great work today!",
          };
        }
        throw err;
      }
    }

    if (decision.uiAction === "SHOW_EXPLANATION") {
      const explanation = await this.explanationEngine.getExplanation(decision);
      return { decision, payload: explanation };
    }

    if (decision.uiAction === "SUGGEST_BREAK") {
      const minutes = decision.parameters.breakMinutes ?? 3;
      return {
        decision,
        payload: {
          breakMinutes: minutes,
          message: "Let's take a short break and come back fresh.",
          continueAllowed: true as const,
        },
        studentMessage: "Let's take a short break and come back fresh.",
      };
    }

    if (decision.uiAction === "END_SESSION") {
      return {
        decision,
        studentMessage: "Great work today. See you next session.",
      };
    }

    return { decision };
  }

  private async buildDecisionExtras(input: {
    studentId: string;
    session: LearningSession;
    conceptId: string;
    recentIncorrectStreak: number;
    sessionAttempts: Attempt[];
  }) {
    // Parallel context gathering — all queries are read-only and independent
    const idleSpikeCount = input.sessionAttempts.filter((a) =>
      isIdleSpike(a.idleTimeMs),
    ).length;

    const [
      mastery,
      concept,
      transferCheckCount,
      errorRecoveryFactor,
      retentionRow,
      activeHighMisconceptionFactor,
      profile,
      latestMisconception,
    ] = await Promise.all([
      this.prisma.masteryScore.findUnique({
        where: {
          studentId_conceptId: {
            studentId: input.studentId,
            conceptId: input.conceptId,
          },
        },
      }),
      this.conceptCache.get(input.conceptId),
      this.prisma.question.count({
        where: {
          conceptId: input.conceptId,
          questionIntent: "TRANSFER_CHECK",
          reviewStatus: "APPROVED",
        },
      }),
      this.prisma.diagnosticFactor.findFirst({
        where: {
          studentId: input.studentId,
          conceptId: input.conceptId,
          factorType: "ERROR_RECOVERY",
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.retentionEstimate.findFirst({
        where: {
          studentId: input.studentId,
          conceptId: input.conceptId,
          validUntil: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.diagnosticFactor.findFirst({
        where: {
          studentId: input.studentId,
          conceptId: input.conceptId,
          factorType: "MISCONCEPTION",
          confidence: { gt: 0.6 },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.learnerProfile.findUnique({
        where: { studentId: input.studentId },
      }),
      this.prisma.diagnosticFactor.findFirst({
        where: {
          studentId: input.studentId,
          conceptId: input.conceptId,
          factorType: "MISCONCEPTION",
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const hasTransferCheckItem = transferCheckCount > 0;
    const activeHighMisconception = activeHighMisconceptionFactor != null;

    // Alternative explanation dominance check (depends on latestMisconception)
    const altExplanations = latestMisconception?.alternativeExplanations ?? [];
    const alternativeExplanationDominant =
      altExplanations.length > 0 &&
      (await this.prisma.diagnosticFactor.findFirst({
        where: {
          studentId: input.studentId,
          conceptId: input.conceptId,
          factorType: "MISCONCEPTION",
          factorKey: { in: altExplanations.filter((a) => a !== "question_misread") },
          confidence: {
            gte: latestMisconception?.confidence ?? 0,
          },
        },
        orderBy: { createdAt: "desc" },
      })) != null;

    const calibration = profile?.confidenceCalibration;
    type CalibrationLabel =
      | "possibly_overconfident"
      | "possibly_underconfident"
      | "reasonably_calibrated"
      | "unknown";
    const confidenceCalibration: CalibrationLabel =
      calibration === "possibly_overconfident" ||
      calibration === "possibly_underconfident" ||
      calibration === "reasonably_calibrated" ||
      calibration === "unknown"
        ? calibration
        : "unknown";

    return {
      breakSuggestedThisSession: Boolean(input.session.breakSuggestedAt),
      idleSpikeCount,
      masteryValue: mastery?.value,
      evidenceCount: mastery?.evidenceCount,
      masteryThreshold: concept?.masteryThreshold,
      minimumEvidence: concept?.minimumEvidence,
      hasTransferCheckItem,
      hasActiveMisconceptionHighConfidence: activeHighMisconception,
      errorRecoveryRate:
        typeof errorRecoveryFactor?.value === "number"
          ? errorRecoveryFactor.value
          : null,
      retentionEstimateId: retentionRow?.id,
      confidenceCalibration,
      alternativeExplanationDominant,
    };
  }

  private async recordExplanationViewedOutcome(input: {
    studentId: string;
    sessionId: string;
    explanationId: string;
    conceptId: string;
    misconceptionId?: string;
    viewedEventId: string;
  }) {
    try {
      await this.prisma.explanationOutcome.upsert({
        where: { viewedEventId: input.viewedEventId },
        create: {
          studentId: input.studentId,
          sessionId: input.sessionId,
          explanationId: input.explanationId,
          conceptId: input.conceptId,
          misconceptionId: input.misconceptionId,
          viewedEventId: input.viewedEventId,
          effective: null,
          modelVersion: DIAGNOSTIC_RULES_V2,
        },
        update: {},
      });
    } catch (err) {
      this.logger.warn(
        `explanation_outcome create skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async completeExplanationOutcome(input: {
    studentId: string;
    sessionId: string;
    conceptId: string;
    misconceptionId?: string;
    retestAttemptId: string;
    grade: Grade;
    highestHintLevel: number;
  }) {
    try {
      const pending = await this.prisma.explanationOutcome.findFirst({
        where: {
          studentId: input.studentId,
          sessionId: input.sessionId,
          conceptId: input.conceptId,
          effective: null,
        },
        orderBy: { createdAt: "desc" },
      });
      if (!pending) return;

      const effective = isExplanationEffective({
        explanationViewed: true,
        nextAttemptCorrect: input.grade === "CORRECT",
        highestHintLevel: input.highestHintLevel,
      });

      await this.prisma.explanationOutcome.update({
        where: { id: pending.id },
        data: {
          retestAttemptId: input.retestAttemptId,
          effective,
          highestHintLevel: input.highestHintLevel,
        },
      });
    } catch (err) {
      this.logger.warn(
        `explanation_outcome complete skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Blueprint slot for the question shown after the current answer completes. */
  private sessionForNextBaselineQuestion(session: LearningSession): LearningSession {
    if (session.sessionMode !== "BASELINE") {
      return session;
    }

    return {
      ...session,
      questionCount: session.questionCount + 1,
      baselineSlotIndex: Math.min(
        session.baselineSlotIndex + 1,
        BASELINE_SLOT_COUNT - 1,
      ),
    };
  }

  /** Insert-only transition log powering the parent "pattern history" view. No-op when the state didn't actually change. */
  private async recordRemediationTransition(
    studentId: string,
    misconceptionId: string,
    conceptId: string,
    fromState: RemediationState,
    toState: RemediationState,
  ): Promise<void> {
    if (fromState === toState) return;
    await this.prisma.misconceptionRemediationStateHistory.create({
      data: { studentId, misconceptionId, conceptId, fromState, toState },
    });
  }

  private streak(
    attempts: Array<{ isCorrect: boolean }>,
    wantCorrect: boolean,
  ): number {
    let count = 0;
    for (const a of attempts) {
      if (a.isCorrect === wantCorrect) count++;
      else break;
    }
    return count;
  }
}
