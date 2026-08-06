import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { QuestionGeneratorService } from "../../src/engines/question-generator/question-generator.service";
import { ReviewStatus } from "@cogna/database";

/**
 * R12 — Content approval gate
 * When ALLOW_PENDING_REVIEW_QUESTIONS is unset/false, students must never
 * be served PENDING_REVIEW content (wouldServePendingToStudent === false).
 */
function mockPrisma(counts: { approved: number; pending: number }) {
  return {
    question: {
      count: async (args: { where: { reviewStatus: ReviewStatus } }) => {
        if (args.where.reviewStatus === ReviewStatus.APPROVED) {
          return counts.approved;
        }
        if (args.where.reviewStatus === ReviewStatus.PENDING_REVIEW) {
          return counts.pending;
        }
        return 0;
      },
    },
  };
}

describe("R12 — Content approval gate", () => {
  let previousAllowPending: string | undefined;

  before(() => {
    previousAllowPending = process.env.ALLOW_PENDING_REVIEW_QUESTIONS;
    delete process.env.ALLOW_PENDING_REVIEW_QUESTIONS;
  });

  after(() => {
    if (previousAllowPending === undefined) {
      delete process.env.ALLOW_PENDING_REVIEW_QUESTIONS;
    } else {
      process.env.ALLOW_PENDING_REVIEW_QUESTIONS = previousAllowPending;
    }
  });

  it("rejects PENDING when ALLOW_PENDING is unset (ENFORCED, serves none)", async () => {
    const service = new QuestionGeneratorService(
      mockPrisma({ approved: 0, pending: 12 }) as unknown as ConstructorParameters<
        typeof QuestionGeneratorService
      >[0],
    );

    const status = await service.approvalGateStatus();

    assert.equal(status.allowPendingReview, false);
    assert.equal(status.approvedCount, 0);
    assert.equal(status.pendingReviewCount, 12);
    assert.equal(status.wouldServePendingToStudent, false);
    assert.equal(status.stagingGate, "ENFORCED");
  });

  it("still does not serve PENDING when APPROVED items exist but gate is off", async () => {
    const service = new QuestionGeneratorService(
      mockPrisma({ approved: 5, pending: 3 }) as unknown as ConstructorParameters<
        typeof QuestionGeneratorService
      >[0],
    );

    const status = await service.approvalGateStatus();

    assert.equal(status.allowPendingReview, false);
    assert.equal(status.wouldServePendingToStudent, false);
    assert.equal(status.stagingGate, "ENFORCED");
  });

  it("only relaxes when ALLOW_PENDING_REVIEW_QUESTIONS=true", async () => {
    process.env.ALLOW_PENDING_REVIEW_QUESTIONS = "true";
    try {
      const service = new QuestionGeneratorService(
        mockPrisma({ approved: 0, pending: 4 }) as unknown as ConstructorParameters<
          typeof QuestionGeneratorService
        >[0],
      );
      const status = await service.approvalGateStatus();
      assert.equal(status.allowPendingReview, true);
      assert.equal(status.wouldServePendingToStudent, true);
      assert.equal(status.stagingGate, "RELAXED");
    } finally {
      delete process.env.ALLOW_PENDING_REVIEW_QUESTIONS;
    }
  });
});
