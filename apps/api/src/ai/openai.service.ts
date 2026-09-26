import OpenAI from "openai";
import { consumeBudget } from "./spend-cap";

export class OpenAIService {
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Every billed OpenAI call site obtains its client here, so this is the one place the daily cap is enforced. */
  getClient(): OpenAI {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    consumeBudget("openai", "OPENAI");
    return this.client;
  }
}
