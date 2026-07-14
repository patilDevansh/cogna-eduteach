import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { ModalityDirectorService } from "../../src/engines/modality-director/modality-director.service";

/**
 * A05 — Non-APPROVED modality blocked (MVP 5.0)
 * 
 * The Modality Director will never select a modality asset with reviewStatus != APPROVED.
 * Assets in PENDING_REVIEW, DRAFT, or RETIRED states must not reach students.
 */
describe("A05 — Non-APPROVED modality blocked", () => {
  const prisma = new PrismaClient();
  const modalityDirector = new ModalityDirectorService(prisma);

  before(async () => {
    // Create test assets with different review statuses
    await prisma.modalityAsset.deleteMany({ where: { conceptId: "C2_TEST_CONCEPT" } });

    await prisma.modalityAsset.create({
      data: {
        assetId: "MOD_TEST_PENDING",
        modality: "VIDEO",
        conceptId: "C2_TEST_CONCEPT",
        unitId: "linear-equations-one-variable",
        subjectId: "mathematics",
        storageRef: "s3://test/pending-video.mp4",
        reviewStatus: "PENDING_REVIEW", // NOT APPROVED
      },
    });

    await prisma.modalityAsset.create({
      data: {
        assetId: "MOD_TEST_APPROVED",
        modality: "VIDEO",
        conceptId: "C2_TEST_CONCEPT",
        unitId: "linear-equations-one-variable",
        subjectId: "mathematics",
        storageRef: "s3://test/approved-video.mp4",
        reviewStatus: "APPROVED", // APPROVED
      },
    });
  });

  after(async () => {
    await prisma.modalityAsset.deleteMany({ where: { conceptId: "C2_TEST_CONCEPT" } });
    await prisma.$disconnect();
  });

  it("never selects PENDING_REVIEW asset", async () => {
    const result = await modalityDirector.selectModality({
      conceptId: "C2_TEST_CONCEPT",
      learningIntent: "SHOW_TEACHING_MODULE",
      studentId: "test_student",
      sessionId: "test_session",
    });

    // Should select APPROVED asset, not PENDING_REVIEW
    if (result.asset) {
      assert.equal(result.asset.reviewStatus, "APPROVED");
      assert.notEqual(result.asset.assetId, "MOD_TEST_PENDING");
    } else {
      // Or fall back to TEXT
      assert.equal(result.modality, "TEXT");
    }
  });

  it("selects APPROVED asset when available", async () => {
    const result = await modalityDirector.selectModality({
      conceptId: "C2_TEST_CONCEPT",
      learningIntent: "SHOW_TEACHING_MODULE",
      studentId: "test_student",
      sessionId: "test_session",
    });

    assert.ok(result.asset);
    assert.equal(result.asset.assetId, "MOD_TEST_APPROVED");
    assert.equal(result.asset.reviewStatus, "APPROVED");
  });

  it("falls back to TEXT when no APPROVED asset exists", async () => {
    const result = await modalityDirector.selectModality({
      conceptId: "C9_NONEXISTENT_CONCEPT",
      learningIntent: "SHOW_TEACHING_MODULE",
      studentId: "test_student",
      sessionId: "test_session",
    });

    assert.equal(result.modality, "TEXT");
    assert.equal(result.asset, undefined);
  });
});
