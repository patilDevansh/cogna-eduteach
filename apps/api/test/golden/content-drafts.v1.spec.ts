import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ContentDraftService } from "../../src/content/content-draft.service";
import { ContentValidationService } from "../../src/content/content-validation.service";

/**
 * MVP 3.0 — Content draft pipeline golden tests
 * S11 — LLM draft never student-visible
 * S12 — Validation failure blocks review queue
 * S13 — Promotion creates APPROVED bank item
 * S14 — Canonical concept ID enforced
 * S15 — Deny-list language
 */

function mockPrisma() {
  const store = {
    drafts: new Map<string, unknown>(),
    questions: new Map<string, unknown>(),
    explanations: new Map<string, unknown>(),
  };

  return {
    contentDraft: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `draft_${Date.now()}_${Math.random()}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        store.drafts.set(id, record);
        return record;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return store.drafts.get(where.id) ?? null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const draft = store.drafts.get(where.id);
        if (!draft) throw new Error("Draft not found");
        return draft;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = store.drafts.get(where.id);
        if (!existing) throw new Error("Draft not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        store.drafts.set(where.id, updated);
        return updated;
      },
    },
    question: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = data.id as string;
        const record = { ...data, createdAt: new Date(), updatedAt: new Date() };
        store.questions.set(id, record);
        return record;
      },
      findMany: async (args: {
        where: { reviewStatus?: string };
        orderBy?: unknown;
      }) => {
        const all = Array.from(store.questions.values());
        if (args.where.reviewStatus) {
          return all.filter(
            (q: Record<string, unknown>) =>
              q.reviewStatus === args.where.reviewStatus,
          );
        }
        return all;
      },
    },
    explanation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = data.id as string;
        const record = { ...data, createdAt: new Date(), updatedAt: new Date() };
        store.explanations.set(id, record);
        return record;
      },
    },
  };
}

describe("S11 — LLM draft never student-visible", () => {
  it("VALIDATED draft cannot be served to students (only APPROVED_PROMOTED)", async () => {
    const prisma = mockPrisma();
    const validation = new ContentValidationService();
    const service = new ContentDraftService(prisma as unknown as ConstructorParameters<typeof ContentDraftService>[0], validation);

    // Create and validate a draft
    const { draftId } = await service.createDraft({
      draftType: "QUESTION",
      conceptId: "C1_BASIC_SOLVING",
      difficulty: 5,
      payload: {
        type: "NUMERIC",
        stem: "Solve: x + 3 = 7",
        acceptedAnswers: { value: 4 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: {},
        hintLadder: {},
      },
      source: "HUMAN",
    });

    await service.validateDraft({ draftId });

    const draft = await service.getDraft(draftId);
    assert.equal(draft.status, "VALIDATED");

    // Verify: Question Generator would NOT select VALIDATED drafts
    // (it only selects from Question table with reviewStatus=APPROVED)
    const questions = await prisma.question.findMany({
      where: { reviewStatus: "APPROVED" },
    });

    assert.equal(
      questions.length,
      0,
      "No APPROVED questions exist; VALIDATED drafts are isolated",
    );
  });
});

describe("S12 — Validation failure blocks review queue", () => {
  it("draft with wrong answer type fails validation and cannot reach PENDING_REVIEW", async () => {
    const prisma = mockPrisma();
    const validation = new ContentValidationService();
    const service = new ContentDraftService(prisma as unknown as ConstructorParameters<typeof ContentDraftService>[0], validation);

    // Create draft with wrong answer type for NUMERIC question
    const { draftId } = await service.createDraft({
      draftType: "QUESTION",
      conceptId: "C1_BASIC_SOLVING",
      difficulty: 5,
      payload: {
        type: "NUMERIC",
        stem: "Solve: 2x = 10",
        acceptedAnswers: "five", // Wrong: should be number
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: {},
        hintLadder: {},
      },
      source: "HUMAN",
    });

    const result = await service.validateDraft({ draftId });

    assert.equal(result.status, "VALIDATION_FAILED");
    assert.ok(result.validationErrors);
    assert.ok(result.validationErrors.length > 0);

    const draft = await service.getDraft(draftId);
    assert.equal(draft.status, "VALIDATION_FAILED");

    // Cannot review a VALIDATION_FAILED draft without fixing and revalidating
    await assert.rejects(
      async () => {
        await service.reviewDraft({
          draftId,
          reviewer: "test@example.com",
          decision: "APPROVE",
          checklist: {
            mathCorrect: true,
            wordingClear: true,
            tagsAccurate: true,
          },
        });
      },
      {
        message: /Cannot review draft with status VALIDATION_FAILED/,
      },
    );
  });
});

describe("S13 — Promotion creates APPROVED bank item", () => {
  it("APPROVED draft promotes to question.reviewStatus=APPROVED", async () => {
    const prisma = mockPrisma();
    const validation = new ContentValidationService();
    const service = new ContentDraftService(prisma as unknown as ConstructorParameters<typeof ContentDraftService>[0], validation);

    const { draftId } = await service.createDraft({
      draftType: "QUESTION",
      conceptId: "C1_BASIC_SOLVING",
      difficulty: 5,
      payload: {
        type: "NUMERIC",
        stem: "Solve: x - 2 = 5",
        acceptedAnswers: { value: 7 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: {},
        hintLadder: {},
      },
      source: "HUMAN",
    });

    await service.validateDraft({ draftId });

    const { status, promotedContentId } = await service.reviewDraft({
      draftId,
      reviewer: "reviewer@example.com",
      decision: "APPROVE",
      checklist: {
        mathCorrect: true,
        wordingClear: true,
        tagsAccurate: true,
      },
    });

    assert.equal(status, "APPROVED_PROMOTED");
    assert.ok(promotedContentId, "Promoted content ID should be set");

    const draft = await service.getDraft(draftId);
    assert.equal(draft.status, "APPROVED_PROMOTED");
    assert.equal(draft.promotedContentId, promotedContentId);

    // Verify: Question exists with reviewStatus=APPROVED
    const questions = await prisma.question.findMany({
      where: { reviewStatus: "APPROVED" },
    });

    assert.equal(questions.length, 1);
    assert.equal(
      (questions[0] as Record<string, unknown>).id,
      promotedContentId,
    );
  });
});

describe("S14 — Canonical concept ID enforced", () => {
  it("rejects non-canonical conceptId", async () => {
    const prisma = mockPrisma();
    const validation = new ContentValidationService();
    const service = new ContentDraftService(prisma as unknown as ConstructorParameters<typeof ContentDraftService>[0], validation);

    const { draftId } = await service.createDraft({
      draftType: "QUESTION",
      conceptId: "C6_WORD_PROBLEMS", // Alias (non-canonical)
      difficulty: 5,
      payload: {
        type: "WORD_PROBLEM",
        stem: "Alice has 5 apples...",
        acceptedAnswers: { value: 5 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: {},
        hintLadder: {},
      },
      source: "HUMAN",
    });

    const result = await service.validateDraft({ draftId });

    assert.equal(result.status, "VALIDATION_FAILED");
    assert.ok(result.validationErrors);
    const conceptError = result.validationErrors.find((e) =>
      e.includes("Non-canonical conceptId"),
    );
    assert.ok(
      conceptError,
      "Validation should reject non-canonical concept ID",
    );
  });
});

describe("S15 — Deny-list language", () => {
  it("rejects content with clinical language", async () => {
    const prisma = mockPrisma();
    const validation = new ContentValidationService();
    const service = new ContentDraftService(prisma as unknown as ConstructorParameters<typeof ContentDraftService>[0], validation);

    const { draftId } = await service.createDraft({
      draftType: "QUESTION",
      conceptId: "C1_BASIC_SOLVING",
      difficulty: 5,
      payload: {
        type: "NUMERIC",
        stem: "This question tests if the student has ADHD-related focus issues: x + 1 = 3",
        acceptedAnswers: { value: 2 },
        questionIntent: "STANDARD",
        misconceptionsTested: [],
        prerequisiteConceptIds: [],
        solutionSteps: {},
        hintLadder: {},
      },
      source: "HUMAN", // Use HUMAN source to avoid needing feature flag
    });

    const result = await service.validateDraft({ draftId });

    assert.equal(result.status, "VALIDATION_FAILED");
    assert.ok(result.validationErrors);
    const languageError = result.validationErrors.find((e) =>
      e.includes("clinical/personality language"),
    );
    assert.ok(languageError, "Validation should reject clinical language");
  });
});
