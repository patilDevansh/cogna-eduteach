import OpenAI from "openai";

export class OpenAIService {
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): OpenAI {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    return this.client;
  }
}
