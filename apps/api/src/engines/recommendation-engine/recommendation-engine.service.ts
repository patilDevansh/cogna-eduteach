import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { RevisionProposal } from "../../revision/revision.service";
import {
  MAX_CONCEPTS_PER_DAY,
  MAX_QUESTIONS_PER_DAY,
  MAX_TARGETED_MISCONCEPTION_QUESTIONS,
  computeRecommendationPriority,
  isHighPriorityRetention,
} from "../diagnostic-engine/diagnostic-formulas";
import { RECOMMENDATION_RULES_V2 } from "@cogna/shared";

const MASTERY_REINFORCEMENT_THRESHOLD = 0.4;
const MISCONCEPTION_TARGET_THRESHOLD = 0.6;
const PREREQ_GAP_THRESHOLD = 0.3;

export {
  computeRecommendationPriority,
  MAX_QUESTIONS_PER_DAY,
  MAX_CONCEPTS_PER_DAY,
  MAX_TARGETED_MISCONCEPTION_QUESTIONS,
};

@Injectable()
export class RecommendationEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async proposeOnSessionEnd(studentId: string): Promise<RevisionProposal[]> {
    const profile = await this.prisma.learnerProfile.findUnique({
      where: { studentId },
    });

    const proposals: RevisionProposal[] = [];
    const conceptsUsed = new Set<string>();
    let totalQuestions = 0;

    const addProposal = (proposal: RevisionProposal) => {
      if (
        conceptsUsed.size >= MAX_CONCEPTS_PER_DAY ||
        totalQuestions >= MAX_QUESTIONS_PER_DAY
      ) {
        return;
      }
      if (conceptsUsed.has(proposal.conceptId)) {
        return;
      }

      const remaining = MAX_QUESTIONS_PER_DAY - totalQuestions;
      const questionCount = Math.min(proposal.questionCount, remaining);
      if (questionCount <= 0) return;

      proposals.push({ ...proposal, questionCount });
      conceptsUsed.add(proposal.conceptId);
      totalQuestions += questionCount;
    };

    const misconceptions = await this.prisma.diagnosticFactor.findMany({
      where: {
        studentId,
        factorType: "MISCONCEPTION",
        confidence: { gt: MISCONCEPTION_TARGET_THRESHOLD },
      },
      orderBy: { confidence: "desc" },
      take: MAX_CONCEPTS_PER_DAY,
    });

    for (const factor of misconceptions) {
      if (!factor.conceptId || !factor.factorKey) continue;
      const masteryRow = await this.getMasteryRow(studentId, factor.conceptId);
      const weakness =
        masteryRow && masteryRow.evidenceCount >= 3
          ? 1 - masteryRow.value
          : 0;
      addProposal({
        conceptId: factor.conceptId,
        type: "TARGETED_MISCONCEPTION",
        targetMisconception: factor.factorKey,
        priority: computeRecommendationPriority({
          weakness,
          misconceptionSeverity: factor.confidence,
          retentionRisk: 0,
          prereqImportance: 0,
          parentGoalBoost: 0,
        }),
        dueAt: new Date(),
        questionCount: Math.min(3, MAX_TARGETED_MISCONCEPTION_QUESTIONS),
        reasoning: `Misconception ${factor.factorKey} confidence ${factor.confidence.toFixed(2)} exceeds ${MISCONCEPTION_TARGET_THRESHOLD}.`,
        confidence: factor.confidence,
      });
    }

    // Retention-based proposals (retention-rules-v2) — prefer RetentionEstimate rows,
    // fall back to diagnostic RETENTION factors for older paths.
    const retentionEstimates = await this.prisma.retentionEstimate.findMany({
      where: {
        studentId,
        validUntil: { gt: new Date() },
        estimate: { lt: 0.55 },
      },
      orderBy: { estimate: "asc" },
      take: 20,
    });

    const seenRetentionConcepts = new Set<string>();
    for (const row of retentionEstimates) {
      if (seenRetentionConcepts.has(row.conceptId)) continue;
      seenRetentionConcepts.add(row.conceptId);
      const estimate = row.estimate;
      const retentionRisk = 1 - estimate;
      const priorityBoost = isHighPriorityRetention(estimate) ? 0.05 : 0;

      addProposal({
        conceptId: row.conceptId,
        type: "RETENTION_REVIEW",
        priority:
          computeRecommendationPriority({
            weakness: 0,
            misconceptionSeverity: 0,
            retentionRisk,
            prereqImportance: 0,
            parentGoalBoost: 0,
          }) + priorityBoost,
        dueAt: new Date(),
        questionCount: 2,
        reasoning: `retentionEstimate=${estimate.toFixed(2)} (<0.55); retention review due.`,
        confidence: row.confidence,
        recommendationVersion: RECOMMENDATION_RULES_V2,
      });
    }

    const retentionFactors = await this.prisma.diagnosticFactor.findMany({
      where: { studentId, factorType: "RETENTION" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const factor of retentionFactors) {
      if (!factor.conceptId || seenRetentionConcepts.has(factor.conceptId)) continue;
      seenRetentionConcepts.add(factor.conceptId);
      const estimate =
        typeof factor.value === "number"
          ? factor.value
          : Number((factor.value as { estimate?: number })?.estimate ?? NaN);
      if (!Number.isFinite(estimate) || estimate >= 0.55) continue;

      const retentionRisk = 1 - estimate;
      const priorityBoost = isHighPriorityRetention(estimate) ? 0.05 : 0;

      addProposal({
        conceptId: factor.conceptId,
        type: "RETENTION_REVIEW",
        priority:
          computeRecommendationPriority({
            weakness: 0,
            misconceptionSeverity: 0,
            retentionRisk,
            prereqImportance: 0,
            parentGoalBoost: 0,
          }) + priorityBoost,
        dueAt: new Date(),
        questionCount: 2,
        reasoning: `retentionEstimate=${estimate.toFixed(2)} (<0.55); retention review due.`,
        confidence: factor.confidence,
        recommendationVersion: RECOMMENDATION_RULES_V2,
      });
    }

    const lowMastery = await this.prisma.masteryScore.findMany({
      where: { studentId, value: { lt: MASTERY_REINFORCEMENT_THRESHOLD } },
      orderBy: { value: "asc" },
      take: MAX_CONCEPTS_PER_DAY,
    });

    for (const score of lowMastery) {
      const weakness =
        score.evidenceCount >= 3 ? 1 - score.value : 0;
      addProposal({
        conceptId: score.conceptId,
        type: "REINFORCEMENT",
        priority: computeRecommendationPriority({
          weakness,
          misconceptionSeverity: 0,
          retentionRisk: 0,
          prereqImportance: 0.1,
          parentGoalBoost: 0,
        }),
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        questionCount: 3,
        reasoning: `Mastery ${score.value.toFixed(2)} below ${MASTERY_REINFORCEMENT_THRESHOLD}.`,
        confidence: 0.75,
      });
    }

    const signals = (profile?.revisionNeedSignals as Array<Record<string, unknown>>) ?? [];
    for (const signal of signals) {
      const conceptId = String(signal.conceptId ?? "");
      if (!conceptId) continue;

      if (signal.type === "SPACED_REVIEW" || signal.type === "LOW_RETENTION") {
        const retentionRisk =
          signal.type === "LOW_RETENTION"
            ? 1 - Number(signal.retentionEstimate ?? 0.5)
            : 0.58;
        addProposal({
          conceptId,
          type: signal.type === "LOW_RETENTION" ? "RETENTION_REVIEW" : "SPACED_REVIEW",
          priority: computeRecommendationPriority({
            weakness: 0.4,
            misconceptionSeverity: 0,
            retentionRisk,
            prereqImportance: 0,
            parentGoalBoost: 0,
          }),
          dueAt: new Date(),
          questionCount: 2,
          reasoning:
            signal.type === "LOW_RETENTION"
              ? `Retention estimate ${signal.retentionEstimate} below threshold.`
              : `Spaced review after ${signal.daysSincePractice ?? 5}+ days.`,
          confidence: 0.7,
        });
      }

      if (signal.type === "LOW_MASTERY") {
        addProposal({
          conceptId,
          type: "REINFORCEMENT",
          priority: computeRecommendationPriority({
            weakness: 1 - Number(signal.mastery ?? 0.4),
            misconceptionSeverity: 0,
            retentionRisk: 0.1,
            prereqImportance: 0.1,
            parentGoalBoost: 0,
          }),
          dueAt: new Date(),
          questionCount: 3,
          reasoning: "Diagnostic revision signal: low mastery with sufficient evidence.",
          confidence: 0.72,
        });
      }
    }

    const masteryRows = await this.prisma.masteryScore.findMany({ where: { studentId } });
    for (const score of masteryRows) {
      const prereqs = await this.prisma.conceptPrerequisite.findMany({
        where: { conceptId: score.conceptId },
      });

      for (const prereq of prereqs) {
        const prereqMastery = await this.getMastery(studentId, prereq.prerequisiteId);
        if (prereqMastery >= PREREQ_GAP_THRESHOLD) continue;

        addProposal({
          conceptId: prereq.prerequisiteId,
          type: "PREREQ_REVIEW",
          priority: computeRecommendationPriority({
            weakness: 1 - prereqMastery,
            misconceptionSeverity: 0,
            retentionRisk: 0.1,
            prereqImportance: 0.9,
            parentGoalBoost: 0,
          }),
          dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          questionCount: 2,
          reasoning: `Prerequisite gap for ${score.conceptId}: ${prereq.prerequisiteId} mastery ${prereqMastery.toFixed(2)}.`,
          confidence: 0.68,
        });
      }
    }

    void RECOMMENDATION_RULES_V2;

    return proposals
      .map((p) => ({
        ...p,
        recommendationVersion: p.recommendationVersion ?? RECOMMENDATION_RULES_V2,
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_CONCEPTS_PER_DAY);
  }

  /** Alias used by jobs / students API (recommendation-rules-v2 daily planner). */
  async buildDailyProposals(studentId: string): Promise<RevisionProposal[]> {
    return this.proposeOnSessionEnd(studentId);
  }

  /**
   * Weekly plan shape for parent reports / revision plan UI.
   * Spec: 2 retention concepts, 1 active misconception path, 1 transfer check when eligible.
   */
  async buildWeeklyPlan(studentId: string): Promise<{
    retentionConceptIds: string[];
    misconceptionPaths: string[];
    transferCheckConceptIds: string[];
  }> {
    const now = new Date();
    const retentionRows = await this.prisma.retentionEstimate.findMany({
      where: {
        studentId,
        validUntil: { gt: now },
        estimate: { lt: 0.55 },
      },
      orderBy: { estimate: "asc" },
      take: 2,
    });

    const remediations = await this.prisma.misconceptionRemediationState.findMany({
      where: {
        studentId,
        state: {
          in: ["TARGETING", "EXPLANATION_REQUIRED", "RETESTING", "STILL_ACTIVE"],
        },
      },
      take: 3,
    });

    const masteryRows = await this.prisma.masteryScore.findMany({
      where: { studentId },
      orderBy: { value: "desc" },
      take: 10,
    });

    const transferCheckConceptIds: string[] = [];
    for (const score of masteryRows) {
      const concept = await this.prisma.concept.findUnique({
        where: { id: score.conceptId },
      });
      if (!concept) continue;
      if (
        score.value >= concept.masteryThreshold &&
        score.evidenceCount >= concept.minimumEvidence
      ) {
        const hasItem =
          (await this.prisma.question.count({
            where: {
              conceptId: score.conceptId,
              questionIntent: "TRANSFER_CHECK",
              reviewStatus: "APPROVED",
            },
          })) > 0;
        if (hasItem) {
          transferCheckConceptIds.push(score.conceptId);
          break;
        }
      }
    }

    return {
      retentionConceptIds: retentionRows.map((r) => r.conceptId),
      misconceptionPaths: [
        ...new Set(remediations.map((r) => r.conceptId)),
      ].slice(0, 1),
      transferCheckConceptIds,
    };
  }

  /**
   * Pure helper for planners: apply daily caps to an already-scored proposal list.
   * Used by golden R09 without DB.
   */
  applyDailyCaps(
    proposals: Array<{ conceptId: string; questionCount: number }>,
  ): { totalQuestions: number; conceptCount: number; capped: typeof proposals } {
    const capped: typeof proposals = [];
    const concepts = new Set<string>();
    let totalQuestions = 0;

    for (const p of proposals) {
      if (concepts.size >= MAX_CONCEPTS_PER_DAY && !concepts.has(p.conceptId)) {
        continue;
      }
      const remaining = MAX_QUESTIONS_PER_DAY - totalQuestions;
      if (remaining <= 0) break;
      const questionCount = Math.min(p.questionCount, remaining);
      if (questionCount <= 0) continue;
      capped.push({ ...p, questionCount });
      concepts.add(p.conceptId);
      totalQuestions += questionCount;
    }

    return {
      totalQuestions,
      conceptCount: concepts.size,
      capped,
    };
  }

  private async getMastery(studentId: string, conceptId: string): Promise<number> {
    const row = await this.getMasteryRow(studentId, conceptId);
    return row?.value ?? 0.5;
  }

  private async getMasteryRow(studentId: string, conceptId: string) {
    return this.prisma.masteryScore.findUnique({
      where: { studentId_conceptId: { studentId, conceptId } },
    });
  }
}
