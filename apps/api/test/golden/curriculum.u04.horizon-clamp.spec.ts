import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PlanningHorizonService } from "../../src/curriculum/planning-horizon.service";
import { CurriculumGraphService } from "../../src/curriculum/curriculum-graph.service";

/**
 * U04 — Horizon weeks clamp
 * When the planner requests a horizon beyond the 2-6 week range,
 * the planning service must clamp it to the valid range.
 */

const prisma = new PrismaClient();
let testStudentId: string;

describe("U04 — Horizon weeks clamp", () => {
  before(async () => {
    // Create a test student with Linear Equations unlocked
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u04",
        name: "Test Student U04",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u04-test-hash",
      },
    });
    testStudentId = student.id;

    // Set minimal mastery for Linear Equations to unlock it
    const linearConceptIds = ["P1_INTEGER_ADD_SUB", "C2_ONE_STEP_SUBTRACTION"];
    for (const conceptId of linearConceptIds) {
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId,
          value: 0.50,
          confidence: 0.70,
          evidenceCount: 4,
          modelVersion: "mastery-formula-v2",
        },
      });
    }
  });

  after(async () => {
    if (testStudentId) {
      await prisma.curriculumPlan.deleteMany({ where: { studentId: testStudentId } });
      await prisma.masteryScore.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("horizonWeeks must be clamped to 6 when requested 9 weeks", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 9,
    });

    assert.equal(plan.horizonWeeks, 6, "Horizon must be clamped to 6 weeks (max)");
    assert.equal(plan.weeks.length, 6, "Plan must have exactly 6 weekly entries");
    assert.equal(plan.rulesVersion, "planning-rules-v1", "Must use planning-rules-v1");
  });

  it("horizonWeeks must be clamped to 2 when requested 1 week", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 1,
    });

    assert.equal(plan.horizonWeeks, 2, "Horizon must be clamped to 2 weeks (min)");
    assert.equal(plan.weeks.length, 2, "Plan must have exactly 2 weekly entries");
  });

  it("horizonWeeks must accept valid 4-week request (no clamp)", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    assert.equal(plan.horizonWeeks, 4, "Horizon must remain 4 weeks (within range)");
    assert.equal(plan.weeks.length, 4, "Plan must have exactly 4 weekly entries");
  });
});
