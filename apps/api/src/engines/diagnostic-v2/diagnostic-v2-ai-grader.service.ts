/**
 * AI responsibility 3: grade the lines the rules genuinely cannot classify.
 *
 * Called only when linear-bracket-verifier returns PARSE_FAILED or AMBIGUOUS —
 * never on a line the deterministic verifier already decided. That ordering is
 * the whole safety story: rules are always tried first and always win when
 * they have an answer.
 *
 * Note this is a *new* hot path, separate from the existing Attempt/Tx1-Tx4
 * flow, which keeps its zero-LLM-calls invariant untouched. A short bounded
 * wait is acceptable here precisely because this only fires on the rare
 * exceptional case, not on every submission.
 *
 * Fails closed: on any error, timeout, disabled flag, or unusable response the
 * step stays exactly as the rules left it, still unresolved. Silence is never
 * read as "correct".
 */
import { Injectable, Logger } from "@nestjs/common";
import {
  assertDiagnosticV2GraderResultShape,
  containsForbiddenTerm,
  type DiagnosticV2GraderResult,
} from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";

const CAPABILITY = "DIAGNOSTIC_V2_GRADER";
const TIMEOUT_MS = 2000;

export interface GraderContext {
  studentId: string;
  sessionId: string;
  previousLine: string;
  submittedLine: string;
  /** Why the deterministic verifier couldn't decide — given to the model as context, not as a hint about the answer. */
  parseError?: string;
}

export interface GraderOutcome {
  /** null means "still unresolved" — the caller keeps the rules' own AMBIGUOUS/PARSE_FAILED result. */
  validity: "VALID" | "INVALID" | null;
  confidence?: number;
  reasoning?: string;
}

@Injectable()
export class DiagnosticV2AiGraderService {
  private readonly logger = new Logger(DiagnosticV2AiGraderService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  async grade(ctx: GraderContext): Promise<GraderOutcome> {
    const { system, user } = buildGraderPrompts(ctx);

    const result = await this.orchestrator.call<DiagnosticV2GraderResult>({
      capability: CAPABILITY,
      studentId: ctx.studentId,
      sessionId: ctx.sessionId,
      systemPrompt: system,
      userPrompt: user,
      // The rules abstained, which is exactly what gets logged as the baseline.
      ruleOutput: { validity: "AMBIGUOUS", parseError: ctx.parseError ?? null },
      parse: (raw) => this.parseAndValidate(raw),
      timeoutMs: TIMEOUT_MS,
    });

    if (!result.aiOutput || !result.served) {
      return { validity: null };
    }

    this.logger.log(
      JSON.stringify({
        event: "diagnostic_v2_grader.served",
        sessionId: ctx.sessionId,
        validity: result.aiOutput.validity,
        confidence: result.aiOutput.confidence,
      }),
    );

    return {
      validity: result.aiOutput.validity,
      confidence: result.aiOutput.confidence,
      reasoning: result.aiOutput.reasoning,
    };
  }

  private parseAndValidate(raw: string): DiagnosticV2GraderResult {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertDiagnosticV2GraderResultShape(body);
    // graderReasoning can become firstInvalidActionDescription on the response —
    // voice-clean it the same way every other student-visible AI string is.
    if (containsForbiddenTerm(shaped.reasoning)) {
      throw new Error("grader reasoning contains a forbidden term");
    }
    return shaped;
  }
}

export function buildGraderPrompts(ctx: GraderContext): { system: string; user: string } {
  const system =
    "You are checking one line of a student's algebra working. An automatic checker could not read " +
    "this line, so you are the fallback. Decide only one thing: does the student's new line follow " +
    "validly from the line above it — same solution, same meaning? Alternative valid methods are " +
    "acceptable; the student does not have to follow any particular sequence. " +
    "Judge the mathematics only. Say nothing about the student themselves. " +
    'Return JSON only: {"validity":"VALID"|"INVALID","confidence":number 0..1,"reasoning":string one short sentence}. ' +
    "If you cannot tell with reasonable confidence, return INVALID only when you are sure it is wrong; " +
    "otherwise give your best reading with a low confidence value. No other keys.";

  const user = [
    `Previous line: ${ctx.previousLine}`,
    `Student's new line: ${ctx.submittedLine}`,
    ctx.parseError ? `Why the automatic checker gave up: ${ctx.parseError}` : "",
    "Does the new line follow validly from the previous one?",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
