import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import type { LotusSessionView, LotusStatusResponse } from "@cogna/shared";
import { assertStudentAccess, resolveActor } from "../access/cogna-access";
import {
  OverrideLotusSessionDto,
  StartLotusSessionDto,
  SubmitLotusAnswerDto,
} from "./lotus.dto";
import { LotusService } from "./lotus.service";

/**
 * Experimental AI Lab only. This deliberately does not share routes, storage,
 * or conclusions with the validated diagnostic-v2 engine.
 */
@Controller("lotus")
export class LotusController {
  constructor(private readonly lotus: LotusService) {}

  @Get("status")
  status(): LotusStatusResponse {
    return this.lotus.status();
  }

  @Post("sessions")
  start(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: StartLotusSessionDto,
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    assertStudentAccess(actor, body.studentId);
    return this.lotus.start(body.studentId);
  }

  @Get("sessions/:id")
  async get(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    const session = await this.lotus.get(id);
    assertStudentAccess(actor, session.studentId);
    return session;
  }

  @Post("sessions/:id/answers")
  answer(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: SubmitLotusAnswerDto,
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    assertStudentAccess(actor, body.studentId);
    return this.lotus.answer(id, body.studentId, {
      answer: body.didNotKnow ? "I don't know" : body.answer,
      working: body.working,
      confidence: body.confidence,
      responseTimeMs: body.responseTimeMs,
      didNotKnow: body.didNotKnow,
    });
  }

  @Post("sessions/:id/override")
  override(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: OverrideLotusSessionDto,
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    assertStudentAccess(actor, body.studentId);
    return this.lotus.override(id, body.studentId, body.action);
  }
}
