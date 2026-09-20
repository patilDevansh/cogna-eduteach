import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from "@nestjs/common";
import type { LotusSessionView, LotusStatusResponse } from "@cogna/shared";
import { assertStudentAccess, assertTeacher, assertWorker, resolveActor } from "../access/cogna-access";
import {
  OverrideLotusSessionDto,
  StartLotusSessionDto,
  SubmitLotusAnswerDto,
} from "./lotus.dto";
import { LotusService } from "./lotus.service";
import type { LotusReconcileResult } from "./lotus-reconcile";

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
    return this.lotus.start(body.studentId, body.topic);
  }

  @Get("sessions/:id")
  async get(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Query("source") source?: string,
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    // Observer/AI-Lab reads ask for the durable projection directly,
    // bypassing whichever API instance's in-process cache happens to answer
    // — the student's own polling still hits the fast in-memory path.
    const session = source === "db" ? await this.lotus.getForObserver(id) : await this.lotus.get(id);
    assertStudentAccess(actor, session.studentId);
    return session;
  }

  @Get("sessions/:id/reconcile")
  async reconcile(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ): Promise<LotusReconcileResult> {
    assertTeacher(resolveActor(headers));
    return this.lotus.reconcileSession(id);
  }

  /**
   * §11 "Unseen Plan": the next unshown slots' plain-language plan and
   * readiness. Never answer keys or question text — the same trust tier as
   * the rest of the observer/AI-Lab data on GET .../sessions/:id, so it uses
   * the same access rule (the session's own student, a teacher, or a
   * worker), not the stricter teacher-only gate on delete/export/reconcile.
   */
  @Get("sessions/:id/unseen-plan")
  async unseenPlan(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ) {
    const actor = resolveActor(headers);
    const session = await this.lotus.get(id);
    assertStudentAccess(actor, session.studentId);
    return this.lotus.unseenPlan(id);
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
      questionId: body.questionId,
      nextQuestionId: body.nextQuestionId,
      submissionId: body.submissionId,
    });
  }

  @Get("sessions/:id/demo-fill")
  demoFill(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Query("studentId") studentId: string,
  ): Promise<{ answer: string; working: string; confidence: number }> {
    const actor = resolveActor(headers);
    assertStudentAccess(actor, studentId);
    return this.lotus.demoFill(id, studentId);
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

  /** Drains durable outbox jobs a crashed or racing instance never got to run. Worker-only, matching the other job types under apps/api/src/jobs/. */
  @Post("jobs/run-outbox")
  runOutbox(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ claimed: number; completed: number; failed: number }> {
    assertWorker(resolveActor(headers));
    return this.lotus.processPendingOutboxJobs();
  }

  @Delete("students/:studentId")
  async deleteStudentData(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("studentId") studentId: string,
  ): Promise<{ deletedSessions: number }> {
    assertTeacher(resolveActor(headers));
    return this.lotus.deleteStudentData(studentId);
  }

  @Get("students/:studentId/export")
  async exportStudentData(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("studentId") studentId: string,
  ) {
    assertTeacher(resolveActor(headers));
    return this.lotus.exportStudentData(studentId);
  }

  /** Live-model call/token/cost telemetry since this process started. Teacher/admin only — never a student-facing route. */
  @Get("cost-telemetry")
  getCostTelemetry(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertTeacher(resolveActor(headers));
    return this.lotus.getCostTelemetry();
  }
}
