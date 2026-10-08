import { tokenCostUsd, type ModelPricingTable } from "./model-pricing";
import { reserveBudget, SpendCapExceededError, spendCapsFromEnv, type SpendReservation } from "./spend-cap";

/**
 * A `fetch` for the OpenAI client that books every HTTP attempt — the SDK's
 * own retries included — against the daily spend caps before it is sent, then
 * trues the booking up to the real token cost from the response.
 *
 * A refused call never leaves the process: it gets a synthetic 429 with
 * code `cogna_spend_cap` and `x-should-retry: false`, so the SDK raises it at
 * once instead of retrying, and callers' provider-outage paths handle it.
 */

/** Used when a chat request sets no output limit; deliberately generous so the reservation errs high. */
const DEFAULT_OUTPUT_TOKEN_ESTIMATE = 4000;

export const SPEND_CAP_ERROR_CODE = "cogna_spend_cap";

type Fetch = typeof fetch;

interface ParsedRequest {
  model?: string;
  maxOutputTokens: number;
  /** Rough upper bound on prompt tokens: JSON characters / 3 (real text runs ~4 characters a token). */
  inputTokenEstimate: number;
  tokenPriced: boolean;
}

function requestPath(input: Parameters<Fetch>[0]): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function parseRequest(path: string, body: unknown): ParsedRequest {
  const tokenPriced = /\/(responses|chat\/completions)$/.test(path);
  if (typeof body !== "string") return { maxOutputTokens: 0, inputTokenEstimate: 0, tokenPriced };
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    // Not JSON: nothing to price from.
  }
  const limit = [json.max_output_tokens, json.max_completion_tokens, json.max_tokens].find((v) => typeof v === "number");
  return {
    model: typeof json.model === "string" ? json.model : undefined,
    maxOutputTokens: typeof limit === "number" ? limit : DEFAULT_OUTPUT_TOKEN_ESTIMATE,
    inputTokenEstimate: Math.ceil(body.length / 3),
    tokenPriced,
  };
}

/** Real cost from a Responses or Chat Completions body's `usage`; null when the body carries none. */
export function usageCostUsd(price: ModelPricingTable[string], body: unknown): number | null {
  const usage = (body as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage) return null;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const details = (usage.input_tokens_details ?? usage.prompt_tokens_details) as Record<string, unknown> | undefined;
  return tokenCostUsd(price, {
    inputTokens: num(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: num(usage.output_tokens ?? usage.completion_tokens),
    cachedInputTokens: num(details?.cached_tokens),
  });
}

function refusal(message: string): Response {
  return new Response(JSON.stringify({ error: { message, type: SPEND_CAP_ERROR_CODE, code: SPEND_CAP_ERROR_CODE } }), {
    status: 429,
    headers: { "content-type": "application/json", "x-should-retry": "false" },
  });
}

export function createMeteredFetch(options: {
  pricing: ModelPricingTable;
  env?: NodeJS.ProcessEnv;
  baseFetch?: Fetch;
}): Fetch {
  const env = options.env ?? process.env;
  const baseFetch = options.baseFetch ?? fetch;
  const warnedUnpriced = new Set<string>();

  return async (input, init) => {
    const request = parseRequest(requestPath(input), init?.body);
    const price = request.model ? options.pricing[request.model] : undefined;

    if (request.tokenPriced && !price) {
      const label = request.model ?? "(unknown model)";
      // With a dollar cap set, an unpriced model would silently escape it — refuse instead.
      if (Number.isFinite(spendCapsFromEnv("OPENAI", env).usd)) {
        return refusal(
          `OPENAI_DAILY_USD_CAP is set but ${label} has no price in OPENAI_MODEL_PRICING_JSON, so its cost can't be capped.`,
        );
      }
      if (!warnedUnpriced.has(label)) {
        warnedUnpriced.add(label);
        console.warn(`[spend-cap] ${label} has no price in OPENAI_MODEL_PRICING_JSON; only the daily call cap applies to it.`);
      }
    }

    const estimateUsd = price
      ? tokenCostUsd(price, { inputTokens: request.inputTokenEstimate, outputTokens: request.maxOutputTokens })
      : 0;

    let reservation: SpendReservation;
    try {
      reservation = await reserveBudget("openai", "OPENAI", { estimateUsd, env });
    } catch (error) {
      if (error instanceof SpendCapExceededError) {
        console.warn(`[spend-cap] ${error.message}`);
        return refusal(error.message);
      }
      throw error;
    }

    // A thrown fetch (timeout, abort, network) keeps the full reservation: a timed-out
    // request may still have been billed, and over-counting is the safe direction.
    const response = await baseFetch(input, init);
    if (!response.ok) {
      await reservation.settle(0); // OpenAI doesn't bill rejected requests
    } else if (price && response.headers.get("content-type")?.includes("application/json")) {
      const actual = usageCostUsd(price, await response.clone().json().catch(() => null));
      if (actual !== null) await reservation.settle(actual);
    }
    return response;
  };
}
