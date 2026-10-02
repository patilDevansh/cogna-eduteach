import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusReserveIntent,
} from "@cogna/shared";
import { OpenAIService } from "../ai/openai.service";
import { LotusLatencyPolicy, type LotusCallKind } from "./lotus-latency-policy";
import { LotusCostTracker, type LotusCostSnapshot } from "./lotus-cost-tracker";

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model returned no JSON object.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} response was not a JSON object.`);
  }
}

function assertStringField(value: Record<string, unknown>, field: string, label: string): void {
  if (typeof value[field] !== "string" || !String(value[field]).trim()) {
    throw new Error(`${label} response is missing ${field}.`);
  }
}

/**
 * How long an account-level provider failure (no credits, bad key) makes
 * calls fail fast before one probe call is allowed through again.
 */
export const PROVIDER_OUTAGE_PROBE_MS = 60_000;

export interface LotusProviderOutage {
  kind: "NO_CREDITS" | "AUTH";
  /** Plain-English, safe to show a teacher or developer. */
  reason: string;
  /** The provider's own message, for logs and dev views. */
  detail: string;
  at: number;
}

/** Thrown instead of calling the provider while an account-level outage is fresh. */
export class LotusProviderUnavailableError extends ServiceUnavailableException {
  constructor(readonly outage: LotusProviderOutage) {
    super(`AI provider unavailable: ${outage.reason}`);
  }
}

/**
 * Account-level failures that retrying cannot fix. A plain 429 rate limit is
 * transient and deliberately NOT treated as an outage.
 */
export function classifyProviderError(error: unknown): Omit<LotusProviderOutage, "at"> | null {
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (status === 429 && (code === "insufficient_quota" || code === "credit_balance_exhausted" || /credits? remaining|insufficient[_ ]quota|billing/i.test(message))) {
    return { kind: "NO_CREDITS", reason: "the AI provider account has no credits left", detail: message };
  }
  if (status === 401 || status === 403 || code === "invalid_api_key") {
    return { kind: "AUTH", reason: "the AI provider rejected the API key", detail: message };
  }
  return null;
}

export class LotusModelService {
  readonly primaryModel: string;
  readonly challengerModel: string;
  private readonly latency: LotusLatencyPolicy;
  private readonly costTracker = new LotusCostTracker();
  private outage: LotusProviderOutage | null = null;

  constructor(
    private readonly openai: OpenAIService,
    private readonly config: ConfigService,
  ) {
    this.primaryModel = this.config.get<string>("LOTUS_OPENAI_MODEL") ?? "gpt-5.6-terra";
    this.challengerModel =
      this.config.get<string>("LOTUS_CHALLENGER_MODEL") ?? "gpt-5.6-sol";
    this.latency = new LotusLatencyPolicy({
      LOTUS_LATENCY_MODE: this.config.get<string>("LOTUS_LATENCY_MODE"),
      LOTUS_MAX_OUTPUT_TOKENS: this.config.get<string>("LOTUS_MAX_OUTPUT_TOKENS"),
      LOTUS_MODEL_TIMEOUT_MS: this.config.get<string>("LOTUS_MODEL_TIMEOUT_MS"),
    });
  }

  get status(): {
    enabled: boolean;
    ready: boolean;
    missingConfiguration: string[];
    progressiveStreamingEnabled: boolean;
    unavailableReason?: string;
  } {
    const enabled = this.config.get<string>("LOTUS_EXPERIMENTAL_ENABLED") !== "false";
    const missingConfiguration: string[] = [];
    if (!this.openai.isConfigured) missingConfiguration.push("OPENAI_API_KEY");
    const outage = this.activeOutage;
    return {
      enabled,
      ready: enabled && missingConfiguration.length === 0 && !outage,
      missingConfiguration,
      progressiveStreamingEnabled: this.progressiveStreamingEnabled,
      ...(outage ? { unavailableReason: `Lotus can't reach its AI right now: ${outage.reason}.` } : {}),
    };
  }

  /** The current account-level outage, if it's fresh enough that another call would just fail again. */
  get activeOutage(): LotusProviderOutage | null {
    if (!this.outage) return null;
    return Date.now() - this.outage.at < PROVIDER_OUTAGE_PROBE_MS ? this.outage : null;
  }

  /** The last account-level outage, even if a probe is now allowed. Cleared by any successful call. */
  get lastOutage(): LotusProviderOutage | null {
    return this.outage;
  }

  /**
   * Kill switch for the stage-by-stage progress a polling client can observe
   * mid-answer. Purely additive and observational — flipping this off (the
   * default is on) reverts to the original blocking behaviour with zero code
   * changes, if a better latency fix supersedes it.
   */
  get progressiveStreamingEnabled(): boolean {
    return this.config.get<string>("LOTUS_PROGRESSIVE_STREAMING_ENABLED") !== "false";
  }

  /** Snapshot of live-model call counts, token usage, and cost (where a price is configured) since this process started. */
  get costTelemetry(): LotusCostSnapshot {
    return this.costTracker.snapshot();
  }

  assertReady(): void {
    const status = this.status;
    if (!status.enabled) {
      throw new ServiceUnavailableException("Cogna Lotus is disabled. Set LOTUS_EXPERIMENTAL_ENABLED=true.");
    }
    if (!status.ready) {
      throw new ServiceUnavailableException(
        status.unavailableReason ?? `Cogna Lotus needs: ${status.missingConfiguration.join(", ")}.`,
      );
    }
  }

  async primaryAssessment(prompt: string): Promise<LotusModelAssessment> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary", "assessment");
    assertObject(value, "GPT primary assessment");
    assertStringField(value, "mathJudgment", "GPT primary assessment");
    assertStringField(value, "proposedAction", "GPT primary assessment");
    return value as unknown as LotusModelAssessment;
  }

  async challengerAssessment(prompt: string): Promise<LotusModelAssessment> {
    const value = await this.callOpenAi(prompt, this.challengerModel, "GPT challenger", "assessment");
    assertObject(value, "GPT challenger assessment");
    assertStringField(value, "mathJudgment", "GPT challenger assessment");
    assertStringField(value, "proposedAction", "GPT challenger assessment");
    return value as unknown as LotusModelAssessment;
  }

  async primaryDebate(prompt: string): Promise<LotusGptDebateResponse> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary debate", "debate");
    assertObject(value, "GPT primary debate");
    assertStringField(value, "revisedConclusion", "GPT primary debate");
    assertStringField(value, "revisedAction", "GPT primary debate");
    return value as unknown as LotusGptDebateResponse;
  }

  async challengerClosure(prompt: string): Promise<LotusDebateClosure> {
    const value = await this.callOpenAi(prompt, this.challengerModel, "GPT challenger closure", "closure");
    assertObject(value, "GPT challenger closure");
    assertStringField(value, "conclusion", "GPT challenger closure");
    assertStringField(value, "action", "GPT challenger closure");
    if (typeof value.exitDiagnostic !== "boolean") {
      throw new Error("GPT challenger closure response is missing exitDiagnostic.");
    }
    return value as unknown as LotusDebateClosure;
  }

  async reviseQuestion(prompt: string): Promise<Omit<LotusQuestion, "id">> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary question revision", "revision");
    assertObject(value, "GPT primary question revision");
    const candidate = value.question && typeof value.question === "object" ? value.question : value;
    assertObject(candidate, "GPT primary revised question");
    assertStringField(candidate, "prompt", "GPT primary revised question");
    return candidate as unknown as Omit<LotusQuestion, "id">;
  }

  /**
   * Background call only — never awaited on a student's request/response
   * path. One call proposes the whole bounded reserve (see
   * reserveCandidatesPrompt); malformed individual candidates are dropped
   * rather than failing the whole batch, since losing one reserve slot is
   * harmless but losing the reserve entirely would fall the student back to
   * the slow path unnecessarily.
   */
  async generateReserveCandidates(
    prompt: string,
  ): Promise<Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }>> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary reserve generation", "reserve");
    assertObject(value, "GPT primary reserve generation");
    const rawCandidates = Array.isArray(value.candidates) ? value.candidates : [];
    const validIntents = new Set<LotusReserveIntent>([
      "ADVANCE",
      "RETRY_REPRESENTATION",
      "DESCEND_PREREQUISITE",
      "DISCRIMINATE",
    ]);
    const results: Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }> = [];
    for (const raw of rawCandidates) {
      if (!raw || typeof raw !== "object") continue;
      const intent = (raw as Record<string, unknown>).intent;
      const question = (raw as Record<string, unknown>).question;
      if (typeof intent !== "string" || !validIntents.has(intent as LotusReserveIntent)) continue;
      if (!question || typeof question !== "object") continue;
      if (typeof (question as Record<string, unknown>).prompt !== "string") continue;
      results.push({ intent: intent as LotusReserveIntent, question: question as Omit<LotusQuestion, "id"> });
    }
    return results;
  }

  /** Background only: writes one diagnostic question as raw JSON. The question factory checks it before anything uses it. */
  async writeQuestion(prompt: string): Promise<Record<string, unknown>> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT question writer", "generation");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Question writer did not return a JSON object.");
    return value as Record<string, unknown>;
  }

  /** Background only: a second model answers a worded question without seeing the key. */
  async solveBlind(prompt: string): Promise<Record<string, unknown>> {
    const value = await this.callOpenAi(prompt, this.challengerModel, "GPT blind solver", "blind-solve");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Blind solver did not return a JSON object.");
    return value as Record<string, unknown>;
  }

  private async callOpenAi(
    prompt: string,
    model: string,
    agentLabel: string,
    kind: LotusCallKind,
  ): Promise<unknown> {
    // While the account is refusing calls, fail fast instead of spending
    // another request (and another retry round) on a guaranteed 429/401.
    const outage = this.activeOutage;
    if (outage) throw new LotusProviderUnavailableError(outage);
    try {
      const tuning = this.latency.tuning(kind, model);
      const response = await this.openai.getClient().responses.create({
        model,
        input: prompt,
        max_output_tokens: tuning.maxOutputTokens,
        reasoning: { effort: tuning.reasoningEffort },
        text: { format: { type: "json_object" }, verbosity: "low" },
        prompt_cache_key: tuning.promptCacheKey,
      }, { timeout: tuning.timeoutMs });
      if (response.usage) {
        this.costTracker.record(model, kind, {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }
      this.outage = null;
      const content = response.output_text;
      if (!content) throw new Error(`${agentLabel} returned an empty response.`);
      return extractJson(content);
    } catch (error) {
      const provider = classifyProviderError(error);
      if (provider) {
        this.outage = { ...provider, at: Date.now() };
        throw new LotusProviderUnavailableError(this.outage);
      }
      throw new ServiceUnavailableException(
        `${agentLabel} Lotus call failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}
