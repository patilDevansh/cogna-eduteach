import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { OpenAIService } from "./openai.service";
import { isGenerateEnabled, isServeEnabled, resolveModel } from "./ai-orchestrator.formulas";

const DEFAULT_TIMEOUT_MS = 3000;

export interface OrchestratorCallInput<T> {
  /** Env-var namespace: reads AI_<capability>_GENERATE / AI_<capability>_SERVE / AI_<capability>_MODEL. */
  capability: string;
  studentId: string;
  sessionId?: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  /** The deterministic/rule-based output computed regardless of AI availability — always logged, so the audit trail has a comparison baseline even when the AI call never ran. */
  ruleOutput: unknown;
  /** Parses + validates the raw model response. Throw to reject (logged as a failed call, ruleOutput remains the caller's fallback). */
  parse: (raw: string) => T;
  timeoutMs?: number;
}

export interface OrchestratorCallResult<T> {
  /** Non-null only when the call succeeded AND passed `parse`. */
  aiOutput: T | null;
  /** True only when this capability's SERVE flag is on AND the call passed — shadow-mode capabilities never see served=true. */
  served: boolean;
}

/**
 * Shared foundation for every AI agent beyond the existing live-teaching
 * C-lite engine: per-capability GENERATE/SERVE env flags (same shape as
 * LIVE_AGENTIC_GENERATE/LIVE_AGENTIC_SERVE_GENERATED), a timeout, structured
 * output validation, and an audit-log row on every real call — the dataset
 * that later replaces the hardcoded SafetyEval/PolicyEngine stubs.
 *
 * Does not touch live-teaching-agent.service.ts — that engine keeps its own
 * flag names and stays exactly as tested today.
 */
@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly openai?: OpenAIService,
  ) {}

  async call<T>(input: OrchestratorCallInput<T>): Promise<OrchestratorCallResult<T>> {
    if (!isGenerateEnabled(input.capability, Boolean(this.openai?.isConfigured))) {
      // Off by default: no call, no audit row — matches the "no student-facing
      // change" principle for a disabled capability.
      return { aiOutput: null, served: false };
    }

    const model = resolveModel(input.capability, input.model);
    const started = Date.now();

    let aiOutput: T | null = null;
    let rawResponse: string | null = null;
    let passed = false;
    let failureReason: string | undefined;

    try {
      const raw = await this.withTimeout(
        this.callOpenAI(model, input.systemPrompt, input.userPrompt),
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      rawResponse = raw;
      aiOutput = input.parse(raw);
      passed = true;
    } catch (err) {
      failureReason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `AI_${input.capability} call failed, falling back to rule output: ${failureReason}`,
      );
    }

    const latencyMs = Date.now() - started;
    const served = isServeEnabled(input.capability, passed);

    await this.prisma.aiDecisionAuditLog.create({
      data: {
        capability: input.capability,
        studentId: input.studentId,
        sessionId: input.sessionId,
        model,
        ruleOutput: input.ruleOutput as Prisma.InputJsonValue,
        aiOutput: aiOutput ? (aiOutput as object as Prisma.InputJsonValue) : Prisma.JsonNull,
        rejectedOutput: !passed && rawResponse
          ? (() => {
              try {
                return JSON.parse(rawResponse) as Prisma.InputJsonValue;
              } catch {
                return { raw: rawResponse } as Prisma.InputJsonValue;
              }
            })()
          : Prisma.JsonNull,
        served,
        passed,
        failureReason,
        latencyMs,
      },
    });

    return { aiOutput: passed ? aiOutput : null, served };
  }

  private async callOpenAI(
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const client = this.openai!.getClient();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty completion");
    return raw;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}
