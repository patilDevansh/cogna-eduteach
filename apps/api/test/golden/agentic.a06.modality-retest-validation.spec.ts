import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { ModalityValidationService } from "../../src/engines/modality-director/modality-validation.service";

/**
 * A06 — Modality without retest mapping fails validation (MVP 5.0)
 * 
 * Every APPROVED modality asset must have a retest question mapping to verify understanding.
 * Cannot approve an asset that lacks a valid retest question link.
 * 
 * This ensures modality completion is not treated as mastery proof without attempt evidence.
 */
describe("A06 — Modality without retest mapping fails validation", () => {
  const prisma = new PrismaClient();
  const validationService = new ModalityValidationService(prisma);

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
      where: { unitId: "linear-equations-one-variable" },
      update: {},
      create: {
        unitId: "linear-equations-one-variable",
        title: "Linear Equations",
        subjectId: "mathematics",
        prerequisiteUnitIds: [],
        unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
        priorityWeight: 1.0,
      },
    });

    // Clean up test data
    await prisma.modalityAsset.deleteMany({
      where: { conceptId: "C3_VALIDATION_TEST" },
    });
    await prisma.question.deleteMany({
      where: { conceptId: "C3_VALIDATION_TEST" },
    });
    await prisma.concept.deleteMany({
      where: { id: "C3_VALIDATION_TEST" },
    });

    // Create test concept
    await prisma.concept.create({
      data: {
        id: "C3_VALIDATION_TEST",
        name: "Test Validation Concept",
        kind: "CORE",
        masteryThreshold: 0.75,
        minimumEvidence: 3,
        sortOrder: 100,
      },
    });

    // Create an APPROVED retest question
    await prisma.question.create({
      data: {
        id: "Q_RETEST_VALID",
        conceptId: "C3_VALIDATION_TEST",
        unitId: "linear-equations-one-variable",
        type: "NUMERIC",
        difficulty: 5,
        stem: "Solve for x: 3x + 5 = 14",
        acceptedAnswers: { value: 3 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: ["x = 3"],
        hintLadder: ["Subtract 5 from both sides", "Divide by 3"],
        reviewStatus: "APPROVED",
      },
    });

    // Create a PENDING_REVIEW retest question
    await prisma.question.create({
      data: {
        id: "Q_RETEST_PENDING",
        conceptId: "C3_VALIDATION_TEST",
        unitId: "linear-equations-one-variable",
        type: "NUMERIC",
        difficulty: 5,
        stem: "Solve for x: 2x + 3 = 9",
        acceptedAnswers: { value: 3 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: ["x = 3"],
        hintLadder: ["Subtract 3 from both sides", "Divide by 2"],
        reviewStatus: "PENDING_REVIEW",
      },
    });
  });

  after(async () => {
    await prisma.modalityAsset.deleteMany({
      where: { conceptId: "C3_VALIDATION_TEST" },
    });
    await prisma.question.deleteMany({
      where: { conceptId: "C3_VALIDATION_TEST" },
    });
    await prisma.concept.deleteMany({
      where: { id: "C3_VALIDATION_TEST" },
    });
    await prisma.$disconnect();
  });

  it("rejects APPROVAL for asset without retest question mapping", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_TEST_NO_RETEST",
      modality: "VIDEO",
      conceptId: "C3_VALIDATION_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-no-retest.mp4",
      transcriptRef: "s3://test/transcript-no-retest.txt",
      durationMs: 120000,
      targetReviewStatus: "APPROVED",
      // retestQuestionId is missing
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(
      result.errors.some((e) =>
        e.includes("Retest question mapping is required")
      )
    );
  });

  it("rejects APPROVAL for asset with non-existent retest question", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_TEST_INVALID_RETEST",
      modality: "VIDEO",
      conceptId: "C3_VALIDATION_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-invalid-retest.mp4",
      transcriptRef: "s3://test/transcript-invalid-retest.txt",
      durationMs: 120000,
      retestQuestionId: "Q_NONEXISTENT",
      targetReviewStatus: "APPROVED",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(
      result.errors.some((e) => e.includes("does not exist"))
    );
  });

  it("rejects APPROVAL for asset with non-APPROVED retest question", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_TEST_PENDING_RETEST",
      modality: "VIDEO",
      conceptId: "C3_VALIDATION_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-pending-retest.mp4",
      transcriptRef: "s3://test/transcript-pending-retest.txt",
      durationMs: 120000,
      retestQuestionId: "Q_RETEST_PENDING",
      targetReviewStatus: "APPROVED",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(
      result.errors.some((e) => e.includes("must be APPROVED"))
    );
  });

  it("accepts APPROVAL for asset with valid APPROVED retest question", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_TEST_VALID_RETEST",
      modality: "VIDEO",
      conceptId: "C3_VALIDATION_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-valid-retest.mp4",
      transcriptRef: "s3://test/transcript-valid-retest.txt",
      durationMs: 120000,
      retestQuestionId: "Q_RETEST_VALID",
      targetReviewStatus: "APPROVED",
    });

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  it("allows PENDING_REVIEW status without retest question", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_TEST_PENDING",
      modality: "VIDEO",
      conceptId: "C3_VALIDATION_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-pending.mp4",
      durationMs: 120000,
      targetReviewStatus: "PENDING_REVIEW",
      // retestQuestionId is missing, but that's OK for PENDING_REVIEW
    });

    // Should pass because we're not trying to APPROVE yet
    assert.equal(result.valid, true);
  });
});
