/**
 * Operator-supplied OpenAI prices, USD per million tokens, keyed by the exact
 * model string sent to the API. Never guessed: a model with no entry here is
 * "unpriced", and callers must treat that as unknown cost, not zero cost.
 *
 * Env: OPENAI_MODEL_PRICING_JSON (LOTUS_MODEL_PRICING_JSON is the older name and
 * still read), e.g. {"gpt-5.6-terra":{"input":1.25,"output":10,"cachedInput":0.125}}.
 * `cachedInput` is optional; without it cached input tokens are charged at the
 * full input price, which overstates spend rather than understating it.
 */
export interface ModelPriceUsdPerMillionTokens {
  input: number;
  output: number;
  cachedInput?: number;
}

export type ModelPricingTable = Record<string, ModelPriceUsdPerMillionTokens>;

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseModelPricingFromEnv(json: string | undefined): ModelPricingTable {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const table: ModelPricingTable = {};
    for (const [model, price] of Object.entries(parsed as Record<string, unknown>)) {
      if (!price || typeof price !== "object") continue;
      const { input, output, cachedInput } = price as Record<string, unknown>;
      if (!isPrice(input) || !isPrice(output)) continue;
      table[model] = isPrice(cachedInput) ? { input, output, cachedInput } : { input, output };
    }
    return table;
  } catch {
    return {};
  }
}

export function modelPricingFromEnv(env: NodeJS.ProcessEnv = process.env): ModelPricingTable {
  return { ...parseModelPricingFromEnv(env.LOTUS_MODEL_PRICING_JSON), ...parseModelPricingFromEnv(env.OPENAI_MODEL_PRICING_JSON) };
}

/** Exact dollar cost of a completed call. `cachedInputTokens` is the part of `inputTokens` served from the prompt cache. */
export function tokenCostUsd(
  price: ModelPriceUsdPerMillionTokens,
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number },
): number {
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const cachedRate = price.cachedInput ?? price.input;
  return (
    ((usage.inputTokens - cached) * price.input + cached * cachedRate + usage.outputTokens * price.output) / 1_000_000
  );
}
