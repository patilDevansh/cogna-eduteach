import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  RequestTimeoutException,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { resolveActor } from "../access/cogna-access";
import { VoiceTutorService } from "./voice-tutor.service";
import { isFiller, isNothingSaid, readHistory, readScreen, verifyVoiceToken, voiceTutorEnabled } from "./voice-tutor.rules";
import { readRef } from "./voice-tutor.context";

type HeaderMap = Record<string, string | string[] | undefined>;

/** About 15 s of 16 kHz mono 16-bit speech, with room to spare. */
export const MAX_WAV_BYTES = 1_000_000;
/** A recording that hasn't fully arrived by then is refused, so a slow upload can't hold the request open. */
const READ_TIMEOUT_MS = 15_000;
const TOO_LONG = "That recording is too long. Keep each question under about 15 seconds.";

function requireOn(): void {
  if (!voiceTutorEnabled()) throw new NotFoundException("The voice tutor is switched off.");
}

function requireStudent(headers: HeaderMap) {
  const actor = resolveActor(headers);
  if (actor.role !== "student") throw new ForbiddenException("Only a signed-in student can talk to the tutor.");
  return actor;
}

/** Closes the connection once the reply is sent, so the rest of a refused upload is never read. */
function closeAfterReply(req: Request): void {
  req.res?.setHeader("Connection", "close");
}

/** Refuses a recording that says up front it is too big, before anything is read. */
function assertSmallEnough(req: Request): void {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_WAV_BYTES) {
    closeAfterReply(req);
    throw new PayloadTooLargeException(TOO_LONG);
  }
}

export function readWav(req: Request, timeoutMs = READ_TIMEOUT_MS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error: Error | null, body?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      if (!error) { resolve(body!); return; }
      closeAfterReply(req);
      req.pause();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_WAV_BYTES) { finish(new PayloadTooLargeException(TOO_LONG)); return; }
      chunks.push(chunk);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks));
    const onError = (error: Error) => finish(error);
    const timer = setTimeout(() => finish(new RequestTimeoutException("The recording took too long to arrive. Please try again.")), timeoutMs);
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/** Where the student is, for a recording: the body is raw audio, so the page names the place in a header. */
function refFromHeader(value: string | string[] | undefined): unknown {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 600) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

@Controller("voice-tutor")
export class VoiceTutorController {
  constructor(@Inject(VoiceTutorService) private readonly tutor: VoiceTutorService) {}

  /** Lets the page decide whether to show the talk button. No sign-in needed: it reveals only the switch. */
  @Get("status")
  status() {
    return { enabled: voiceTutorEnabled() };
  }

  /** Body: the raw 16 kHz mono WAV (Content-Type audio/wav). Header X-Voice-Tutor-Ref: where the student is. */
  @Post("hear")
  async hear(@Headers() headers: HeaderMap, @Req() req: Request) {
    requireOn();
    const actor = requireStudent(headers);
    if (!String(req.headers["content-type"] ?? "").startsWith("audio/wav")) throw new BadRequestException("Send the recording as audio/wav.");
    assertSmallEnough(req);
    // Read the (bounded) recording before answering, so the browser's upload is never cut off mid-way.
    const wav = await readWav(req);
    // Something is open that the student must do alone: nothing is transcribed, so nothing is paid for.
    const ctx = await this.tutor.context(actor, readRef(refFromHeader(headers["x-voice-tutor-ref"])), readScreen({}));
    if (ctx.paused) return { text: "", paused: ctx.paused };
    if (wav.length < 1000) return { text: "" };
    return { text: await this.tutor.hear(actor.studentId, wav) };
  }

  /** Body: { said, screen (title and first name only are used), ref (where the student is), history }. */
  @Post("talk")
  async talk(@Headers() headers: HeaderMap, @Body() body: { said?: unknown; screen?: unknown; ref?: unknown; history?: unknown }) {
    requireOn();
    const actor = requireStudent(headers);
    const said = typeof body?.said === "string" ? body.said.slice(0, 1000) : "";
    if (!said.trim()) throw new BadRequestException("Nothing was said.");
    if (isFiller(said) || isNothingSaid(said)) return { say: null, voice: null };
    const ctx = await this.tutor.context(actor, readRef(body?.ref), readScreen(body?.screen));
    return this.tutor.talk(actor.studentId, said, ctx, readHistory(body?.history));
  }

  /** The reply's voice, for an <audio> tag (which cannot send session headers): the sealed single-use token names the line. */
  @Get("voice")
  async voice(@Query("t") token: string, @Res() res: Response) {
    requireOn();
    const line = verifyVoiceToken(String(token ?? ""));
    if (!line) throw new UnauthorizedException("This voice link has expired or was already used.");
    try {
      await this.tutor.streamVoice(line.text, res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      res.status(503).json({ message: error instanceof Error ? error.message : "No voice service answered." });
    }
  }
}
