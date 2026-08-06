import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";

/**
 * U01 — Linear Equations IDs unchanged
 * Ensures that the Linear Equations concept IDs from MVP 1.0/2.0/3.0 remain canonical
 * and are never renamed as part of MVP 4.0 multi-unit curriculum work.
 */

const prisma = new PrismaClient();

describe("U01 — Linear Equations IDs unchanged", () => {
  it("P2_NEGATIVE_OPS must still be canonical", async () => {
    const concept = await prisma.concept.findUnique({
      where: { id: "P2_NEGATIVE_OPS" },
    });
    assert.ok(concept, "P2_NEGATIVE_OPS must exist");
    assert.equal(concept.id, "P2_NEGATIVE_OPS", "Concept ID must be exactly P2_NEGATIVE_OPS");
    assert.equal(concept.kind, "PREREQ", "P2_NEGATIVE_OPS must be PREREQ");
  });

  it("C6_SIMPLE_WORD_PROBLEMS must still be canonical", async () => {
    const concept = await prisma.concept.findUnique({
      where: { id: "C6_SIMPLE_WORD_PROBLEMS" },
    });
    assert.ok(concept, "C6_SIMPLE_WORD_PROBLEMS must exist");
    assert.equal(
      concept.id,
      "C6_SIMPLE_WORD_PROBLEMS",
      "Concept ID must be exactly C6_SIMPLE_WORD_PROBLEMS",
    );
    assert.equal(concept.kind, "CORE", "C6_SIMPLE_WORD_PROBLEMS must be CORE");
  });

  it("All 11 Linear Equations concepts must exist with original IDs", async () => {
    const expectedIds = [
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

    const concepts = await prisma.concept.findMany({
      where: { id: { in: expectedIds } },
    });

    assert.equal(
      concepts.length,
      11,
      "All 11 Linear Equations concepts must be present",
    );

    const foundIds = new Set(concepts.map((c) => c.id));
    for (const expectedId of expectedIds) {
      assert.ok(
        foundIds.has(expectedId),
        `Linear Equations concept ${expectedId} must exist`,
      );
    }
  });

  it("linear-equations-one-variable unit must reference all 11 original concepts", async () => {
    const unit = await prisma.curriculumUnit.findUnique({
      where: { unitId: "linear-equations-one-variable" },
      include: { unitConcepts: true },
    });

    assert.ok(unit, "linear-equations-one-variable unit must exist");

    const conceptIds = unit.unitConcepts.map((uc) => uc.conceptId);
    const expectedIds = [
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

    assert.equal(
      conceptIds.length,
      11,
      "Unit must have exactly 11 concepts",
    );

    for (const expectedId of expectedIds) {
      assert.ok(
        conceptIds.includes(expectedId),
        `Unit must include ${expectedId}`,
      );
    }
  });
});
