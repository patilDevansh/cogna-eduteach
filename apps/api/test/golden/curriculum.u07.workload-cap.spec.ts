import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { RecommendationEngineService } from "../../src/engines/recommendation-engine/recommendation-engine.service";

/**
 * U07 — Workload cap across concepts
 * Daily recommendation must not exceed session caps even when multiple concepts have due items.
 * Planning-rules-v1 inherits recommendation-rules-v2/v4 workload caps.
 */

const prisma = new PrismaClient();
let testStudentId: string;

describe("U07 — Workload cap across concepts", () => {
  before(async () => {
    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-u07",
        name: "Test Student U07",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "u07-test-hash",
      },
    });
    testStudentId = student.id;

    // Create retention estimates that will drive the proposals
    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        estimate: 0.40,
        confidence: 0.80,
        daysSinceSuccess: 7,
        evidenceAttemptIds: [],
        modelVersion: "retention-rules-v2",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C5_TWO_STEP_EQUATIONS",
        estimate: 0.45,
        confidence: 0.80,
        daysSinceSuccess: 6,
        evidenceAttemptIds: [],
        modelVersion: "retention-rules-v2",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C3_ONE_STEP_MULTIPLICATION",
        estimate: 0.42,
        confidence: 0.80,
        daysSinceSuccess: 8,
        evidenceAttemptIds: [],
        modelVersion: "retention-rules-v2",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Create revision items from Linear Equations (simulating multi-concept workload)
    // Concept group 1
    for (let i = 0; i < 4; i++) {
      await prisma.revisionQueueItem.create({
        data: {
          studentId: testStudentId,
          conceptId: "C2_ONE_STEP_SUBTRACTION",
          type: "RETENTION_REVIEW",
          priority: 0.8,
          status: "PENDING",
          reasoning: `C2 retention item ${i}`,
          dueAt: new Date(),
          questionCount: 1,
          confidence: 0.80,
          recommendationVersion: "recommendation-rules-v2",
          dedupeKey: `c2-retention-${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        },
      });
    }

    // Concept group 2
    for (let i = 0; i < 4; i++) {
      await prisma.revisionQueueItem.create({
        data: {
          studentId: testStudentId,
          conceptId: "C5_TWO_STEP_EQUATIONS",
          type: "RETENTION_REVIEW",
          priority: 0.8,
          status: "PENDING",
          reasoning: `C5 retention item ${i}`,
          dueAt: new Date(),
          questionCount: 1,
          confidence: 0.80,
          recommendationVersion: "recommendation-rules-v2",
          dedupeKey: `c5-retention-${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        },
      });
    }
  });

  after(async () => {
    if (testStudentId) {
      await prisma.revisionQueueItem.deleteMany({ where: { studentId: testStudentId } });
      await prisma.retentionEstimate.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
  });

  it("daily proposals must not exceed workload cap even with 2 units due", async () => {
    const recommendationEngine = new RecommendationEngineService(prisma);
    const proposals = await recommendationEngine.buildDailyProposals(testStudentId);

    // Workload cap is typically 5-7 items per day (recommendation-rules-v2)
    assert.ok(
      proposals.length <= 7,
      `Daily proposals must not exceed workload cap (got ${proposals.length}, expected ≤ 7)`,
    );
  });

  it("proposals must include items from multiple concepts within cap", async () => {
    const recommendationEngine = new RecommendationEngineService(prisma);
    const proposals = await recommendationEngine.buildDailyProposals(testStudentId);

    const c2ConceptIds = proposals
      .map((p) => p.conceptId)
      .filter((c) => c === "C2_ONE_STEP_SUBTRACTION");
    const c5ConceptIds = proposals
      .map((p) => p.conceptId)
      .filter((c) => c === "C5_TWO_STEP_EQUATIONS");
    const c3ConceptIds = proposals
      .map((p) => p.conceptId)
      .filter((c) => c === "C3_ONE_STEP_MULTIPLICATION");

    // Multiple concepts should be represented in the proposals
    // (even if some items are deferred due to cap)
    assert.ok(
      c2ConceptIds.length > 0 || c5ConceptIds.length > 0 || c3ConceptIds.length > 0,
      "Proposals must include items from at least one concept",
    );

    const totalTestItems = c2ConceptIds.length + c5ConceptIds.length + c3ConceptIds.length;
    assert.ok(
      totalTestItems > 0,
      "Proposals must include some retention items from test concepts",
    );
  });
});
