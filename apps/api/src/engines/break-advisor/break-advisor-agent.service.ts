import { Injectable, Logger } from "@nestjs/common";
import { assertBreakRecommendationShape, type BreakRecommendation } from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import { agreesWithRule, buildBreakPrompts, clampBreakMinutes, type BreakContext } from "./break-advisor.formulas";

const CAPABILITY = "BREAK_ADVISOR";

/**
 * Shadow-mode agent: given the same fatigue signals the rule-based hard gate
 * already uses, asks whether a break should be suggested right now and for
 * how long. Purely for offline comparison — there is no path from this
 * service back into what a student actually sees. The rule-based fatigue
 * gate in decision-engine.service.ts is completely unchanged by this agent's
 * existence.
 */
@Injectable()
export class BreakAdvisorAgentService {
  private readonly logger = new Logger(BreakAdvisorAgentService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  /** Call from learning-loop.service.ts after a decision is computed — fire-and-forget, never blocks the response. */
  evaluateInBackground(studentId: string, sessionId: string, ctx: BreakContext): void {
    this.evaluate(studentId, sessionId, ctx).catch((err) => {
      this.logger.warn(
        `Break advisor shadow run failed for session ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  async evaluate(
    studentId: string,
    sessionId: string,
    ctx: BreakContext,
  ): Promise<BreakRecommendation | null> {
    const { system, user } = buildBreakPrompts(ctx);
    const ruleOutput = { suggestBreak: ctx.ruleSuggestsBreak, minutes: ctx.ruleSuggestsBreak ? undefined : null };

    const result = await this.orchestrator.call<BreakRecommendation>({
      capability: CAPABILITY,
      studentId,
      sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput,
      parse: (raw) => this.parseAndValidate(raw),
      timeoutMs: 2000, // this is a hot-path-adjacent signal — keep it tight even though nothing is served yet
    });

    if (!result.aiOutput) return null;

    this.logger.log(
      JSON.stringify({
        event: "break_advisor.shadow",
        studentId,
        sessionId,
        served: result.served,
        ruleSuggestsBreak: ctx.ruleSuggestsBreak,
        aiSuggestsBreak: result.aiOutput.suggestBreak,
        agrees: agreesWithRule(ctx.ruleSuggestsBreak, result.aiOutput.suggestBreak),
      }),
    );

    return result.aiOutput;
  }

  private parseAndValidate(raw: string): BreakRecommendation {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertBreakRecommendationShape({
      suggestBreak: body.suggestBreak,
      minutes: clampBreakMinutes(Number(body.minutes)),
      confidence: body.confidence,
      reasoning: body.reasoning,
    });
    return shaped;
  }
}
