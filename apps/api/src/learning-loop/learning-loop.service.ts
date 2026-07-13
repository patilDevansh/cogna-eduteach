import {
  Injectable,
  NotFoundException,
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
} from "@cogna/shared";
import { BASELINE_SLOT_COUNT } from "@cogna/shared";
import {
  LearningIntent,
  Prisma,
  ProcessingStatus,
  UiAction,
  type Attempt,
  type LearningSession,
} from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { GraderService } from "../grading/grader.service";
import { DiagnosticEngineService } from "../engines/diagnostic-engine/diagnostic-engine.service";
import { DecisionEngineService } from "../engines/decision-engine/decision-engine.service";
import { QuestionGeneratorService } from "../engines/question-generator/question-generator.service";
import { ExplanationEngineService } from "../engines/explanation-engine/explanation-engine.service";

@Injectable()
export class LearningLoopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grader: GraderService,
    private readonly diagnostic: DiagnosticEngineService,
    private readonly decisionEngine: DecisionEngineService,
    private readonly questionGenerator: QuestionGeneratorService,
    private readonly explanationEngine: ExplanationEngineService,
  ) {}

  async processAnswer(event: AnswerSubmittedEvent): Promise<AnswerSubmittedResponse> {
    const existing = await this.prisma.attempt.findUnique({
      where: { eventId: event.eventId },
    });

    if (existing?.storedResponse) {
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
          answerChangedBeforeSubmit: event.answerChangedBeforeSubmit,
          processingStatus: ProcessingStatus.GRADED,
        },
        update: {},
      });
    }

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
      } catch {
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

    // RETESTING + correct → RESOLVED (G11)
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
      remediation = { ...remediation, state: "RESOLVED" };
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

    let decision: LearningDecision;
    try {
      decision = this.decisionEngine.decide({
        session: sessionForNext,
        recentCorrectStreak,
        recentIncorrectStreak,
        activeMisconceptionId: misconceptionId,
        misconceptionConfidence,
        remediationState: remediation?.state,
        dueRevision: dueRevision ?? undefined,
        prerequisiteMastery: prereqMastery,
        hasPrereqQuestions,
      });
    } catch {
      decision = this.decisionEngine.fallbackDecision(sessionForNext);
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
      decision = this.decisionEngine.decide({
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
      if (nextState === "EXPLANATION_REQUIRED") {
        decision = this.decisionEngine.decide({
          session: sessionForNext,
          recentCorrectStreak,
          recentIncorrectStreak,
          activeMisconceptionId: remediation.misconceptionId,
          misconceptionConfidence,
          remediationState: "EXPLANATION_REQUIRED",
        });
      }
    }

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

    const next = await this.resolveContent(
      decision,
      event.studentId,
      event.sessionId,
      sessionForNext,
    );

    const sessionUpdate: {
      questionCount: { increment: number };
      activeConceptId: string | undefined;
      activeDifficulty: number | undefined;
      baselineSlotIndex?: { increment: number };
    } = {
      questionCount: { increment: 1 },
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

    const decision = this.decisionEngine.decide({
      session,
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId:
        event.misconceptionId ?? remediation?.misconceptionId ?? undefined,
      remediationState: "RETESTING",
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

    const currentLevel = lastAttempt?.highestHintLevel ?? 0;
    const hint = await this.explanationEngine.getNextHint(
      event.questionId,
      lastAttempt?.questionVersion ?? 1,
      currentLevel,
    );

    await this.prisma.rawEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        studentId: event.studentId,
        sessionId: event.sessionId,
        payload: event as unknown as object,
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

    const decision = this.decisionEngine.decide({
      session,
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId: remediation?.misconceptionId,
      misconceptionConfidence: this.resolveMisconceptionConfidence(
        activeFactor?.confidence,
        remediation?.state,
      ),
      remediationState: remediation?.state,
    });

    return this.resolveContent(decision, studentId, sessionId, session);
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
    const recent = await this.prisma.attempt.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { questionId: true },
    });
    const recentQuestionIds = recent.map((a) => a.questionId);

    if (decision.uiAction === "SHOW_QUESTION") {
      try {
        const { question, reasoning } = await this.questionGenerator.selectForDecision(
          decision,
          recentQuestionIds,
          {
            baselineSlotIndex:
              session?.sessionMode === "BASELINE"
                ? session.baselineSlotIndex
                : decision.parameters.baselineSlotIndex,
          },
        );
        return {
          decision,
          payload: question,
          studentMessage: reasoning,
        };
      } catch (err) {
        if (
          err instanceof NotFoundException &&
          (err.message === "NO_ELIGIBLE_QUESTION" ||
            err.message.includes("NO_ELIGIBLE_QUESTION"))
        ) {
          const endDecision: LearningDecision = {
            uiAction: "END_SESSION",
            learningIntent: "STANDARD_PRACTICE",
            parameters: decision.parameters,
            confidence: 0.8,
            reasoning: "No eligible questions; ending session safely.",
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

    if (decision.uiAction === "END_SESSION") {
      return {
        decision,
        studentMessage: "Great work today. See you next session.",
      };
    }

    return { decision };
  }

  /** Blueprint slot for the question shown after the current answer completes. */
  private sessionForNextBaselineQuestion(session: LearningSession): LearningSession {
    if (session.sessionMode !== "BASELINE") {
      return session;
    }

    return {
      ...session,
      baselineSlotIndex: Math.min(
        session.baselineSlotIndex + 1,
        BASELINE_SLOT_COUNT - 1,
      ),
    };
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
