import { HttpException, HttpStatus, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Response } from "express";
import { OpenAIService } from "../ai/openai.service";
import { reserveBudget, SpendCapExceededError } from "../ai/spend-cap";
import { spokenMath } from "../ai/spoken-math";
import { openAiStudentTextModerator } from "../ai/student-text-safety";
import {
  FALLBACK_SAY,
  isFiller,
  issueVoiceToken,
  parseTutorReply,
  tutorMessages,
  voiceTutorDailyTurns,
  voiceTutorModel,
  voiceTutorSafety,
  type VoiceTutorScreen,
  type VoiceTutorTurn,
} from "./voice-tutor.rules";

const CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_API_VERSION = "2026-08-14";
/** Skylar: the voice the Cogna guide's recorded lines use, so live replies sound like the same character. */
const DEFAULT_CARTESIA_VOICE = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
/** Rough voice prices for the spend ledger: Cartesia ~$45 per million characters, Sarvam ~₹30 per 10,000. */
const CARTESIA_USD_PER_CHAR = 45 / 1_000_000;
const SARVAM_USD_PER_CHAR = 0.0036 / 10;

const log = new Logger("VoiceTutor");

/**
 * Hear → think → speak for the live voice tutor.
 *
 * Hearing and thinking go through the shared OpenAI-compatible client, so every
 * call is booked against the daily OpenAI caps. The voice is fetched by the
 * <audio> tag with a signed token and streamed from Cartesia (Sarvam if
 * Cartesia refuses). If no voice service answers, the page speaks the line with
 * the browser's own voice, so a reply is never silent.
 *
 * Deliberately undecorated, wired with a factory, like the other AI services.
 */
export class VoiceTutorService {
  constructor(private readonly openai: OpenAIService) {}

  /** One turn per call, counted per student per UTC day in the shared spend ledger. */
  private async countTurn(studentId: string): Promise<void> {
    try {
      await reserveBudget(`voice-tutor:${studentId}`, "VOICE_TUTOR_STUDENT", {
        env: { ...process.env, VOICE_TUTOR_STUDENT_DAILY_CALL_CAP: voiceTutorDailyTurns() },
      });
    } catch (error) {
      if (error instanceof SpendCapExceededError) {
        throw new HttpException("You've talked a lot today! Cogna will be ready to chat again tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  private client() {
    if (!this.openai.isConfigured) throw new ServiceUnavailableException("The tutor isn't set up on this server.");
    return this.openai.getClient();
  }

  /** 16 kHz mono WAV of the student speaking → what they said. Empty when nothing clear was said. */
  async hear(wav: Buffer): Promise<string> {
    const response = await this.client().chat.completions.create(
      {
        model: voiceTutorModel(),
        temperature: 0,
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "A grade 8 Indian student is talking to their maths tutor. Write down exactly what they say, in English. Reply with only their words. If there is no clear speech, reply with nothing." },
            { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } },
          ],
        }],
      },
      { timeout: 20_000 },
    );
    return String(response.choices[0]?.message?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
  }

  /** The tutor's spoken reply and a token for its voice. A filler ("um") gets no reply and costs nothing. */
  async talk(studentId: string, said: string, screen: VoiceTutorScreen, history: VoiceTutorTurn[]): Promise<{ say: string | null; voice: string | null }> {
    const text = said.replace(/\s+/g, " ").trim();
    if (isFiller(text)) return { say: null, voice: null };
    await this.countTurn(studentId);
    const response = await this.client().chat.completions.create(
      {
        model: voiceTutorModel(),
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: tutorMessages(text, screen, history),
      },
      { timeout: 20_000 },
    );
    const say = parseTutorReply(response.choices[0]?.message?.content);
    if (say !== FALLBACK_SAY && voiceTutorSafety() === "moderation") {
      const unsafe = await openAiStudentTextModerator(this.client())([say]);
      if (unsafe) {
        log.warn(`reply withheld: ${unsafe}`);
        return { say: "Let's keep going with the maths. What part would you like help with?", voice: null };
      }
    }
    return { say, voice: issueVoiceToken(say) };
  }

  /** Streams the line's voice into `res`. Throws only before anything is written, so the caller can send an error. */
  async streamVoice(text: string, res: Response): Promise<void> {
    const spoken = spokenMath(text);
    if (await this.streamCartesia(spoken, res)) return;
    if (await this.sendSarvam(spoken, res)) return;
    throw new ServiceUnavailableException("No voice service answered.");
  }

  private async streamCartesia(text: string, res: Response): Promise<boolean> {
    const key = process.env.CARTESIA_API_KEY?.trim();
    if (!key) return false;
    try {
      const reservation = await reserveBudget("cartesia", "CARTESIA", { estimateUsd: text.length * CARTESIA_USD_PER_CHAR });
      const up = await fetch(CARTESIA_TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cartesia-Version": CARTESIA_API_VERSION, Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model_id: process.env.CARTESIA_MODEL?.trim() || "sonic-3.6",
          transcript: text,
          language: "en",
          voice: { mode: "id", id: process.env.VOICE_TUTOR_CARTESIA_VOICE?.trim() || DEFAULT_CARTESIA_VOICE },
          output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!up.ok || !up.body) {
        await reservation.settle(0);
        log.warn(`cartesia ${up.status}: ${(await up.text().catch(() => "")).slice(0, 160)}`);
        return false;
      }
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
      const reader = up.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
      return true;
    } catch (error) {
      if (res.headersSent) { res.end(); return true; }
      log.warn(`cartesia unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async sendSarvam(text: string, res: Response): Promise<boolean> {
    const key = process.env.SARVAM_API_KEY?.trim();
    if (!key) return false;
    try {
      const reservation = await reserveBudget("sarvam", "SARVAM", { estimateUsd: text.length * SARVAM_USD_PER_CHAR });
      const up = await fetch(SARVAM_TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": key },
        body: JSON.stringify({
          text,
          target_language_code: "en-IN",
          speaker: process.env.VOICE_TUTOR_SARVAM_VOICE?.trim() || "priya",
          model: process.env.SARVAM_MODEL?.trim() || "bulbul:v3",
          output_audio_codec: "mp3",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!up.ok) {
        await reservation.settle(0);
        log.warn(`sarvam ${up.status}: ${(await up.text().catch(() => "")).slice(0, 160)}`);
        return false;
      }
      const body = (await up.json()) as { audios?: string[] };
      if (!body.audios?.length) return false;
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
      res.end(Buffer.concat(body.audios.map((chunk) => Buffer.from(chunk, "base64"))));
      return true;
    } catch (error) {
      log.warn(`sarvam unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
