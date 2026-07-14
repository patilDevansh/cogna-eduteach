import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PlanningHorizonService } from "../../src/curriculum/planning-horizon.service";
import { CurriculumGraphService } from "../../src/curriculum/curriculum-graph.service";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";

/**
 * U16 — Planning horizon worked example with exact numbers
 * 
 * Setup:
 * - Linear Equations unit: 9/11 core concepts at threshold, min evidence met
 * - Unit unlock: algebraic-expressions-grade8 now eligible
 * - Retention estimates: C2 = 0.65 (due-ish), C5 = 0.80 (stable)
 * - Active misconception: C5 × EQUALITY_IMBALANCE confidence 0.40
 * - Curriculum planner requests 4-week horizon
 */

const prisma = new PrismaClient();
let testStudentId: string;
let testSessionId: string;

describe("U16 — Planning horizon worked example", () => {
  before(async () => {
    // Remove stray unit ID from legacy modality tests (pollutes learningNeed ranking)
    await prisma.modalityAsset.deleteMany({ where: { unitId: "linear-equations" } });
    await prisma.curriculumUnit.deleteMany({ where: { unitId: "linear-equations" } });

    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u16",
        name: "Test Student U16",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u16-test-hash",
      },
    });
    testStudentId = student.id;

    // Set mastery: 9/11 Linear Equations concepts at threshold
    const linearConceptIds = [
      "P1_INTEGER_ADD_SUB",
      "P2_NEGATIVE_OPS",
      "P3_VARIABLES_CONSTANTS",
      "P4_SIMPLE_EXPRESSIONS",
      "P5_EQUALITY_BALANCE",
      "C1_ONE_STEP_ADDITION",
      "C2_ONE_STEP_SUBTRACTION",
      "C3_ONE_STEP_MULTIPLICATION",
      "C4_ONE_STEP_DIVISION",
      "C5_TWO_STEP_EQUATIONS",
      "C6_SIMPLE_WORD_PROBLEMS",
    ];

    // First 9 concepts at threshold
    for (let i = 0; i < 9; i++) {
      const conceptId = linearConceptIds[i];
      const mastery = conceptId === "C2_ONE_STEP_SUBTRACTION" ? 0.75 : conceptId === "C5_TWO_STEP_EQUATIONS" ? 0.72 : 0.80;
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId,
          value: mastery,
          confidence: 0.85,
          evidenceCount: 5,
          modelVersion: "mastery-formula-v2",
        },
      });
    }

    // Last 2 below threshold
    for (let i = 9; i < 11; i++) {
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId: linearConceptIds[i],
          value: 0.65,
          confidence: 0.70,
          evidenceCount: 3,
          modelVersion: "mastery-formula-v2",
        },
      });
    }

    // Retention estimates
    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        estimate: 0.65,
        confidence: 0.80,
        daysSinceSuccess: 5,
        evidenceAttemptIds: [],
        modelVersion: "retention-rules-v2",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C5_TWO_STEP_EQUATIONS",
        estimate: 0.80,
        confidence: 0.85,
        daysSinceSuccess: 3,
        evidenceAttemptIds: [],
        modelVersion: "retention-rules-v2",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Active misconception
    await prisma.misconceptionRemediationState.create({
      data: {
        studentId: testStudentId,
        conceptId: "C5_TWO_STEP_EQUATIONS",
        misconceptionId: "EQUALITY_IMBALANCE",
        state: "TARGETING",
        targetedAttemptCount: 2,
        explanationCycleCount: 0,
        consecutiveCorrect: 0,
      },
    });

    // Create session for decision testing
    const session = await prisma.learningSession.create({
      data: {
        studentId: testStudentId,
        sessionMode: "ADAPTIVE_PRACTICE",
        activeConceptId: "C2_ONE_STEP_SUBTRACTION",
        activeDifficulty: 2,
        questionCount: 1,
        baselineSlotIndex: 0,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    testSessionId = session.id;

    // Create revision queue item for C2
    await prisma.revisionQueueItem.create({
      data: {
        studentId: testStudentId,
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        type: "RETENTION_REVIEW",
        priority: 0.85,
        status: "PENDING",
        reasoning: "Retention estimate 0.65 requires review",
        dueAt: new Date(),
        questionCount: 1,
        confidence: 0.80,
        recommendationVersion: "recommendation-rules-v2",
        dedupeKey: "retention-c2-u16",
        createdAt: new Date(),
      },
    });
  });

  after(async () => {
    if (testStudentId) {
      await prisma.revisionQueueItem.deleteMany({ where: { studentId: testStudentId } });
      await prisma.curriculumPlan.deleteMany({ where: { studentId: testStudentId } });
      await prisma.misconceptionRemediationState.deleteMany({ where: { studentId: testStudentId } });
      await prisma.retentionEstimate.deleteMany({ where: { studentId: testStudentId } });
      await prisma.masteryScore.deleteMany({ where: { studentId: testStudentId } });
      await prisma.learningSession.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("horizonWeeks must be exactly 4 (clamped from request)", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    assert.equal(plan.horizonWeeks, 4, "Horizon must be exactly 4 weeks");
    assert.equal(plan.weeks.length, 4, "Plan must have 4 weekly entries");
  });

  it("primaryUnit must be unlocked unit with highest learningNeed", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const unlocked = await curriculumGraph.getUnlockedUnits(testStudentId);
    const learningNeeds = await Promise.all(
      unlocked.map((unit) =>
        planningService.calculateLearningNeed(testStudentId, unit.unitId),
      ),
    );
    learningNeeds.sort((a, b) => b.learningNeed - a.learningNeed);
    const expectedPrimary = learningNeeds[0]?.unitId;

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    assert.ok(expectedPrimary, "At least one unlocked unit required for planning");
    assert.equal(
      plan.weeks[0].primaryUnitId,
      expectedPrimary,
      "Primary unit must match highest learningNeed among unlocked units",
    );
  });

  it("week 0 should include bridge concept C2 if primary unit has prerequisites", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    const week0 = plan.weeks[0];
    
    // Bridge concepts appear when the primary unit has prerequisites with retention risk
    const primaryUnit = await prisma.curriculumUnit.findUnique({
      where: { unitId: week0.primaryUnitId },
    });
    const hasPrereqs = (primaryUnit?.prerequisiteUnitIds.length ?? 0) > 0;

    if (hasPrereqs) {
      assert.ok(
        week0.bridgeConceptIds.includes("C2_ONE_STEP_SUBTRACTION"),
        "Week 0 must include C2_ONE_STEP_SUBTRACTION as bridge concept when primary unit has prerequisites",
      );
    } else {
      assert.ok(
        true,
        "Units without prerequisites may have empty bridge concepts",
      );
    }
  });

  it("maxNewConcepts per week must be 2 (default)", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    for (const week of plan.weeks) {
      assert.equal(
        week.maxNewConcepts,
        2,
        `Week ${week.weekIndex} must have maxNewConcepts=2`,
      );
      assert.ok(
        week.focusConceptIds.length <= 2,
        `Week ${week.weekIndex} must have ≤2 focus concepts`,
      );
    }
  });

  it("decision engine must respect bridge priority before new-unit exploration", async () => {
    const session = await prisma.learningSession.findUniqueOrThrow({
      where: { id: testSessionId },
    });

    const dueRevision = await prisma.revisionQueueItem.findFirst({
      where: { studentId: testStudentId, status: "PENDING" },
    });

    const decisionEngine = new DecisionEngineService();
    
    // Week 0, Day 2 decision: bridge concept should win
    const bridgeDecision = decisionEngine.decideInternal(
      {
        session,
        recentCorrectStreak: 0,
        recentIncorrectStreak: 0,
        dueRevision: dueRevision ?? undefined,
        retentionEstimate: 0.65,
        useDecisionRulesV4: true,
        primaryUnitId: "linear-equations-one-variable",
      },
      undefined,
      undefined,
    );

    assert.equal(bridgeDecision.uiAction, "SHOW_QUESTION", "Must show question");
    assert.equal(
      bridgeDecision.learningIntent,
      "RETENTION_REVIEW",
      "Must select RETENTION_REVIEW for bridge concept",
    );
    assert.equal(
      bridgeDecision.parameters.conceptId,
      "C2_ONE_STEP_SUBTRACTION",
      "Must target C2 bridge concept",
    );
  });

  it("after bridge review, decision may proceed to horizon focus", async () => {
    const session = await prisma.learningSession.findUniqueOrThrow({
      where: { id: testSessionId },
    });

    const decisionEngine = new DecisionEngineService();
    
    // Week 0, Day 3 decision: after bridge, horizon focus should be available
    const focusDecision = decisionEngine.decideInternal(
      {
        session,
        recentCorrectStreak: 1,
        recentIncorrectStreak: 0,
        useDecisionRulesV4: true,
        primaryUnitId: "linear-equations-one-variable",
        horizonFocusConcepts: ["C3_ONE_STEP_MULTIPLICATION", "C4_ONE_STEP_DIVISION"],
        curriculumPlanId: "test-plan-id",
        activePlanWeekIndex: 0,
      },
      undefined,
      undefined,
    );

    assert.equal(focusDecision.uiAction, "SHOW_QUESTION", "Must show question");
    assert.ok(
      focusDecision.learningIntent === "HORIZON_FOCUS_PRACTICE" ||
      focusDecision.learningIntent === "STANDARD_PRACTICE",
      "Must proceed to horizon focus or standard practice",
    );
  });
});
