import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Inject, NotFoundException, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { resolveActor } from "../access/cogna-access";
import { VoiceTutorService } from "./voice-tutor.service";
import { readHistory, readScreen, verifyVoiceToken, voiceTutorEnabled } from "./voice-tutor.rules";

type HeaderMap = Record<string, string | string[] | undefined>;

/** About 15 s of 16 kHz mono 16-bit speech, with room to spare. */
const MAX_WAV_BYTES = 1_000_000;

function requireOn(): void {
  if (!voiceTutorEnabled()) throw new NotFoundException("The voice tutor is switched off.");
}

function requireStudent(headers: HeaderMap): string {
  const actor = resolveActor(headers);
  if (actor.role !== "student") throw new ForbiddenException("Only a signed-in student can talk to the tutor.");
  return actor.studentId;
}

function readWav(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_WAV_BYTES) { reject(new BadRequestException("That recording is too long.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

@Controller("voice-tutor")
export class VoiceTutorController {
  constructor(@Inject(VoiceTutorService) private readonly tutor: VoiceTutorService) {}

  /** Lets the page decide whether to show the talk button. No sign-in needed: it reveals only the switch. */
  @Get("status")
  status() {
    return { enabled: voiceTutorEnabled() };
  }

  /** Body: the raw 16 kHz mono WAV (Content-Type audio/wav). */
  @Post("hear")
  async hear(@Headers() headers: HeaderMap, @Req() req: Request) {
    requireOn();
    requireStudent(headers);
    if (!String(req.headers["content-type"] ?? "").startsWith("audio/wav")) throw new BadRequestException("Send the recording as audio/wav.");
    const wav = await readWav(req);
    if (wav.length < 1000) return { text: "" };
    return { text: await this.tutor.hear(wav) };
  }

  @Post("talk")
  async talk(@Headers() headers: HeaderMap, @Body() body: { said?: unknown; screen?: unknown; history?: unknown }) {
    requireOn();
    const studentId = requireStudent(headers);
    const said = typeof body?.said === "string" ? body.said : "";
    if (!said.trim()) throw new BadRequestException("Nothing was said.");
    return this.tutor.talk(studentId, said, readScreen(body.screen), readHistory(body.history));
  }

  /** The reply's voice, for an <audio> tag (which cannot send session headers): the signed token names the line. */
  @Get("voice")
  async voice(@Query("t") token: string, @Res() res: Response) {
    requireOn();
    const line = verifyVoiceToken(String(token ?? ""));
    if (!line) throw new UnauthorizedException("This voice link has expired.");
    try {
      await this.tutor.streamVoice(line.text, res);
    } catch (error) {
      if (res.headersSent) return;
      res.status(503).json({ message: error instanceof Error ? error.message : "No voice service answered." });
    }
  }
}
