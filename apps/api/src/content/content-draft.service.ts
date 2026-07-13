import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ContentValidationService } from "./content-validation.service";
import type {
  DraftStatus,
  DraftType,
  DraftSource,
} from "@cogna/shared/contracts/content-drafts";

export interface CreateDraftInput {
  draftType: DraftType;
  conceptId: string;
  difficulty?: number;
  targetMisconception?: string;
  payload: Record<string, unknown>;
  source: DraftSource;
  provider?: string;
  promptVersion?: string;
}

export interface ValidateDraftInput {
  draftId: string;
}

export interface ReviewDraftInput {
  draftId: string;
  reviewer: string;
  decision: "APPROVE" | "REJECT";
  reviewNotes?: string;
  checklist: {
    mathCorrect: boolean;
    wordingClear: boolean;
    tagsAccurate: boolean;
    llmRecheckComplete?: boolean; // MVP 3.0: LLM math rechecked by human
  };
}

@Injectable()
export class ContentDraftService {
  private readonly logger = new Logger(ContentDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ContentValidationService,
  ) {}

  /**
   * Create a new content draft.
   * LLM_ASSISTED drafts are only created when CONTENT_LLM_DRAFTS_ENABLED=true.
   */
  async createDraft(input: CreateDraftInput): Promise<{
    draftId: string;
    status: DraftStatus;
  }> {
    // Gate LLM-assisted drafts behind feature flag
    const contentLlmDraftsEnabled = process.env.CONTENT_LLM_DRAFTS_ENABLED === "true";
    if (input.source === "LLM_ASSISTED" && !contentLlmDraftsEnabled) {
      throw new BadRequestException(
        "LLM-assisted drafts require CONTENT_LLM_DRAFTS_ENABLED=true",
      );
    }

    const draft = await this.prisma.contentDraft.create({
      data: {
        draftType: input.draftType,
        conceptId: input.conceptId,
        difficulty: input.difficulty ?? null,
        targetMisconception: input.targetMisconception ?? null,
        payload: input.payload,
        source: input.source,
        provider: input.provider ?? null,
        promptVersion: input.promptVersion ?? null,
        status: "DRAFT",
        validationErrors: null,
        reviewNotes: null,
        promotedContentId: null,
      },
    });

    this.logger.log(
      `Created ${input.source} draft ${draft.id} for concept ${input.conceptId}`,
    );

    return {
      draftId: draft.id,
      status: "DRAFT" as DraftStatus,
    };
  }

  /**
   * Validate a draft using content-validation-rules-v1.
   * Transitions: DRAFT → VALIDATED | VALIDATION_FAILED
   */
  async validateDraft(input: ValidateDraftInput): Promise<{
    draftId: string;
    status: DraftStatus;
    validationErrors?: string[];
  }> {
    const draft = await this.prisma.contentDraft.findUnique({
      where: { id: input.draftId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${input.draftId} not found`);
    }

    if (draft.status !== "DRAFT" && draft.status !== "VALIDATION_FAILED") {
      throw new BadRequestException(
        `Cannot validate draft with status ${draft.status}`,
      );
    }

    this.logger.log(`Validating draft ${input.draftId}`);

    // Run validation rules
    const validationResult = await this.validation.validateContent({
      draftType: draft.draftType as DraftType,
      conceptId: draft.conceptId,
      difficulty: draft.difficulty ?? undefined,
      targetMisconception: draft.targetMisconception ?? undefined,
      payload: draft.payload as Record<string, unknown>,
    });

    const newStatus = validationResult.valid
      ? "VALIDATED"
      : "VALIDATION_FAILED";

    await this.prisma.contentDraft.update({
      where: { id: input.draftId },
      data: {
        status: newStatus,
        validationErrors: validationResult.errors ?? null,
      },
    });

    this.logger.log(
      `Draft ${input.draftId} validation: ${newStatus}${validationResult.errors ? ` (${validationResult.errors.length} errors)` : ""}`,
    );

    return {
      draftId: input.draftId,
      status: newStatus as DraftStatus,
      validationErrors: validationResult.errors,
    };
  }

  /**
   * Human review and decision: approve or reject.
   * VALIDATED → PENDING_REVIEW → APPROVED_PROMOTED | REJECTED
   */
  async reviewDraft(input: ReviewDraftInput): Promise<{
    draftId: string;
    status: DraftStatus;
    promotedContentId?: string;
  }> {
    const draft = await this.prisma.contentDraft.findUnique({
      where: { id: input.draftId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${input.draftId} not found`);
    }

    // Enforce validation gate: only VALIDATED drafts can be reviewed
    if (draft.status !== "VALIDATED" && draft.status !== "PENDING_REVIEW") {
      throw new BadRequestException(
        `Cannot review draft with status ${draft.status}. Draft must be VALIDATED first.`,
      );
    }

    const { mathCorrect, wordingClear, tagsAccurate, llmRecheckComplete } =
      input.checklist;

    // Enforce checklist requirements for approval
    if (input.decision === "APPROVE") {
      if (!mathCorrect || !wordingClear || !tagsAccurate) {
        throw new BadRequestException(
          "Cannot APPROVE when checklist items are false",
        );
      }

      // LLM-assisted drafts require human recheck
      if (draft.source === "LLM_ASSISTED" && !llmRecheckComplete) {
        throw new BadRequestException(
          "LLM-assisted drafts require llmRecheckComplete=true for approval",
        );
      }
    }

    if (input.decision === "APPROVE") {
      // Promote to APPROVED bank
      const promotedContentId = await this.promoteDraft(draft.id);

      await this.prisma.contentDraft.update({
        where: { id: input.draftId },
        data: {
          status: "APPROVED_PROMOTED",
          reviewNotes: input.reviewNotes ?? null,
          promotedContentId,
        },
      });

      this.logger.log(
        `Draft ${input.draftId} APPROVED and promoted to ${promotedContentId}`,
      );

      return {
        draftId: input.draftId,
        status: "APPROVED_PROMOTED" as DraftStatus,
        promotedContentId,
      };
    } else {
      // Reject
      await this.prisma.contentDraft.update({
        where: { id: input.draftId },
        data: {
          status: "REJECTED",
          reviewNotes: input.reviewNotes ?? null,
        },
      });

      this.logger.log(`Draft ${input.draftId} REJECTED: ${input.reviewNotes}`);

      return {
        draftId: input.draftId,
        status: "REJECTED" as DraftStatus,
      };
    }
  }

  /**
   * Promote an APPROVED draft to the production question/explanation bank.
   * Returns the promoted content ID.
   */
  private async promoteDraft(draftId: string): Promise<string> {
    const draft = await this.prisma.contentDraft.findUniqueOrThrow({
      where: { id: draftId },
    });

    if (draft.draftType === "QUESTION") {
      // Create a new Question with reviewStatus=APPROVED
      const payload = draft.payload as {
        type: "NUMERIC" | "MCQ" | "WORD_PROBLEM";
        stem: string;
        acceptedAnswers: unknown; // Json field
        options?: unknown; // Json field
        solutionSteps?: unknown; // Json field
        hintLadder?: unknown; // Json field
        questionIntent?: string;
        misconceptionsTested?: string[];
        misconceptionPatterns?: unknown;
        prerequisiteConceptIds?: string[];
      };

      const question = await this.prisma.question.create({
        data: {
          id: `Q${Date.now()}`,
          conceptId: draft.conceptId,
          type: payload.type,
          difficulty: draft.difficulty ?? 5,
          stem: payload.stem,
          acceptedAnswers: payload.acceptedAnswers ?? {},
          options: payload.options ?? null,
          solutionSteps: payload.solutionSteps ?? {},
          hintLadder: payload.hintLadder ?? {},
          questionIntent: payload.questionIntent ?? "STANDARD",
          misconceptionsTested: payload.misconceptionsTested ?? [],
          misconceptionPatterns: payload.misconceptionPatterns ?? null,
          prerequisiteConceptIds: payload.prerequisiteConceptIds ?? [],
          version: 1,
          reviewStatus: "APPROVED",
          // Note: draftOriginId would need to be added to schema
        },
      });

      return question.id;
    } else if (draft.draftType === "EXPLANATION_TEMPLATE") {
      // Create a new Explanation with reviewStatus=APPROVED
      const payload = draft.payload as {
        misconceptionId: string;
        conceptId: string;
        style: string;
        content: string;
        checkForUnderstanding?: string;
      };

      const explanation = await this.prisma.explanation.create({
        data: {
          id: `E${Date.now()}`,
          misconceptionId: payload.misconceptionId ?? null,
          conceptId: payload.conceptId,
          style: payload.style ?? "DIAGNOSTIC",
          content: payload.content,
          checkForUnderstanding: payload.checkForUnderstanding ?? null,
          version: 1,
          reviewStatus: "APPROVED",
          // Note: draftOriginId would need to be added to schema
        },
      });

      return explanation.id;
    } else {
      throw new BadRequestException(
        `Promotion not implemented for draftType ${draft.draftType}`,
      );
    }
  }

  /**
   * Get draft by ID (admin/review UI).
   */
  async getDraft(draftId: string) {
    const draft = await this.prisma.contentDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    return {
      id: draft.id,
      draftType: draft.draftType,
      conceptId: draft.conceptId,
      difficulty: draft.difficulty ?? undefined,
      targetMisconception: draft.targetMisconception ?? undefined,
      payload: draft.payload,
      source: draft.source,
      provider: draft.provider ?? undefined,
      promptVersion: draft.promptVersion ?? undefined,
      status: draft.status,
      validationErrors:
        draft.validationErrors &&
        typeof draft.validationErrors === "object" &&
        Array.isArray(draft.validationErrors)
          ? (draft.validationErrors as string[])
          : undefined,
      reviewNotes: draft.reviewNotes ?? undefined,
      promotedContentId: draft.promotedContentId ?? undefined,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  /**
   * List drafts by status (admin/review UI).
   */
  async listDrafts(input: {
    status?: DraftStatus;
    source?: DraftSource;
    limit?: number;
  }) {
    const drafts = await this.prisma.contentDraft.findMany({
      where: {
        status: input.status,
        source: input.source,
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 50,
    });

    return {
      drafts: drafts.map((d) => ({
        id: d.id,
        draftType: d.draftType,
        conceptId: d.conceptId,
        difficulty: d.difficulty ?? undefined,
        status: d.status,
        source: d.source,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }
}
