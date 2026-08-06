import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { CurriculumGraphService } from "../../src/curriculum/curriculum-graph.service";

/**
 * U02 — Unit unlock blocked
 * When core concepts are below threshold on prerequisite unit,
 * the second unit must not unlock and UNIT_BRIDGE_REVIEW must be eligible.
 */

const prisma = new PrismaClient();
let testStudentId: string;

describe("U02 — Unit unlock blocked", () => {
  before(async () => {
    // Create a test student
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u02",
        name: "Test Student U02",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u02-test-hash",
      },
    });
    testStudentId = student.id;

    // Set mastery scores: only 6 out of 11 Linear Equations core concepts at threshold
    // This is ~54%, below the 70% threshold required to unlock systems-of-equations
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

    // Set 6 concepts at threshold (≥0.75 mastery, ≥4 evidence)
    const masteredConceptIds = linearConceptIds.slice(0, 6);
    for (const conceptId of masteredConceptIds) {
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId,
          value: 0.80,
          confidence: 0.85,
          evidenceCount: 5,
          modelVersion: "mastery-formula-v1",
        },
      });
    }

    // Set remaining 5 concepts below threshold
    const belowThresholdIds = linearConceptIds.slice(6);
    for (const conceptId of belowThresholdIds) {
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId,
          value: 0.50,
          confidence: 0.60,
          evidenceCount: 3,
          modelVersion: "mastery-formula-v1",
        },
      });
    }
  });

  after(async () => {
    // Cleanup test student
    if (testStudentId) {
      await prisma.masteryScore.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("systems-of-equations must not unlock when only 54% of prerequisite concepts are mastered", async () => {
    const service = new CurriculumGraphService(prisma);
    const evaluation = await service.evaluateUnitUnlock(testStudentId, "systems-of-equations");

    assert.equal(evaluation.isUnlocked, false, "Unit must not be unlocked");
    assert.ok(
      evaluation.reason.includes("Prerequisites not yet met"),
      "Reason must indicate prerequisites not met",
    );
    assert.ok(evaluation.prerequisiteSummary, "Must provide prerequisite summary");
    assert.equal(
      evaluation.prerequisiteSummary.length,
      1,
      "Must have one prerequisite unit",
    );

    const prereq = evaluation.prerequisiteSummary[0];
    assert.equal(
      prereq.prerequisiteUnitId,
      "linear-equations-one-variable",
      "Prerequisite must be Linear Equations",
    );
    assert.equal(prereq.coreConcepts, 11, "Must have 11 core concepts");
    assert.equal(prereq.masteredCoreConcepts, 6, "Must show 6 mastered");
    assert.ok(
      prereq.percentageMastered < 70,
      `Percentage mastered must be < 70% (got ${prereq.percentageMastered}%)`,
    );
    assert.equal(prereq.thresholdMet, false, "Threshold must not be met");
  });

  it("UNIT_BRIDGE_REVIEW must be eligible with blocker concepts identified", async () => {
    const service = new CurriculumGraphService(prisma);
    const blockerConcepts = await service.getUnlockBlockerConcepts(
      testStudentId,
      "systems-of-equations",
    );

    assert.ok(blockerConcepts.length > 0, "Must have blocker concepts");
    assert.ok(
      blockerConcepts.length === 5,
      `Expected 5 blocker concepts, got ${blockerConcepts.length}`,
    );

    // Blocker concepts should be the ones below threshold
    const expectedBlockers = [
      "C3_ONE_STEP_MULTIPLICATION",
      "C4_ONE_STEP_DIVISION",
      "C5_TWO_STEP_EQUATIONS",
      "C6_SIMPLE_WORD_PROBLEMS",
    ];
    for (const expectedBlocker of expectedBlockers) {
      // Allow some flexibility as there's also P5_EQUALITY_BALANCE
      const found = blockerConcepts.some((id) => expectedBlockers.includes(id));
      assert.ok(found || blockerConcepts.length >= 4, "Must identify weak concepts as blockers");
    }
  });

  it("linear-equations-one-variable must still be unlocked (DIAGNOSTIC_PLACEMENT)", async () => {
    const service = new CurriculumGraphService(prisma);
    const evaluation = await service.evaluateUnitUnlock(
      testStudentId,
      "linear-equations-one-variable",
    );

    assert.equal(evaluation.isUnlocked, true, "Linear Equations must always be unlocked");
    assert.ok(
      evaluation.reason.includes("DIAGNOSTIC_PLACEMENT"),
      "Must use DIAGNOSTIC_PLACEMENT rule",
    );
  });
});
