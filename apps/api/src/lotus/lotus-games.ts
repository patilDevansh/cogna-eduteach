import type {
  CommitThenChooseGame,
  CommitThenChooseResponse,
  EditHistoryGame,
  EditHistoryResponse,
  FourSignsGame,
  FourSignsResponse,
  LotusBracketSign,
  LotusClaimVerdict,
  LotusGameConfig,
  LotusGameDiagnosis,
  LotusGameKind,
  LotusGameReading,
  LotusGameResponse,
  LotusQuestion,
  SplitConfidenceGame,
  SplitConfidenceResponse,
  TrueFalseGame,
  TrueFalseResponse,
  TwoMovesGame,
  TwoMovesResponse,
  TwoNumbersGame,
  TwoNumbersResponse,
} from "@cogna/shared";
import { LOTUS_CLAIM_VERDICTS, LOTUS_EDIT_MAX_LENGTH, LOTUS_EDIT_MAX_SAMPLES, LOTUS_GAME_MAX_TRIES, LOTUS_SPLIT_TOKENS } from "@cogna/shared";
import { gameFormatsEnabled, tidyAlgebra } from "../interaction-formats/tile-builder";
import { algebraicallyEqual, classifyFactorisation, isReadable, normalizeMathText } from "./lotus-algebra";
import { findSkill } from "./lotus-factorisation-catalogue";

/**
 * Themed Lotus games, built and read by code.
 *
 * Every game is made from the checked question (its expression, its canonical
 * answer and the mistakes students are known to make), never from the browser.
 * On submit the server rebuilds the answer from the payload and reads the
 * process evidence itself, so the reading is the same whichever look
 * (theme) the student played in: the theme is not even an input here.
 *
 * Most games apply to a monic trinomial whose answer is two brackets,
 * (x + p)(x + q). "Edit history" is typed, so it fits any factorising question.
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

/** The games that take the place of a tile game. "Edit history" is not one: it dresses a typed turn. */
const TILE_TURN_KINDS: readonly LotusGameKind[] = ["TWO_NUMBERS", "COMMIT_THEN_CHOOSE", "TRUE_FALSE", "SPLIT_CONFIDENCE", "TWO_MOVES", "FOUR_SIGNS"];

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

/** A factorising question whose stored answer the algebra engine marks right: the least any game needs. */
function isCheckedFactorising(question: LotusQuestion): boolean {
  const d = question.answerKey.diagnostics;
  if (!d || d.itemKind !== "FACTORISE" || !d.expression) return false;
  try {
    return classifyFactorisation(question.answerKey.canonicalAnswer, d.expression) === "CORRECT";
  } catch {
    return false;
  }
}

/** What the question asks for, read from the checked canonical answer. Null when the item is not a monic two-bracket factorisation. */
function targetOf(question: LotusQuestion): Target | null {
  if (!isCheckedFactorising(question)) return null;
  const pair = parseMonicPair(question.answerKey.canonicalAnswer);
  if (!pair || Math.max(Math.abs(pair.p), Math.abs(pair.q)) > 20) return null;
  return { pair, product: pair.p * pair.q, sum: pair.p + pair.q, range: Math.max(12, Math.max(Math.abs(pair.p), Math.abs(pair.q)) + 3) };
}

type PairKind = "right" | "flip" | "prod" | "swap" | "other";

/** How a pair relates to the question: right, both signs flipped, the right product with another sum, product and sum mixed up, or something else. */
function classifyPair(pair: Pair, t: Target): PairKind {
  if (sameSet(pair, t.pair)) return "right";
  if (pair.p * pair.q === t.sum && pair.p + pair.q === t.product) return "swap";
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

/** The pair that multiplies to the sum and adds to the product: the "mixed them up" answer, when whole numbers allow it. */
function swappedPair(t: Target): Pair[] {
  const disc = t.product * t.product - 4 * t.sum;
  const root = Math.sqrt(disc);
  if (disc < 0 || !Number.isInteger(root)) return [];
  const p = (t.product + root) / 2;
  const q = (t.product - root) / 2;
  return Number.isInteger(p) && Number.isInteger(q) && p !== 0 && q !== 0 ? [{ p, q }] : [];
}

function buildOptions(question: LotusQuestion, t: Target, seed: string): string[] | null {
  const mistakes = question.answerKey.diagnostics!.predictedMistakes.map((m) => parseMonicPair(m.answer)).filter((m): m is Pair => !!m);
  const pool: Pair[] = [t.pair, ...mistakes, { p: -t.pair.p, q: -t.pair.q }, ...swappedPair(t), ...sameProductPairs(t)];
  const chosen: Pair[] = [];
  for (const pair of pool) {
    if (chosen.length >= 4) break;
    if (!chosen.some((c) => sameSet(c, pair)) && Math.max(Math.abs(pair.p), Math.abs(pair.q)) <= t.range) chosen.push(pair);
  }
  if (chosen.length < 3) return null;
  return shuffled(`${question.id}|${seed}`, chosen).map(pairAnswer);
}

const FOUR_CASES: ReadonlyArray<[LotusBracketSign, LotusBracketSign]> = [["+", "+"], ["-", "-"], ["-", "+"], ["+", "-"]];
const signValue = (s: LotusBracketSign) => (s === "+" ? 1 : -1);

/** The expression (x ± a)(x ± b) expands to. */
function caseExpression(a: number, b: number, [sa, sb]: readonly [LotusBracketSign, LotusBracketSign]): string {
  const mid = signValue(sa) * a + signValue(sb) * b;
  const last = signValue(sa) * signValue(sb) * a * b;
  const midText = Math.abs(mid) === 1 ? "x" : `${Math.abs(mid)}x`;
  return `x^2 ${mid < 0 ? "-" : "+"} ${midText} ${last < 0 ? "-" : "+"} ${Math.abs(last)}`;
}

/** The numbers smaller first, and the four cases in this question's display order. Same result every time for a question. */
function fourCases(question: LotusQuestion, t: Target) {
  const a = Math.min(Math.abs(t.pair.p), Math.abs(t.pair.q));
  const b = Math.max(Math.abs(t.pair.p), Math.abs(t.pair.q));
  return { a, b, order: shuffled(`${question.id}|FOUR`, [...FOUR_CASES]) };
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
  if (!isCheckedFactorising(question)) return undefined;
  const base = { version: 1 as const, expression: tidyAlgebra(question.answerKey.diagnostics!.expression!) };
  if (kind === "EDIT_HISTORY") return { ...base, kind } satisfies EditHistoryGame;
  const t = targetOf(question);
  if (!t) return undefined;
  try {
    if (kind === "TWO_NUMBERS") return { ...base, kind, range: t.range } satisfies TwoNumbersGame;
    if (kind === "COMMIT_THEN_CHOOSE") {
      const options = buildOptions(question, t, "COMMIT");
      return options ? ({ ...base, kind, range: t.range, options } satisfies CommitThenChooseGame) : undefined;
    }
    if (kind === "SPLIT_CONFIDENCE") {
      const options = buildOptions(question, t, "SPLIT");
      return options ? ({ ...base, kind, options } satisfies SplitConfidenceGame) : undefined;
    }
    if (kind === "TWO_MOVES") return { ...base, kind, range: t.range } satisfies TwoMovesGame;
    if (kind === "FOUR_SIGNS") {
      const { a, b, order } = fourCases(question, t);
      // With equal numbers (x² − 16) two of the cases are the same expression, so there is no pattern to read.
      if (a === b) return undefined;
      const cases = order.map((signs) => caseExpression(a, b, signs));
      if (!cases.some((c) => equalSafe(c, question.answerKey.diagnostics!.expression!))) return undefined;
      return { ...base, kind, numbers: [a, b], cases: cases.map(tidyAlgebra) } satisfies FourSignsGame;
    }
    const claims = buildClaims(question, t);
    return claims ? ({ ...base, kind, claims } satisfies TrueFalseGame) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which game, if any, a question is played as. On the tile-game turns (the
 * opening, every repurposed turn, every second coverage turn) about half of the
 * two-bracket items become a game. On the typed turns about half of the items
 * become "Edit history", which is still typed and still asks for working: it
 * only adds the deleted drafts. The choice depends only on the question, so it
 * never depends on the student's theme.
 */
export function chooseLotusGame(question: LotusQuestion, context: { turn: number; repurposed: boolean }, env: NodeJS.ProcessEnv = process.env): LotusGameConfig | undefined {
  if (!themedGamesEnabled(env)) return undefined;
  const h = hashOf(question.id);
  if (h % 2 === 0 && (env.COGNA_THEMED_GAMES ?? "").toLowerCase() !== "all") return undefined;
  if (!(context.turn === 1 || context.repurposed || context.turn % 2 === 0)) return buildLotusGame(question, "EDIT_HISTORY");
  return twoBracketGame(question, h);
}

function twoBracketGame(question: LotusQuestion, h: number): LotusGameConfig | undefined {
  const start = (h >>> 1) % TILE_TURN_KINDS.length;
  for (let i = 0; i < TILE_TURN_KINDS.length; i++) {
    const game = buildLotusGame(question, TILE_TURN_KINDS[(start + i) % TILE_TURN_KINDS.length]!);
    if (game) return game;
  }
  return undefined;
}

/**
 * The crossword and cut-and-build take the two-bracket questions on any turn,
 * which would leave these games none. About half of those questions are played
 * as a themed game instead. Null keeps the puzzle.
 */
export function chooseLotusGameOverPuzzle(question: LotusQuestion, env: NodeJS.ProcessEnv = process.env): LotusGameConfig | undefined {
  if (!themedGamesEnabled(env)) return undefined;
  const h = hashOf(question.id);
  if (h % 2 === 0 && (env.COGNA_THEMED_GAMES ?? "").toLowerCase() !== "all") return undefined;
  return twoBracketGame(question, h);
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

/** A mistake code as a teacher reads it: SIGNS_SWAPPED → "signs swapped". */
const mistakeWords = (code: string) => code.toLowerCase().replace(/_/g, " ");

const KIND_NAMES: Record<PairKind, string> = {
  right: "the right answer",
  flip: "signs flipped (right product, sum the wrong way round)",
  prod: "the right product but the wrong sum",
  swap: "product and sum mixed up",
  other: "a pair that does not fit",
};

/** The mistake a two-bracket pair shows, by how it relates to the question. */
const KIND_MISTAKE: Record<Exclude<PairKind, "right">, string> = {
  flip: "SIGNS_SWAPPED",
  prod: "WRONG_FACTOR_PAIR_SUM",
  swap: "PRODUCT_SUM_SWAPPED",
  other: "WRONG_FACTOR_PAIR_PRODUCT",
};

/** A mistake code only counts on a skill that has it: x² − 16 has no "signs swapped". */
function ownMistake(question: LotusQuestion, code: string): string | undefined {
  return findSkill(question.answerKey.diagnostics!.skillId)?.mistakes.includes(code) ? code : undefined;
}

function mistakeOf(question: LotusQuestion, kind: PairKind, note: string): LotusGameDiagnosis {
  return { effect: "MISTAKE", ...(kind !== "right" && ownMistake(question, KIND_MISTAKE[kind]) ? { mistake: KIND_MISTAKE[kind] } : {}), note };
}

interface Read {
  answer: string;
  didNotKnow?: boolean;
  /** Set when the play itself says how sure the student was, in place of a separate question. */
  confidence?: number;
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
      diagnosis: finalKind !== "right" ? mistakeOf(question, finalKind, "The two numbers chosen don't make this factorisation.")
        // A long hunt with the product and sum on screen can land on the answer without knowing how to get there.
        : signals.includes("trial_and_error") ? { effect: "NEEDS_ANOTHER", note: "Reached the answer by trying many pairs." }
        : { effect: "SECURE" },
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
    reading: {
      kind: "COMMIT_THEN_CHOOSE", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty,
      diagnosis: signals.includes("predicted_then_picked") ? { effect: "SECURE" }
        : signals.includes("checked_options") ? { effect: "NO_EVIDENCE", note: "Picked the right answer after a different first answer, so it may have come from checking the options." }
        : signals.includes("changed_a_right_guess") ? { effect: "NO_EVIDENCE", note: "Wrote the right answer first, then picked a different one." }
        : signals.includes("same_mistake_twice") ? mistakeOf(question, ok, "Wrote this answer first and picked it again from the options.")
        : { effect: "DOESNT_KNOW", note: "The first answer and the pick were two different wrong answers." },
      facts: { guessKind: pk, pickKind: ok },
    },
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
    if (nh === idx.length && idx.length >= 2) { signals.push(`believes:${name}`); lines.push(`Believes “${mistakeWords(name)}”: all ${idx.length} claims of it were called true.`); }
    else if (nh) { signals.push(`possible:${name}`); lines.push(`Called ${nh} of ${idx.length} “${mistakeWords(name)}” claims true: ${nh === idx.length ? "worth a second look" : "could be a slip"}.`); }
  }
  if (unsure) { signals.push("unsure_on_some"); lines.push(`Marked ${unsure} unsure.`); }
  if (!lines.length) lines.push("Every claim judged correctly.");
  if (cardMs) {
    const sorted = [...cardMs].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const slow = cardMs.map((ms, i) => [ms, i] as const).filter(([ms]) => med > 0 && ms > med * 1.8).map(([, i]) => `claim ${i + 1}`);
    if (slow.length) { signals.push("slow_on_some"); lines.push(`Took much longer on ${slow.join(", ")}.`); }
  }

  const allRight = !hitsOnFalse && !unsure && !signals.includes("missed_control");
  if (allRight) signals.push("all_judged_right");
  // What gets marked: a false claim called true is the answer given; otherwise a true claim called true means the right answer.
  const wrongTrue = game.claims.filter((_, i) => verdicts[i] === "true" && !truth[i]);
  const rightTrue = game.claims.some((_, i) => verdicts[i] === "true" && truth[i]);
  let answer: string;
  let didNotKnow = false;
  if (wrongTrue.length) answer = wrongTrue[0]!;
  else if (rightTrue) answer = pairAnswer(t.pair);
  else if (verdicts.every((v) => v === "unsure")) { answer = "I don't know"; didNotKnow = true; }
  else answer = "None of these";

  const markedPair = wrongTrue.length ? parseMonicPair(wrongTrue[0]!) : null;
  const diagnosis: LotusGameDiagnosis | undefined = didNotKnow ? undefined
    : wrongTrue.length ? mistakeOf(question, markedPair ? classifyPair(markedPair, t) : "right", "Called a claim true that isn't.")
    : !rightTrue ? { effect: "DOESNT_KNOW", note: "Didn't call any of the claims true, including the true one." }
    // Every card right is hard to do by chance, so it needs no second answer to back it up.
    : allRight ? { effect: "SECURE" }
    : signals.includes("missed_control") ? { effect: "NO_EVIDENCE", note: "Called one form of the right answer true and another form of it false." }
    : { effect: "NEEDS_ANOTHER", note: "Knew the true claim, but wasn't sure about the others." };

  return {
    answer, ...(didNotKnow ? { didNotKnow } : {}),
    game: { kind: "TRUE_FALSE", verdicts, ...(cardMs ? { cardMs } : {}) },
    reading: {
      kind: "TRUE_FALSE", summary: lines.join(" "), signals, skillId: question.answerKey.diagnostics!.skillId,
      certainty: hitsOnFalse ? 0.75 : unsure ? 0.25 : 0.8,
      ...(diagnosis ? { diagnosis } : {}),
      facts: { claims: game.claims.length, calledFalseClaimTrue: hitsOnFalse, unsure },
    },
  };
}

const TORN_OVER: Record<string, string> = {
  "flip|right": "the signs inside the brackets",
  "prod|right": "whether the numbers must also add to the middle number",
  "right|swap": "which number is the product and which the sum",
  "flip|prod": "both the sum and the signs",
  "flip|swap": "the product–sum rule itself",
  "prod|swap": "the product–sum rule itself",
};

function readSplit(question: LotusQuestion, t: Target, game: SplitConfidenceGame, raw: SplitConfidenceResponse): Read {
  const counts = raw.counts;
  if (!Array.isArray(counts) || counts.length !== game.options.length || counts.some((n) => !isInt(n) || n < 0) || counts.reduce((a, b) => a + b, 0) !== LOTUS_SPLIT_TOKENS) {
    throw new LotusGameError(`Place all ${LOTUS_SPLIT_TOKENS} tokens before submitting.`);
  }
  const kinds = game.options.map((o) => { const pair = parseMonicPair(o); return pair ? classifyPair(pair, t) : "other" as PairKind; });
  const order = counts.map((n, i) => ({ n, i })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i);
  const top = order[0]!;
  const shape = order.map((x) => x.n).join("–");
  const tied = order.filter((x) => x.n === top.n);
  const signals = [`shape_${order.map((x) => x.n).join("_")}`];
  const nameOf = (i: number) => KIND_NAMES[kinds[i]!];
  let summary: string;
  let certainty: number;
  if (top.n === LOTUS_SPLIT_TOKENS) {
    certainty = 0.95;
    if (kinds[top.i] === "right") { summary = "All four tokens on the right answer. Confident and correct."; signals.push("confident_right"); }
    else { summary = `All four tokens on ${nameOf(top.i)}. Confident, so this is a settled belief and not a guess.`; signals.push("confident_mistake"); }
  } else if (shape === "2–2") {
    certainty = 0.55;
    const over = TORN_OVER[[kinds[order[0]!.i]!, kinds[order[1]!.i]!].sort().join("|")] ?? "which of these two is the factorisation";
    summary = `Split 2–2. The two answers differ in ${over}. That is exactly where the doubt is.`;
    signals.push("torn");
  } else if (shape === "3–1") {
    certainty = 0.7;
    summary = `Mostly ${nameOf(order[0]!.i)}, with a doubt about ${nameOf(order[1]!.i)}.`;
    signals.push("mostly_sure");
  } else if (shape === "1–1–1–1") {
    certainty = 0.2;
    summary = "Spread evenly. Doesn't know yet, which is not a misconception.";
    signals.push("spread_evenly");
  } else {
    certainty = 0.2;
    summary = `Leans towards ${nameOf(top.i)}, but unsure.`;
    signals.push("leans");
  }
  const clean = { kind: "SPLIT_CONFIDENCE" as const, counts: [...counts] };
  const reading = { kind: "SPLIT_CONFIDENCE" as const, summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty, facts: { shape, leaderKind: kinds[top.i]! } };
  if (top.n === 1) {
    return { answer: "I don't know", didNotKnow: true, game: clean, reading };
  }
  // A tie is not a commitment to the right answer: mark the wrong one it includes, and let the plan re-check that doubt.
  const marked = tied.find((x) => kinds[x.i] !== "right") ?? top;
  const markedKind = kinds[marked.i]!;
  // One token more on an answer than on the others is a lean, not a belief: it shows neither that they know it nor a mistake.
  const leaning = signals.includes("leans");
  const diagnosis: LotusGameDiagnosis = markedKind === "right"
    ? (leaning ? { effect: "NO_EVIDENCE", note: "Leaned towards the right answer, but was unsure." } : { effect: "NEEDS_ANOTHER", note: "Put most of their confidence on the right answer." })
    : leaning ? { effect: "DOESNT_KNOW", note: "Leaned towards a wrong answer, but was unsure." }
    : mistakeOf(question, markedKind, signals.includes("torn") ? "Was torn between two answers, and one of them was wrong." : "Put most of their confidence on a wrong answer.");
  return { answer: game.options[marked.i]!, confidence: top.n === LOTUS_SPLIT_TOKENS ? 90 : top.n === 3 ? 60 : 25, game: clean, reading: { ...reading, diagnosis } };
}

const isSign = (s: unknown): s is LotusBracketSign => s === "+" || s === "-";

function readTwoMoves(question: LotusQuestion, t: Target, game: TwoMovesGame, raw: TwoMovesResponse): Read {
  const n1 = checkedNumber(raw.numbers?.n1, game.range, "A number");
  const n2 = checkedNumber(raw.numbers?.n2, game.range, "A number");
  const signs = raw.signs;
  if (!Array.isArray(signs) || signs.length !== 2 || !isSign(signs[0]) || !isSign(signs[1])) throw new LotusGameError("Set the sign in both brackets before submitting.");
  const b1 = signValue(signs[0]) * Math.abs(n1);
  const b2 = signValue(signs[1]) * Math.abs(n2);
  const productOk = n1 * n2 === t.product;
  const numbersRight = productOk && n1 + n2 === t.sum;
  const numbersSlip = productOk && !numbersRight && n1 + n2 === -t.sum;
  const carried = b1 === n1 && b2 === n2;
  const flipped = b1 === -n1 && b2 === -n2;
  const finalKind = classifyPair({ p: b1, q: b2 }, t);
  const move1: PairKind = numbersRight ? "right" : classifyPair({ p: n1, q: n2 }, t);
  const signals = [`final_${finalKind}`, `move1_${move1}`, carried ? "signs_carried" : flipped ? "signs_flipped" : "signs_mixed"];
  let summary: string;
  if (numbersRight && carried) { summary = "Sound all the way through: the right numbers, carried straight into the brackets."; signals.push("sound"); }
  else if (numbersSlip && flipped) { summary = "Two wrongs make a right. The numbers had the wrong signs and so did the bracket step, so they cancel. The answer looks right, and marking the answer alone cannot see this."; signals.push("two_slips_cancel"); }
  else if (numbersSlip) { summary = "A sign slip in move 1, carried into the brackets."; signals.push("sign_slip_move_1"); }
  else if (numbersRight && flipped) { summary = "Flips the signs into the brackets: the right numbers, lost in move 2."; signals.push("flips_into_brackets"); }
  else if (numbersRight) { summary = "The right numbers, but one sign changed on the way into the brackets."; signals.push("one_sign_lost"); }
  else { summary = "Move 1 does not fit the product–sum rule. Start there."; signals.push("move_1_off"); }
  const signNote = "A sign went the wrong way between the numbers and the brackets.";
  const diagnosis: LotusGameDiagnosis = signals.includes("sound") ? { effect: "SECURE" }
    // The answer is right and the mark stands, but each step had a sign the wrong way round: the same slip will show on the next question.
    : signals.includes("two_slips_cancel") ? { effect: "MISTAKE", ...(ownMistake(question, "SIGN_PAIR_ERROR") ? { mistake: "SIGN_PAIR_ERROR" } : {}), note: "Reached the right answer, but the numbers and the brackets each had a sign the wrong way round." }
    : finalKind === "right" ? { effect: "NO_EVIDENCE", note: "Reached the right answer, but the two moves don't fit together." }
    : signals.includes("flips_into_brackets") ? { effect: "MISTAKE", ...(ownMistake(question, "SIGNS_SWAPPED") ? { mistake: "SIGNS_SWAPPED" } : {}), note: "Found the right numbers, then changed their signs going into the brackets." }
    : signals.includes("sign_slip_move_1") || signals.includes("one_sign_lost") ? { effect: "MISTAKE", ...(ownMistake(question, "SIGN_PAIR_ERROR") ? { mistake: "SIGN_PAIR_ERROR" } : {}), note: signNote }
    : mistakeOf(question, move1, "The two numbers don't fit this expression.");
  return {
    answer: pairAnswer({ p: b1, q: b2 }),
    game: { kind: "TWO_MOVES", numbers: { n1, n2 }, signs: [signs[0], signs[1]] },
    reading: {
      kind: "TWO_MOVES", summary, signals, skillId: question.answerKey.diagnostics!.skillId,
      certainty: signals.includes("two_slips_cancel") || signals.includes("sound") ? 0.85 : 0.7,
      diagnosis,
      facts: { move1, finalKind, carried, flipped },
    },
  };
}

function readFourSigns(question: LotusQuestion, t: Target, game: FourSignsGame, raw: FourSignsResponse): Read {
  const { a, b, order } = fourCases(question, t);
  const picks = raw.picks;
  if (!Array.isArray(picks) || picks.length !== game.cases.length || picks.some((p) => !Array.isArray(p) || p.length !== 2 || !isSign(p[0]) || !isSign(p[1]))) {
    throw new LotusGameError("Set both signs in every case before submitting.");
  }
  const same = (x: readonly LotusBracketSign[], y: readonly LotusBracketSign[]) => x[0] === y[0] && x[1] === y[1];
  const flip = (s: LotusBracketSign): LotusBracketSign => (s === "+" ? "-" : "+");
  // What each rule students use predicts for a case, from the case's own middle and last signs.
  const facts = order.map((ok) => {
    const mid: LotusBracketSign = signValue(ok[0]) * a + signValue(ok[1]) * b < 0 ? "-" : "+";
    const last: LotusBracketSign = ok[0] === ok[1] ? "+" : "-";
    return { ok, mid, last };
  });
  const rules: Array<{ id: string; name: string; predict: (f: (typeof facts)[number]) => readonly LotusBracketSign[] }> = [
    { id: "real", name: "the real rule: the signs multiply to the last sign and add to the middle", predict: (f) => f.ok },
    { id: "copy_middle", name: "copy the middle sign into both brackets", predict: (f) => [f.mid, f.mid] },
    { id: "minus_on_smaller", name: "the minus always goes on the smaller number", predict: (f) => (f.last === "+" ? [f.mid, f.mid] : ["-", "+"]) },
    { id: "middle_then_last", name: "the first bracket copies the middle sign, the second the last", predict: (f) => [f.mid, f.last] },
    { id: "flip_all", name: "flip every sign into the brackets", predict: (f) => [flip(f.ok[0]), flip(f.ok[1])] },
  ];
  const scores = rules.map((r) => facts.filter((f, i) => same(r.predict(f), picks[i]!)).length);
  const bestScore = Math.max(...scores);
  const best = scores.indexOf(bestScore);
  const right = facts.filter((f, i) => same(f.ok, picks[i]!)).length;
  const asked = order.findIndex((signs) => sameSet({ p: signValue(signs[0]) * a, q: signValue(signs[1]) * b }, t.pair));
  const pick = picks[asked]!;
  const signals = bestScore === 4 ? [`rule_${rules[best]!.id}`] : ["no_known_rule"];
  let summary: string;
  if (bestScore === 4 && best === 0) summary = "All four cases follow the real rule. Not a shortcut.";
  else if (bestScore === 4) {
    summary = `All four follow “${rules[best]!.name}”. ${right ? `${right} of 4 came out right anyway, so a single question could have marked this student correct.` : "Consistent, so this is a settled belief."}`;
    if (right) signals.push("rule_hides_in_right_answers");
  } else summary = `No known rule fits all four (closest ${bestScore} of 4). Guessing signs: doesn't know yet.`;
  const askedRight = same(facts[asked]!.ok, pick);
  const ruleCode = rules[best]!.id === "flip_all" ? "SIGNS_SWAPPED" : "SIGN_PAIR_ERROR";
  const diagnosis: LotusGameDiagnosis = bestScore === 4 && best === 0
    // The numbers were given, so this shows the signs only, not finding the numbers.
    ? { effect: "NEEDS_ANOTHER", note: "Set the signs right in all four cases, with the two numbers given." }
    : bestScore === 4 ? { effect: "MISTAKE", ...(ownMistake(question, ruleCode) ? { mistake: ruleCode } : {}), note: "Used the same wrong rule for the signs in all four cases." }
    : askedRight ? { effect: "NO_EVIDENCE", note: "Got this case right, but the signs followed no pattern across the four." }
    : { effect: "DOESNT_KNOW", note: "The signs followed no pattern across the four cases." };
  return {
    answer: pairAnswer({ p: signValue(pick[0]) * a, q: signValue(pick[1]) * b }),
    game: { kind: "FOUR_SIGNS", picks: picks.map((p) => [p[0], p[1]] as [LotusBracketSign, LotusBracketSign]) },
    reading: {
      kind: "FOUR_SIGNS", summary, signals, skillId: question.answerKey.diagnostics!.skillId,
      certainty: bestScore === 4 ? 0.9 : 0.35,
      diagnosis,
      facts: { casesRight: right, closestRule: rules[best]!.id, closestScore: bestScore },
    },
  };
}

function readEditHistory(question: LotusQuestion, raw: EditHistoryResponse): Read {
  const samples = raw.history;
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > LOTUS_EDIT_MAX_SAMPLES) throw new LotusGameError("Type an answer before submitting.");
  let previous = 0;
  const history = samples.map((s) => {
    if (typeof s?.v !== "string" || s.v.length > LOTUS_EDIT_MAX_LENGTH) throw new LotusGameError("That answer is too long.");
    const t = clampMs(s?.t);
    if (t === undefined || t < previous) throw new LotusGameError("The typing record is out of order.");
    previous = t;
    return { t, v: s.v };
  });
  const final = history[history.length - 1]!.v;
  if (!final.trim()) throw new LotusGameError("Type an answer before submitting.");

  const d = question.answerKey.diagnostics!;
  const expression = d.expression!;
  const isRight = (text: string) => { try { return classifyFactorisation(text, expression) === "CORRECT"; } catch { return false; } };
  const mistakeIn = (text: string): string | undefined => {
    if (isRight(text)) return undefined;
    const key = normalizeMathText(text).toLowerCase();
    return d.predictedMistakes.find((m) => normalizeMathText(m.answer).toLowerCase() === key
      // An unfinished mistake equals the expression in value, so only its exact text counts.
      || (isReadable(text) && !equalSafe(m.answer, expression) && equalSafe(text, m.answer)))?.mistake;
  };
  // A draft: what stood in the box just before the student started deleting.
  const drafts = history.filter((s, k) => {
    const next = history[k + 1];
    const prev = history[k - 1];
    return !!next && next.v.length < s.v.length && (!prev || prev.v.length <= s.v.length);
  });
  const buggy = [...new Set(drafts.map((x) => mistakeIn(x.v)).filter((m): m is string => !!m))];
  const right = isRight(final);
  const finalMistake = mistakeIn(final);
  let gap = 0;
  let gapAfter = "";
  history.forEach((s, k) => {
    const g = s.t - (k ? history[k - 1]!.t : 0);
    if (g > gap) { gap = g; gapAfter = k ? history[k - 1]!.v : ""; }
  });

  const signals: string[] = [right ? "final_right" : finalMistake ? "final_known_mistake" : "final_other"];
  const word = drafts.length === 1 ? "draft" : "drafts";
  let summary: string;
  if (right && buggy.length) { summary = `Finished right, but a discarded draft matched a known mistake (${mistakeWords(buggy[0]!)}). They caught it this time; the mistake is still live.`; signals.push("caught_own_mistake", ...buggy.map((m) => `draft_mistake:${m}`)); }
  else if (right && !drafts.length) { summary = "Straight through, no changes. Fluent."; signals.push("straight_through"); }
  else if (right) { summary = `Right, after ${drafts.length} discarded ${word}. None matched a known mistake.`; signals.push("discarded_drafts"); }
  else if (finalMistake) { summary = `Finished with a known mistake (${mistakeWords(finalMistake)}).`; signals.push(`final_mistake:${finalMistake}`); }
  else summary = "Finished with something that isn't the factorisation.";
  if (gap > 1500) { summary += ` Longest pause: ${(gap / 1000).toFixed(1)}s${gapAfter ? ` after “${gapAfter}”` : " before starting"}.`; signals.push("long_pause"); }
  return {
    answer: final,
    game: { kind: "EDIT_HISTORY", history },
    reading: {
      kind: "EDIT_HISTORY", summary, signals, skillId: d.skillId, certainty: buggy.length ? 0.6 : 0.85,
      // Typed like any other answer, so it is marked and reviewed like one. Only a caught mistake changes anything: they fixed it, but it's still live.
      ...(right && buggy.length ? { diagnosis: { effect: "NEEDS_ANOTHER" as const, note: "Started with a known mistake and fixed it themselves." } } : {}),
      facts: { samples: history.length, drafts: drafts.length, longestPauseMs: gap },
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
  if (!response || typeof response !== "object" || response.kind !== game.kind) throw new LotusGameError("That doesn't match the game on screen.");
  if (game.kind === "EDIT_HISTORY") {
    if (!isCheckedFactorising(question)) throw new LotusGameError("That doesn't match the game on screen.");
    return readEditHistory(question, response as EditHistoryResponse);
  }
  const t = targetOf(question);
  if (!t) throw new LotusGameError("That doesn't match the game on screen.");
  switch (game.kind) {
    case "TWO_NUMBERS": return readTwoNumbers(question, t, game, response as TwoNumbersResponse);
    case "COMMIT_THEN_CHOOSE": return readCommit(question, t, game, response as CommitThenChooseResponse);
    case "TRUE_FALSE": return readTrueFalse(question, t, game, response as TrueFalseResponse);
    case "SPLIT_CONFIDENCE": return readSplit(question, t, game, response as SplitConfidenceResponse);
    case "TWO_MOVES": return readTwoMoves(question, t, game, response as TwoMovesResponse);
    case "FOUR_SIGNS": return readFourSigns(question, t, game, response as FourSignsResponse);
  }
}
