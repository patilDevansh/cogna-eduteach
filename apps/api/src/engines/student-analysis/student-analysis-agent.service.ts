import { Injectable, Logger } from "@nestjs/common";
import { containsForbiddenTerm, assertStudentAnalysisSnapshotShape, type StudentAnalysisSnapshot } from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import { buildAnalysisPrompts, buildRuleDirections, computeAgreementRate } from "./student-analysis.formulas";

const CAPABILITY = "STUDENT_ANALYSIS";
const MODEL_VERSION = "student-analysis-agent-v1";

/**
 * Shadow-mode agent: synthesizes this session's mastery changes into a
 * confidence-scored per-concept assessment, purely for offline comparison
 * against the existing rule-based diagnostic engine. Never shown to a
 * student or parent — there is no SERVE path wired to any UI in this phase.
 */
@Injectable()
export class StudentAnalysisAgentService {
  private readonly logger = new Logger(StudentAnalysisAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  /** Call from SessionsService.end() — fire-and-forget, never blocks the session-end response. */
  analyzeSessionInBackground(studentId: string, sessionId: string): void {
    this.analyzeSession(studentId, sessionId).catch((err) => {
      this.logger.warn(
        `Student analysis shadow run failed for session ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  async analyzeSession(studentId: string, sessionId: string): Promise<StudentAnalysisSnapshot | null> {
    const session = await this.prisma.learningSession.findUnique({
      where: { id: sessionId },
      select: { startedAt: true, endedAt: true },
    });
    if (!session) return null;

    const updates = await this.prisma.masteryHistory.findMany({
      where: {
        studentId,
        createdAt: { gte: session.startedAt, lte: session.endedAt ?? new Date() },
      },
      select: { conceptId: true, previousValue: true, newValue: true },
      orderBy: { createdAt: "asc" },
    });

    const ruleDirections = buildRuleDirections(updates);
    const ruleOutput = {
      directions: Object.fromEntries(ruleDirections),
      formulaVersion: "mastery-delta-threshold-v1",
    };

    const { system, user } = buildAnalysisPrompts(updates);

    const result = await this.orchestrator.call<StudentAnalysisSnapshot>({
      capability: CAPABILITY,
      studentId,
      sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput,
      parse: (raw) => this.parseAndValidate(raw, studentId, sessionId),
    });

    if (!result.aiOutput) return null;

    const agreement = computeAgreementRate(ruleDirections, result.aiOutput.conceptAssessments);
    this.logger.log(
      JSON.stringify({
        event: "student_analysis.shadow",
        studentId,
        sessionId,
        served: result.served,
        agreementRate: agreement.agreementRate,
        comparedCount: agreement.comparedCount,
      }),
    );

    return result.aiOutput;
  }

  /** Validates shape, then re-checks every reasoning string for forbidden voice terms — a leak here fails the call even if the JSON shape was otherwise valid. */
  private parseAndValidate(raw: string, studentId: string, sessionId: string): StudentAnalysisSnapshot {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const snapshot = assertStudentAnalysisSnapshotShape({
      studentId,
      sessionId,
      conceptAssessments: body.conceptAssessments,
      modelVersion: MODEL_VERSION,
    });

    for (const assessment of snapshot.conceptAssessments) {
      if (containsForbiddenTerm(assessment.reasoning)) {
        throw new Error(`reasoning for ${assessment.conceptId} contains a forbidden term`);
      }
    }

    return snapshot;
  }
}
