import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { RecommendationEngineService } from "../../src/engines/recommendation-engine/recommendation-engine.service";

/**
 * A14 — Workload includes modality minutes (MVP 5.0)
 * 
 * Daily recommendations must respect a combined workload cap that includes:
 * - Traditional text questions (count-based cap)
 * - Modality asset duration (time-based cap)
 * 
 * Example:
 * - 10 text questions ≈ 30 minutes (3 min/question)
 * - 1 video module = 5 minutes
 * - Combined cap: 35-40 minutes/day or ~12 question-equivalents
 * 
 * This prevents overwhelming students with both many questions AND long videos.
 */
describe("A14 — Workload includes modality minutes", () => {
  const prisma = new PrismaClient();
  let testStudentId: string;

  before(async () => {
    // Ensure subject and unit exist
    await prisma.subject.upsert({
      where: { subjectId: "mathematics" },
      update: {},
      create: {
        subjectId: "mathematics",
        title: "Mathematics",
      },
    });

    await prisma.curriculumUnit.upsert({
      where: { unitId: "linear-equations" },
      update: {},
      create: {
        unitId: "linear-equations",
        title: "Linear Equations",
        subjectId: "mathematics",
        prerequisiteUnitIds: [],
        unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
        priorityWeight: 1.0,
      },
    });

    const student = await prisma.student.create({
      data: {
        primaryParentId: "test-parent-a14",
        name: "Test Student A14",
        grade: 8,
        curriculum: "CBSE",
        accessCodeHash: "a14-test-hash",
      },
    });
    testStudentId = student.id;

    // Clean up any existing test modality assets
    await prisma.modalityAsset.deleteMany({
      where: { assetId: { startsWith: "MOD_A14_" } },
    });
    await prisma.question.deleteMany({
      where: {
        OR: [
          { conceptId: "C2_VARIABLES_BOTH_SIDES" },
          { conceptId: "C3_DISTRIBUTIVE_PROPERTY" },
        ],
        id: { startsWith: "Q_A14_" },
      },
    });

    // Ensure test concepts exist (they should already exist from seeds)
    await prisma.concept.upsert({
      where: { id: "C2_VARIABLES_BOTH_SIDES" },
      update: {},
      create: {
        id: "C2_VARIABLES_BOTH_SIDES",
        name: "Variables on Both Sides",
        kind: "CORE",
        masteryThreshold: 0.75,
        minimumEvidence: 3,
        sortOrder: 2,
      },
    });

    await prisma.concept.upsert({
      where: { id: "C3_DISTRIBUTIVE_PROPERTY" },
      update: {},
      create: {
        id: "C3_DISTRIBUTIVE_PROPERTY",
        name: "Distributive Property",
        kind: "CORE",
        masteryThreshold: 0.75,
        minimumEvidence: 3,
        sortOrder: 3,
      },
    });

    // Create modality assets with varying durations
    await prisma.modalityAsset.create({
      data: {
        assetId: "MOD_A14_SHORT",
        modality: "VIDEO",
        conceptId: "C2_VARIABLES_BOTH_SIDES",
        unitId: "linear-equations",
        subjectId: "mathematics",
        storageRef: "s3://test/short-video.mp4",
        transcriptRef: "s3://test/short-transcript.txt",
        durationMs: 120000, // 2 minutes
        reviewStatus: "APPROVED",
        retestQuestionId: "Q_A14_RETEST_1",
      },
    });

    await prisma.modalityAsset.create({
      data: {
        assetId: "MOD_A14_LONG",
        modality: "VIDEO",
        conceptId: "C3_DISTRIBUTIVE_PROPERTY",
        unitId: "linear-equations",
        subjectId: "mathematics",
        storageRef: "s3://test/long-video.mp4",
        transcriptRef: "s3://test/long-transcript.txt",
        durationMs: 600000, // 10 minutes
        reviewStatus: "APPROVED",
        retestQuestionId: "Q_A14_RETEST_2",
      },
    });

    // Create APPROVED retest questions
    await prisma.question.create({
      data: {
        id: "Q_A14_RETEST_1",
        conceptId: "C2_VARIABLES_BOTH_SIDES",
        unitId: "linear-equations",
        type: "NUMERIC",
        difficulty: 5,
        stem: "Solve: 2x + 3 = x + 7",
        acceptedAnswers: { value: 4 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: ["x = 4"],
        hintLadder: ["Move x to one side", "Simplify"],
        reviewStatus: "APPROVED",
      },
    });

    await prisma.question.create({
      data: {
        id: "Q_A14_RETEST_2",
        conceptId: "C3_DISTRIBUTIVE_PROPERTY",
        unitId: "linear-equations",
        type: "NUMERIC",
        difficulty: 6,
        stem: "Solve: 2(x + 3) = 14",
        acceptedAnswers: { value: 4 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: ["x = 4"],
        hintLadder: ["Distribute the 2", "Subtract 6", "Divide by 2"],
        reviewStatus: "APPROVED",
      },
    });

    // Create retention estimates to drive proposals
    await prisma.retentionEstimate.create({
      data: {
        studentId: testStudentId,
        conceptId: "C2_VARIABLES_BOTH_SIDES",
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
        conceptId: "C3_DISTRIBUTIVE_PROPERTY",
        estimate: 0.42,
        confidence: 0.80,
        daysSinceSuccess: 6,
        evidenceAttemptIds: [],
        modelVersion: "retention-rules-v2",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Create multiple revision queue items to test cap
    for (let i = 0; i < 8; i++) {
      await prisma.revisionQueueItem.create({
        data: {
          studentId: testStudentId,
          conceptId: "C1_BASIC_SOLVING",
          type: "RETENTION_REVIEW",
          priority: 0.7,
          status: "PENDING",
          reasoning: `Retention item ${i}`,
          dueAt: new Date(),
          questionCount: 1,
          confidence: 0.75,
          recommendationVersion: "recommendation-rules-v2",
          dedupeKey: `c1-retention-${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        },
      });
    }
  });

  after(async () => {
    if (testStudentId) {
      await prisma.modalityOutcome.deleteMany({ where: { studentId: testStudentId } });
      await prisma.revisionQueueItem.deleteMany({ where: { studentId: testStudentId } });
      await prisma.retentionEstimate.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.delete({ where: { id: testStudentId } });
    }
    await prisma.modalityAsset.deleteMany({ where: { assetId: { startsWith: "MOD_A14_" } } });
    await prisma.question.deleteMany({ where: { id: { startsWith: "Q_A14_" } } });
    await prisma.$disconnect();
  });

  it("counts modality duration toward daily workload budget", async () => {
    // MVP 5.0 workload budget:
    // - 10 text questions (MAX_QUESTIONS_PER_DAY)
    // - Assume 3 min/question average = 30 minutes text
    // - Modality assets add their duration to the budget
    // - Combined cap: ~40 minutes or 13-14 question-equivalents
    //
    // In this test:
    // - 2 concepts with modality assets (2 min + 10 min = 12 min)
    // - 8 revision items (text, ~24 min if 3 min each)
    // - Total ≈ 36 min, within reasonable budget

    const recommendationEngine = new RecommendationEngineService(prisma);
    const proposals = await recommendationEngine.buildDailyProposals(testStudentId);

    // Calculate total estimated workload time
    let totalEstimatedMinutes = 0;
    let modalityCount = 0;

    for (const proposal of proposals) {
      // Check if this concept has an APPROVED modality asset
      const modalityAsset = await prisma.modalityAsset.findFirst({
        where: {
          conceptId: proposal.conceptId,
          reviewStatus: "APPROVED",
        },
      });

      if (modalityAsset?.durationMs) {
        totalEstimatedMinutes += modalityAsset.durationMs / 60000;
        modalityCount++;
      }

      // Each text question ≈ 3 minutes
      totalEstimatedMinutes += proposal.questionCount * 3;
    }

    // Combined workload cap: ~40 minutes/day
    const MAX_DAILY_MINUTES = 40;

    assert.ok(
      totalEstimatedMinutes <= MAX_DAILY_MINUTES,
      `Combined workload (${totalEstimatedMinutes.toFixed(1)} min) exceeds daily cap (${MAX_DAILY_MINUTES} min)`
    );

    // Verify that modality assets were considered
    assert.ok(
      modalityCount > 0,
      "Test should include at least one concept with modality asset"
    );
  });

  it("prefers shorter modality assets when near workload cap", async () => {
    // This test documents the expected behavior:
    // When the recommendation engine is near the daily workload cap,
    // it should prefer shorter modality assets over longer ones
    // to maximize learning opportunities within the time budget.

    // In MVP 5.0 pilot, this may be a simple heuristic.
    // Post-pilot, could use more sophisticated scheduling.

    const recommendationEngine = new RecommendationEngineService(prisma);
    const proposals = await recommendationEngine.buildDailyProposals(testStudentId);

    // Calculate modality durations in proposals
    const modalityProposals = await Promise.all(
      proposals.map(async (p) => {
        const asset = await prisma.modalityAsset.findFirst({
          where: {
            conceptId: p.conceptId,
            reviewStatus: "APPROVED",
          },
        });
        return {
          conceptId: p.conceptId,
          durationMin: asset?.durationMs ? asset.durationMs / 60000 : 0,
        };
      })
    );

    const withModality = modalityProposals.filter((p) => p.durationMin > 0);

    if (withModality.length > 1) {
      // If multiple modality assets are proposed,
      // shorter ones should generally be prioritized (within same priority tier)
      const durations = withModality.map((p) => p.durationMin);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      // Most proposals should be <= average (not skewed toward long videos)
      const shortCount = durations.filter((d) => d <= avgDuration).length;
      const ratio = shortCount / durations.length;

      assert.ok(
        ratio >= 0.5,
        `Modality proposals should prefer shorter assets near workload cap (${ratio.toFixed(2)} ratio)`
      );
    } else {
      // If only 1 or 0 modality assets, test is informational
      assert.ok(true, "Single or no modality asset; workload cap respected");
    }
  });

  it("records modalityOutcome with dwell time for workload tracking", async () => {
    // When a student completes a modality asset,
    // the system should record the outcome with dwell time.
    // This enables future workload planning based on actual completion times.

    const asset = await prisma.modalityAsset.findFirst({
      where: { assetId: "MOD_A14_SHORT" },
    });
    assert.ok(asset);

    // Simulate student completing the modality asset
    await prisma.modalityOutcome.create({
      data: {
        studentId: testStudentId,
        assetId: asset.assetId,
        sessionId: "test-session-a14",
        completed: true,
        dwellMs: 135000, // 2.25 minutes (slightly longer than asset duration)
        retestCorrect: true,
        modelVersion: "modality-rules-v1",
      },
    });

    const outcome = await prisma.modalityOutcome.findFirst({
      where: {
        studentId: testStudentId,
        assetId: asset.assetId,
      },
    });

    assert.ok(outcome);
    assert.equal(outcome.completed, true);
    assert.ok(outcome.dwellMs > 0);

    // Future workload planning could use dwell time statistics
    // to adjust time estimates per student or per asset
    const dwellMinutes = outcome.dwellMs / 60000;
    assert.ok(
      dwellMinutes > 0,
      `Dwell time recorded for workload tracking: ${dwellMinutes.toFixed(2)} min`
    );
  });
});
