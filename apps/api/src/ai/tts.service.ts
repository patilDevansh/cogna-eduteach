import { ConfigService } from "@nestjs/config";
import { OpenAIService } from "./openai.service";
import { reserveBudget } from "./spend-cap";

export interface SynthesizedSpeech {
  bytes: Buffer;
  format: "mp3";
}

/**
 * Shared shape both TtsService (OpenAI) and CartesiaTtsService implement,
 * so personalized-videos.service.ts's synthesizeNarration works unchanged
 * regardless of which provider ai.module.ts's factory selects via
 * COGNA_TTS_PROVIDER. Every implementation must keep the same non-throwing
 * contract: a TTS outage never fails a lesson render, it falls back silent.
 */
/** "…f0a89": enough to tell keys apart without exposing one. */
export function maskKey(key: string | undefined): string | undefined {
  const trimmed = key?.trim();
  return trimmed ? `…${trimmed.slice(-4)}` : undefined;
}

export interface TtsProvider {
  /** Which service speaks: voice IDs are only meaningful to their own provider. */
  readonly provider: "openai" | "elevenlabs" | "cartesia" | "sarvam";
  readonly enabled: boolean;
  /** Last characters of the configured API key (never the key), so dev tools can show which one is in use. */
  readonly keyHint?: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions?: string;
  /** `voiceId` overrides the configured voice for one call (providers that can't switch ignore it). */
  synthesize(text: string, options?: { voiceId?: string }): Promise<SynthesizedSpeech | null>;
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
export class TtsService implements TtsProvider {
  constructor(
    private readonly openai: OpenAIService,
    private readonly config: ConfigService,
  ) {}

  /** ElevenLabs is used when its key is set (set COGNA_LESSON_AUDIO_PROVIDER=openai to opt out). */
  get provider(): "openai" | "elevenlabs" {
    return this.useEleven ? "elevenlabs" : "openai";
  }

  get keyHint(): string | undefined {
    return this.useEleven ? maskKey(this.config.get<string>("ELEVENLABS_API_KEY")) : maskKey(this.config.get<string>("OPENAI_API_KEY"));
  }

  get useEleven(): boolean {
    return (
      Boolean(this.config.get<string>("ELEVENLABS_API_KEY")) &&
      this.config.get<string>("COGNA_LESSON_AUDIO_PROVIDER") !== "openai"
    );
  }

  get enabled(): boolean {
    return (
      this.config.get<string>("COGNA_LESSON_AUDIO_ENABLED") !== "false" &&
      (this.useEleven || this.openai.isConfigured)
    );
  }

  get model(): string {
    if (this.useEleven) return "eleven_multilingual_v2";
    return this.config.get<string>("COGNA_LESSON_AUDIO_MODEL") ?? "gpt-4o-mini-tts";
  }

  get voice(): string {
    // Lily — a calm premade ElevenLabs voice (library voices need a paid plan for API use).
    if (this.useEleven) return this.config.get<string>("ELEVENLABS_VOICE_ID") ?? "pFZP5JQG7iQjIQuC4Bku";
    // "alloy" (the SDK's own default) reads flat/neutral for a tutoring
    // context. "nova" was warmer but still had a clipped, announcer-like
    // cadence — "coral" (gpt-4o-mini-tts's newer voice) has noticeably more
    // natural breath and pitch variation, closer to a real person explaining
    // something than a text-to-speech engine reading it.
    return this.config.get<string>("COGNA_LESSON_AUDIO_VOICE") ?? "coral";
  }

  /**
   * Only gpt-4o-mini-tts supports steering tone via `instructions` (tts-1/
   * tts-1-hd ignore it) — without this, narration reads in a flat, uninflected
   * pace regardless of voice choice, which is most of what makes TTS sound
   * "robotic" rather than actually the wrong voice. Deliberately plain: an
   * earlier "expressive tutor" prompt added a deep, performed quality that
   * read as acting, and the pilot audience is Indian students.
   */
  get instructions(): string | undefined {
    // For ElevenLabs this is only a cache-key version: bump it when the pause timings change so old clips regenerate.
    if (this.useEleven) return "eleven-pauses-v1";
    if (this.model !== "gpt-4o-mini-tts") return undefined;
    return (
      this.config.get<string>("COGNA_LESSON_AUDIO_INSTRUCTIONS") ??
      "Speak in a natural Indian English accent, like a friendly school teacher from India explaining " +
        "to a student. Conversational, light and clear, at an even, unhurried pace with gentle everyday " +
        "intonation. Keep the tone plain and neutral: no theatrical or storytelling delivery, no " +
        "dramatic emphasis, no deep or resonant announcer voice."
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
  async synthesize(text: string, options?: { voiceId?: string }): Promise<SynthesizedSpeech | null> {
    if (!this.enabled || !text.trim()) return null;
    if (this.useEleven) return this.synthesizeEleven(text, options?.voiceId ?? this.voice);
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

  // No OpenAI fallback on failure: a fallback clip would be cached under the ElevenLabs cache key
  // (voice/model are part of it) and hide the outage. A failed call means a silent, timer-paced scene.
  private async synthesizeEleven(text: string, voiceId: string): Promise<SynthesizedSpeech | null> {
    try {
      await reserveBudget("elevenlabs", "ELEVENLABS");
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.config.get<string>("ELEVENLABS_API_KEY")!,
            "Content-Type": "application/json",
          },
          // High stability + zero style = plain, even delivery (no performed "depth").
          body: JSON.stringify({
            text,
            model_id: this.model,
            voice_settings: { stability: 0.7, similarity_boost: 0.75, style: 0, use_speaker_boost: false },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) {
        console.warn(`[elevenlabs] ${response.status} for voice ${voiceId}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
        return null;
      }
      return { bytes: Buffer.from(await response.arrayBuffer()), format: "mp3" };
    } catch {
      return null;
    }
  }
}
