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

export class LotusModelService {
  readonly primaryModel: string;
  readonly challengerModel: string;
  private readonly latency: LotusLatencyPolicy;

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
    });
  }

  get status(): {
    enabled: boolean;
    ready: boolean;
    missingConfiguration: string[];
    progressiveStreamingEnabled: boolean;
  } {
    const enabled = this.config.get<string>("LOTUS_EXPERIMENTAL_ENABLED") !== "false";
    const missingConfiguration: string[] = [];
    if (!this.openai.isConfigured) missingConfiguration.push("OPENAI_API_KEY");
    return {
      enabled,
      ready: enabled && missingConfiguration.length === 0,
      missingConfiguration,
      progressiveStreamingEnabled: this.progressiveStreamingEnabled,
    };
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

  assertReady(): void {
    const status = this.status;
    if (!status.enabled) {
      throw new ServiceUnavailableException("Cogna Lotus is disabled. Set LOTUS_EXPERIMENTAL_ENABLED=true.");
    }
    if (!status.ready) {
      throw new ServiceUnavailableException(
        `Cogna Lotus needs: ${status.missingConfiguration.join(", ")}.`,
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
    try {
      const tuning = this.latency.tuning(kind, model);
      const response = await this.openai.getClient().responses.create({
        model,
        input: prompt,
        max_output_tokens: tuning.maxOutputTokens,
        reasoning: { effort: tuning.reasoningEffort },
        text: { format: { type: "json_object" }, verbosity: "low" },
        prompt_cache_key: tuning.promptCacheKey,
      });
      const content = response.output_text;
      if (!content) throw new Error(`${agentLabel} returned an empty response.`);
      return extractJson(content);
    } catch (error) {
      throw new ServiceUnavailableException(
        `${agentLabel} Lotus call failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}
