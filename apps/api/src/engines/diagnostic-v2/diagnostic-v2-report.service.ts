/**
 * DiagnosticV2-native report assembly + AI polish (MVP 9.0.1 Phase D.v2).
 *
 * Reuses ReportGeneratorAgentService (forbidden-term + numeric cross-check).
 * Structured facts come from MicroSkillStateV2 / hypotheses / attempts — never
 * LearningSession mastery. Rule templates remain the fallback when AI is off
 * or rejected.
 */
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  DIAGNOSTIC_V2_REPORT_V1,
  isDiagnosticV2Track,
  type DiagnosticV2Track,
  type MicroSkillStatus,
} from "@cogna/shared";
import { ReportAudience, ReportTrigger } from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";
import { ReportGeneratorAgentService } from "../report-generator/report-generator-agent.service";
import {
  buildChildFacingSummary,
  childFacingSkillName,
  joinWords,
} from "./diagnostic-v2-summary";

export interface DiagnosticV2ReportSkillFact {
  microSkillId: string;
  childFacingName: string;
  status: MicroSkillStatus | string;
  evidenceCount: number;
  independentSuccessCount: number;
  independentFailureCount: number;
  assistedSuccessCount: number;
  hypothesisLabel?: string | null;
  confidence?: number | null;
  childFacingSummary?: string | null;
}

export interface DiagnosticV2ReportStructuredData {
  kind: "diagnostic_v2_session";
  diagnosticSessionId: string;
  track: DiagnosticV2Track | "UNKNOWN";
  status: string;
  itemsAttempted: number;
  itemsCompleted: number;
  solidSkillCount: number;
  gapSkillCount: number;
  solidSkillNames: string[];
  gapSkillNames: string[];
  stageCount: number;
  retentionScheduled: boolean;
  skills: DiagnosticV2ReportSkillFact[];
  /** Grounded next-step lines for the parent template / AI (not invented). */
  parentActions: string[];
}

export interface DiagnosticV2PolishedSummaries {
  childFacingSummary: string;
  parentFacingSummary: string;
  structuredData: DiagnosticV2ReportStructuredData;
  studentPolished: boolean;
  parentPolished: boolean;
}

@Injectable()
export class DiagnosticV2ReportService {
  private readonly logger = new Logger(DiagnosticV2ReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportAgent: ReportGeneratorAgentService,
  ) {}

  async buildStructuredData(sessionId: string): Promise<DiagnosticV2ReportStructuredData> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Diagnostic session not found.");

    const [attempts, states, hypotheses, sessionSteps, retentionCount] = await Promise.all([
      this.prisma.diagnosticV2Attempt.findMany({
        where: { sessionId },
        select: { status: true },
      }),
      this.prisma.microSkillStateV2.findMany({
        where: { studentId: session.studentId },
        orderBy: { microSkillId: "asc" },
      }),
      this.prisma.diagnosticV2Hypothesis.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.diagnosticV2Step.findMany({
        where: { attempt: { sessionId } },
        select: { primaryMicroSkillId: true },
      }),
      this.prisma.revisionQueueItem.count({
        where: {
          studentId: session.studentId,
          type: "MICRO_SKILL_RETENTION_CHECK",
          status: "PENDING",
        },
      }),
    ]);

    const history = Array.isArray(session.stageHistory)
      ? (session.stageHistory as Array<{ track?: unknown; stageId?: string }>)
      : [];
    const trackRaw = history.find((e) => e && e.track !== undefined)?.track;
    const track: DiagnosticV2Track | "UNKNOWN" = isDiagnosticV2Track(trackRaw)
      ? trackRaw
      : "UNKNOWN";

    const sessionSkillIds = new Set<string>();
    for (const h of hypotheses) sessionSkillIds.add(h.microSkillId);
    for (const step of sessionSteps) {
      if (step.primaryMicroSkillId) sessionSkillIds.add(step.primaryMicroSkillId);
    }

    let touched = states.filter((s) => sessionSkillIds.has(s.microSkillId));
    // Early-stop with no steps yet: still return a polite empty-ish summary.
    if (touched.length === 0) {
      touched = [];
    }

    const hypBySkill = new Map<string, (typeof hypotheses)[number]>();
    for (const h of hypotheses) hypBySkill.set(h.microSkillId, h);

    const skills: DiagnosticV2ReportSkillFact[] = touched.map((s) => {
      const hyp = hypBySkill.get(s.microSkillId);
      return {
        microSkillId: s.microSkillId,
        childFacingName: childFacingSkillName(s.microSkillId),
        status: s.status,
        evidenceCount: s.evidenceCount,
        independentSuccessCount: s.independentSuccessCount,
        independentFailureCount: s.independentFailureCount,
        assistedSuccessCount: s.assistedSuccessCount,
        hypothesisLabel: hyp?.hypothesisLabel ?? null,
        confidence: hyp?.confidence ?? null,
        childFacingSummary: hyp?.childFacingSummary ?? null,
      };
    });

    const solid = [
      ...skills.filter((s) => s.status === "RELIABLE"),
      ...skills.filter((s) => s.status === "DEVELOPING"),
    ];
    const gaps = skills.filter((s) => s.status === "LIKELY_GAP");
    const solidSkillNames = solid.slice(0, 3).map((s) => s.childFacingName);
    const gapSkillNames = gaps.map((s) => s.childFacingName);

    const parentActions: string[] = [];
    if (gaps.length > 0) {
      parentActions.push(
        `Spend a short practice block revisiting ${joinWords(gapSkillNames)}.`,
      );
      parentActions.push("We'll schedule a short follow-up check in a few days.");
    } else {
      parentActions.push("Keep practising similar problems so today's skills stay solid.");
    }

    return {
      kind: "diagnostic_v2_session",
      diagnosticSessionId: sessionId,
      track,
      status: session.status,
      itemsAttempted: attempts.length,
      itemsCompleted: attempts.filter((a) => a.status === "COMPLETED").length,
      solidSkillCount: solid.length,
      gapSkillCount: gaps.length,
      solidSkillNames,
      gapSkillNames,
      stageCount: history.filter((e) => typeof e?.stageId === "string").length,
      retentionScheduled: retentionCount > 0 || gaps.length > 0,
      skills,
      parentActions,
    };
  }

  renderStudentSummary(data: DiagnosticV2ReportStructuredData): string {
    return buildChildFacingSummary(
      data.skills.map((s) => ({
        microSkillId: s.microSkillId,
        status: s.status as MicroSkillStatus,
      })),
      data.skills.map((s) => ({
        microSkillId: s.microSkillId,
        childFacingSummary: s.childFacingSummary ?? null,
      })),
    );
  }

  renderParentSummary(data: DiagnosticV2ReportStructuredData): string {
    const parts: string[] = [];
    parts.push(
      `Today your child worked through a short step-by-step algebra check ` +
        `(${data.itemsCompleted} of ${data.itemsAttempted} questions finished).`,
    );
    if (data.solidSkillNames.length > 0) {
      parts.push(`They looked solid on ${joinWords(data.solidSkillNames)}.`);
    } else {
      parts.push("They stayed engaged with the working lines.");
    }
    if (data.gapSkillNames.length > 0) {
      parts.push(
        `Areas to revisit: ${joinWords(data.gapSkillNames)} ` +
          `(${data.gapSkillCount} skill gap${data.gapSkillCount === 1 ? "" : "s"} noted).`,
      );
    } else {
      parts.push("No clear skill gaps stood out in this check.");
    }
    for (const action of data.parentActions) {
      parts.push(action);
    }
    return parts.join(" ");
  }

  /**
   * Build rule text, polish when REPORT_GENERATOR GENERATE+SERVE pass gates,
   * and persist STUDENT/PARENT Report rows (idempotent per session).
   */
  async getOrBuildSummaries(sessionId: string): Promise<DiagnosticV2PolishedSummaries> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Diagnostic session not found.");

    const existing = await this.findPersistedSummaries(session.studentId, sessionId);
    if (existing) return existing;

    const structuredData = await this.buildStructuredData(sessionId);
    const ruleStudent = this.renderStudentSummary(structuredData);
    const ruleParent = this.renderParentSummary(structuredData);

    const polishedStudent = await this.tryPolish(
      "STUDENT",
      session.studentId,
      sessionId,
      structuredData,
      ruleStudent,
    );
    const polishedParent = await this.tryPolish(
      "PARENT",
      session.studentId,
      sessionId,
      structuredData,
      ruleParent,
    );

    const childFacingSummary = polishedStudent ?? ruleStudent;
    const parentFacingSummary = polishedParent ?? ruleParent;

    const periodStart = session.startedAt;
    const periodEnd = session.endedAt ?? new Date();

    await this.prisma.report.createMany({
      data: [
        {
          studentId: session.studentId,
          audience: ReportAudience.STUDENT,
          trigger: ReportTrigger.SESSION_ENDED,
          periodStart,
          periodEnd,
          structuredData: structuredData as object,
          renderedText: childFacingSummary,
          reportVersion: DIAGNOSTIC_V2_REPORT_V1,
        },
        {
          studentId: session.studentId,
          audience: ReportAudience.PARENT,
          trigger: ReportTrigger.SESSION_ENDED,
          periodStart,
          periodEnd,
          structuredData: structuredData as object,
          renderedText: parentFacingSummary,
          reportVersion: DIAGNOSTIC_V2_REPORT_V1,
        },
      ],
    });

    return {
      childFacingSummary,
      parentFacingSummary,
      structuredData,
      studentPolished: polishedStudent != null,
      parentPolished: polishedParent != null,
    };
  }

  /** Fire-and-forget safe wrapper for session-complete hooks. */
  ensureSessionReportsInBackground(sessionId: string): void {
    void this.getOrBuildSummaries(sessionId).catch((err) => {
      this.logger.warn(
        `diagnostic_v2 report generate failed for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async findPersistedSummaries(
    studentId: string,
    sessionId: string,
  ): Promise<DiagnosticV2PolishedSummaries | null> {
    const rows = await this.prisma.report.findMany({
      where: {
        studentId,
        reportVersion: DIAGNOSTIC_V2_REPORT_V1,
        trigger: ReportTrigger.SESSION_ENDED,
        audience: { in: [ReportAudience.STUDENT, ReportAudience.PARENT] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const matching = rows.filter((r) => {
      const data = r.structuredData as { diagnosticSessionId?: unknown } | null;
      return data?.diagnosticSessionId === sessionId;
    });
    const student = matching.find((r) => r.audience === ReportAudience.STUDENT);
    const parent = matching.find((r) => r.audience === ReportAudience.PARENT);
    if (!student || !parent) return null;

    const structuredData = student.structuredData as unknown as DiagnosticV2ReportStructuredData;
    return {
      childFacingSummary: student.renderedText,
      parentFacingSummary: parent.renderedText,
      structuredData,
      studentPolished: true,
      parentPolished: true,
    };
  }

  private async tryPolish(
    audience: "STUDENT" | "PARENT",
    studentId: string,
    sessionId: string,
    structuredData: DiagnosticV2ReportStructuredData,
    ruleText: string,
  ): Promise<string | null> {
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
        `diagnostic_v2 REPORT_GENERATOR polish failed for ${audience}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}

