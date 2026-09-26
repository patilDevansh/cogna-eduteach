/**
 * In-process usage/cost telemetry for live Lotus model calls (COGNA 10.0/
 * LOTUS_CONTINUOUS_DIAGNOSTIC.md, Phase 4 outstanding gate: "cost telemetry
 * for live-model usage"). Resets on process restart — an MVP-scoped first
 * cut that answers "how many calls, how many tokens, at what cost" for the
 * process's own lifetime, not a durable metrics store.
 *
 * Token counts come directly from each OpenAI response and are always
 * exact. A dollar figure is only ever computed for a model with a verified
 * price configured below — never estimated or guessed for an unrecognised
 * model. This matters here specifically: this deployment's configured
 * models (LOTUS_OPENAI_MODEL / LOTUS_CHALLENGER_MODEL, "gpt-5.6-terra" and
 * "gpt-5.6-sol" by default) are not models with publicly documented
 * pricing available to this codebase, so a fabricated per-token price would
 * be actively misleading for a budget decision — reporting "unpriced" is
 * more honest than reporting a wrong number that looks authoritative.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ModelPriceUsdPerMillionTokens {
  input: number;
  output: number;
}

/**
 * Verified USD-per-million-token pricing, keyed by the exact model string
 * passed to the API. Empty by default — see file header. An operator can
 * supply real, sourced prices without a code change via LOTUS_MODEL_PRICING_JSON
 * (a JSON object of exactly this shape, e.g. {"gpt-5.6-terra":{"input":1.25,"output":10}});
 * LotusCostTracker also accepts an explicit table directly, which is how
 * tests exercise the priced path without needing env parsing.
 */
const MODEL_PRICING_USD_PER_MILLION_TOKENS: Record<string, ModelPriceUsdPerMillionTokens> = {};

export function parseModelPricingFromEnv(json: string | undefined): Record<string, ModelPriceUsdPerMillionTokens> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const table: Record<string, ModelPriceUsdPerMillionTokens> = {};
    for (const [model, price] of Object.entries(parsed as Record<string, unknown>)) {
      if (!price || typeof price !== "object") continue;
      const input = (price as Record<string, unknown>).input;
      const output = (price as Record<string, unknown>).output;
      if (typeof input === "number" && typeof output === "number" && input >= 0 && output >= 0) {
        table[model] = { input, output };
      }
    }
    return table;
  } catch {
    return {};
  }
}

interface AggregateBucket {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  unpriced: boolean;
}

export interface LotusCostBucketSnapshot {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Null when any call in this bucket used a model with no configured price — a partial total would understate real spend, so it's withheld rather than shown as if complete. */
  costUsd: number | null;
}

export interface LotusCostSnapshot {
  since: string;
  calls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number | null;
  /** Distinct model strings seen with no configured price — the reason totalCostUsd may be null or a byModel entry may report costUsd: null. */
  unpricedModels: string[];
  byModel: Record<string, LotusCostBucketSnapshot>;
  byKind: Record<string, LotusCostBucketSnapshot>;
}

function newBucket(): AggregateBucket {
  return { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, unpriced: false };
}

function addToBucket(bucket: AggregateBucket, usage: TokenUsage, costUsd: number | null): void {
  bucket.calls += 1;
  bucket.inputTokens += usage.inputTokens;
  bucket.outputTokens += usage.outputTokens;
  bucket.totalTokens += usage.totalTokens;
  if (costUsd === null) { bucket.unpriced = true; bucket.costUsd = null; }
  else if (!bucket.unpriced) bucket.costUsd = (bucket.costUsd ?? 0) + costUsd;
}

function bucketSnapshot(bucket: AggregateBucket): LotusCostBucketSnapshot {
  return { calls: bucket.calls, inputTokens: bucket.inputTokens, outputTokens: bucket.outputTokens, totalTokens: bucket.totalTokens, costUsd: bucket.costUsd };
}

export class LotusCostTracker {
  private readonly startedAt = new Date().toISOString();
  private readonly overall = newBucket();
  private readonly byModel = new Map<string, AggregateBucket>();
  private readonly byKind = new Map<string, AggregateBucket>();
  private readonly unpricedModels = new Set<string>();
  private readonly pricing: Record<string, ModelPriceUsdPerMillionTokens>;

  /** `pricing` overrides the built-in (empty) table — merged on top, so an explicit table always wins over an unset default. Defaults to MODEL_PRICING_USD_PER_MILLION_TOKENS merged with LOTUS_MODEL_PRICING_JSON. */
  constructor(pricing?: Record<string, ModelPriceUsdPerMillionTokens>) {
    this.pricing = pricing ?? { ...MODEL_PRICING_USD_PER_MILLION_TOKENS, ...parseModelPricingFromEnv(process.env.LOTUS_MODEL_PRICING_JSON) };
  }

  /** Records one completed call's exact token usage against its model and call kind. */
  record(model: string, kind: string, usage: TokenUsage): void {
    const price = this.pricing[model];
    const costUsd = price
      ? (usage.inputTokens / 1_000_000) * price.input + (usage.outputTokens / 1_000_000) * price.output
      : null;
    if (costUsd === null) this.unpricedModels.add(model);

    addToBucket(this.overall, usage, costUsd);
    if (!this.byModel.has(model)) this.byModel.set(model, newBucket());
    addToBucket(this.byModel.get(model)!, usage, costUsd);
    if (!this.byKind.has(kind)) this.byKind.set(kind, newBucket());
    addToBucket(this.byKind.get(kind)!, usage, costUsd);
  }

  snapshot(): LotusCostSnapshot {
    return {
      since: this.startedAt,
      calls: this.overall.calls,
      totalInputTokens: this.overall.inputTokens,
      totalOutputTokens: this.overall.outputTokens,
      totalTokens: this.overall.totalTokens,
      totalCostUsd: this.overall.costUsd,
      unpricedModels: [...this.unpricedModels].sort(),
      byModel: Object.fromEntries([...this.byModel.entries()].map(([model, bucket]) => [model, bucketSnapshot(bucket)])),
      byKind: Object.fromEntries([...this.byKind.entries()].map(([kind, bucket]) => [kind, bucketSnapshot(bucket)])),
    };
  }
}
