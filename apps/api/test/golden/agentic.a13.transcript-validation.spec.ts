import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { ModalityValidationService } from "../../src/engines/modality-director/modality-validation.service";

/**
 * A13 — Transcript claim mismatch fails review (MVP 5.0)
 * 
 * VIDEO/VOICE modality assets must have transcripts for math claim validation.
 * Cannot approve an asset without transcript reference (claim validation is offline).
 * 
 * This prevents unchecked generative voice/video from asserting wrong math to students.
 */
describe("A13 — Transcript claim mismatch fails review", () => {
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
      where: { conceptId: "C4_TRANSCRIPT_TEST" },
    });
    await prisma.question.deleteMany({
      where: { conceptId: "C4_TRANSCRIPT_TEST" },
    });
    await prisma.concept.deleteMany({
      where: { id: "C4_TRANSCRIPT_TEST" },
    });

    // Create test concept
    await prisma.concept.create({
      data: {
        id: "C4_TRANSCRIPT_TEST",
        name: "Test Transcript Concept",
        kind: "CORE",
        masteryThreshold: 0.75,
        minimumEvidence: 3,
        sortOrder: 101,
      },
    });

    // Create an APPROVED retest question
    await prisma.question.create({
      data: {
        id: "Q_TRANSCRIPT_RETEST",
        conceptId: "C4_TRANSCRIPT_TEST",
        unitId: "linear-equations-one-variable",
        type: "NUMERIC",
        difficulty: 5,
        stem: "Solve for x: 4x + 2 = 18",
        acceptedAnswers: { value: 4 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: ["x = 4"],
        hintLadder: ["Subtract 2 from both sides", "Divide by 4"],
        reviewStatus: "APPROVED",
      },
    });
  });

  after(async () => {
    await prisma.modalityAsset.deleteMany({
      where: { conceptId: "C4_TRANSCRIPT_TEST" },
    });
    await prisma.question.deleteMany({
      where: { conceptId: "C4_TRANSCRIPT_TEST" },
    });
    await prisma.concept.deleteMany({
      where: { id: "C4_TRANSCRIPT_TEST" },
    });
    await prisma.$disconnect();
  });

  it("rejects APPROVAL for VIDEO without transcript", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_VIDEO_NO_TRANSCRIPT",
      modality: "VIDEO",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-no-transcript.mp4",
      durationMs: 120000,
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
      // transcriptRef is missing
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(
      result.errors.some((e) => e.includes("Transcript reference is required"))
    );
  });

  it("rejects APPROVAL for VOICE without transcript", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_VOICE_NO_TRANSCRIPT",
      modality: "VOICE",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/voice-no-transcript.mp3",
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
      // transcriptRef is missing
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(
      result.errors.some((e) => e.includes("Transcript reference is required"))
    );
  });

  it("rejects APPROVAL for invalid transcript reference format", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_VIDEO_INVALID_TRANSCRIPT",
      modality: "VIDEO",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-invalid-transcript.mp4",
      transcriptRef: "invalid-format",
      durationMs: 120000,
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(
      result.errors.some((e) => e.includes("invalid format"))
    );
  });

  it("accepts APPROVAL for VIDEO with valid transcript", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_VIDEO_VALID_TRANSCRIPT",
      modality: "VIDEO",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/video-valid-transcript.mp4",
      transcriptRef: "s3://test/transcript-valid.txt",
      durationMs: 120000,
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
    });

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  it("accepts APPROVAL for VOICE with valid transcript", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_VOICE_VALID_TRANSCRIPT",
      modality: "VOICE",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/voice-valid.mp3",
      transcriptRef: "s3://test/transcript-voice-valid.txt",
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
    });

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  it("allows TEXT modality without transcript", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_TEXT_NO_TRANSCRIPT",
      modality: "TEXT",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/text-content.json",
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
      // transcriptRef is missing, but TEXT doesn't need it
    });

    assert.equal(result.valid, true);
  });

  it("allows ANIMATION without transcript", async () => {
    const result = await validationService.validateAsset({
      assetId: "MOD_ANIMATION_NO_TRANSCRIPT",
      modality: "ANIMATION",
      conceptId: "C4_TRANSCRIPT_TEST",
      unitId: "linear-equations-one-variable",
      subjectId: "mathematics",
      storageRef: "s3://test/animation.json",
      durationMs: 60000,
      retestQuestionId: "Q_TRANSCRIPT_RETEST",
      targetReviewStatus: "APPROVED",
      // transcriptRef is missing, but ANIMATION doesn't need it (visual only)
    });

    assert.equal(result.valid, true);
  });
});
