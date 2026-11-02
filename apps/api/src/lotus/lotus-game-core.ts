import type { LotusGameDiagnosis, LotusGameReading, LotusGameResponse, LotusQuestion } from "@cogna/shared";
import { gameFormatsEnabled } from "../interaction-formats/tile-builder";
import { algebraicallyEqual } from "./lotus-algebra";
import { findSkill } from "./lotus-factorisation-catalogue";

/** Pieces every themed game shares: the error, the switch, seeded shuffles and the reading a game hands back. */

export class LotusGameError extends Error {}

/**
 * The single switch for themed games. Off only when explicitly turned off (or
 * when all game formats are off). "all" skips the half-of-items rule so a test
 * run can reach a game quickly; it never changes how a game is read.
 */
export function themedGamesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return gameFormatsEnabled(env) && (env.COGNA_THEMED_GAMES ?? "on").toLowerCase() !== "off";
}

export function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function seededRandom(seed: string): () => number {
  let h = hashOf(seed);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(seed: string, items: T[]): T[] {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function equalSafe(a: string, b: string): boolean {
  try { return algebraicallyEqual(a, b); } catch { return false; }
}

export const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
export const clampMs = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 3_600_000) : undefined);

/** A mistake code only counts on a skill that has it: x² − 16 has no "signs swapped". */
export function ownMistake(question: LotusQuestion, code: string): string | undefined {
  return findSkill(question.answerKey.diagnostics!.skillId)?.mistakes.includes(code) ? code : undefined;
}

/** A diagnosis that raises a mistake the question's own skill owns (the skill alone when it owns none). */
export function mistakeWith(question: LotusQuestion, code: string | undefined, note: string): LotusGameDiagnosis {
  const owned = code ? ownMistake(question, code) : undefined;
  return { effect: "MISTAKE", ...(owned ? { mistake: owned } : {}), note };
}

export interface Read {
  answer: string;
  didNotKnow?: boolean;
  /** Set when the play itself says how sure the student was, in place of a separate question. */
  confidence?: number;
  /** The payload as the server accepted it: only known fields, numbers checked and clamped. */
  game: LotusGameResponse;
  reading: LotusGameReading;
}
