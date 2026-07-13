import { Injectable } from "@nestjs/common";
import { RETENTION_RULES_V2 } from "@cogna/shared";
import { PrismaService } from "../prisma/prisma.service";
import { computeRetentionEstimate } from "../engines/diagnostic-engine/diagnostic-formulas";

const RETENTION_THRESHOLD = 0.55;
const HIGH_PRIORITY_THRESHOLD = 0.4;
const VALID_DAYS = 7;

export interface RetentionEstimateResult {
  conceptId: string;
  estimate: number;
  confidence: number;
  daysSinceSuccess: number;
  modelVersion: string;
  validUntil: string;
  highPriority: boolean;
  reviewEligible: boolean;
}

export interface RetentionComputeInput {
  mastery: number;
  daysSinceSuccess: number;
  completedRevisionsLast14Days: number;
}

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exact retention-rules-v2 formula (R01/R03). */
  computeEstimate(input: RetentionComputeInput): number {
    return computeRetentionEstimate(input);
  }

  async listEstimates(studentId: string): Promise<{
    studentId: string;
    estimates: RetentionEstimateResult[];
    abstainedConceptIds: string[];
  }> {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const now = new Date();
    const rows = await this.prisma.retentionEstimate.findMany({
      where: {
        studentId,
        modelVersion: RETENTION_RULES_V2,
        validUntil: { gt: now },
      },
      orderBy: { estimate: "asc" },
    });

    const estimates: RetentionEstimateResult[] = rows.map((row) => ({
      conceptId: row.conceptId,
      estimate: row.estimate,
      confidence: row.confidence,
      daysSinceSuccess: row.daysSinceSuccess,
      modelVersion: row.modelVersion,
      validUntil: row.validUntil.toISOString(),
      highPriority: row.estimate < HIGH_PRIORITY_THRESHOLD,
      reviewEligible: row.estimate < RETENTION_THRESHOLD,
    }));

    return { studentId, estimates, abstainedConceptIds: [] };
  }

  /**
   * Recompute retention for all mastery concepts with enough independent evidence.
   * Absains when evidence is insufficient (R02).
   */
  async recomputeForStudent(studentId: string): Promise<{
    studentId: string;
    estimates: RetentionEstimateResult[];
    abstainedConceptIds: string[];
  }> {
    const masteryRows = await this.prisma.masteryScore.findMany({ where: { studentId } });
    const estimates: RetentionEstimateResult[] = [];
    const abstainedConceptIds: string[] = [];
    const validUntil = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);

    for (const mastery of masteryRows) {
      const independent = await this.prisma.attempt.findMany({
        where: {
          studentId,
          highestHintLevel: { lte: 1 },
          question: { conceptId: mastery.conceptId },
        },
        orderBy: { createdAt: "desc" },
        include: { question: { select: { conceptId: true } } },
      });

      const independentCorrect = independent.filter((a) => a.isCorrect);
      if (independent.length < 2 || independentCorrect.length < 1) {
        abstainedConceptIds.push(mastery.conceptId);
        continue;
      }

      const lastSuccess = independentCorrect[0]!;
      const daysSinceSuccess = daysBetween(lastSuccess.createdAt, new Date());

      const completedRevisionsLast14Days = await this.prisma.revisionQueueItem.count({
        where: {
          studentId,
          conceptId: mastery.conceptId,
          type: "RETENTION_REVIEW",
          status: "COMPLETED",
          updatedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
      });

      const estimate = this.computeEstimate({
        mastery: mastery.value,
        daysSinceSuccess,
        completedRevisionsLast14Days,
      });

      const confidence = Math.min(0.95, 0.5 + independent.length * 0.05);
      const evidenceAttemptIds = independent.slice(0, 8).map((a) => a.id);

      // Replace prior active estimate for this concept/version by expiring them.
      await this.prisma.retentionEstimate.updateMany({
        where: {
          studentId,
          conceptId: mastery.conceptId,
          modelVersion: RETENTION_RULES_V2,
          validUntil: { gt: new Date() },
        },
        data: { validUntil: new Date() },
      });

      await this.prisma.retentionEstimate.create({
        data: {
          studentId,
          conceptId: mastery.conceptId,
          estimate,
          confidence,
          daysSinceSuccess,
          evidenceAttemptIds,
          modelVersion: RETENTION_RULES_V2,
          validUntil,
        },
      });

      estimates.push({
        conceptId: mastery.conceptId,
        estimate,
        confidence,
        daysSinceSuccess,
        modelVersion: RETENTION_RULES_V2,
        validUntil: validUntil.toISOString(),
        highPriority: estimate < HIGH_PRIORITY_THRESHOLD,
        reviewEligible: estimate < RETENTION_THRESHOLD,
      });
    }

    return { studentId, estimates, abstainedConceptIds };
  }

  /**
   * Staging/dev fixture for CLI R01/R03 without waiting calendar days.
   * Only creates RetentionEstimate + optional mastery row; does not invent attempts.
   */
  async upsertFixture(
    studentId: string,
    input: {
      conceptId: string;
      mastery: number;
      daysSinceSuccess: number;
      completedRevisionsLast14Days?: number;
      evidenceAttemptIds?: string[];
    },
  ): Promise<RetentionEstimateResult> {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });

    const estimate = this.computeEstimate({
      mastery: input.mastery,
      daysSinceSuccess: input.daysSinceSuccess,
      completedRevisionsLast14Days: input.completedRevisionsLast14Days ?? 0,
    });

    const validUntil = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.masteryScore.upsert({
      where: {
        studentId_conceptId: { studentId, conceptId: input.conceptId },
      },
      create: {
        studentId,
        conceptId: input.conceptId,
        value: input.mastery,
        confidence: 0.8,
        evidenceCount: 3,
        modelVersion: "mastery-formula-v2",
      },
      update: {
        value: input.mastery,
        evidenceCount: Math.max(3, 0),
      },
    });

    await this.prisma.retentionEstimate.updateMany({
      where: {
        studentId,
        conceptId: input.conceptId,
        modelVersion: RETENTION_RULES_V2,
        validUntil: { gt: new Date() },
      },
      data: { validUntil: new Date() },
    });

    const row = await this.prisma.retentionEstimate.create({
      data: {
        studentId,
        conceptId: input.conceptId,
        estimate,
        confidence: 0.85,
        daysSinceSuccess: input.daysSinceSuccess,
        evidenceAttemptIds: input.evidenceAttemptIds ?? ["fixture"],
        modelVersion: RETENTION_RULES_V2,
        validUntil,
      },
    });

    return {
      conceptId: row.conceptId,
      estimate: row.estimate,
      confidence: row.confidence,
      daysSinceSuccess: row.daysSinceSuccess,
      modelVersion: row.modelVersion,
      validUntil: row.validUntil.toISOString(),
      highPriority: row.estimate < HIGH_PRIORITY_THRESHOLD,
      reviewEligible: row.estimate < RETENTION_THRESHOLD,
    };
  }

  async getActiveEstimates(studentId: string): Promise<
    Array<{
      id: string;
      studentId: string;
      conceptId: string;
      estimate: number;
      confidence: number;
      daysSinceSuccess: number;
      evidenceAttemptIds: unknown;
      modelVersion: string;
      validUntil: Date;
      createdAt: Date;
    }>
  > {
    return this.prisma.retentionEstimate.findMany({
      where: {
        studentId,
        modelVersion: RETENTION_RULES_V2,
        validUntil: { gt: new Date() },
      },
      orderBy: { estimate: "asc" },
    });
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}
