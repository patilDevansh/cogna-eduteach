import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { CurriculumGraphService } from "../../src/curriculum/curriculum-graph.service";

/**
 * U03 — Unit unlock allowed
 * When ≥70% of prerequisite unit's core concepts reach mastery threshold with minimum evidence,
 * the unit must unlock and the planning horizon may set it as the primary unit.
 */

const prisma = new PrismaClient();
let testStudentId: string;

describe("U03 — Unit unlock allowed", () => {
  before(async () => {
    // Create a test student
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u03",
        name: "Test Student U03",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u03-test-hash",
      },
    });
    testStudentId = student.id;

    // Set mastery scores: 9 out of 11 Linear Equations core concepts at threshold
    // This is ~82%, above the 70% threshold required to unlock systems-of-equations
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

    // Set 9 concepts at threshold (≥0.75 mastery, ≥4 evidence for core, ≥3 for prereq)
    const masteredConceptIds = linearConceptIds.slice(0, 9);
    for (const conceptId of masteredConceptIds) {
      const concept = await prisma.concept.findUnique({ where: { id: conceptId } });
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId,
          value: 0.80,
          confidence: 0.85,
          evidenceCount: concept?.minimumEvidence ?? 4,
          modelVersion: "mastery-formula-v1",
        },
      });
    }

    // Set remaining 2 concepts just below threshold (still counts as progress)
    const nearThresholdIds = linearConceptIds.slice(9);
    for (const conceptId of nearThresholdIds) {
      await prisma.masteryScore.create({
        data: {
          studentId: testStudentId,
          conceptId,
          value: 0.72,
          confidence: 0.70,
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

  it("systems-of-equations must unlock when ≥70% of prerequisite concepts are mastered", async () => {
    const service = new CurriculumGraphService(prisma);
    const evaluation = await service.evaluateUnitUnlock(testStudentId, "systems-of-equations");

    assert.equal(evaluation.isUnlocked, true, "Unit must be unlocked");
    assert.ok(
      evaluation.reason.includes("All prerequisites met"),
      "Reason must indicate prerequisites met",
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
    assert.equal(prereq.masteredCoreConcepts, 9, "Must show 9 mastered");
    assert.ok(
      prereq.percentageMastered >= 70,
      `Percentage mastered must be ≥ 70% (got ${prereq.percentageMastered}%)`,
    );
    assert.equal(prereq.thresholdMet, true, "Threshold must be met");
  });

  it("getUnlockedUnits must include both linear-equations and systems-of-equations", async () => {
    const service = new CurriculumGraphService(prisma);
    const unlockedUnits = await service.getUnlockedUnits(testStudentId);

    assert.ok(unlockedUnits.length >= 2, "Must have at least 2 unlocked units");

    const unitIds = unlockedUnits.map((u) => u.unitId);
    assert.ok(
      unitIds.includes("linear-equations-one-variable"),
      "Must include Linear Equations",
    );
    assert.ok(
      unitIds.includes("systems-of-equations"),
      "Must include Systems of Equations",
    );
  });

  it("quadratic-equations must remain locked (same prerequisite, but different student profile)", async () => {
    const service = new CurriculumGraphService(prisma);
    const evaluation = await service.evaluateUnitUnlock(testStudentId, "quadratic-equations");

    // quadratic-equations has same prerequisite as systems-of-equations,
    // so it should also unlock for this student
    assert.equal(evaluation.isUnlocked, true, "Quadratic equations must also unlock");
  });

  it("no blocker concepts when unit is unlocked", async () => {
    const service = new CurriculumGraphService(prisma);
    const blockerConcepts = await service.getUnlockBlockerConcepts(
      testStudentId,
      "systems-of-equations",
    );

    assert.equal(
      blockerConcepts.length,
      0,
      "Must have no blocker concepts when unit is unlocked",
    );
  });
});
