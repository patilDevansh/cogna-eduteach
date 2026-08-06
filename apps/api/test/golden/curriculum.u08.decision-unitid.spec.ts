import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";

/**
 * U08 — Decision includes unitId
 * When decision-rules-v4 is active, SHOW_QUESTION decisions must set parameters.unitId.
 */

const prisma = new PrismaClient();
let testStudentId: string;
let testSessionId: string;

describe("U08 — Decision includes unitId", () => {
  before(async () => {
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u08",
        name: "Test Student U08",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u08-test-hash",
      },
    });
    testStudentId = student.id;

    const session = await prisma.learningSession.create({
      data: {
        studentId: testStudentId,
        sessionMode: "ADAPTIVE_PRACTICE",
        activeConceptId: "SE_C1_SUBSTITUTION_METHOD",
        activeDifficulty: 2,
        questionCount: 2,
        baselineSlotIndex: 0,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    testSessionId = session.id;
  });

  after(async () => {
    if (testStudentId) {
      await prisma.learningSession.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("decision must include unitId when useDecisionRulesV4 is true", async () => {
    const session = await prisma.learningSession.findUniqueOrThrow({
      where: { id: testSessionId },
    });

    const decisionEngine = new DecisionEngineService();
    const decision = decisionEngine.decideInternal(
      {
        session,
        recentCorrectStreak: 1,
        recentIncorrectStreak: 0,
        useDecisionRulesV4: true,
        primaryUnitId: "systems-of-equations",
      },
      undefined,
      undefined,
    );

    assert.equal(decision.uiAction, "SHOW_QUESTION", "Must show question");
    assert.ok(
      decision.parameters.unitId,
      "Decision parameters must include unitId when v4 enabled",
    );
    assert.equal(
      decision.parameters.unitId,
      "systems-of-equations",
      "Unit ID must match primary unit",
    );
    assert.equal(
      decision.decisionVersion,
      "decision-rules-v4",
      "Must use decision-rules-v4",
    );
  });

  it("decision must not include unitId when useDecisionRulesV4 is false", async () => {
    const session = await prisma.learningSession.findUniqueOrThrow({
      where: { id: testSessionId },
    });

    const decisionEngine = new DecisionEngineService();
    const decision = decisionEngine.decideInternal(
      {
        session,
        recentCorrectStreak: 1,
        recentIncorrectStreak: 0,
        useDecisionRulesV4: false,
      },
      undefined,
      undefined,
    );

    assert.equal(decision.uiAction, "SHOW_QUESTION", "Must show question");
    assert.equal(
      decision.parameters.unitId,
      undefined,
      "Decision parameters must not include unitId when v4 disabled",
    );
    assert.ok(
      decision.decisionVersion !== "decision-rules-v4",
      "Must not use decision-rules-v4",
    );
  });
});
