import { ConfigService } from "@nestjs/config";
import { maskKey, type SynthesizedSpeech, type TtsProvider } from "./tts.service";

const CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_API_VERSION = "2026-08-14";
// Skylar — "Approachable American female, ideal for customer care and
// support" per Cartesia's own voice library. Closest documented match to a
// warm tutoring narrator without an account to browse the full library;
// override with CARTESIA_VOICE_ID once a better-fitting voice is picked.
const DEFAULT_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";

/**
 * Wraps Cartesia's Sonic TTS endpoint for narrating lesson-video scenes.
 * Same non-throwing contract as TtsService (see personalized-videos
 * .service.ts's synthesizeNarration): a TTS outage must never fail a
 * lesson render, so every failure path here returns null instead of
 * throwing and the caller falls back to a silent scene.
 *
 * Deliberately undecorated (no @Injectable()), matching TtsService's own
 * convention — wired via an explicit factory in ai.module.ts instead of
 * decorator-based auto-DI.
 */
export class CartesiaTtsService implements TtsProvider {
  readonly provider = "cartesia" as const;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return (
      this.config.get<string>("COGNA_LESSON_AUDIO_ENABLED") !== "false" &&
      !!this.config.get<string>("CARTESIA_API_KEY")?.trim()
    );
  }

  get keyHint(): string | undefined {
    return maskKey(this.config.get<string>("CARTESIA_API_KEY"));
  }

  get model(): string {
    return this.config.get<string>("CARTESIA_MODEL") ?? "sonic-3.6";
  }

  get voice(): string {
    return this.config.get<string>("CARTESIA_VOICE_ID")?.trim() || DEFAULT_VOICE_ID;
  }

  // Cartesia has no equivalent to OpenAI's steerable `instructions` field —
  // tone comes from voice choice and generation_config, not a text prompt.
  get instructions(): string | undefined {
    return undefined;
  }

  /**
   * Returns null on any failure — never throws. Mirrors TtsService's own
   * 15s fail-fast timeout: a single short scene narration should complete
   * in a few seconds, so a hung call shouldn't stall the whole render.
   */
  async synthesize(text: string, options?: { voiceId?: string }): Promise<SynthesizedSpeech | null> {
    if (!this.enabled || !text.trim()) return null;
    const apiKey = this.config.get<string>("CARTESIA_API_KEY")!.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(CARTESIA_TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cartesia-Version": CARTESIA_API_VERSION,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model_id: this.model,
          transcript: text,
          voice: { id: options?.voiceId ?? this.voice },
          language: "en",
          output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`[cartesia] ${response.status} for voice ${options?.voiceId ?? this.voice}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return { bytes: Buffer.from(arrayBuffer), format: "mp3" };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
