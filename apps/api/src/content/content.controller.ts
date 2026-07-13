import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { QuestionGeneratorService } from "../engines/question-generator/question-generator.service";
import { ContentReviewInput, ContentService } from "./content.service";

@Controller("content")
export class ContentController {
  constructor(
    private readonly questions: QuestionGeneratorService,
    private readonly content: ContentService,
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
}
