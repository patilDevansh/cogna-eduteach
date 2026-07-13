import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { QuestionGeneratorService } from "../engines/question-generator/question-generator.service";
import { ContentReviewInput, ContentService } from "./content.service";
import {
  ContentDraftService,
  CreateDraftInput,
  ReviewDraftInput,
} from "./content-draft.service";
import type { DraftStatus, DraftSource } from "@cogna/shared/contracts/content-drafts";

@Controller("content")
export class ContentController {
  constructor(
    private readonly questions: QuestionGeneratorService,
    private readonly content: ContentService,
    private readonly drafts: ContentDraftService,
  ) {}

  /** Staging approval gate status (R12 / content-approval-gate CLI). */
  @Get("approval-gate")
  approvalGate() {
    return this.questions.approvalGateStatus();
  }

  /** Record human review decision and update question reviewStatus. */
  @Post("review/:questionId")
  reviewQuestion(
    @Param("questionId") questionId: string,
    @Body() body: ContentReviewInput,
  ) {
    return this.content.reviewQuestion(questionId, body);
  }

  // ─── MVP 3.0 — Content Draft Pipeline ─────────────────────────────────────

  /** Create a new content draft (human, LLM-assisted, or programmatic). */
  @Post("drafts")
  createDraft(@Body() body: CreateDraftInput) {
    return this.drafts.createDraft(body);
  }

  /** Validate a draft using content-validation-rules-v1. */
  @Post("drafts/:id/validate")
  validateDraft(@Param("id") draftId: string) {
    return this.drafts.validateDraft({ draftId });
  }

  /** Human review and decision: approve or reject a validated draft. */
  @Post("drafts/:id/review")
  reviewDraft(@Param("id") draftId: string, @Body() body: Omit<ReviewDraftInput, "draftId">) {
    return this.drafts.reviewDraft({ draftId, ...body });
  }

  /** Get draft by ID (admin/review UI). */
  @Get("drafts/:id")
  getDraft(@Param("id") draftId: string) {
    return this.drafts.getDraft(draftId);
  }

  /** List drafts by status/source (admin/review UI). */
  @Get("drafts")
  listDrafts(
    @Query("status") status?: DraftStatus,
    @Query("source") source?: DraftSource,
    @Query("limit") limit?: string,
  ) {
    return this.drafts.listDrafts({
      status,
      source,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
