import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";

/**
 * U06 — Cross-unit retention due
 * When a prior unit concept has low retention (estimate ≤ 0.30),
 * bridge/retention item must compete in decision priority before new-unit exploration.
 */

const prisma = new PrismaClient();
let testStudentId: string;
let testSessionId: string;

describe("U06 — Cross-unit retention due", () => {
  before(async () => {
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u06",
        name: "Test Student U06",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u06-test-hash",
      },
    });
    testStudentId = student.id;

    // Create a learning session
    const session = await prisma.learningSession.create({
      data: {
        studentId: testStudentId,
        sessionMode: "ADAPTIVE_PRACTICE",
        activeConceptId: "SE_C1_SUBSTITUTION_METHOD",
        activeDifficulty: 2,
        questionCount: 0,
        baselineSlotIndex: 0,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    testSessionId = session.id;

    // Create retention estimate with low value (0.30)
    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        estimate: 0.30,
        confidence: 0.80,
        daysSinceSuccess: 7,
        dueForReview: true,
        rulesVersion: "retention-rules-v2",
      },
    });

    // Create revision queue item
    await prisma.revisionQueueItem.create({
      data: {
        studentId: testStudentId,
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        type: "RETENTION_REVIEW",
        priority: "HIGH",
        status: "PENDING",
        reasoning: "Retention estimate 0.30 requires review",
        dueAt: new Date(),
        questionCount: 1,
        createdAt: new Date(),
      },
    });
  });

  after(async () => {
    if (testStudentId) {
      await prisma.revisionQueueItem.deleteMany({ where: { studentId: testStudentId } });
      await prisma.retentionEstimate.deleteMany({ where: { studentId: testStudentId } });
      await prisma.learningSession.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("decision must prioritize retention review before new-unit exploration", async () => {
    const session = await prisma.learningSession.findUniqueOrThrow({
      where: { id: testSessionId },
    });

    const dueRevision = await prisma.revisionQueueItem.findFirst({
      where: { studentId: testStudentId, status: "PENDING" },
    });

    const decisionEngine = new DecisionEngineService();
    const decision = decisionEngine.decideInternal(
      {
        session,
        recentCorrectStreak: 0,
        recentIncorrectStreak: 0,
        dueRevision: dueRevision ?? undefined,
        retentionEstimate: 0.30,
        useDecisionRulesV4: true,
        primaryUnitId: "systems-of-equations",
      },
      undefined,
      undefined,
    );

    assert.equal(decision.uiAction, "SHOW_QUESTION", "Must show question");
    assert.equal(
      decision.learningIntent,
      "RETENTION_REVIEW",
      "Must prioritize retention review",
    );
    assert.equal(
      decision.parameters.conceptId,
      "C2_ONE_STEP_SUBTRACTION",
      "Must target the low-retention concept",
    );
    assert.ok(
      decision.reasoning.toLowerCase().includes("retention"),
      "Reasoning must mention retention",
    );
  });
});
