/**
 * Pure logic for the shadow-mode Break Advisor Agent — no Prisma, no
 * NestJS. Same split as student-analysis.formulas.ts / diagnostic-formulas.ts.
 */
import { DEFAULT_BREAK_MINUTES } from "../diagnostic-engine/diagnostic-formulas";

const MIN_BREAK_MINUTES = 1;
const MAX_BREAK_MINUTES = 10;

/** The AI never gets to pick an unbounded break length — always clamped in code, never trusted raw. */
export function clampBreakMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_BREAK_MINUTES;
  return Math.min(MAX_BREAK_MINUTES, Math.max(MIN_BREAK_MINUTES, Math.round(minutes)));
}

export function agreesWithRule(ruleSuggestsBreak: boolean, aiSuggestsBreak: boolean): boolean {
  return ruleSuggestsBreak === aiSuggestsBreak;
}

export interface BreakContext {
  sessionMinutes: number;
  recentIncorrectStreak: number;
  idleSpikeCount: number;
  averageTimeIncreasing50Pct: boolean;
  ruleSuggestsBreak: boolean;
}

export function buildBreakPrompts(ctx: BreakContext): { system: string; user: string } {
  const system =
    "You decide whether a student practicing maths should be offered a short break right now. " +
    "Only use the signals given — session length, recent wrong-answer streak, idle pauses, and " +
    "slowing response times. Never infer mood, attention, motivation, or any clinical trait. " +
    "A break should feel optional and calm, never a punishment or a judgment about effort. " +
    "Return JSON only in this exact shape: " +
    '{"suggestBreak":boolean,"minutes":number between 1 and 10,"confidence":number between 0 and 1,"reasoning":string, one plain sentence}. ' +
    "No other keys.";

  const user = [
    `Session length so far: ${ctx.sessionMinutes.toFixed(1)} minutes.`,
    `Recent incorrect-answer streak: ${ctx.recentIncorrectStreak}.`,
    `Idle pauses over 45 seconds this session: ${ctx.idleSpikeCount}.`,
    `Response times trending 50%+ slower than earlier in the session: ${ctx.averageTimeIncreasing50Pct ? "yes" : "no"}.`,
  ].join("\n");

  return { system, user };
}
