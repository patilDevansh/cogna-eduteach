import { Body, Controller, Delete, Get, Headers, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { LotusSessionView, LotusStatusResponse } from "@cogna/shared";
import { assertStudentAccess, assertTeacher, assertWorker, resolveActor } from "../access/cogna-access";
import {
  OverrideLotusSessionDto,
  StartLotusSessionDto,
  SubmitLotusAnswerDto,
} from "./lotus.dto";
import { LotusService } from "./lotus.service";
import type { LotusReconcileResult } from "./lotus-reconcile";

/** A private seam for the local autonomous-evaluation runner. It is never
 * enabled in production, and a browser/student token cannot satisfy this
 * independent process token. Returning 404 instead of 401 prevents route
 * discovery from becoming an invitation to probe it. */
function assertAutonomousEvaluationAccess(headers: Record<string, string | string[] | undefined>): void {
  const configured = process.env.LOTUS_AUTONOMOUS_EVAL_TOKEN;
  const supplied = headers["x-lotus-autonomous-eval-token"];
  const token = Array.isArray(supplied) ? supplied[0] : supplied;
  if (process.env.NODE_ENV === "production" || !configured || !token) throw new NotFoundException();
  const left = Buffer.from(configured);
  const right = Buffer.from(token);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new NotFoundException();
}

/**
 * Local manual-testing convenience only: skips the teacher requirement on
 * the AI Studio observer route so one browser session can watch its own
 * live diagnostic hypotheses without a separate teacher login. Same
 * production hard-disable as assertAutonomousEvaluationAccess, and off by
 * default even outside production — must be explicitly opted into. Never
 * lower the bar on delete/export/reconcile this way; those stay
 * teacher-only regardless of this flag.
 */
function observerTeacherGateBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LOTUS_DEV_OBSERVER_BYPASS === "true";
}

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
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    const session = await this.lotus.get(id);
    assertStudentAccess(actor, session.studentId);
    return session;
  }

  /**
   * The AI Studio is a teacher-only observer surface. It reads the durable
   * projection so a teacher never mistakes a stale API instance for the
   * evidence record, while student requests remain redacted above.
   */
  @Get("sessions/:id/observer")
  async observer(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ): Promise<LotusSessionView> {
    const actor = resolveActor(headers);
    if (!observerTeacherGateBypassed()) assertTeacher(actor);
    const session = await this.lotus.getForObserver(id);
    assertStudentAccess(actor, session.studentId);
    return session;
  }

  /**
   * Test runner only — never proxy this route through the web app. The
   * response intentionally includes the answer key so a synthetic learner
   * can respond to a live-generated item; `assertAutonomousEvaluationAccess`
   * makes it absent in production and inaccessible to a student browser.
   */
  @Get("sessions/:id/autonomous-evaluation-question")
  evaluationQuestion(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ) {
    assertAutonomousEvaluationAccess(headers);
    return this.lotus.getEvaluationQuestion(id);
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
    assertTeacher(actor);
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
    assertTeacher(actor);
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
