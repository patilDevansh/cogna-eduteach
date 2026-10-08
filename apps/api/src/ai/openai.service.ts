import OpenAI from "openai";
import { modelPricingFromEnv } from "./model-pricing";
import { createMeteredFetch } from "./openai-metering";

export class OpenAIService {
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          // The SDK default (2) silently triples a failing call; callers already
          // run their own bounded retry loops on top of this.
          maxRetries: 1,
          // Every request — retries included — is booked against the daily caps here.
          fetch: createMeteredFetch({ pricing: modelPricingFromEnv() }),
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Every billed OpenAI call site obtains its client here; the daily caps are enforced on each request it sends. */
  getClient(): OpenAI {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    return this.client;
  }
}
