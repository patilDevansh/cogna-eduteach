import type { InteractionStage, TileBuildInteraction, TileBuildResponse, TileFramePart } from "@cogna/shared";
import { assembleTileAnswer, formatAllowedAt } from "@cogna/shared";
import { algebraicallyEqual, classifyFactorisation, isReadable, normalizeMathText } from "../lotus/lotus-algebra";

/**
 * Builds game-like tile sets ("bracket bridge", "split it", "term builder")
 * from a verified answer key. Shared by the Lotus diagnostic, the
 * independent exit and practice.
 *
 * Safety: a tile set is only returned when the right picks assemble into an
 * answer the algebra engine marks CORRECT for the expression, every tile
 * parses, and there is at least one wrong tile to choose. Anything else
 * returns null and the caller keeps the typed question. No model is involved.
 */

export type TileTask = "factorise" | "expand";

export interface TileBuildRequest {
  stage: InteractionStage;
  task: TileTask;
  expression: string;
  /** The verified correct answer. */
  answer: string;
  /** Wrong answers students are known to give (e.g. Lotus predicted mistakes); their pieces become tiles. */
  mistakes?: string[];
  /** Stable seed so the same question always shows the same tile order. */
  seed: string;
}

const MAX_TILES = 8;
const MAX_SLOTS = 4;

/** Plain ASCII algebra with even spacing around + and − (but not after "(" or "^" or at the start). */
export function tidyAlgebra(text: string): string {
  const ascii = String(text).replace(/[−–—]/g, "-").replace(/[×·∙]/g, "*").replace(/²/g, "^2").replace(/³/g, "^3").replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i < ascii.length; i++) {
    const c = ascii[i]!;
    const prev = ascii[i - 1];
    if ((c === "+" || c === "-") && i > 0 && prev !== "(" && prev !== "^" && prev !== "*") out += ` ${c} `;
    else out += c;
  }
  // A coefficient of 1 is written as nothing: 1x → x (10x and 2.1x are untouched).
  return out.trim().replace(/(^|[^\d.])1(?=[a-z])/g, "$1");
}

/**
 * Splits a product such as "2(x - 3)(x + 3)", "3x(x + 2)" or "(x + 1)^2" into
 * its top-level factors. Null when the text is not a plain product (a sum at
 * the top level, unbalanced brackets, a bare leading minus).
 */
export function splitFactors(text: string): string[] | null {
  const t = normalizeMathText(text);
  if (!t) return null;
  const factors: string[] = [];
  let i = 0;
  let lead = "";
  while (i < t.length && t[i] !== "(") lead += t[i++];
  if (lead.endsWith("*")) lead = lead.slice(0, -1);
  if (lead) {
    // A bare leading minus or a sum before the first bracket is not a plain product.
    if (lead === "-" || lead === "+" || /[+\-]/.test(lead.slice(1))) return null;
    factors.push(lead);
  }
  while (i < t.length) {
    if (t[i] === "*") { i++; continue; }
    if (t[i] !== "(") {
      // A trailing monomial such as "(x + 1)x".
      let rest = "";
      while (i < t.length && t[i] !== "(") rest += t[i++];
      if (/[+\-]/.test(rest)) return null;
      factors.push(rest);
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < t.length; j++) {
      if (t[j] === "(") depth++;
      else if (t[j] === ")") { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) return null;
    let k = j + 1;
    if (t[k] === "^") { k++; while (k < t.length && /[0-9]/.test(t[k]!)) k++; }
    factors.push(t.slice(i, k));
    i = k;
  }
  return factors.length ? factors.map(tidyAlgebra) : null;
}

/** Splits an expanded expression into signed top-level terms: "-6x + 12" → ["-6x", "+ 12"]. */
export function splitTerms(text: string): string[] | null {
  const t = normalizeMathText(text);
  if (!t) return null;
  const terms: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === "(") depth++;
    if (c === ")") depth--;
    if ((c === "+" || c === "-") && depth === 0 && i > 0 && t[i - 1] !== "^" && t[i - 1] !== "*") {
      terms.push(current);
      current = c;
    } else current += c;
  }
  terms.push(current);
  if (depth !== 0 || terms.some((term) => !term || term === "+" || term === "-")) return null;
  return terms.map((term, i) => {
    const sign = term[0] === "-" ? "-" : "+";
    const body = term.replace(/^[+-]/, "");
    return i === 0 && sign === "+" ? body : sign === "-" && i === 0 ? `-${body}` : `${sign} ${body}`;
  });
}

const BRIDGE_INNER = /^\(([a-z]) ([+-]) (\d+)\)$/;

/** "x + 5" ↔ "x - 5": the sign-swap distractor. */
function flipInner(inner: string): string {
  return inner.includes(" + ") ? inner.replace(" + ", " - ") : inner.replace(" - ", " + ");
}

function flipTerm(term: string): string {
  if (term.startsWith("- ")) return `+ ${term.slice(2)}`;
  if (term.startsWith("+ ")) return `- ${term.slice(2)}`;
  if (term.startsWith("-")) return term.slice(1);
  return `-${term}`;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function shuffle<T>(rand: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const key = (tile: string) => normalizeMathText(tile).toLowerCase();

/** Correct tiles first, then distractors in priority order, deduplicated and capped. */
function collect(correct: string[], distractors: string[], max: number): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tile of correct) {
    if (seen.has(key(tile))) return null; // a repeated correct tile (e.g. (x+1)(x+1)) can't be built from single-use tiles
    seen.add(key(tile));
    out.push(tile);
  }
  for (const tile of distractors) {
    if (out.length >= max) break;
    // A bare 1 is never a meaningful wrong piece.
    if (!tile || tile === "1" || seen.has(key(tile))) continue;
    seen.add(key(tile));
    out.push(tile);
  }
  return out;
}

function readableTile(tile: string, format: TileBuildInteraction["format"]): boolean {
  if (format === "BRACKET_BRIDGE") return isReadable(`(${tile})`);
  if (format === "TERM_BUILDER") return isReadable(tile.replace(/^\+\s*/, ""));
  return isReadable(tile);
}

function markCorrect(task: TileTask, assembled: string, expression: string): boolean {
  try {
    return task === "factorise" ? classifyFactorisation(assembled, expression) === "CORRECT" : algebraicallyEqual(assembled, expression);
  } catch {
    return false;
  }
}

function finish(req: TileBuildRequest, format: TileBuildInteraction["format"], frame: TileFramePart[], slots: number, allowEmpty: boolean, correct: string[], ordered: string[] | null): TileBuildInteraction | null {
  if (!ordered || ordered.length <= correct.length || ordered.length < slots + 2) return null;
  if (!ordered.every((tile) => readableTile(tile, format))) return null;
  const tiles = shuffle(seededRandom(`${req.seed}|${format}`), ordered);
  const interaction: TileBuildInteraction = {
    version: 1, format, stage: req.stage, expression: tidyAlgebra(req.expression), frame, slots, tiles, allowEmpty,
  };
  const picks: Array<number | null> = correct.map((tile) => tiles.indexOf(tile));
  while (picks.length < slots) picks.push(null);
  const assembled = assembleTileAnswer(interaction, picks);
  if (!assembled || !markCorrect(req.task, assembled, req.expression)) return null;
  return interaction;
}

/** Monic trinomial into two brackets: tiles are the bracket insides. */
function bracketBridge(req: TileBuildRequest): TileBuildInteraction | null {
  const factors = splitFactors(req.answer);
  if (!factors || factors.length !== 2) return null;
  const inners = factors.map((f) => f.match(BRIDGE_INNER));
  if (inners.some((m) => !m) || inners[0]![1] !== inners[1]![1]) return null;
  const letter = inners[0]![1]!;
  const correct = factors.map((f) => f.slice(1, -1));
  const value = (m: RegExpMatchArray) => (m[2] === "-" ? -1 : 1) * Number(m[3]);
  const [a, b] = inners.map((m) => value(m!)) as [number, number];
  const fromMistakes = (req.mistakes ?? []).flatMap((m) => (splitFactors(m) ?? []).filter((f) => BRIDGE_INNER.test(f)).map((f) => f.slice(1, -1)));
  const product = a * b;
  const otherPairs: string[] = [];
  for (let r = 1; r <= Math.abs(product) && otherPairs.length < 4; r++) {
    if (product % r !== 0) continue;
    const s = product / r;
    if ((r === Math.abs(a) && Math.abs(s) === Math.abs(b)) || (r === Math.abs(b) && Math.abs(s) === Math.abs(a))) continue;
    for (const n of [r, s]) otherPairs.push(`${letter} ${n < 0 ? "-" : "+"} ${Math.abs(n)}`);
  }
  const ordered = collect(correct, [...fromMistakes, ...correct.map(flipInner), ...otherPairs], 6);
  return finish(req, "BRACKET_BRIDGE", [{ text: "(" }, { slot: 0 }, { text: ")(" }, { slot: 1 }, { text: ")" }], 2, false, correct, ordered);
}

/** Any full factorisation, built from factor tiles; unfinished forms from known mistakes become tiles too. */
function factorBuilder(req: TileBuildRequest): TileBuildInteraction | null {
  const correct = splitFactors(req.answer);
  if (!correct || correct.length > MAX_SLOTS) return null;
  const mistakeFactors = (req.mistakes ?? []).map((m) => splitFactors(m)).filter((f): f is string[] => !!f && f.length <= MAX_SLOTS);
  const slots = Math.max(correct.length, ...mistakeFactors.map((f) => f.length), 2);
  const flippable = (f: string) => /^\(\S+ [+-] \S+\)$/.test(f);
  // Sign flips of the right factors and of the mistake factors: (x^2 - 9) brings (x^2 + 9), the "sum of squares" slip.
  const flips = [...correct, ...mistakeFactors.flat()].filter(flippable).map((f) => `(${flipInner(f.slice(1, -1))})`);
  // Only part of a common factor ("6" or "x" instead of "6x") is the classic unfinished slip.
  const partials = correct.flatMap((f) => {
    const m = f.match(/^(\d+)([a-z])$/);
    return m && m[1] !== "1" ? [m[1]!, m[2]!] : [];
  });
  const ordered = collect(correct, [...mistakeFactors.flat(), ...partials, ...flips], MAX_TILES);
  const frame: TileFramePart[] = Array.from({ length: slots }, (_, i) => ({ slot: i }));
  return finish(req, "FACTOR_BUILDER", frame, slots, slots > correct.length || mistakeFactors.some((f) => f.length < slots), correct, ordered);
}

/** An expansion built from signed terms. */
function termBuilder(req: TileBuildRequest): TileBuildInteraction | null {
  const correct = splitTerms(req.answer);
  if (!correct || correct.length > MAX_SLOTS) return null;
  const mistakeTerms = (req.mistakes ?? []).flatMap((m) => splitTerms(m) ?? []);
  const asSigned = (term: string, i: number) => (i === 0 && !term.startsWith("-") ? `+ ${term}` : term);
  // "Only multiplied the first term": the inside terms of k(…) left unmultiplied, e.g. 3(x + 2) → "+ 2".
  const single = normalizeMathText(req.expression).match(/^-?\d+\((.+)\)$/);
  const unmultiplied = single ? (splitTerms(single[1]!) ?? []).slice(1) : [];
  const ordered = collect(correct, [...mistakeTerms, ...unmultiplied, ...correct.map((t, i) => flipTerm(asSigned(t, i)))], 6);
  const frame: TileFramePart[] = correct.flatMap((_, i) => (i ? [{ text: " " }, { slot: i }] : [{ slot: i }]));
  return finish(req, "TERM_BUILDER", frame, correct.length, false, correct, ordered);
}

/** The best tile game for this answer, or null when the question should stay typed. */
export function buildTileInteraction(req: TileBuildRequest): TileBuildInteraction | null {
  try {
    if (req.task === "expand") return formatAllowedAt("TERM_BUILDER", req.stage) ? termBuilder(req) : null;
    return bracketBridge(req) ?? factorBuilder(req);
  } catch {
    return null;
  }
}

/**
 * Rebuilds the student's answer from their picks against the interaction the
 * server itself issued. Null when the picks don't make a complete answer.
 */
export function answerFromPicks(interaction: TileBuildInteraction, response: TileBuildResponse | undefined): string | null {
  if (!response || response.format !== interaction.format) return null;
  return assembleTileAnswer(interaction, response.picks);
}

/** The single switch for every game format. Off only when explicitly turned off. */
export function gameFormatsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.COGNA_GAME_FORMATS ?? "on").toLowerCase() !== "off";
}
