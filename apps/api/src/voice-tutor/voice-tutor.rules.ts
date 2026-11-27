import { sessionSecretFromEnv, signPayload, verifyMac } from "@cogna/shared/dist/session";

/**
 * The live voice tutor's pure rules: the switch, what the page may tell it, the
 * instructions it answers under, how its reply is read, and the signed token an
 * <audio> tag uses to fetch the spoken reply. Kept free of Nest and network so
 * the golden tests can pin every rule.
 *
 * Product decisions (UX-009, 27 Nov 2026): lessons and practice only, never the
 * Lotus check-in; talking during an open practice question counts as help (the
 * page records a hint before the tutor answers); off unless VOICE_TUTOR_ENABLED.
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

/** Turns one student may take per UTC day (each turn is a heard question, a reply and its voice). */
export function voiceTutorDailyTurns(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VOICE_TUTOR_STUDENT_DAILY_CALL_CAP?.trim();
  return raw && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? raw : "80";
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
   * May the tutor help with the open question? False when the page could not record the help
   * (no hint to record it with), so the tutor only talks about ideas, never this question.
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
- When reviewed hints are given, build on the next one the student has not used yet. Do not invent new facts or numbers.
- Never say whether the student's answer is right or wrong. The app checks answers itself.
- If help with the on-screen question is not allowed, talk only about the general idea and say you can help with this question after they try it.
- Stay on maths and learning. If they drift, bring them back kindly in one sentence.
- If they are upset or stuck, be encouraging and suggest one small next step.
Reply with JSON only: {"say": "..."}`;

/** The messages sent to the model for one turn. Earlier turns go in as a short transcript. */
export function tutorMessages(said: string, screen: VoiceTutorScreen, history: VoiceTutorTurn[]): Array<{ role: "system" | "user"; content: string }> {
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
  const past = history.map((t) => `${t.role === "student" ? "Student" : "Cogna"}: ${t.text}`);
  const ask = (past.length ? `The conversation so far:\n${past.join("\n")}\n\n` : "") + `The student now says: ${said.slice(0, 1000)}`;
  return [
    { role: "system", content: `${TUTOR_RULES}\n\nWhat the app shows right now:\n${lines.join("\n")}` },
    { role: "user", content: ask },
  ];
}

export const FALLBACK_SAY = "Sorry, could you say that again?";

/** The model's reply as one spoken line. Never throws: anything unreadable becomes a polite "say that again". */
export function parseTutorReply(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  if (!text) return FALLBACK_SAY;
  const json = text.match(/\{[\s\S]*\}/);
  let say = "";
  try {
    const parsed = JSON.parse(json ? json[0] : text) as { say?: unknown };
    say = typeof parsed.say === "string" ? parsed.say : "";
  } catch {
    // Plain words are spoken as they are; half-written JSON never is.
    say = json || /[{}"]/.test(text) ? "" : text;
  }
  say = say.replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  return say ? say.slice(0, 500) : FALLBACK_SAY;
}

/** True when the transcript is only a filler ("um", "hmm") or empty: no reply, no cost. */
export function isFiller(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return true;
  return /^(u+m+|h+m+|u+h+|a+h+|e+r+|o+h+|mm+|okay|ok)( (u+m+|h+m+|u+h+|a+h+|e+r+|mm+))*$/.test(t);
}

const VOICE_TOKEN_TTL_MS = 2 * 60 * 1000;

/** A short-lived signed token naming the line to speak, for an <audio> tag that cannot send session headers. */
export function issueVoiceToken(text: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): string {
  const secret = sessionSecretFromEnv(env);
  if (!secret) throw new Error("Session signing is not configured.");
  // Signed, not encrypted: it carries only the line the student already sees, and nothing about who they are.
  return signPayload(JSON.stringify({ role: "voice-tutor", text: text.slice(0, 500), exp: now + VOICE_TOKEN_TTL_MS }), secret);
}

export function verifyVoiceToken(token: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): { text: string } | null {
  const secret = sessionSecretFromEnv(env);
  if (!secret || !token) return null;
  const payload = verifyMac(token, secret);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { role?: string; text?: string; exp?: number };
    if (parsed.role !== "voice-tutor" || !parsed.text || (parsed.exp ?? 0) < now) return null;
    return { text: parsed.text };
  } catch {
    return null;
  }
}
