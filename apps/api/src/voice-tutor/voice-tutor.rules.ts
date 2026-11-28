import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { sessionSecretFromEnv } from "@cogna/shared/dist/session";
import { type MathsWords, wordsNote } from "./voice-tutor.words";

/**
 * The live voice tutor's pure rules: the switch, the daily limits, what the page may tell it, the
 * instructions it answers under, how its reply and the student's words are read, and the sealed
 * single-use token an <audio> tag uses to fetch the spoken reply. Kept free of Nest and network so
 * the golden tests can pin every rule.
 *
 * Product decisions (UX-009, 27 Nov 2026): lessons and practice only, never the Lotus check-in or
 * baseline practice; talking during an open practice question counts as help, recorded by the server
 * before the tutor answers (learning-evidence/tutor-help.ts); off unless VOICE_TUTOR_ENABLED.
 */

export function voiceTutorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_TUTOR_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * "moderation" (default): every reply passes the provider's moderation endpoint
 * and is refused if the check cannot run (fails closed, like the rest of Cogna).
 * "provider": rely on the model provider's own built-in safety filters, for a
 * provider with no moderation endpoint (Gemini's OpenAI-compatible API). An
 * explicit product decision, never a silent fallback.
 */
export function voiceTutorSafety(env: NodeJS.ProcessEnv = process.env): "moderation" | "provider" {
  return env.VOICE_TUTOR_SAFETY?.trim().toLowerCase() === "provider" ? "provider" : "moderation";
}

export function voiceTutorModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.VOICE_TUTOR_MODEL?.trim() || env.LOTUS_OPENAI_MODEL?.trim() || "gpt-4.1-mini";
}

const isCap = (raw: string | undefined): raw is string => !!raw && Number.isFinite(Number(raw)) && Number(raw) >= 0;

/** Replies one student may get per UTC day (each is one turn: a reply and its voice). */
export function voiceTutorDailyTurns(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VOICE_TUTOR_STUDENT_DAILY_CALL_CAP?.trim();
  return isCap(raw) ? raw : "80";
}

/** Recordings one student may have transcribed per UTC day. Twice the replies by default: some recordings are only noise. */
export function voiceTutorDailyHears(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VOICE_TUTOR_STUDENT_DAILY_HEAR_CAP?.trim();
  return isCap(raw) ? raw : String(Number(voiceTutorDailyTurns(env)) * 2);
}

/**
 * Model calls the whole tutor may make per UTC day, hearing and replies together. By default half of
 * OPENAI_DAILY_CALL_CAP when that is set (else 2500), so the tutor can never use up the calls Lotus needs.
 */
export function voiceTutorDailyCalls(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VOICE_TUTOR_DAILY_CALL_CAP?.trim();
  if (isCap(raw)) return raw;
  const openai = env.OPENAI_DAILY_CALL_CAP?.trim();
  return isCap(openai) ? String(Math.floor(Number(openai) / 2)) : "2500";
}

export type VoiceTutorSurface = "PRACTICE" | "LESSON";

/** What the page tells the tutor about the screen. Display text only: nothing here is evidence. */
export interface VoiceTutorScreen {
  surface: VoiceTutorSurface;
  /** Lesson or module title. */
  title?: string;
  /** The explanation steps currently shown (lesson). */
  steps?: string[];
  /** The open question, if any. */
  question?: string;
  options?: string[];
  /** Reviewed hints for the open question, in order. The tutor builds on these rather than inventing maths. */
  approvedHints?: string[];
  /**
   * May the tutor help with the open question? Decided by the server from its records
   * (voice-tutor.context.ts), never by the page. When false the tutor only talks about ideas.
   */
  helpOnQuestion: boolean;
  studentFirstName?: string;
}

export interface VoiceTutorTurn {
  role: "student" | "tutor";
  text: string;
}

const clip = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
};
const clipList = (value: unknown, items: number, max: number): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((v) => clip(v, max)).filter((v): v is string => !!v).slice(0, items);
  return list.length ? list : undefined;
};

/** Reads the page's screen description defensively: unknown fields dropped, every string length-limited. */
export function readScreen(raw: unknown): VoiceTutorScreen {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const surface: VoiceTutorSurface = v.surface === "LESSON" ? "LESSON" : "PRACTICE";
  return {
    surface,
    title: clip(v.title, 160),
    steps: clipList(v.steps, 8, 400),
    question: clip(v.question, 600),
    options: clipList(v.options, 6, 160),
    approvedHints: clipList(v.approvedHints, 5, 400),
    helpOnQuestion: v.helpOnQuestion === true,
    studentFirstName: clip(v.studentFirstName, 40),
  };
}

export function readHistory(raw: unknown): VoiceTutorTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .filter((t) => (t.role === "student" || t.role === "tutor") && typeof t.text === "string" && t.text.trim())
    .slice(-10)
    .map((t) => ({ role: t.role as VoiceTutorTurn["role"], text: clip(t.text, 400)! }));
}

export const TUTOR_RULES = `You are Cogna, a warm Indian maths tutor inside a learning app. A grade 8 student is talking to you out loud at home.
Everything you write is spoken aloud by a voice, so:
- Reply in one to three short sentences of plain spoken English, the way a kind teacher talks. No lists, no markdown, no emoji, no LaTeX.
- Write maths in words or simple symbols (², ×, =).
- Use the student's first name now and then, not every time.
Teaching rules:
- Never give the answer to a question on the screen, and never do its final step for them. Give one hint or ask one guiding question.
- Never say the value of an unknown ("x is 14"), and never say the answer's number, even inside a sum.
- Reviewed hints, when given, are the ones the student has already seen: build on them one small step at a time. Do not invent new facts or numbers.
- Use only numbers that are in the question, its choices, the reviewed hints or the steps on screen, plus small counting numbers.
- Every sum or equation you state must be exactly true. Asking a question ("What is 12 times 12?") is better than stating one.
- Never say whether the student's answer is right or wrong. The app checks answers itself.
- If help with the on-screen question is not allowed, talk only about the general idea and say you can help with this question after they try it.
- If the student says they are being hurt, feel unsafe, or are very upset about something serious, this comes before maths: kindly tell them to talk to a trusted adult or a teacher, and that they can call Childline on 1098, India's free helpline for children. Write the number as 1098. Do not ask for details.
- Otherwise stay on maths and learning. If they drift, bring them back kindly in one sentence.
- If they are upset or stuck with the work, be encouraging and suggest one small next step.
Reply with JSON only: {"say": "...", "maths": ["every equation your say states, in symbols, e.g. 10 × 10 = 100"]}. Use [] when it states none.
A checker re-derives every equation and every number before your reply is spoken; a reply that fails is not used.`;

/** The messages sent to the model for one turn. Earlier turns go in as a short transcript. */
export function tutorMessages(said: string, screen: VoiceTutorScreen, history: VoiceTutorTurn[], words: MathsWords = {}): Array<{ role: "system" | "user"; content: string }> {
  const lines: string[] = [];
  lines.push(`Where the student is: ${screen.surface === "LESSON" ? "a lesson" : "practice"}${screen.title ? ` — ${screen.title}` : ""}.`);
  if (screen.studentFirstName) lines.push(`Student's first name: ${screen.studentFirstName}.`);
  if (screen.steps?.length) lines.push(`Explanation on screen:\n${screen.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  if (screen.question && screen.helpOnQuestion) {
    lines.push(`Question on screen: ${screen.question}${screen.options?.length ? `\nChoices: ${screen.options.join(" | ")}` : ""}`);
    lines.push("Help with this question is allowed (hints only, never the answer).");
    if (screen.approvedHints?.length) lines.push(`Reviewed hints, in order:\n${screen.approvedHints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`);
  } else if (screen.question) {
    // Not even the question is sent: a tutor that cannot see it cannot hint at its method.
    lines.push("A question is open, but help with it is NOT allowed right now, and you cannot see it. Do not guess what it is or which method it needs.");
  } else {
    lines.push("No question is open right now.");
  }
  const note = wordsNote(words);
  if (note) lines.push(note);
  const past = history.map((t) => `${t.role === "student" ? "Student" : "Cogna"}: ${t.text}`);
  const ask = (past.length ? `The conversation so far:\n${past.join("\n")}\n\n` : "") + `The student now says: ${said.slice(0, 1000)}`;
  return [
    { role: "system", content: `${TUTOR_RULES}\n\nWhat the app shows right now:\n${lines.join("\n")}` },
    { role: "user", content: ask },
  ];
}

export const FALLBACK_SAY = "Sorry, could you say that again?";

/** The model's reply: the spoken line and the equations it says it states. Never throws. */
export function parseTutorJson(raw: string | null | undefined): { say: string; maths: string[] } {
  const text = String(raw ?? "").trim();
  if (!text) return { say: FALLBACK_SAY, maths: [] };
  const json = text.match(/\{[\s\S]*\}/);
  let say = "";
  let maths: string[] = [];
  try {
    const parsed = JSON.parse(json ? json[0] : text) as { say?: unknown; maths?: unknown };
    say = typeof parsed.say === "string" ? parsed.say : "";
    if (Array.isArray(parsed.maths)) maths = parsed.maths.filter((m): m is string => typeof m === "string").slice(0, 8).map((m) => m.slice(0, 200));
  } catch {
    // Plain words are spoken as they are; half-written JSON never is.
    say = json || /[{}"]/.test(text) ? "" : text;
  }
  // "*", "#" and "`" are markdown here (maths is written with ×); ">" and "_" stay, as in "5 > 3" or "a_1"
  say = say.replace(/[*#`]/g, "").replace(/\s+/g, " ").trim();
  return { say: say ? say.slice(0, 500) : FALLBACK_SAY, maths };
}

/** The model's reply as one spoken line. Never throws: anything unreadable becomes a polite "say that again". */
export function parseTutorReply(raw: string | null | undefined): string {
  return parseTutorJson(raw).say;
}

/** Said instead of a reply that failed the maths check twice: no maths in it at all. */
export function safeFallback(screen: VoiceTutorScreen): string {
  return screen.question && screen.helpOnQuestion
    ? "Let's take it one small step at a time. Read the question again and tell me which part feels tricky."
    : "Good question! Tell me which part of the steps on your screen feels confusing, and we'll look at it together.";
}

/** Sent back to the model with its failed reply, so the second try can fix exactly what was wrong. */
export function correctionNote(problems: string[]): string {
  return `Your reply can't be used: ${problems.slice(0, 5).join("; ")}. Rewrite it as one hint or one guiding question. ` +
    "Use only numbers from the question, its choices, the reviewed hints and the steps on screen. Never state the answer. Reply with the same JSON.";
}

/**
 * True when the transcript is only a filler ("um", "hmm") or empty: no reply, no cost.
 * A lone "okay" is a real answer (to "Shall we try the next step?"), so it is not a filler.
 */
export function isFiller(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return true;
  return /^(u+m+|h+m+|u+h+|a+h+|e+r+|o+h+|mm+)( (u+m+|h+m+|u+h+|a+h+|e+r+|mm+))*$/.test(t);
}

const NOTHING_SAID = new RegExp(
  "^(no (clear |audible |spoken )?(speech|words|voice|audio|sound)( (was |is )?(detected|heard|found|present))?" +
    "|there (is|was) no (clear |audible )?(speech|audio|sound|voice)" +
    "|(the )?(audio|recording|clip) (is|was) (silent|empty|blank|unclear|inaudible)" +
    "|inaudible|unintelligible|silence|silent|blank audio|background noise|no one is speaking|nobody is speaking)$",
);

/**
 * True when the transcript only describes the audio instead of quoting the student:
 * "[inaudible]", "(silence)", "No speech detected." Nothing was said, so there is no reply and no cost.
 */
export function isNothingSaid(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[[(<{*]\s*[a-z _-]*\s*[\])>}*]\.?$/i.test(t)) return true; // wholly bracketed words: [inaudible], (silence), *music*, never "(x + 3)"
  const plain = t.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return !plain || NOTHING_SAID.test(plain);
}

const VOICE_TOKEN_TTL_MS = 2 * 60 * 1000;
const VOICE_TOKEN_PREFIX = "vt1.";
const VOICE_TOKEN_AAD = Buffer.from("cogna-voice-tutor-voice-link-v1");
const voiceKeys = new Map<string, Buffer>();

/** A key used only for voice links, derived from the session secret. */
function voiceKey(secret: string): Buffer {
  let key = voiceKeys.get(secret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", secret, "cogna-voice-tutor", "voice-link-v1", 32));
    voiceKeys.set(secret, key);
  }
  return key;
}

/**
 * Voice links already played, until they expire. Per process and best effort: a link is single-use on the
 * replica that served it, and every link expires within two minutes anyway.
 */
const usedVoiceLinks = new Map<string, number>();
const MAX_REMEMBERED_LINKS = 50_000;

function markUsed(nonce: string, exp: number, now: number): void {
  if (usedVoiceLinks.size >= MAX_REMEMBERED_LINKS) {
    for (const [n, until] of usedVoiceLinks) if (until < now) usedVoiceLinks.delete(n);
    // Still full of live links: forget the oldest rather than grow without bound.
    for (const n of usedVoiceLinks.keys()) { if (usedVoiceLinks.size < MAX_REMEMBERED_LINKS) break; usedVoiceLinks.delete(n); }
  }
  usedVoiceLinks.set(nonce, exp);
}

export function resetVoiceLinksForTests(): void {
  usedVoiceLinks.clear();
}

/**
 * A sealed, single-use, two-minute token naming the line to speak, for an <audio> tag that cannot send
 * session headers. Encrypted (AES-256-GCM), so the reply, and the first name it may hold, can't be read
 * from the URL; authenticated, so it can't be altered.
 */
export function issueVoiceToken(text: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): string {
  const secret = sessionSecretFromEnv(env);
  if (!secret) throw new Error("Session signing is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", voiceKey(secret), iv);
  cipher.setAAD(VOICE_TOKEN_AAD);
  const body = JSON.stringify({ v: 1, t: text.slice(0, 800), e: now + VOICE_TOKEN_TTL_MS, n: randomBytes(12).toString("base64url") });
  const sealed = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return VOICE_TOKEN_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

/** Opens a voice link and uses it up. Null when it is unreadable, altered, expired or already used. */
export function verifyVoiceToken(token: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): { text: string } | null {
  const secret = sessionSecretFromEnv(env);
  if (!secret || !token?.startsWith(VOICE_TOKEN_PREFIX)) return null;
  try {
    const raw = Buffer.from(token.slice(VOICE_TOKEN_PREFIX.length), "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const decipher = createDecipheriv("aes-256-gcm", voiceKey(secret), raw.subarray(0, 12));
    decipher.setAAD(VOICE_TOKEN_AAD);
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(body) as { v?: number; t?: unknown; e?: unknown; n?: unknown };
    if (parsed.v !== 1 || typeof parsed.t !== "string" || !parsed.t || typeof parsed.e !== "number" || typeof parsed.n !== "string") return null;
    if (parsed.e < now || usedVoiceLinks.has(parsed.n)) return null;
    markUsed(parsed.n, parsed.e, now);
    return { text: parsed.t };
  } catch {
    return null; // a wrong key or an altered token fails the authentication tag
  }
}
