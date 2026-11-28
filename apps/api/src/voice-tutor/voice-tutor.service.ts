import { HttpException, HttpStatus, Logger, ServiceUnavailableException } from "@nestjs/common";
import { once } from "node:events";
import type { Response } from "express";
import type { AccessActor } from "../access/cogna-access";
import { OpenAIService } from "../ai/openai.service";
import { SPEND_CAP_ERROR_CODE } from "../ai/openai-metering";
import { reserveBudget, SpendCapExceededError, type SpendReservation } from "../ai/spend-cap";
import { spokenMath } from "../ai/spoken-math";
import { openAiStudentTextModerator } from "../ai/student-text-safety";
import { recordTutorHelp, type TutorHelpKey } from "../learning-evidence/tutor-help";
import { checkSpokenMaths } from "./voice-tutor.maths";
import { mathsWords } from "./voice-tutor.words";
import { generalContext, generalMode, moduleContext, practiceContext, type TutorContext, type TutorRecords, type TutorRuns, type VoiceTutorRef } from "./voice-tutor.context";
import {
  correctionNote,
  FALLBACK_SAY,
  isFiller,
  isNothingSaid,
  issueVoiceToken,
  parseTutorJson,
  safeFallback,
  tutorMessages,
  voiceTutorDailyCalls,
  voiceTutorDailyHears,
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
/** Rough voice prices for the spend ledger: Cartesia ~$45 per million characters, Sarvam ~₹30 (≈ $0.36) per 10,000. */
const CARTESIA_USD_PER_CHAR = 45 / 1_000_000;
const SARVAM_USD_PER_CHAR = 0.36 / 10_000;
/** Each tutor model call gets about 12 seconds and no retry: a turn fails fast instead of hanging. */
const TUTOR_CALL_OPTIONS = { timeout: 12_000, maxRetries: 0 } as const;
const VOICE_TIMEOUT_MS = 15_000;

/** What the page is told when Cogna can't answer. The codes let it turn the microphone off when the day is over. */
export const DAILY_LIMIT_CODE = "VOICE_TUTOR_DAILY_LIMIT";
export const RESTING_CODE = "VOICE_TUTOR_RESTING";
export const UNAVAILABLE_CODE = "VOICE_TUTOR_UNAVAILABLE";
export const HELP_NOT_SAVED_CODE = "VOICE_TUTOR_HELP_NOT_SAVED";
export const DAILY_LIMIT_MESSAGE = "You've talked a lot today! Cogna will be ready to chat again tomorrow.";
export const RESTING_MESSAGE = "Cogna has talked a lot today and needs a rest. Please try again tomorrow.";
export const UNAVAILABLE_MESSAGE = "Cogna couldn't answer just now. Please try again in a moment.";
export const HELP_NOT_SAVED_MESSAGE = "Cogna couldn't save that you asked for help, so it didn't answer. Please try again.";

const dailyLimit = () => new HttpException({ statusCode: 429, message: DAILY_LIMIT_MESSAGE, code: DAILY_LIMIT_CODE }, HttpStatus.TOO_MANY_REQUESTS);
const resting = () => new ServiceUnavailableException({ statusCode: 503, message: RESTING_MESSAGE, code: RESTING_CODE });
const unavailable = () => new ServiceUnavailableException({ statusCode: 503, message: UNAVAILABLE_MESSAGE, code: UNAVAILABLE_CODE });
const helpNotSaved = () => new ServiceUnavailableException({ statusCode: 503, message: HELP_NOT_SAVED_MESSAGE, code: HELP_NOT_SAVED_CODE });

const log = new Logger("VoiceTutor");

/** A spend cap said no: ours (the ledger) or the metered OpenAI client's synthetic 429. */
function isSpendCapRefusal(error: unknown): boolean {
  if (error instanceof SpendCapExceededError) return true;
  const e = error as { status?: number; code?: string; error?: { code?: string } } | null;
  return e?.status === 429 && (e.code === SPEND_CAP_ERROR_CODE || e.error?.code === SPEND_CAP_ERROR_CODE);
}

/** For the server log only: the kind of failure, never the student's words. */
function describe(error: unknown): string {
  const e = error as { name?: string; status?: number; message?: string } | null;
  return `${e?.name ?? "Error"}${e?.status ? ` ${e.status}` : ""}: ${String(e?.message ?? error).slice(0, 160)}`;
}

/**
 * Hear → think → speak for the live voice tutor.
 *
 * Hearing and thinking go through the shared OpenAI-compatible client, so every call is booked against
 * the daily OpenAI caps, and also against the tutor's own caps: per student (replies and recordings) and
 * tutor-wide, so the tutor can't use up the calls Lotus needs. The voice is fetched by the <audio> tag
 * with a sealed single-use token and streamed from Cartesia (Sarvam if Cartesia refuses). If no voice
 * service answers, the page speaks the line with the browser's own voice, so a reply is never silent.
 *
 * Deliberately undecorated, wired with a factory, like the other AI services.
 */
export class VoiceTutorService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly records: TutorRecords | null = null,
    private readonly runs: TutorRuns | null = null,
  ) {}

  /** What the tutor may see for this turn, read from the records (see voice-tutor.context.ts). Never writes. */
  async context(actor: AccessActor, ref: VoiceTutorRef | null, base: VoiceTutorScreen): Promise<TutorContext> {
    if (actor.role !== "student") return generalContext(base);
    if (ref?.kind === "PRACTICE" && this.records) {
      const practice = await practiceContext(this.records, actor.studentId, ref, base);
      if (practice) return practice;
    }
    if (ref?.kind === "MODULE" && this.runs) {
      try {
        return await moduleContext(this.runs, actor, ref, base);
      } catch (error) {
        // Not a run this student can open: general talk, with its own checks.
        if (!(error instanceof HttpException) || ![403, 404].includes(error.getStatus())) throw error;
      }
    }
    return this.records ? generalMode(this.records, actor.studentId, base) : generalContext(base);
  }

  private async reserve(service: string, envPrefix: string, cap: string, refusal: () => HttpException): Promise<void> {
    try {
      await reserveBudget(service, envPrefix, { env: { ...process.env, [`${envPrefix}_DAILY_CALL_CAP`]: cap } });
    } catch (error) {
      if (error instanceof SpendCapExceededError) throw refusal();
      throw error;
    }
  }

  /** One reply per call, counted per student per UTC day in the shared spend ledger. */
  private countTurn(studentId: string): Promise<void> {
    return this.reserve(`voice-tutor:${studentId}`, "VOICE_TUTOR_STUDENT", voiceTutorDailyTurns(), dailyLimit);
  }

  /** One transcribed recording per call, counted per student per UTC day. */
  private countHear(studentId: string): Promise<void> {
    return this.reserve(`voice-tutor-hear:${studentId}`, "VOICE_TUTOR_STUDENT_HEAR", voiceTutorDailyHears(), dailyLimit);
  }

  /** One model call by the tutor, counted tutor-wide per UTC day. */
  private reserveTutorCall(): Promise<void> {
    return this.reserve("voice-tutor", "VOICE_TUTOR", voiceTutorDailyCalls(), resting);
  }

  private client() {
    if (!this.openai.isConfigured) throw new ServiceUnavailableException({ statusCode: 503, message: "Cogna's voice helper isn't set up on this server yet.", code: UNAVAILABLE_CODE });
    return this.openai.getClient();
  }

  /** A model call that failed: a rest until tomorrow when a spend cap said no, else a turn the student can retry. */
  private failure(step: string, error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    const capped = isSpendCapRefusal(error);
    log.warn(`${step} failed: ${capped ? "a spend cap refused the call" : describe(error)}`);
    return capped ? resting() : unavailable();
  }

  /** 16 kHz mono WAV of the student speaking → what they said. Empty when nothing clear was said. */
  async hear(studentId: string, wav: Buffer): Promise<string> {
    const client = this.client();
    await this.countHear(studentId);
    await this.reserveTutorCall();
    let content: unknown;
    try {
      const response = await client.chat.completions.create(
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
        TUTOR_CALL_OPTIONS,
      );
      content = response.choices[0]?.message?.content;
    } catch (error) {
      throw this.failure("hearing", error);
    }
    const text = String(content ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
    return isNothingSaid(text) ? "" : text;
  }

  private async ask(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<{ raw: string; say: string; maths: string[] }> {
    let content: unknown;
    try {
      const response = await this.client().chat.completions.create(
        { model: voiceTutorModel(), temperature: 0.5, max_tokens: 500, response_format: { type: "json_object" }, messages },
        TUTOR_CALL_OPTIONS,
      );
      content = response.choices[0]?.message?.content;
    } catch (error) {
      throw this.failure("reply", error);
    }
    const raw = String(content ?? "");
    return { raw, ...parseTutorJson(raw) };
  }

  /** Records the help before the model is asked. No record, no reply: the answer must count as helped. */
  private async recordHelp(keys: TutorHelpKey[]): Promise<void> {
    if (!keys.length) return;
    if (!this.records) throw helpNotSaved();
    try {
      for (const key of keys) await recordTutorHelp(this.records, key);
    } catch (error) {
      log.warn(`tutor help not recorded, so no reply: ${describe(error)}`);
      throw helpNotSaved();
    }
  }

  /**
   * The tutor's spoken reply and a token for its voice. A filler ("um") gets no reply and costs nothing; an open
   * check gets its pause line with no model call. Help on an open practice question is recorded first. Every reply
   * passes the maths check (voice-tutor.maths.ts) before it can be spoken: a failing reply is sent back once with
   * the reasons, and if the second one fails too the tutor says a line with no maths. Maths is said back in the
   * student's own words (voice-tutor.words.ts): `spoken` is the line as the voice says it, for the browser's voice too.
   */
  async talk(studentId: string, said: string, ctx: TutorContext, history: VoiceTutorTurn[]): Promise<{ say: string | null; spoken?: string; voice: string | null; paused?: boolean }> {
    const text = said.replace(/\s+/g, " ").trim();
    if (isFiller(text) || isNothingSaid(text)) return { say: null, voice: null };
    // Something is open that the student must do alone: say why, with no model call, no turn used and no voice to pay for.
    if (ctx.paused) return { say: ctx.paused, voice: null, paused: true };
    this.client();
    await this.countTurn(studentId);
    await this.reserveTutorCall();
    await this.recordHelp(ctx.record ?? []);
    const words = mathsWords([...history.filter((t) => t.role === "student").map((t) => t.text), text]);
    const messages = tutorMessages(text, ctx.screen, history, words);
    const reply = await this.ask(messages);
    let say = reply.say;
    if (say !== FALLBACK_SAY) {
      let check = checkSpokenMaths(say, reply.maths, ctx.facts);
      if (!check.ok) {
        log.warn(`maths check failed, asking again: ${check.problems.join("; ")}`);
        let second: Awaited<ReturnType<VoiceTutorService["ask"]>> | null = null;
        try {
          await this.reserveTutorCall();
          second = await this.ask([...messages, { role: "assistant", content: reply.raw }, { role: "user", content: correctionNote(check.problems) }]);
        } catch (error) {
          log.warn(`no second try: ${describe(error)}`);
        }
        say = second?.say ?? FALLBACK_SAY;
        if (second && say !== FALLBACK_SAY) check = checkSpokenMaths(say, second.maths, ctx.facts);
        if (!second || !check.ok || say === FALLBACK_SAY) {
          log.warn(`maths check failed twice, saying a line with no maths: ${check.problems.join("; ")}`);
          say = safeFallback(ctx.screen);
        }
      }
    }
    if (say !== FALLBACK_SAY && voiceTutorSafety() === "moderation") {
      const unsafe = await openAiStudentTextModerator(this.client())([say]);
      if (unsafe) {
        log.warn(`reply withheld: ${unsafe}`);
        return { say: "Let's keep going with the maths. What part would you like help with?", voice: null };
      }
    }
    const spoken = spokenMath(say, words);
    return { say, spoken, voice: issueVoiceToken(spoken) };
  }

  /** Streams the line's voice into `res`. Throws only before anything is written, so the caller can send an error. */
  async streamVoice(text: string, res: Response): Promise<void> {
    const spoken = spokenMath(text);
    if (await this.streamCartesia(spoken, res)) return;
    if (res.destroyed) return; // the listener has gone: make nothing more
    if (await this.sendSarvam(spoken, res)) return;
    throw new ServiceUnavailableException("No voice service answered.");
  }

  /** Aborts the upstream request on timeout, and as soon as the listener goes (interrupted, or the page closed). */
  private upstreamSignal(res: Response): { signal: AbortSignal; done: () => void } {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new Error("timed out")), VOICE_TIMEOUT_MS);
    const gone = () => { if (!res.writableFinished) abort.abort(new Error("the listener left")); };
    if (res.destroyed) gone();
    else res.once("close", gone);
    return { signal: abort.signal, done: () => { clearTimeout(timer); res.off("close", gone); } };
  }

  private async streamCartesia(text: string, res: Response): Promise<boolean> {
    const key = process.env.CARTESIA_API_KEY?.trim();
    if (!key) return false;
    let reservation: SpendReservation | null = null;
    const upstream = this.upstreamSignal(res);
    try {
      reservation = await reserveBudget("cartesia", "CARTESIA", { estimateUsd: text.length * CARTESIA_USD_PER_CHAR });
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
        signal: upstream.signal,
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
        if (!res.write(Buffer.from(value))) await once(res, "drain", { signal: upstream.signal });
      }
      res.end();
      return true;
    } catch (error) {
      // Once audio has started, the voice was made (and billed): keep the booking and end the reply.
      if (res.headersSent) { if (!res.writableEnded) res.end(); return true; }
      await reservation?.settle(0).catch(() => undefined);
      log.warn(`cartesia unavailable: ${describe(error)}`);
      return false;
    } finally {
      upstream.done();
    }
  }

  private async sendSarvam(text: string, res: Response): Promise<boolean> {
    const key = process.env.SARVAM_API_KEY?.trim();
    if (!key) return false;
    let reservation: SpendReservation | null = null;
    const upstream = this.upstreamSignal(res);
    try {
      reservation = await reserveBudget("sarvam", "SARVAM", { estimateUsd: text.length * SARVAM_USD_PER_CHAR });
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
        signal: upstream.signal,
      });
      if (!up.ok) {
        await reservation.settle(0);
        log.warn(`sarvam ${up.status}: ${(await up.text().catch(() => "")).slice(0, 160)}`);
        return false;
      }
      const body = (await up.json()) as { audios?: string[] };
      if (!body.audios?.length) {
        await reservation.settle(0);
        log.warn("sarvam answered with no audio");
        return false;
      }
      if (res.destroyed) return true; // the listener has gone: nothing to send
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
      res.end(Buffer.concat(body.audios.map((chunk) => Buffer.from(chunk, "base64"))));
      return true;
    } catch (error) {
      await reservation?.settle(0).catch(() => undefined);
      log.warn(`sarvam unavailable: ${describe(error)}`);
      return false;
    } finally {
      upstream.done();
    }
  }
}
