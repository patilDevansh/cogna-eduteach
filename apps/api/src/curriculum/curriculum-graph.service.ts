import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * MVP 4.0 Phase 1 — Curriculum Graph Service
 * Evaluates unit unlocks using curriculum-rules-v1
 */

export interface UnitUnlockEvaluation {
  unitId: string;
  isUnlocked: boolean;
  reason: string;
  prerequisiteSummary?: Array<{
    prerequisiteUnitId: string;
    coreConcepts: number;
    masteredCoreConcepts: number;
    percentageMastered: number;
    thresholdMet: boolean;
  }>;
}

export interface UnlockedUnit {
  unitId: string;
  title: string;
  priorityWeight: number;
}

@Injectable()
export class CurriculumGraphService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate whether a unit is unlocked for a student
   * 
   * curriculum-rules-v1:
   * Unit U unlocks when for every prerequisite unit P:
   *   ≥ 70% of P.coreConcepts have mastery >= masteryThreshold
   *   AND minimumEvidence met per those concepts
   * ELSE if DIAGNOSTIC_PLACEMENT:
   *   placement baseline for U may unlock with low confidence plan
   */
  async evaluateUnitUnlock(
    studentId: string,
    unitId: string,
  ): Promise<UnitUnlockEvaluation> {
    const unit = await this.prisma.curriculumUnit.findUnique({
      where: { unitId },
      include: {
        unitConcepts: true,
      },
    });

    if (!unit) {
      return {
        unitId,
        isUnlocked: false,
        reason: "Unit not found",
      };
    }

    // DIAGNOSTIC_PLACEMENT always unlocks (e.g., linear-equations-one-variable)
    if (unit.unlockRule === "DIAGNOSTIC_PLACEMENT") {
      return {
        unitId,
        isUnlocked: true,
        reason: "DIAGNOSTIC_PLACEMENT rule always unlocks",
      };
    }

    // MANUAL requires explicit unlock (out of scope for Phase 1)
    if (unit.unlockRule === "MANUAL") {
      return {
        unitId,
        isUnlocked: false,
        reason: "MANUAL unlock not implemented",
      };
    }

    // ALL_PREREQ_UNITS_AT_THRESHOLD
    const prerequisiteUnitIds = unit.prerequisiteUnitIds as string[];
    if (prerequisiteUnitIds.length === 0) {
      return {
        unitId,
        isUnlocked: true,
        reason: "No prerequisites required",
      };
    }

    const prerequisiteSummary: UnitUnlockEvaluation["prerequisiteSummary"] = [];
    let allPrerequisitesMet = true;

    for (const prereqUnitId of prerequisiteUnitIds) {
      const prereqUnit = await this.prisma.curriculumUnit.findUnique({
        where: { unitId: prereqUnitId },
        include: {
          unitConcepts: true,
        },
      });

      if (!prereqUnit) {
        allPrerequisitesMet = false;
        prerequisiteSummary.push({
          prerequisiteUnitId: prereqUnitId,
          coreConcepts: 0,
          masteredCoreConcepts: 0,
          percentageMastered: 0,
          thresholdMet: false,
        });
        continue;
      }

      // Get all CORE and PREREQ concepts (both count toward unlock threshold per Content Spec)
      const coreConceptIds = prereqUnit.unitConcepts
        .filter((uc) => uc.kind === "CORE" || uc.kind === "PREREQ")
        .map((uc) => uc.conceptId);

      if (coreConceptIds.length === 0) {
        // Edge case: unit has no core concepts defined yet
        prerequisiteSummary.push({
          prerequisiteUnitId: prereqUnitId,
          coreConcepts: 0,
          masteredCoreConcepts: 0,
          percentageMastered: 0,
          thresholdMet: false,
        });
        allPrerequisitesMet = false;
        continue;
      }

      // Get concept masteryThreshold and minimumEvidence
      const concepts = await this.prisma.concept.findMany({
        where: { id: { in: coreConceptIds } },
      });

      const conceptThresholds = new Map(
        concepts.map((c) => [
          c.id,
          { masteryThreshold: c.masteryThreshold, minimumEvidence: c.minimumEvidence },
        ]),
      );

      // Get student's mastery scores for these concepts
      const masteryScores = await this.prisma.masteryScore.findMany({
        where: {
          studentId,
          conceptId: { in: coreConceptIds },
        },
      });

      const masteryMap = new Map(masteryScores.map((m) => [m.conceptId, m]));

      let masteredCount = 0;
      for (const conceptId of coreConceptIds) {
        const mastery = masteryMap.get(conceptId);
        const thresholds = conceptThresholds.get(conceptId);
        if (!thresholds) continue;

        if (
          mastery &&
          mastery.value >= thresholds.masteryThreshold &&
          mastery.evidenceCount >= thresholds.minimumEvidence
        ) {
          masteredCount++;
        }
      }

      const percentageMastered = (masteredCount / coreConceptIds.length) * 100;
      const thresholdMet = percentageMastered >= 70;

      prerequisiteSummary.push({
        prerequisiteUnitId: prereqUnitId,
        coreConcepts: coreConceptIds.length,
        masteredCoreConcepts: masteredCount,
        percentageMastered,
        thresholdMet,
      });

      if (!thresholdMet) {
        allPrerequisitesMet = false;
      }
    }

    return {
      unitId,
      isUnlocked: allPrerequisitesMet,
      reason: allPrerequisitesMet
        ? "All prerequisites met (≥70% core mastery)"
        : "Prerequisites not yet met",
      prerequisiteSummary,
    };
  }

  /**
   * Get all unlocked units for a student
   */
  async getUnlockedUnits(studentId: string): Promise<UnlockedUnit[]> {
    const allUnits = await this.prisma.curriculumUnit.findMany({
      orderBy: { priorityWeight: "desc" },
    });

    const unlocked: UnlockedUnit[] = [];
    for (const unit of allUnits) {
      const evaluation = await this.evaluateUnitUnlock(studentId, unit.unitId);
      if (evaluation.isUnlocked) {
        unlocked.push({
          unitId: unit.unitId,
          title: unit.title,
          priorityWeight: unit.priorityWeight,
        });
      }
    }

    return unlocked;
  }

  /**
   * Check if a unit unlock is blocked and identify bridge concepts
   * Returns concepts from prerequisite units that need bridge review
   */
  async getUnlockBlockerConcepts(
    studentId: string,
    unitId: string,
  ): Promise<string[]> {
    const evaluation = await this.evaluateUnitUnlock(studentId, unitId);
    if (evaluation.isUnlocked || !evaluation.prerequisiteSummary) {
      return [];
    }

    const blockerConcepts: string[] = [];

    for (const prereq of evaluation.prerequisiteSummary) {
      if (!prereq.thresholdMet) {
        // Get concepts from this prerequisite unit that are below threshold
        const prereqUnit = await this.prisma.curriculumUnit.findUnique({
          where: { unitId: prereq.prerequisiteUnitId },
          include: { unitConcepts: true },
        });

        if (!prereqUnit) continue;

        const coreConceptIds = prereqUnit.unitConcepts
          .filter((uc) => uc.kind === "CORE" || uc.kind === "PREREQ")
          .map((uc) => uc.conceptId);

        const concepts = await this.prisma.concept.findMany({
          where: { id: { in: coreConceptIds } },
        });

        const masteryScores = await this.prisma.masteryScore.findMany({
          where: {
            studentId,
            conceptId: { in: coreConceptIds },
          },
        });

        const masteryMap = new Map(masteryScores.map((m) => [m.conceptId, m]));

        for (const concept of concepts) {
          const mastery = masteryMap.get(concept.id);
          if (
            !mastery ||
            mastery.value < concept.masteryThreshold ||
            mastery.evidenceCount < concept.minimumEvidence
          ) {
            blockerConcepts.push(concept.id);
          }
        }
      }
    }

    return blockerConcepts;
  }
}
