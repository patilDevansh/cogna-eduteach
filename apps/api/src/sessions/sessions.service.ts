import { Injectable } from "@nestjs/common";
import { SessionMode, SessionStatus } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { LearningLoopService } from "../learning-loop/learning-loop.service";
import { ReportGeneratorService } from "../engines/report-generator/report-generator.service";

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loop: LearningLoopService,
    private readonly reportGenerator: ReportGeneratorService,
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

    const report = await this.reportGenerator.generateSessionSummary(sessionId);

    return {
      sessionId: session.id,
      status: session.status,
      questionCount: session.questionCount,
      summaryReportId: report.id,
      revisionProposed: report.revisionProposed,
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
