import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  assertStartDiagnosticV2SessionRequestShape,
  assertSubmitDiagnosticV2StepRequestShape,
  type DiagnosticV2DebugView,
  type DiagnosticV2SummaryResponse,
  type StartDiagnosticV2SessionResponse,
  type SubmitDiagnosticV2StepResponse,
} from "@cogna/shared";
import { DiagnosticV2SessionService } from "./diagnostic-v2-session.service";

/** Hand-written shape guards, same convention as the AI response validators — a malformed body is a 400, never a 500 from deeper in the stack. */
function validated<T>(assert: (v: unknown) => T, body: unknown): T {
  try {
    return assert(body);
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : "Invalid request body.");
  }
}

/**
 * The micro-skill step diagnostic's own surface (MVP 9.0.1 Phase A). Entirely
 * separate from /sessions and /learning-loop — no existing route changes
 * behaviour because this exists.
 *
 * Same known auth gap as /policy and /ai/shadow-gates: no production guard is
 * wired yet, which is fine for local/pilot use and must be closed before this
 * is exposed publicly (see COGNA 9.0.1/SKIPPED.md).
 */
@Controller("diagnostic-v2")
export class DiagnosticV2Controller {
  constructor(private readonly sessions: DiagnosticV2SessionService) {}

  @Post("sessions")
  start(@Body() body: unknown): Promise<StartDiagnosticV2SessionResponse> {
    const req = validated(assertStartDiagnosticV2SessionRequestShape, body);
    return this.sessions.startSession(req.studentId, req.track ?? "NEGATIVE_DISTRIBUTION");
  }

  @Post("sessions/:id/steps")
  submitStep(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubmitDiagnosticV2StepResponse> {
    return this.sessions.submitStep(id, validated(assertSubmitDiagnosticV2StepRequestShape, body));
  }

  /** Internal debug view behind the frontend's `?debug=1` panel: rule-vs-AI source per decision, the AI's stated reasoning, and each step's verification source. */
  @Get("sessions/:id")
  debugView(@Param("id") id: string): Promise<DiagnosticV2DebugView> {
    return this.sessions.getDebugView(id);
  }

  @Get("sessions/:id/summary")
  summary(@Param("id") id: string): Promise<DiagnosticV2SummaryResponse> {
    return this.sessions.getSummary(id);
  }
}
