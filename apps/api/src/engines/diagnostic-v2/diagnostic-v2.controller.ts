import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  assertStartDiagnosticV2SessionRequestShape,
  assertSubmitDiagnosticV2StepRequestShape,
  type DiagnosticV2DebugView,
  type DiagnosticV2SummaryResponse,
  type StartDiagnosticV2SessionResponse,
  type SubmitDiagnosticV2StepResponse,
} from "@cogna/shared";
import { StudentAccessService } from "../../access/student-access.service";
import { DiagnosticV2SessionService } from "./diagnostic-v2-session.service";

/** Hand-written shape guards, same convention as the AI response validators — a malformed body is a 400, never a 500 from deeper in the stack. */
function validated<T>(assert: (v: unknown) => T, body: unknown): T {
  try {
    return assert(body);
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : "Invalid request body.");
  }
}

type RequestHeaders = Record<string, string | string[] | undefined>;

/**
 * The micro-skill step diagnostic's own surface (MVP 9.0.1 Phase A). Entirely
 * separate from /sessions and /learning-loop — no existing route changes
 * behaviour because this exists.
 *
 * Access: only the student may start a session or submit steps; the student, their teacher or
 * the worker may read it (StudentAccessService).
 */
@Controller("diagnostic-v2")
export class DiagnosticV2Controller {
  constructor(
    private readonly sessions: DiagnosticV2SessionService,
    private readonly access: StudentAccessService,
  ) {}

  @Post("sessions")
  start(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<StartDiagnosticV2SessionResponse> {
    const req = validated(assertStartDiagnosticV2SessionRequestShape, body);
    this.access.write(headers, req.studentId);
    return this.sessions.startSession(req.studentId, req.track ?? "NEGATIVE_DISTRIBUTION");
  }

  @Post("sessions/:id/steps")
  async submitStep(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubmitDiagnosticV2StepResponse> {
    await this.access.diagnosticSession(headers, id, "write");
    return this.sessions.submitStep(id, validated(assertSubmitDiagnosticV2StepRequestShape, body));
  }

  /** Internal debug view behind the frontend's `?debug=1` panel: rule-vs-AI source per decision, the AI's stated reasoning, and each step's verification source. */
  @Get("sessions/:id")
  async debugView(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<DiagnosticV2DebugView> {
    await this.access.diagnosticSession(headers, id, "read");
    return this.sessions.getDebugView(id);
  }

  /** Local-only evidence feed: append-only copy/paste text rows recorded while testing the diagnostic. */
  @Get("sessions/:id/evidence")
  async evidence(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<unknown> {
    await this.access.diagnosticSession(headers, id, "read");
    return this.sessions.getEvidenceRecords(id);
  }

  @Get("sessions/:id/summary")
  async summary(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<DiagnosticV2SummaryResponse> {
    await this.access.diagnosticSession(headers, id, "read");
    return this.sessions.getSummary(id);
  }
}
