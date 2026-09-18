/**
 * The only tuning point for Lotus model-call latency.
 *
 * `balanced` is the production default: it keeps an independent primary and
 * challenger assessment, but reserves deeper reasoning for the final critic.
 * `quality` restores the earlier, slower budgets for evaluation runs. `fast`
 * is deliberately opt-in for controlled latency experiments.
 */
export type LotusLatencyMode = "balanced" | "fast" | "quality";
export type LotusCallKind = "assessment" | "debate" | "closure" | "revision" | "reserve" | "generation" | "blind-solve";
export type LotusReasoningEffort = "low" | "medium" | "high";

export type LotusCallTuning = {
  reasoningEffort: LotusReasoningEffort;
  maxOutputTokens: number;
  promptCacheKey: string;
};

function boundedInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 512 && parsed <= 3200 ? parsed : fallback;
}

function latencyMode(value: string | undefined): LotusLatencyMode {
  return value === "fast" || value === "quality" ? value : "balanced";
}

export class LotusLatencyPolicy {
  readonly mode: LotusLatencyMode;
  readonly maxOutputTokens: number;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.mode = latencyMode(env.LOTUS_LATENCY_MODE?.trim().toLowerCase());
    this.maxOutputTokens = boundedInteger(
      env.LOTUS_MAX_OUTPUT_TOKENS,
      this.mode === "quality" ? 3200 : 1200,
    );
  }

  tuning(kind: LotusCallKind, model: string): LotusCallTuning {
    const reasoningEffort = this.reasoningEffort(kind);
    return {
      reasoningEffort,
      // A written question carries its answer, worked steps and predicted wrong
      // answers; the default cap truncated some of those in the timing test.
      maxOutputTokens: kind === "generation" ? Math.max(this.maxOutputTokens, 2500) : this.maxOutputTokens,
      // The policy and JSON shapes lead every Lotus prompt. A stable key lets
      // the Responses API reuse that common prefix across learners without
      // putting a learner identifier into the cache key.
      promptCacheKey: `cogna-lotus-v1:${model}:${kind}`,
    };
  }

  private reasoningEffort(kind: LotusCallKind): LotusReasoningEffort {
    if (this.mode === "quality") {
      return kind === "assessment" || kind === "debate" || kind === "revision" || kind === "reserve" || kind === "generation" || kind === "blind-solve"
        ? "medium"
        : "high";
    }
    if (this.mode === "fast") return "low";
    // Balanced mode removes high-effort work from the two independent reads
    // and the debate. The final critic remains medium effort, where the
    // decision to continue or exit actually becomes durable evidence.
    // Reserve generation runs off the critical path entirely, so it stays
    // low regardless — there is no latency reason to spend more on it.
    return kind === "closure" ? "medium" : "low";
  }
}
