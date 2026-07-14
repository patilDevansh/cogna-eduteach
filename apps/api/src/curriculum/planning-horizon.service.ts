import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CurriculumGraphService } from "./curriculum-graph.service";
import { PLANNING_RULES_V1, type CurriculumPlan } from "@cogna/shared";

/**
 * MVP 4.0 Phase 2 — Planning Horizon Service
 * Generates multi-week curriculum plans using planning-rules-v1
 */

export interface LearningNeedCalculation {
  unitId: string;
  learningNeed: number;
  breakdown: {
    masteryComponent: number;
    retentionComponent: number;
    misconceptionComponent: number;
    priorityComponent: number;
  };
  focusConcepts: string[];
}

export interface PlanningContext {
  studentId: string;
  requestedWeeks?: number; // Default: 4
  currentWeek?: Date; // Default: now
}

@Injectable()
export class PlanningHorizonService {
  private readonly logger = new Logger(PlanningHorizonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly curriculumGraph: CurriculumGraphService,
  ) {}

  /**
   * Generate a curriculum plan for a student
   * 
   * planning-rules-v1:
   * - horizonWeeks = clamp(recommended, 2, 6)
   * - primaryUnit = unlocked unit with highest learningNeed
   * - learningNeed = weighted sum of mastery gap, retention risk, misconceptions, priority
   * - maxNewConcepts per week = 2 (default)
   * - Must include ≥ 1 bridgeConcept from prior unit if prior unit retentionRisk high
   */
  async generatePlan(context: PlanningContext): Promise<CurriculumPlan> {
    const { studentId, requestedWeeks = 4 } = context;

    // 1. Clamp horizon to 2-6 weeks
    const horizonWeeks = Math.max(2, Math.min(6, requestedWeeks));

    // 2. Get all unlocked units for student
    const unlockedUnits = await this.curriculumGraph.getUnlockedUnits(studentId);

    if (unlockedUnits.length === 0) {
      throw new Error("No unlocked units available for planning");
    }

    // 3. Calculate learningNeed for each unlocked unit
    const learningNeeds: LearningNeedCalculation[] = [];
    for (const unit of unlockedUnits) {
      const calculation = await this.calculateLearningNeed(studentId, unit.unitId);
      learningNeeds.push(calculation);
    }

    // 4. Sort by learningNeed (highest first)
    learningNeeds.sort((a, b) => b.learningNeed - a.learningNeed);

    // 5. Select primary unit (highest learningNeed)
    const primaryUnitId = learningNeeds[0].unitId;

    // 6. Build week-by-week plan
    const weeks: CurriculumPlan["weeks"] = [];
    const primaryUnit = await this.prisma.curriculumUnit.findUniqueOrThrow({
      where: { unitId: primaryUnitId },
      include: { unitConcepts: true },
    });

    // Get focus concepts for primary unit (CORE concepts only for new learning)
    const coreConcepts = primaryUnit.unitConcepts
      .filter((uc) => uc.kind === "CORE")
      .map((uc) => uc.conceptId);

    // Get student's mastery for these concepts to prioritize unmastered ones
    const masteryScores = await this.prisma.masteryScore.findMany({
      where: { studentId, conceptId: { in: coreConcepts } },
    });
    const masteryMap = new Map(masteryScores.map((m) => [m.conceptId, m.value]));

    // Sort concepts by mastery (lowest first = highest need)
    const sortedConcepts = coreConcepts.sort((a, b) => {
      const masteryA = masteryMap.get(a) ?? 0;
      const masteryB = masteryMap.get(b) ?? 0;
      return masteryA - masteryB;
    });

    // 7. Check for bridge concepts from prerequisite units
    const bridgeConcepts = await this.identifyBridgeConcepts(
      studentId,
      primaryUnitId,
    );

    // 8. Build weekly plan (max 2 new concepts per week)
    const maxNewConceptsPerWeek = 2;
    let conceptIndex = 0;

    for (let weekIndex = 0; weekIndex < horizonWeeks; weekIndex++) {
      const focusConceptIds: string[] = [];
      const weekBridgeConcepts: string[] = [];

      // Add new concepts (up to maxNewConcepts)
      for (let i = 0; i < maxNewConceptsPerWeek && conceptIndex < sortedConcepts.length; i++) {
        focusConceptIds.push(sortedConcepts[conceptIndex]);
        conceptIndex++;
      }

      // Add bridge concepts if needed (week 0 and week 2 per U16 example)
      if (weekIndex === 0 && bridgeConcepts.length > 0) {
        weekBridgeConcepts.push(bridgeConcepts[0]);
      } else if (weekIndex === 2 && bridgeConcepts.length > 1) {
        weekBridgeConcepts.push(bridgeConcepts[1]);
      }

      weeks.push({
        weekIndex,
        primaryUnitId,
        focusConceptIds,
        bridgeConceptIds: weekBridgeConcepts,
        maxNewConcepts: maxNewConceptsPerWeek,
      });
    }

    // 9. Create plan record
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + horizonWeeks * 7);

    const plan = await this.prisma.curriculumPlan.create({
      data: {
        studentId,
        horizonWeeks,
        planJson: weeks,
        rulesVersion: PLANNING_RULES_V1,
        validUntil,
      },
    });

    return {
      id: plan.id,
      studentId: plan.studentId,
      horizonWeeks: plan.horizonWeeks,
      weeks: plan.planJson as CurriculumPlan["weeks"],
      rulesVersion: plan.rulesVersion,
      createdAt: plan.createdAt.toISOString(),
      validUntil: plan.validUntil.toISOString(),
    };
  }

  /**
   * Calculate learningNeed for a unit using planning-rules-v1 formula:
   * 
   * learningNeed =
   *   0.4 × (1 - meanMastery(focusConcepts))
   * + 0.3 × meanRetentionRisk(focusConcepts)
   * + 0.2 × misconceptionBurden
   * + 0.1 × curriculumPriorityWeight(unit)
   */
  async calculateLearningNeed(
    studentId: string,
    unitId: string,
  ): Promise<LearningNeedCalculation> {
    const unit = await this.prisma.curriculumUnit.findUniqueOrThrow({
      where: { unitId },
      include: { unitConcepts: true },
    });

    // Focus concepts are CORE concepts (new learning target)
    const focusConceptIds = unit.unitConcepts
      .filter((uc) => uc.kind === "CORE")
      .map((uc) => uc.conceptId);

    if (focusConceptIds.length === 0) {
      return {
        unitId,
        learningNeed: 0,
        breakdown: {
          masteryComponent: 0,
          retentionComponent: 0,
          misconceptionComponent: 0,
          priorityComponent: 0,
        },
        focusConcepts: [],
      };
    }

    // 1. Mean mastery of focus concepts
    const masteryScores = await this.prisma.masteryScore.findMany({
      where: { studentId, conceptId: { in: focusConceptIds } },
    });
    const masteryMap = new Map(masteryScores.map((m) => [m.conceptId, m.value]));
    const meanMastery =
      focusConceptIds.reduce((sum, cid) => sum + (masteryMap.get(cid) ?? 0), 0) /
      focusConceptIds.length;

    // 2. Mean retention risk of focus concepts
    const retentionEstimates = await this.prisma.retentionEstimate.findMany({
      where: { studentId, conceptId: { in: focusConceptIds } },
    });
    const retentionMap = new Map(retentionEstimates.map((r) => [r.conceptId, r.estimate]));
    const meanRetentionRisk =
      focusConceptIds.reduce((sum, cid) => {
        const estimate = retentionMap.get(cid) ?? 1.0;
        return sum + (1 - estimate);
      }, 0) / focusConceptIds.length;

    // 3. Misconception burden (active misconceptions in this unit)
    const activeMisconceptions = await this.prisma.misconceptionRemediationState.findMany({
      where: {
        studentId,
        conceptId: { in: focusConceptIds },
        state: { in: ["UNCONFIRMED", "TARGETING", "EXPLANATION_REQUIRED", "RETESTING", "STILL_ACTIVE"] },
      },
    });
    const diagnosticFactors =
      activeMisconceptions.length > 0
        ? await this.prisma.diagnosticFactor.findMany({
            where: {
              studentId,
              factorType: "MISCONCEPTION",
              OR: activeMisconceptions.map((m) => ({
                conceptId: m.conceptId,
                factorKey: m.misconceptionId,
              })),
            },
          })
        : [];
    const confidenceByMisconception = new Map(
      diagnosticFactors.map((f) => [
        `${f.conceptId}:${f.factorKey}`,
        f.confidence,
      ]),
    );
    const totalConfidence = activeMisconceptions.reduce(
      (sum, m) =>
        sum +
        (confidenceByMisconception.get(`${m.conceptId}:${m.misconceptionId}`) ??
          0),
      0,
    );
    const misconceptionBurden = Math.min(1.0, totalConfidence / focusConceptIds.length);

    // 4. Curriculum priority weight from unit (already in DB)
    const curriculumPriorityWeight = unit.priorityWeight;

    // Calculate components
    const masteryComponent = 0.4 * (1 - meanMastery);
    const retentionComponent = 0.3 * meanRetentionRisk;
    const misconceptionComponent = 0.2 * misconceptionBurden;
    const priorityComponent = 0.1 * curriculumPriorityWeight;

    const learningNeed =
      masteryComponent +
      retentionComponent +
      misconceptionComponent +
      priorityComponent;

    return {
      unitId,
      learningNeed,
      breakdown: {
        masteryComponent,
        retentionComponent,
        misconceptionComponent,
        priorityComponent,
      },
      focusConcepts: focusConceptIds,
    };
  }

  /**
   * Identify bridge concepts from prerequisite units that need retention review
   * Returns concepts with retention risk (estimate < 0.7)
   */
  async identifyBridgeConcepts(
    studentId: string,
    targetUnitId: string,
  ): Promise<string[]> {
    const unit = await this.prisma.curriculumUnit.findUniqueOrThrow({
      where: { unitId: targetUnitId },
    });

    const prerequisiteUnitIds = unit.prerequisiteUnitIds as string[];
    if (prerequisiteUnitIds.length === 0) {
      return [];
    }

    const bridgeConcepts: string[] = [];

    for (const prereqUnitId of prerequisiteUnitIds) {
      const prereqUnit = await this.prisma.curriculumUnit.findUnique({
        where: { unitId: prereqUnitId },
        include: { unitConcepts: true },
      });

      if (!prereqUnit) continue;

      // Get core concepts from prerequisite unit
      const coreConceptIds = prereqUnit.unitConcepts
        .filter((uc) => uc.kind === "CORE" || uc.kind === "PREREQ")
        .map((uc) => uc.conceptId);

      // Check retention estimates
      const retentionEstimates = await this.prisma.retentionEstimate.findMany({
        where: {
          studentId,
          conceptId: { in: coreConceptIds },
          estimate: { lt: 0.7 }, // High retention risk threshold
        },
      });

      // Add concepts with retention risk as bridge candidates
      bridgeConcepts.push(...retentionEstimates.map((r) => r.conceptId));
    }

    // Sort by retention estimate (lowest first = highest risk)
    const retentionEstimates = await this.prisma.retentionEstimate.findMany({
      where: {
        studentId,
        conceptId: { in: bridgeConcepts },
      },
    });
    const retentionMap = new Map(retentionEstimates.map((r) => [r.conceptId, r.estimate]));

    return bridgeConcepts.sort((a, b) => {
      const estA = retentionMap.get(a) ?? 1.0;
      const estB = retentionMap.get(b) ?? 1.0;
      return estA - estB; // Lowest estimate first
    });
  }

  /**
   * Get active curriculum plan for a student
   * Returns null if no valid plan exists
   */
  async getActivePlan(studentId: string): Promise<CurriculumPlan | null> {
    const plan = await this.prisma.curriculumPlan.findFirst({
      where: {
        studentId,
        validUntil: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!plan) return null;

    return {
      id: plan.id,
      studentId: plan.studentId,
      horizonWeeks: plan.horizonWeeks,
      weeks: plan.planJson as CurriculumPlan["weeks"],
      rulesVersion: plan.rulesVersion,
      createdAt: plan.createdAt.toISOString(),
      validUntil: plan.validUntil.toISOString(),
    };
  }

  /**
   * Refresh plan if expired or invalid
   * Returns existing plan if still valid
   */
  async refreshPlanIfNeeded(studentId: string): Promise<CurriculumPlan> {
    const existing = await this.getActivePlan(studentId);
    if (existing) {
      return existing;
    }

    this.logger.log(`Generating new curriculum plan for student ${studentId}`);
    return this.generatePlan({ studentId });
  }
}
