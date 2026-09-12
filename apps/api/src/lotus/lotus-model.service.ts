import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
} from "@cogna/shared";
import { OpenAIService } from "../ai/openai.service";

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

  constructor(
    private readonly openai: OpenAIService,
    private readonly config: ConfigService,
  ) {
    this.primaryModel = this.config.get<string>("LOTUS_OPENAI_MODEL") ?? "gpt-5.6-terra";
    this.challengerModel =
      this.config.get<string>("LOTUS_CHALLENGER_MODEL") ?? "gpt-5.6-sol";
  }

  get status(): { enabled: boolean; ready: boolean; missingConfiguration: string[] } {
    const enabled = this.config.get<string>("LOTUS_EXPERIMENTAL_ENABLED") !== "false";
    const missingConfiguration: string[] = [];
    if (!this.openai.isConfigured) missingConfiguration.push("OPENAI_API_KEY");
    return { enabled, ready: enabled && missingConfiguration.length === 0, missingConfiguration };
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
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary", "medium");
    assertObject(value, "GPT primary assessment");
    assertStringField(value, "mathJudgment", "GPT primary assessment");
    assertStringField(value, "proposedAction", "GPT primary assessment");
    return value as unknown as LotusModelAssessment;
  }

  async challengerAssessment(prompt: string): Promise<LotusModelAssessment> {
    const value = await this.callOpenAi(prompt, this.challengerModel, "GPT challenger", "high");
    assertObject(value, "GPT challenger assessment");
    assertStringField(value, "mathJudgment", "GPT challenger assessment");
    assertStringField(value, "proposedAction", "GPT challenger assessment");
    return value as unknown as LotusModelAssessment;
  }

  async primaryDebate(prompt: string): Promise<LotusGptDebateResponse> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary debate", "medium");
    assertObject(value, "GPT primary debate");
    assertStringField(value, "revisedConclusion", "GPT primary debate");
    assertStringField(value, "revisedAction", "GPT primary debate");
    return value as unknown as LotusGptDebateResponse;
  }

  async challengerClosure(prompt: string): Promise<LotusDebateClosure> {
    const value = await this.callOpenAi(prompt, this.challengerModel, "GPT challenger closure", "high");
    assertObject(value, "GPT challenger closure");
    assertStringField(value, "conclusion", "GPT challenger closure");
    assertStringField(value, "action", "GPT challenger closure");
    if (typeof value.exitDiagnostic !== "boolean") {
      throw new Error("GPT challenger closure response is missing exitDiagnostic.");
    }
    return value as unknown as LotusDebateClosure;
  }

  async reviseQuestion(prompt: string): Promise<Omit<LotusQuestion, "id">> {
    const value = await this.callOpenAi(prompt, this.primaryModel, "GPT primary question revision", "medium");
    assertObject(value, "GPT primary question revision");
    const candidate = value.question && typeof value.question === "object" ? value.question : value;
    assertObject(candidate, "GPT primary revised question");
    assertStringField(candidate, "prompt", "GPT primary revised question");
    return candidate as unknown as Omit<LotusQuestion, "id">;
  }

  private async callOpenAi(
    prompt: string,
    model: string,
    agentLabel: string,
    effort: "medium" | "high",
  ): Promise<unknown> {
    try {
      const response = await this.openai.getClient().responses.create({
        model,
        input: prompt,
        max_output_tokens: 3200,
        reasoning: { effort },
        text: { format: { type: "json_object" }, verbosity: "low" },
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
