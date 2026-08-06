import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PlanningHorizonService } from "../../src/curriculum/planning-horizon.service";
import { CurriculumGraphService } from "../../src/curriculum/curriculum-graph.service";

/**
 * U05 — maxNewConcepts per week
 * Planning-rules-v1 enforces a maximum of 2 new concepts per week by default.
 * Each weekly plan entry must respect this limit.
 */

const prisma = new PrismaClient();
let testStudentId: string;

describe("U05 — maxNewConcepts per week", () => {
  before(async () => {
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u05",
        name: "Test Student U05",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u05-test-hash",
      },
    });
    testStudentId = student.id;

    // No mastery scores — all concepts are new learning
  });

  after(async () => {
    if (testStudentId) {
      await prisma.curriculumPlan.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("each week must have ≤ 2 new focus concepts", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    assert.equal(plan.horizonWeeks, 4, "Plan must have 4 weeks");

    for (const week of plan.weeks) {
      assert.ok(
        week.focusConceptIds.length <= 2,
        `Week ${week.weekIndex} must have ≤ 2 focus concepts (got ${week.focusConceptIds.length})`,
      );
      assert.equal(
        week.maxNewConcepts,
        2,
        `Week ${week.weekIndex} must set maxNewConcepts=2`,
      );
    }
  });

  it("plan must cover multiple concepts across weeks", async () => {
    const curriculumGraph = new CurriculumGraphService(prisma);
    const planningService = new PlanningHorizonService(prisma, curriculumGraph);

    const plan = await planningService.generatePlan({
      studentId: testStudentId,
      requestedWeeks: 4,
    });

    // Collect all focus concepts across all weeks
    const allFocusConcepts = plan.weeks.flatMap((w) => w.focusConceptIds);
    assert.ok(
      allFocusConcepts.length >= 4,
      `Plan must cover at least 4 concepts across 4 weeks (got ${allFocusConcepts.length})`,
    );

    // Verify no duplicate focus concepts (each concept introduced once)
    const uniqueConcepts = new Set(allFocusConcepts);
    assert.equal(
      uniqueConcepts.size,
      allFocusConcepts.length,
      "Focus concepts must not be duplicated across weeks",
    );
  });
});
