import { Injectable, Logger, Optional } from "@nestjs/common";
import type { LearningDecision, QuestionPayload } from "@cogna/shared";
import { OpenAIService } from "../../ai/openai.service";
import { ContentVerifierService } from "./content-verifier.service";
import { LINEAR_WORD_PROBLEM_TEMPLATE_ID, TemplateRenderService } from "./template-render.service";
import type {
  LinearEquationParams,
  RenderedQuestion,
  RenderedQuestionParams,
  TwoBinomialParams,
  VariableBothSidesParams,
} from "./template-render.types";

const GENERATE_TIMEOUT_MS = 2500;
const DEFAULT_MODEL = "gpt-4.1-mini";

export interface TryGenerateShadowInput {
  decision: LearningDecision;
  sessionId: string;
  studentId: string;
}

/** Which closed-form family a conceptId maps to — determines param picker, render function, and cache key shape. */
type Family = "linear-one-step" | "linear-word-problem" | "variable-both-sides" | "two-binomial-expand" | "two-binomial-factor";

function familyFor(conceptId: string): Family {
  switch (conceptId) {
    case "C6_SIMPLE_WORD_PROBLEMS":
      return "linear-word-problem";
    case "C7_VARIABLE_BOTH_SIDES":
      return "variable-both-sides";
    case "ID_C4_TWO_BINOMIAL_IDENTITY":
      return "two-binomial-expand";
    case "FAC_C4_TRINOMIAL":
      return "two-binomial-factor";
    default:
      return "linear-one-step";
  }
}

/**
 * Live Teaching Agent (C-lite) — generate params → template → verify → shadow log.
 * Serves bank unless LIVE_AGENTIC_SERVE_GENERATED=true and verify passes.
 */
/** In-memory cache of verified C-lite items; promotes reuse and future bank feeds. */
const verifiedCache = new Map<string, QuestionPayload>();

@Injectable()
export class LiveTeachingAgentService {
  private readonly logger = new Logger(LiveTeachingAgentService.name);

  constructor(
    private readonly templates: TemplateRenderService,
    private readonly verifier: ContentVerifierService,
    @Optional() private readonly openai?: OpenAIService,
  ) {}

  /**
   * When LIVE_AGENTIC_GENERATE=true, run generate+verify+shadow.
   * Returns QuestionPayload only if serve flag is on and verify passed; else null (bank).
   */
  async tryGenerateShadow(input: TryGenerateShadowInput): Promise<QuestionPayload | null> {
    if (process.env.LIVE_AGENTIC_GENERATE !== "true") {
      return null;
    }

    const conceptId = input.decision.parameters.conceptId;
    if (!conceptId) {
      return null;
    }

    const serveGenerated = process.env.LIVE_AGENTIC_SERVE_GENERATED === "true";
    const model = process.env.LIVE_AGENTIC_MODEL ?? DEFAULT_MODEL;
    const started = Date.now();

    try {
      const payload = await this.withTimeout(
        this.generateAndVerify(input, conceptId, model, serveGenerated),
        GENERATE_TIMEOUT_MS,
      );
      return payload;
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      this.logShadow({
        pass: false,
        latencyMs,
        serving: "bank",
        reason: message.includes("timeout") ? "timeout" : "error",
        error: message,
        sessionId: input.sessionId,
        conceptId,
        model,
      });
      return null;
    }
  }

  private async generateAndVerify(
    input: TryGenerateShadowInput,
    conceptId: string,
    model: string,
    serveGenerated: boolean,
  ): Promise<QuestionPayload | null> {
    const started = Date.now();
    const family = familyFor(conceptId);
    const contextIndex = this.hashSeed(`${input.sessionId}:${conceptId}:ctx`);

    let rendered: RenderedQuestion;
    let cacheKey: string;

    if (family === "variable-both-sides") {
      const params = await this.pickVariableBothSidesParams(input.sessionId, conceptId, model);
      cacheKey = `vbs:${conceptId}:${params.a}:${params.b}:${params.c}:${params.d}`;
      const cached = this.checkCache(cacheKey, serveGenerated, started, input.sessionId, conceptId, model);
      if (cached) return cached;
      rendered = this.templates.renderVariableBothSides(params);
    } else if (family === "two-binomial-expand" || family === "two-binomial-factor") {
      const params = await this.pickTwoBinomialParams(
        input.sessionId,
        conceptId,
        model,
        family === "two-binomial-expand" ? "expand" : "factor",
      );
      cacheKey = `tb:${conceptId}:${params.direction}:${params.a}:${params.b}`;
      const cached = this.checkCache(cacheKey, serveGenerated, started, input.sessionId, conceptId, model);
      if (cached) return cached;
      rendered = this.templates.renderTwoBinomial(params);
    } else {
      const params = await this.pickLinearParams(input.sessionId, conceptId, model);
      const useWordProblem = family === "linear-word-problem";
      cacheKey = `${useWordProblem ? "word" : "eq"}:${conceptId}:${params.a}:${params.b}:${params.x}:${
        useWordProblem ? contextIndex % 4 : 0
      }`;
      const cached = this.checkCache(cacheKey, serveGenerated, started, input.sessionId, conceptId, model);
      if (cached) return cached;
      rendered = useWordProblem
        ? this.templates.renderLinearWordProblem(params, contextIndex)
        : this.templates.renderLinearOneStep(params);
    }

    const result = this.verifier.verify(rendered);
    const latencyMs = Date.now() - started;

    const canServe = serveGenerated && result.passed;
    this.logShadow({
      pass: result.passed,
      latencyMs,
      serving: canServe ? "generated" : "bank",
      layers: result.layers,
      failures: result.failures,
      sessionId: input.sessionId,
      conceptId,
      model,
      templateId: rendered.templateId,
      cached: false,
    });

    if (!result.passed) {
      return null;
    }

    const payload = this.toQuestionPayload(rendered, input.decision);
    verifiedCache.set(cacheKey, payload);
    // Cap cache size for process lifetime.
    if (verifiedCache.size > 500) {
      const first = verifiedCache.keys().next().value;
      if (first) verifiedCache.delete(first);
    }

    return canServe ? payload : null;
  }

  private checkCache(
    cacheKey: string,
    serveGenerated: boolean,
    started: number,
    sessionId: string,
    conceptId: string,
    model: string,
  ): QuestionPayload | null {
    const cached = verifiedCache.get(cacheKey);
    if (cached && serveGenerated) {
      this.logShadow({
        pass: true,
        latencyMs: Date.now() - started,
        serving: "generated",
        cached: true,
        sessionId,
        conceptId,
        model,
      });
      return cached;
    }
    return null;
  }

  // ─── Linear (a·x+b=c) params — one-step and word-problem framings ─────────

  private async pickLinearParams(
    sessionId: string,
    conceptId: string,
    model: string,
  ): Promise<LinearEquationParams> {
    if (this.openai?.isConfigured) {
      try {
        const llmParams = await this.pickLinearParamsViaOpenAI(conceptId, model);
        if (llmParams) return llmParams;
      } catch (err) {
        this.logger.warn(
          `OpenAI params failed; falling back to deterministic: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return this.pickLinearParamsDeterministic(sessionId, conceptId);
  }

  private pickLinearParamsDeterministic(
    sessionId: string,
    conceptId: string,
  ): LinearEquationParams {
    const seed = this.hashSeed(`${sessionId}:${conceptId}`);
    // a ∈ {2..9} so a≠0; avoid a=1 with b=0 identity edge cases in hints.
    const a = 2 + (seed % 8);
    const bRaw = ((seed >>> 8) % 19) - 9; // -9..9
    const b = bRaw === 0 ? 1 : bRaw;
    let x = 1 + ((seed >>> 16) % 12); // 1..12
    if (x === a) x = x === 12 ? 1 : x + 1;
    return { conceptId, a, b, x };
  }

  private async pickLinearParamsViaOpenAI(
    conceptId: string,
    model: string,
  ): Promise<LinearEquationParams | null> {
    const client = this.openai!.getClient();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return JSON only with integer fields a, b, x for a one-step linear equation a*x+b=c. Constraints: a in 2..9, b in -9..9 nonzero, x in 1..12, a≠x. No other keys.",
        },
        {
          role: "user",
          content: `conceptId=${conceptId}. Pick fresh a,b,x.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { a?: unknown; b?: unknown; x?: unknown };
    const a = Number(parsed.a);
    const b = Number(parsed.b);
    const x = Number(parsed.x);
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      !Number.isInteger(x) ||
      a === 0 ||
      a < 2 ||
      a > 9 ||
      b === 0 ||
      x < 1 ||
      x > 12 ||
      a === x
    ) {
      return null;
    }
    return { conceptId, a, b, x };
  }

  // ─── Variable-both-sides (a·x+b = c·x+d) params ────────────────────────────
  // The LLM (or deterministic fallback) only ever picks a, c, b, x — bounded,
  // independently harmless integers. d is always DERIVED so the equation is
  // consistent by construction, the same "answer defines correctness" pattern
  // the existing linear picker already relies on (there, c is derived from x).

  private async pickVariableBothSidesParams(
    sessionId: string,
    conceptId: string,
    model: string,
  ): Promise<VariableBothSidesParams> {
    if (this.openai?.isConfigured) {
      try {
        const llmParams = await this.pickVariableBothSidesParamsViaOpenAI(conceptId, model);
        if (llmParams) return llmParams;
      } catch (err) {
        this.logger.warn(
          `OpenAI params failed; falling back to deterministic: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return this.pickVariableBothSidesParamsDeterministic(sessionId, conceptId);
  }

  private pickVariableBothSidesParamsDeterministic(
    sessionId: string,
    conceptId: string,
  ): VariableBothSidesParams {
    const seed = this.hashSeed(`${sessionId}:${conceptId}:vbs`);
    const a = 2 + (seed % 8); // 2..9
    let c = 1 + ((seed >>> 8) % 9); // 1..9
    if (c === a) c = c === 9 ? 1 : c + 1;
    const bRaw = ((seed >>> 16) % 19) - 9; // -9..9
    const b = bRaw;
    let x = 1 + ((seed >>> 24) % 12); // 1..12
    if (x === 0) x = 1;
    const d = b + (a - c) * x; // derived so (d-b)/(a-c) === x exactly
    return { conceptId, a, b, c, d, x };
  }

  private async pickVariableBothSidesParamsViaOpenAI(
    conceptId: string,
    model: string,
  ): Promise<VariableBothSidesParams | null> {
    const client = this.openai!.getClient();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return JSON only with integer fields a, c, b, x for a variable-both-sides linear equation a*x+b=c*x+d (d is computed separately, do not return it). Constraints: a in 2..9, c in 1..9, a≠c, b in -9..9, x in 1..12 nonzero. No other keys.",
        },
        {
          role: "user",
          content: `conceptId=${conceptId}. Pick fresh a,c,b,x.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { a?: unknown; c?: unknown; b?: unknown; x?: unknown };
    const a = Number(parsed.a);
    const c = Number(parsed.c);
    const b = Number(parsed.b);
    const x = Number(parsed.x);
    if (
      !Number.isInteger(a) || !Number.isInteger(c) || !Number.isInteger(b) || !Number.isInteger(x) ||
      a < 2 || a > 9 || c < 1 || c > 9 || a === c ||
      b < -9 || b > 9 ||
      x < 1 || x > 12
    ) {
      return null;
    }
    const d = b + (a - c) * x;
    return { conceptId, a, b, c, d, x };
  }

  // ─── Two-binomial (x+a)(x+b) <-> x^2+(a+b)x+ab params ─────────────────────
  // mid=a+b and last=a*b are always DERIVED from whatever a,b are picked, so
  // there is no way for the LLM (or the fallback) to produce an inconsistent item.

  private async pickTwoBinomialParams(
    sessionId: string,
    conceptId: string,
    model: string,
    direction: "expand" | "factor",
  ): Promise<TwoBinomialParams> {
    if (this.openai?.isConfigured) {
      try {
        const llmParams = await this.pickTwoBinomialParamsViaOpenAI(conceptId, model, direction);
        if (llmParams) return llmParams;
      } catch (err) {
        this.logger.warn(
          `OpenAI params failed; falling back to deterministic: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return this.pickTwoBinomialParamsDeterministic(sessionId, conceptId, direction);
  }

  private pickTwoBinomialParamsDeterministic(
    sessionId: string,
    conceptId: string,
    direction: "expand" | "factor",
  ): TwoBinomialParams {
    const seed = this.hashSeed(`${sessionId}:${conceptId}:tb:${direction}`);
    let a = 1 + (seed % 12); // 1..12
    if ((seed >>> 8) % 2 === 0) a = -a;
    let b = 1 + ((seed >>> 12) % 12); // 1..12
    if ((seed >>> 20) % 2 === 0) b = -b;
    if (b === 0) b = 1;
    return { conceptId, a, b, direction };
  }

  private async pickTwoBinomialParamsViaOpenAI(
    conceptId: string,
    model: string,
    direction: "expand" | "factor",
  ): Promise<TwoBinomialParams | null> {
    const client = this.openai!.getClient();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return JSON only with integer fields a, b for the identity (x+a)(x+b) = x^2+(a+b)x+ab. Constraints: a and b non-zero integers, each between -12 and 12. No other keys.",
        },
        {
          role: "user",
          content: `conceptId=${conceptId}. Pick fresh a,b.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { a?: unknown; b?: unknown };
    const a = Number(parsed.a);
    const b = Number(parsed.b);
    if (
      !Number.isInteger(a) || !Number.isInteger(b) ||
      a === 0 || b === 0 ||
      a < -12 || a > 12 || b < -12 || b > 12
    ) {
      return null;
    }
    return { conceptId, a, b, direction };
  }

  private toQuestionPayload(rendered: RenderedQuestion, decision: LearningDecision): QuestionPayload {
    const idSeedParts: (string | number)[] = [rendered.templateId, rendered.conceptId, this.paramsIdSeed(rendered.params), rendered.stem];
    const id = `live_gen_${this.hashSeed(idSeedParts.join(":")).toString(16)}`;

    return {
      id,
      version: 1,
      stem: rendered.stem,
      type: rendered.templateId === LINEAR_WORD_PROBLEM_TEMPLATE_ID ? "WORD_PROBLEM" : "NUMERIC",
      difficulty: decision.parameters.difficulty ?? 2,
      conceptId: rendered.conceptId,
      hintLadder: rendered.hints,
    };
  }

  private paramsIdSeed(params: RenderedQuestionParams): string {
    if ("d" in params) return `${params.a}:${params.b}:${params.c}:${params.d}:${params.x}`;
    if ("direction" in params) return `${params.a}:${params.b}:${params.direction}`;
    return `${params.a}:${params.b}:${params.x}`;
  }

  private logShadow(payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event: "live_agentic.shadow",
        ...payload,
      }),
    );
  }

  private hashSeed(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
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
