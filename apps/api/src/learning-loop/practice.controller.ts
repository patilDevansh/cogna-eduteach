import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { HintRequestedEvent } from "@cogna/shared";
import { LearningLoopService } from "./learning-loop.service";
import { AnswerSubmittedDto } from "./dto/answer-submitted.dto";
import { ExplanationViewedDto } from "./dto/explanation-viewed.dto";

@Controller("practice")
export class PracticeController {
  constructor(private readonly loop: LearningLoopService) {}

  @Get("next")
  getNext(
    @Query("sessionId") sessionId: string,
    @Query("studentId") studentId: string,
  ) {
    return this.loop.getNextForSession(sessionId, studentId);
  }

  @Post("answer")
  submitAnswer(@Body() body: AnswerSubmittedDto) {
    return this.loop.processAnswer({
      ...body,
      selfRatedConfidence: body.selfRatedConfidence ?? null,
    });
  }

  @Post("explanation-viewed")
  explanationViewed(@Body() body: ExplanationViewedDto) {
    return this.loop.processExplanationViewed(body);
  }

  @Post("hint")
  requestHint(@Body() body: HintRequestedEvent) {
    return this.loop.processHint(body);
  }
}
