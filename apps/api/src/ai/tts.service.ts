import { ConfigService } from "@nestjs/config";
import { OpenAIService } from "./openai.service";

export interface SynthesizedSpeech {
  bytes: Buffer;
  format: "mp3";
}

/**
 * Wraps OpenAI's text-to-speech endpoint for narrating lesson-video scenes.
 * Deliberately non-throwing on missing config or a failed call — a TTS
 * outage must never fail a lesson render; the caller falls back to a silent
 * scene (see personalized-videos.service.ts's synthesizeNarration).
 *
 * Deliberately undecorated (no @Injectable()) — this class is imported
 * directly by the Next.js-embedded API route (apps/web/.../route.ts), whose
 * webpack/SWC bundler can't parse Nest's decorator syntax. Matches the same
 * convention already used by OpenAIService, LotusModelService, and
 * PersonalizedVideosService: wire it via an explicit factory in ai.module.ts
 * instead of relying on decorator-based auto-DI.
 */
export class TtsService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return (
      this.config.get<string>("COGNA_LESSON_AUDIO_ENABLED") !== "false" &&
      this.openai.isConfigured
    );
  }

  get model(): string {
    return this.config.get<string>("COGNA_LESSON_AUDIO_MODEL") ?? "gpt-4o-mini-tts";
  }

  get voice(): string {
    return this.config.get<string>("COGNA_LESSON_AUDIO_VOICE") ?? "alloy";
  }

  /** Returns null on any failure — never throws. Callers render silently instead. */
  async synthesize(text: string): Promise<SynthesizedSpeech | null> {
    if (!this.enabled || !text.trim()) return null;
    try {
      const response = await this.openai.getClient().audio.speech.create({
        input: text,
        model: this.model,
        voice: this.voice as never,
        response_format: "mp3",
      });
      const arrayBuffer = await response.arrayBuffer();
      return { bytes: Buffer.from(arrayBuffer), format: "mp3" };
    } catch {
      return null;
    }
  }
}
