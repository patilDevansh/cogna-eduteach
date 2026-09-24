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
    // "alloy" (the SDK's own default) reads flat/neutral for a tutoring
    // context — "nova" is a warmer, more conversational voice, closer to
    // what a Grade 8 CBSE student would find engaging rather than robotic.
    return this.config.get<string>("COGNA_LESSON_AUDIO_VOICE") ?? "nova";
  }

  /**
   * Only gpt-4o-mini-tts supports steering tone via `instructions` (tts-1/
   * tts-1-hd ignore it) — without this, narration reads in a flat, uninflected
   * pace regardless of voice choice, which is most of what makes TTS sound
   * "robotic" rather than actually the wrong voice.
   */
  get instructions(): string | undefined {
    if (this.model !== "gpt-4o-mini-tts") return undefined;
    return (
      this.config.get<string>("COGNA_LESSON_AUDIO_INSTRUCTIONS") ??
      "Warm, encouraging tutor speaking to a Grade 8 student. Calm, conversational pace, not rushed. Natural sentence-level inflection, like explaining something to one student in person, not reading a script aloud."
    );
  }

  /**
   * Returns null on any failure — never throws. Callers render silently
   * instead. The OpenAI SDK's own default is a 10-minute timeout with
   * automatic retries on top of that — observed directly: a hung TTS call
   * blocked an entire lesson render for 7+ minutes with no progress. A
   * single short scene narration should complete in a few seconds, so this
   * fails fast and lets the caller move on to a silent scene instead of
   * stalling the whole render.
   */
  async synthesize(text: string): Promise<SynthesizedSpeech | null> {
    if (!this.enabled || !text.trim()) return null;
    try {
      const response = await this.openai.getClient().audio.speech.create(
        {
          input: text,
          model: this.model,
          voice: this.voice as never,
          response_format: "mp3",
          ...(this.instructions ? { instructions: this.instructions } : {}),
        },
        { timeout: 15_000, maxRetries: 1 },
      );
      const arrayBuffer = await response.arrayBuffer();
      return { bytes: Buffer.from(arrayBuffer), format: "mp3" };
    } catch {
      return null;
    }
  }
}
