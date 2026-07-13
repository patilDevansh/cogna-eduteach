import { Injectable } from "@nestjs/common";
import { SessionMode, SessionStatus } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { LearningLoopService } from "../learning-loop/learning-loop.service";
import { ReportGeneratorService } from "../engines/report-generator/report-generator.service";
import { RecommendationEngineService } from "../engines/recommendation-engine/recommendation-engine.service";
import { RevisionService } from "../revision/revision.service";

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loop: LearningLoopService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly revisionService: RevisionService,
  ) {}

  async create(studentId: string, sessionMode: SessionMode = SessionMode.ADAPTIVE_PRACTICE) {
    const session = await this.prisma.learningSession.create({
      data: {
        studentId,
        sessionMode,
        activeConceptId: "C2_ONE_STEP_SUBTRACTION",
        activeDifficulty: 2,
      },
    });

    const next = await this.loop.getNextForSession(session.id, studentId);

    return {
      sessionId: session.id,
      sessionMode: session.sessionMode,
      next,
    };
  }

  async end(sessionId: string) {
    const existing = await this.prisma.learningSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const session = await this.prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
      },
    });

    await this.prisma.rawEvent.upsert({
      where: { eventId: `session-ended-${sessionId}` },
      create: {
        eventId: `session-ended-${sessionId}`,
        eventType: "SESSION_ENDED",
        studentId: existing.studentId,
        sessionId,
        payload: { sessionId, endedAt: session.endedAt?.toISOString() },
      },
      update: {},
    });

    const proposals = await this.recommendationEngine.proposeOnSessionEnd(existing.studentId);
    const revisionItems = await this.revisionService.applyProposals(
      existing.studentId,
      proposals,
    );

    const report = await this.reportGenerator.generateSessionSummary(sessionId);

    return {
      sessionId: session.id,
      status: session.status,
      questionCount: session.questionCount,
      summaryReportId: report.id,
      revisionProposed: revisionItems.length > 0,
      revisionItemsCreated: revisionItems.length,
    };
  }

  async simulateElapsed(sessionId: string, minutes: number) {
    const startedAt = new Date(Date.now() - Math.max(0, minutes) * 60_000);
    const session = await this.prisma.learningSession.update({
      where: { id: sessionId },
      data: { startedAt },
    });
    return {
      sessionId: session.id,
      startedAt: session.startedAt.toISOString(),
      simulatedMinutes: minutes,
    };
  }

  async get(sessionId: string): Promise<unknown> {
    return this.prisma.learningSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        attempts: { orderBy: { createdAt: "asc" } },
        decisions: { orderBy: { createdAt: "asc" } },
      },
    });
  }
}
