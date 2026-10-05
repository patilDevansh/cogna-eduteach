import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import type { HintRequestedEvent } from "@cogna/shared";
import { StudentAccessService } from "../access/student-access.service";
import { LearningLoopService } from "./learning-loop.service";
import { AnswerSubmittedDto } from "./dto/answer-submitted.dto";
import { ExplanationViewedDto } from "./dto/explanation-viewed.dto";
import { SkipQuestionDto } from "./dto/skip-question.dto";
import { UpdateAttemptConfidenceDto } from "./dto/update-attempt-confidence.dto";

type RequestHeaders = Record<string, string | string[] | undefined>;

/** Every practice event acts for one student in one of their sessions: only that student may send it. */
@Controller("practice")
export class PracticeController {
  constructor(
    private readonly loop: LearningLoopService,
    private readonly access: StudentAccessService,
  ) {}

  @Get("next")
  async getNext(
    @Headers() headers: RequestHeaders,
    @Query("sessionId") sessionId: string,
    @Query("studentId") studentId: string,
  ) {
    await this.access.writeLearningSession(headers, sessionId, studentId);
    return this.loop.getNextForSession(sessionId, studentId);
  }

  @Post("answer")
  async submitAnswer(@Headers() headers: RequestHeaders, @Body() body: AnswerSubmittedDto) {
    await this.access.writeLearningSession(headers, body.sessionId, body.studentId);
    return this.loop.processAnswer({
      ...body,
      selfRatedConfidence: body.selfRatedConfidence ?? null,
    });
  }

  @Post("explanation-viewed")
  async explanationViewed(@Headers() headers: RequestHeaders, @Body() body: ExplanationViewedDto) {
    await this.access.writeLearningSession(headers, body.sessionId, body.studentId);
    return this.loop.processExplanationViewed(body);
  }

  @Post("hint")
  async requestHint(@Headers() headers: RequestHeaders, @Body() body: HintRequestedEvent) {
    await this.access.writeLearningSession(headers, body.sessionId, body.studentId);
    return this.loop.processHint(body);
  }

  @Post("skip")
  async skipQuestion(@Headers() headers: RequestHeaders, @Body() body: SkipQuestionDto) {
    await this.access.writeLearningSession(headers, body.sessionId, body.studentId);
    return this.loop.processSkip(body);
  }

  @Patch("attempts/:attemptId/confidence")
  updateAttemptConfidence(
    @Headers() headers: RequestHeaders,
    @Param("attemptId") attemptId: string,
    @Body() body: UpdateAttemptConfidenceDto,
  ) {
    // The service also checks the attempt belongs to body.studentId.
    this.access.write(headers, body.studentId);
    return this.loop.updateAttemptConfidence(
      attemptId,
      body.studentId,
      body.selfRatedConfidence,
    );
  }
}
