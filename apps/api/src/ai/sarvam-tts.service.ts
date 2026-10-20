import { ConfigService } from "@nestjs/config";
import { maskKey, type SynthesizedSpeech, type TtsProvider } from "./tts.service";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
// Bulbul's speaker names double as voice IDs.
const DEFAULT_VOICE_ID = "priya";

/**
 * Wraps Sarvam AI's Bulbul TTS (Indian-English and Indic voices) for lesson
 * narration. Same non-throwing contract as TtsService and CartesiaTtsService:
 * every failure returns null so the caller falls back to a silent beat.
 *
 * Deliberately undecorated, wired via the factory in ai.module.ts.
 */
export class SarvamTtsService implements TtsProvider {
  readonly provider = "sarvam" as const;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return (
      this.config.get<string>("COGNA_LESSON_AUDIO_ENABLED") !== "false" &&
      !!this.config.get<string>("SARVAM_API_KEY")?.trim()
    );
  }

  get keyHint(): string | undefined {
    return maskKey(this.config.get<string>("SARVAM_API_KEY"));
  }

  get model(): string {
    return this.config.get<string>("SARVAM_MODEL") ?? "bulbul:v3";
  }

  get voice(): string {
    return this.config.get<string>("SARVAM_VOICE_ID")?.trim() || DEFAULT_VOICE_ID;
  }

  get instructions(): string | undefined {
    return undefined;
  }

  /** Returns null on any failure — never throws. 15s fail-fast, as for the other providers. */
  async synthesize(text: string, options?: { voiceId?: string }): Promise<SynthesizedSpeech | null> {
    if (!this.enabled || !text.trim()) return null;
    const apiKey = this.config.get<string>("SARVAM_API_KEY")!.trim();
    const speaker = options?.voiceId ?? this.voice;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(SARVAM_TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": apiKey },
        body: JSON.stringify({
          text,
          target_language_code: "en-IN",
          speaker,
          model: this.model,
          output_audio_codec: "mp3",
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`[sarvam] ${response.status} for voice ${speaker}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
        return null;
      }
      // Long text can come back as several base64 chunks of one MP3 stream.
      const body = (await response.json()) as { audios?: string[] };
      if (!body.audios?.length) return null;
      return { bytes: Buffer.concat(body.audios.map((chunk) => Buffer.from(chunk, "base64"))), format: "mp3" };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
