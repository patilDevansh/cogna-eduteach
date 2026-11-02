import type {
  CommitThenChooseGame,
  CommitThenChooseResponse,
  LotusClaimVerdict,
  LotusGameConfig,
  LotusGameKind,
  LotusGameReading,
  LotusGameResponse,
  LotusQuestion,
  TrueFalseGame,
  TrueFalseResponse,
  TwoNumbersGame,
  TwoNumbersResponse,
} from "@cogna/shared";
import { LOTUS_CLAIM_VERDICTS, LOTUS_GAME_MAX_TRIES } from "@cogna/shared";
import { gameFormatsEnabled, tidyAlgebra } from "../interaction-formats/tile-builder";
import { algebraicallyEqual, classifyFactorisation, isReadable, normalizeMathText } from "./lotus-algebra";

/**
 * Themed Lotus games, built and read by code.
 *
 * Every game is made from the checked question (its expression, its canonical
 * answer and the mistakes students are known to make), never from the browser.
 * On submit the server rebuilds the answer from the payload and reads the
 * process evidence itself, so the reading is the same whichever look
 * (theme) the student played in: the theme is not even an input here.
 *
 * Games apply to a monic trinomial whose answer is two brackets, (x + p)(x + q).
 * Anything else stays a tile game or typed.
 */

export class LotusGameError extends Error {}

/**
 * The single switch for themed games. Off only when explicitly turned off (or
 * when all game formats are off). "all" skips the half-of-items rule so a test
 * run can reach a game quickly; it never changes how a game is read.
 */
export function themedGamesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return gameFormatsEnabled(env) && (env.COGNA_THEMED_GAMES ?? "on").toLowerCase() !== "off";
}

interface Pair { p: number; q: number }

const KINDS: readonly LotusGameKind[] = ["TWO_NUMBERS", "COMMIT_THEN_CHOOSE", "TRUE_FALSE"];

const PAIR_TEXT = /^\(x([+-]\d+)\)\*?\(x([+-]\d+)\)$/;

/** (x + 4)(x - 1) → {p: 4, q: -1}; null for anything that is not exactly two monic brackets with whole numbers. */
export function parseMonicPair(text: string): Pair | null {
  const m = PAIR_TEXT.exec(normalizeMathText(text).toLowerCase());
  if (!m) return null;
  const p = Number(m[1]);
  const q = Number(m[2]);
  return Number.isInteger(p) && Number.isInteger(q) && p !== 0 && q !== 0 ? { p, q } : null;
}

function bracketText(n: number): string {
  return `(x ${n < 0 ? "-" : "+"} ${Math.abs(n)})`;
}

/** The answer text the marking accepts for a pair. */
export function pairAnswer({ p, q }: Pair): string {
  return `${bracketText(p)}${bracketText(q)}`;
}

const sameSet = (a: Pair, b: Pair) => (a.p === b.p && a.q === b.q) || (a.p === b.q && a.q === b.p);

interface Target { pair: Pair; product: number; sum: number; range: number }

/** What the question asks for, read from the checked canonical answer. Null when the item is not a monic two-bracket factorisation. */
function targetOf(question: LotusQuestion): Target | null {
  const d = question.answerKey.diagnostics;
  if (!d || d.itemKind !== "FACTORISE" || !d.expression) return null;
  const pair = parseMonicPair(question.answerKey.canonicalAnswer);
  if (!pair || Math.max(Math.abs(pair.p), Math.abs(pair.q)) > 20) return null;
  try {
    if (classifyFactorisation(question.answerKey.canonicalAnswer, d.expression) !== "CORRECT") return null;
  } catch {
    return null;
  }
  return { pair, product: pair.p * pair.q, sum: pair.p + pair.q, range: Math.max(12, Math.max(Math.abs(pair.p), Math.abs(pair.q)) + 3) };
}

type PairKind = "right" | "flip" | "prod" | "other";

/** How a pair relates to the question: right, both signs flipped, the right product with another sum, or something else. */
function classifyPair(pair: Pair, t: Target): PairKind {
  if (sameSet(pair, t.pair)) return "right";
  if (pair.p * pair.q !== t.product) return "other";
  if (pair.p + pair.q === -t.sum) return "flip";
  return "prod";
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function seededRandom(seed: string): () => number {
  let h = hashOf(seed);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function shuffled<T>(seed: string, items: T[]): T[] {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function equalSafe(a: string, b: string): boolean {
  try { return algebraicallyEqual(a, b); } catch { return false; }
}

// ---------- building ----------

/** Other pairs with the same product, nearest to the right ones last, for look-alike options. */
function sameProductPairs(t: Target): Pair[] {
  const out: Pair[] = [];
  const prod = t.product;
  for (let r = 1; r <= Math.abs(prod); r++) {
    if (prod % r !== 0) continue;
    const s = prod / r;
    for (const [p, q] of [[r, s], [-r, -s]] as const) {
      const pair = { p, q };
      if (p === 0 || q === 0 || sameSet(pair, t.pair) || out.some((o) => sameSet(o, pair))) continue;
      out.push(pair);
    }
  }
  return out;
}

function buildCommitOptions(question: LotusQuestion, t: Target): string[] | null {
  const mistakes = question.answerKey.diagnostics!.predictedMistakes.map((m) => parseMonicPair(m.answer)).filter((m): m is Pair => !!m);
  const pool: Pair[] = [t.pair, ...mistakes, { p: -t.pair.p, q: -t.pair.q }, ...sameProductPairs(t)];
  const chosen: Pair[] = [];
  for (const pair of pool) {
    if (chosen.length >= 4) break;
    if (!chosen.some((c) => sameSet(c, pair)) && Math.max(Math.abs(pair.p), Math.abs(pair.q)) <= t.range) chosen.push(pair);
  }
  if (chosen.length < 3) return null;
  return shuffled(`${question.id}|COMMIT`, chosen).map(pairAnswer);
}

/** A false claim has to be false: unreadable or equal-valued candidates are dropped. */
function buildClaims(question: LotusQuestion, t: Target): string[] | null {
  const d = question.answerKey.diagnostics!;
  const expression = d.expression!;
  const seen = new Set<string>();
  const add = (list: string[], text: string) => {
    const key = normalizeMathText(text).toLowerCase();
    if (!key || seen.has(key) || !isReadable(text)) return false;
    seen.add(key);
    list.push(tidyAlgebra(text));
    return true;
  };
  const trues: string[] = [];
  const falses: string[] = [];
  add(trues, pairAnswer(t.pair));
  // The brackets the other way round is the same answer: a control that should be called true.
  if (t.pair.p !== t.pair.q) add(trues, pairAnswer({ p: t.pair.q, q: t.pair.p }));
  for (const m of d.predictedMistakes) if (falses.length < 4 && !equalSafe(m.answer, expression)) add(falses, m.answer);
  const generated = [{ p: -t.pair.p, q: -t.pair.q }, ...sameProductPairs(t)];
  for (const pair of generated) if (falses.length < 4 && !equalSafe(pairAnswer(pair), expression)) add(falses, pairAnswer(pair));
  if (falses.length < 2) return null;
  return shuffled(`${question.id}|TF`, [...trues, ...falses]);
}

export function buildLotusGame(question: LotusQuestion, kind: LotusGameKind): LotusGameConfig | undefined {
  const t = targetOf(question);
  if (!t) return undefined;
  const base = { version: 1 as const, expression: tidyAlgebra(question.answerKey.diagnostics!.expression!) };
  try {
    if (kind === "TWO_NUMBERS") return { ...base, kind, range: t.range } satisfies TwoNumbersGame;
    if (kind === "COMMIT_THEN_CHOOSE") {
      const options = buildCommitOptions(question, t);
      return options ? ({ ...base, kind, range: t.range, options } satisfies CommitThenChooseGame) : undefined;
    }
    const claims = buildClaims(question, t);
    return claims ? ({ ...base, kind, claims } satisfies TrueFalseGame) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which game, if any, a question is played as. Same turns as the tile games
 * (the opening, every repurposed turn, every second coverage turn); about half
 * of those items become a game, and which one depends only on the question, so
 * the choice never depends on the student's theme.
 */
export function chooseLotusGame(question: LotusQuestion, context: { turn: number; repurposed: boolean }, env: NodeJS.ProcessEnv = process.env): LotusGameConfig | undefined {
  if (!themedGamesEnabled(env)) return undefined;
  if (!(context.turn === 1 || context.repurposed || context.turn % 2 === 0)) return undefined;
  const h = hashOf(question.id);
  if (h % 2 === 0 && (env.COGNA_THEMED_GAMES ?? "").toLowerCase() !== "all") return undefined;
  const start = (h >>> 1) % KINDS.length;
  for (let i = 0; i < KINDS.length; i++) {
    const game = buildLotusGame(question, KINDS[(start + i) % KINDS.length]!);
    if (game) return game;
  }
  return undefined;
}

// ---------- reading ----------

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const clampMs = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 3_600_000) : undefined);

function checkedNumber(n: unknown, range: number, what: string): number {
  if (!isInt(n) || n === 0 || Math.abs(n) > range) throw new LotusGameError(`${what} is out of range.`);
  return n;
}

function signed(n: number): string {
  return n < 0 ? `−${-n}` : `${n}`;
}

const KIND_NAMES: Record<PairKind, string> = {
  right: "the right answer",
  flip: "signs flipped (right product, sum the wrong way round)",
  prod: "the right product but the wrong sum",
  other: "a pair that does not fit",
};

interface Read {
  answer: string;
  didNotKnow?: boolean;
  /** The payload as the server accepted it: only known fields, numbers checked and clamped. */
  game: LotusGameResponse;
  reading: LotusGameReading;
}

function readTwoNumbers(question: LotusQuestion, t: Target, game: TwoNumbersGame, raw: TwoNumbersResponse): Read {
  if (!Array.isArray(raw.tries) || raw.tries.length > LOTUS_GAME_MAX_TRIES) throw new LotusGameError("The search is malformed.");
  const tries = raw.tries.map((x) => ({ p: checkedNumber(x?.p, game.range, "A number"), q: checkedNumber(x?.q, game.range, "A number"), ...(clampMs(x?.atMs) !== undefined ? { atMs: clampMs(x?.atMs)! } : {}) }));
  const final = { p: checkedNumber(raw.final?.p, game.range, "A number"), q: checkedNumber(raw.final?.q, game.range, "A number") };
  const path: Pair[] = tries.map(({ p, q }) => ({ p, q }));
  const last = path[path.length - 1];
  if (!last || last.p !== final.p || last.q !== final.q) path.push(final);

  const on = path.filter((x) => x.p * x.q === t.product).length;
  const slip = path.some((x) => x.p * x.q === t.product && x.p + x.q === -t.sum && t.sum !== 0);
  const finalKind = classifyPair(final, t);
  const ratio = on / path.length;
  const signals = [`final_${finalKind}`];
  let style: string;
  if (path.length <= 2) { style = finalKind === "right" ? "Straight there: fluent." : "Settled almost at once."; if (finalKind === "right") signals.push("straight_there"); }
  else if (ratio >= 0.5) { style = `${on} of ${path.length} tries had the right product: a systematic search.`; signals.push("systematic_search"); }
  else { style = `Only ${on} of ${path.length} tries had the right product: trial and error.`; signals.push("trial_and_error"); }
  if (slip) signals.push("hit_sign_slip");
  if (slip && finalKind === "right") signals.push("fixed_sign_slip");
  const summary = `Locked in ${signed(final.p)} and ${signed(final.q)}: ${KIND_NAMES[finalKind]}. ${style}${slip ? (finalKind === "right" ? " On the way they tried the sign-flipped pair and corrected it themselves." : " They tried the sign-flipped pair on the way.") : ""}`;
  return {
    answer: pairAnswer(final),
    game: { kind: "TWO_NUMBERS", tries, final },
    reading: {
      kind: "TWO_NUMBERS", summary, signals, skillId: question.answerKey.diagnostics!.skillId,
      certainty: finalKind === "right" ? (path.length <= 2 ? 0.95 : 0.7) : 0.6,
      facts: { tries: path.length, onProduct: on, finalKind, signSlipTried: slip },
    },
  };
}

function readCommit(question: LotusQuestion, t: Target, game: CommitThenChooseGame, raw: CommitThenChooseResponse): Read {
  const guess = { p: checkedNumber(raw.guess?.p, game.range, "The guess"), q: checkedNumber(raw.guess?.q, game.range, "The guess") };
  if (!isInt(raw.pick) || raw.pick < 0 || raw.pick >= game.options.length) throw new LotusGameError("Choose one of the options.");
  const option = parseMonicPair(game.options[raw.pick]!);
  if (!option) throw new LotusGameError("That option cannot be read.");
  const pk = classifyPair(guess, t);
  const ok = classifyPair(option, t);
  const signals = [`guess_${pk}`, `pick_${ok}`];
  let summary: string;
  let certainty = 0.6;
  if (pk === "right" && ok === "right") { summary = "Committed to the right answer first, then picked it. Real factorising."; signals.push("predicted_then_picked"); certainty = 0.9; }
  else if (ok === "right") { summary = "The guess was off but the pick is right. They most likely found it by checking the options, which is expanding: an easier skill than factorising."; signals.push("checked_options"); }
  else if (pk === "right") { summary = "Guessed right before seeing the options, then picked something else: second-guessed themselves."; signals.push("changed_a_right_guess"); }
  else if (pk === ok) { summary = `The same mistake twice, independently (${KIND_NAMES[ok]}). Strong evidence.`; signals.push("same_mistake_twice"); }
  else { summary = "The guess and the pick disagree, and both are wrong. Doesn't know yet."; signals.push("guess_and_pick_disagree"); }
  const chooseMs = clampMs(raw.chooseMs);
  return {
    answer: game.options[raw.pick]!,
    game: { kind: "COMMIT_THEN_CHOOSE", guess, pick: raw.pick, ...(chooseMs !== undefined ? { chooseMs } : {}) },
    reading: { kind: "COMMIT_THEN_CHOOSE", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty, facts: { guessKind: pk, pickKind: ok } },
  };
}

/** What a false claim is evidence of: the predicted mistake it matches, else how the pair relates to the question. */
function claimFamily(question: LotusQuestion, t: Target, claim: string): string {
  const key = normalizeMathText(claim).toLowerCase();
  const hit = question.answerKey.diagnostics!.predictedMistakes.find((m) => normalizeMathText(m.answer).toLowerCase() === key);
  if (hit) return hit.mistake;
  const pair = parseMonicPair(claim);
  const kind = pair ? classifyPair(pair, t) : "other";
  return kind === "flip" ? "Flips the signs into the brackets" : kind === "prod" ? "Matches the product but ignores the sum" : "Another wrong answer";
}

function readTrueFalse(question: LotusQuestion, t: Target, game: TrueFalseGame, raw: TrueFalseResponse): Read {
  if (!Array.isArray(raw.verdicts) || raw.verdicts.length !== game.claims.length || raw.verdicts.some((v) => !LOTUS_CLAIM_VERDICTS.includes(v))) throw new LotusGameError("Judge every card before submitting.");
  const verdicts = raw.verdicts as LotusClaimVerdict[];
  const expression = question.answerKey.diagnostics!.expression!;
  const truth = game.claims.map((c) => equalSafe(c, expression));
  const cardMs = Array.isArray(raw.cardMs) && raw.cardMs.length === game.claims.length ? raw.cardMs.map((n) => clampMs(n) ?? 0) : undefined;

  const mark = (i: number): "ok" | "hit" | "uns" => (verdicts[i] === "unsure" ? "uns" : (verdicts[i] === "true") === truth[i] ? "ok" : "hit");
  const families = new Map<string, number[]>();
  game.claims.forEach((c, i) => {
    const name = truth[i] ? "Control: a claim that is true" : claimFamily(question, t, c);
    families.set(name, [...(families.get(name) ?? []), i]);
  });
  const signals: string[] = [];
  const lines: string[] = [];
  let hitsOnFalse = 0;
  let unsure = 0;
  for (const [name, idx] of families) {
    const marks = idx.map(mark);
    const nh = marks.filter((m) => m === "hit").length;
    unsure += marks.filter((m) => m === "uns").length;
    if (name.startsWith("Control")) {
      if (nh) { signals.push("missed_control"); lines.push("Called a true claim false, so read the rest with care."); }
      continue;
    }
    hitsOnFalse += nh;
    if (nh === idx.length && idx.length >= 2) { signals.push(`believes:${name}`); lines.push(`Believes “${name}”: all ${idx.length} claims of it were called true.`); }
    else if (nh) { signals.push(`possible:${name}`); lines.push(`Called ${nh} of ${idx.length} “${name}” claims true: ${nh === idx.length ? "worth a second look" : "could be a slip"}.`); }
  }
  if (unsure) { signals.push("unsure_on_some"); lines.push(`Marked ${unsure} unsure.`); }
  if (!lines.length) lines.push("Every claim judged correctly.");
  if (cardMs) {
    const sorted = [...cardMs].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const slow = cardMs.map((ms, i) => [ms, i] as const).filter(([ms]) => med > 0 && ms > med * 1.8).map(([, i]) => `claim ${i + 1}`);
    if (slow.length) { signals.push("slow_on_some"); lines.push(`Took much longer on ${slow.join(", ")}.`); }
  }

  // What gets marked: a false claim called true is the answer given; otherwise a true claim called true means the right answer.
  const wrongTrue = game.claims.filter((_, i) => verdicts[i] === "true" && !truth[i]);
  const rightTrue = game.claims.some((_, i) => verdicts[i] === "true" && truth[i]);
  let answer: string;
  let didNotKnow = false;
  if (wrongTrue.length) answer = wrongTrue[0]!;
  else if (rightTrue) answer = pairAnswer(t.pair);
  else if (verdicts.every((v) => v === "unsure")) { answer = "I don't know"; didNotKnow = true; }
  else answer = "None of these";

  return {
    answer, ...(didNotKnow ? { didNotKnow } : {}),
    game: { kind: "TRUE_FALSE", verdicts, ...(cardMs ? { cardMs } : {}) },
    reading: {
      kind: "TRUE_FALSE", summary: lines.join(" "), signals, skillId: question.answerKey.diagnostics!.skillId,
      certainty: hitsOnFalse ? 0.75 : unsure ? 0.25 : 0.8,
      facts: { claims: game.claims.length, calledFalseClaimTrue: hitsOnFalse, unsure },
    },
  };
}

/**
 * The marked answer and the process evidence for a submitted game, read
 * against the game this server issued. Throws LotusGameError for a payload
 * that does not fit that game.
 */
export function readLotusGame(question: LotusQuestion, response: LotusGameResponse | undefined): Read {
  const game = question.game;
  if (!game) throw new LotusGameError("This question isn't a game.");
  const t = targetOf(question);
  if (!t || !response || typeof response !== "object" || response.kind !== game.kind) throw new LotusGameError("That doesn't match the game on screen.");
  switch (game.kind) {
    case "TWO_NUMBERS": return readTwoNumbers(question, t, game, response as TwoNumbersResponse);
    case "COMMIT_THEN_CHOOSE": return readCommit(question, t, game, response as CommitThenChooseResponse);
    case "TRUE_FALSE": return readTrueFalse(question, t, game, response as TrueFalseResponse);
  }
}
