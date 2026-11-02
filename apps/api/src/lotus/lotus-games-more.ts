import type {
  ChunkItGame,
  ChunkItResponse,
  FindEveryBGame,
  FindEveryBResponse,
  LotusGameDiagnosis,
  LotusGameResponse,
  LotusQuestion,
  OrderStepsGame,
  OrderStepsResponse,
  RapidSetGame,
  RapidSetResponse,
  RapidSetRow,
  ReplayGame,
  ReplayResponse,
  TestClaimGame,
  TestClaimResponse,
} from "@cogna/shared";
import { LOTUS_SELECT_SEPARATOR } from "@cogna/shared";
import { tidyAlgebra } from "../interaction-formats/tile-builder";
import { algebraicallyEqual, classifyFactorisation, normalizeMathText } from "./lotus-algebra";
import { clampMs, equalSafe, isInt, LotusGameError, mistakeWith, shuffled, type Read } from "./lotus-game-core";

/**
 * The second family of themed games. Unlike the first, most of these are not a
 * different way to answer a factorising question the plan already asked: each
 * has its own question, built and checked by code (lotus-game-probes.ts), and
 * the data a game needs is made here, so the question and its reader can never
 * disagree. "Order the steps" is the exception and dresses a grouping question.
 */

// ---------- small helpers ----------

const minus = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
/** ASCII algebra the engine reads: "x - 3", "y + 2". */
export const lin = (v: string, n: number) => (n < 0 ? `${v} - ${-n}` : `${v} + ${n}`);
export const prettyText = (t: string) => t.replace(/\^2/g, "²").replace(/ - /g, " − ").replace(/^-/, "−").replace(/\(-/g, "(−");

/** "6xy - 4y": signed terms, a coefficient of 1 written as nothing. */
function poly(terms: Array<[number, string]>): string {
  return terms.filter(([c]) => c !== 0).map(([c, mono], i) => {
    const body = Math.abs(c) === 1 && mono ? mono : `${Math.abs(c)}${mono}`;
    return i === 0 ? `${c < 0 ? "-" : ""}${body}` : ` ${c < 0 ? "-" : "+"} ${body}`;
  }).join("");
}
const sortedLetters = (...letters: string[]) => [...letters].sort().join("");

const norm = (t: string) => normalizeMathText(t).toLowerCase();

// ---------- Order the steps (dresses a grouping question) ----------

interface Linear { v: string; c1: number; c0: number }

function parseLinear(text: string): Linear | null {
  const m = /^\((-?\d*)([a-z])([+-]\d+)\)$/.exec(norm(text));
  if (!m) return null;
  const c1 = m[1] === "" ? 1 : m[1] === "-" ? -1 : Number(m[1]);
  const c0 = Number(m[3]);
  return Number.isInteger(c1) && Number.isInteger(c0) && c1 !== 0 && c0 !== 0 ? { v: m[2]!, c1, c0 } : null;
}

/** The six cards for a grouping question, with what each one is. Null when the question isn't a clean grouping of the second-pair-starts-with-a-minus kind. */
export function orderStepCards(question: LotusQuestion): { texts: string[]; roles: string[] } | null {
  const d = question.answerKey.diagnostics;
  if (!d || d.itemKind !== "FACTORISE" || !d.expression) return null;
  const m = /^(\([^()]*\))(\([^()]*\))$/.exec(norm(question.answerKey.canonicalAnswer));
  if (!m) return null;
  const parsed = [parseLinear(m[1]!), parseLinear(m[2]!)];
  if (!parsed[0] || !parsed[1] || parsed[0].v === parsed[1].v) return null;
  // F is the factor whose number is negative (the second pair then starts with a minus); B is the common bracket.
  const fIndex = parsed[1].c0 < 0 ? 1 : parsed[0].c0 < 0 ? 0 : -1;
  if (fIndex < 0) return null;
  const F = parsed[fIndex]!;
  const B = parsed[1 - fIndex]!;
  if (F.c1 < 0 || B.c1 < 0) return null;
  const u = F.v, w = B.v, abs0 = Math.abs(F.c0);
  const pair1 = poly([[F.c1 * B.c1, sortedLetters(u, w)], [F.c1 * B.c0, u]]);
  const bTxt = poly([[B.c1, w], [B.c0, ""]]);
  const bFlip = poly([[B.c1, w], [-B.c0, ""]]);
  const fu = `${F.c1 === 1 ? "" : F.c1}${u}`;
  const cards: Array<[string, string]> = [
    ["L1", `(${pair1}) - (${poly([[abs0 * B.c1, w], [abs0 * B.c0, ""]])})`],
    ["L2", `${fu}(${bTxt}) - ${abs0}(${bTxt})`],
    ["L3", `(${bTxt})(${fu} - ${abs0})`],
    ["D1", `(${pair1}) - (${poly([[abs0 * B.c1, w], [-abs0 * B.c0, ""]])})`],
    ["D2", `${fu}(${bTxt}) - ${abs0}(${bFlip})`],
    ["D3", `(${bTxt})(${fu} + ${abs0})`],
  ];
  // Every claim re-derived: the three sound steps equal the expression, the three slips do not.
  if (!cards.every(([role, text]) => equalSafe(text, d.expression!) === role.startsWith("L"))) return null;
  if (new Set(cards.map(([, t]) => norm(t))).size !== 6) return null;
  const order = shuffled(`${question.id}|ORDER`, cards);
  return { texts: order.map(([, t]) => t), roles: order.map(([r]) => r) };
}

export function buildOrderSteps(question: LotusQuestion): OrderStepsGame | undefined {
  const cards = orderStepCards(question);
  if (!cards || !classifiesRight(question)) return undefined;
  return { version: 1, kind: "ORDER_STEPS", expression: tidyAlgebra(question.answerKey.diagnostics!.expression!), steps: cards.texts, slots: 3 };
}

function classifiesRight(question: LotusQuestion): boolean {
  try { return classifyFactorisation(question.answerKey.canonicalAnswer, question.answerKey.diagnostics!.expression!) === "CORRECT"; } catch { return false; }
}

function distinctIndexes(value: unknown, size: number, what: string): number[] {
  if (!Array.isArray(value) || value.length > size || value.some((n) => !isInt(n) || n < 0 || n >= size) || new Set(value).size !== value.length) throw new LotusGameError(`${what} is malformed.`);
  return value as number[];
}

function readOrderSteps(question: LotusQuestion, game: OrderStepsGame, raw: OrderStepsResponse): Read {
  const cards = orderStepCards(question);
  if (!cards || cards.texts.length !== game.steps.length || cards.texts.some((t, i) => t !== game.steps[i])) throw new LotusGameError("That doesn't match the game on screen.");
  const placed = distinctIndexes(raw.placed, cards.texts.length, "The working");
  if (placed.length !== game.slots) throw new LotusGameError("Place all three steps before submitting.");
  const ever = [...new Set([...distinctIndexes(raw.ever ?? placed, cards.texts.length, "The record of steps"), ...placed])];
  const roles = placed.map((i) => cards.roles[i]!);
  const ordered = roles.join(",") === "L1,L2,L3";
  const soundOnly = roles.every((r) => r.startsWith("L"));
  const slips = roles.filter((r) => r.startsWith("D")).length;
  const caught = ever.filter((i) => cards.roles[i]!.startsWith("D") && !placed.includes(i)).length;
  const signals = [ordered ? "ordered_right" : soundOnly ? "right_steps_wrong_order" : "slip_placed", ...(caught ? ["caught_own_slip"] : [])];
  let summary = ordered ? "All three steps right, in order. As strong as typed working." : soundOnly ? "The right steps in the wrong order: knows the moves, not the shape of the method." : `${slips} step${slips > 1 ? "s" : ""} with a slip: a sign inside a bracket wasn't changed when the minus was taken out.`;
  if (caught) summary += ` They also swapped out ${caught} slip${caught > 1 ? "s" : ""} before finishing, so they caught their own.`;
  const diagnosis: LotusGameDiagnosis = slips > 0
    ? mistakeWith(question, "SIGN_NOT_FLIPPED_IN_GROUP", "A sign inside a bracket wasn't changed when the minus was taken out.")
    : ordered ? (caught ? { effect: "NEEDS_ANOTHER", note: "Swapped out a slip before finishing." } : { effect: "SECURE" })
      : { effect: "NO_EVIDENCE", note: "Chose the right steps but put them in a different order." };
  return {
    answer: cards.texts[placed[2]!]!,
    game: { kind: "ORDER_STEPS", placed, ever },
    reading: { kind: "ORDER_STEPS", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty: ordered ? 0.9 : 0.7, diagnosis, facts: { slips, caught } },
  };
}

// ---------- Test the claim ----------

export const CLAIM_OPTIONS = ["Always true", "Sometimes true", "Never true", "Not enough to say"] as const;

/** (x + k)² and x² + k² agree exactly when x = 0, so they are equal sometimes, never always. */
function readTestClaim(question: LotusQuestion, game: TestClaimGame, raw: TestClaimResponse): Read {
  const span = game.max - game.min + 1;
  const tested = distinctIndexes(Array.isArray(raw.tested) ? raw.tested.map((x) => (isInt(x) ? x - game.min : -1)) : null, span, "The values tried").map((i) => i + game.min);
  if (!isInt(raw.verdict) || raw.verdict < 0 || raw.verdict >= game.options.length) throw new LotusGameError("Choose a verdict before submitting.");
  const said = game.options[raw.verdict]!;
  const sawEqual = tested.includes(0);
  const sawDiffer = tested.some((x) => x !== 0);
  const n = tested.length;
  const role = /^Always/.test(said) ? "always" : /^Sometimes/.test(said) ? "sometimes" : /^Never/.test(said) ? "never" : "unsure";
  const signals = [`said_${role}`, `tested_${Math.min(n, 3)}${n > 3 ? "plus" : ""}`, ...(sawEqual ? ["saw_equal"] : []), ...(sawDiffer ? ["saw_differ"] : [])];
  let summary: string;
  let diagnosis: LotusGameDiagnosis;
  if (role === "always" && !sawDiffer) {
    summary = `Checked only ${n === 0 ? "nothing" : n === 1 ? "x = 0" : "values where the two sides happened to match"} and said always. Checks one easy case and stops.`;
    signals.push("checked_one_case");
    diagnosis = mistakeWith(question, "EXPAND_CHECK_FAIL", "Said always true after checking only values where the two sides matched.");
  } else if (role === "always") {
    summary = "Saw the two sides differ and still said always. Believes (a + b)² = a² + b² firmly enough to overrule the evidence.";
    signals.push("overruled_evidence");
    diagnosis = mistakeWith(question, "EXPAND_CHECK_FAIL", "Saw the two sides differ and still said always true.");
  } else if (role === "never") {
    summary = sawEqual ? "Saw them match at x = 0 but said never. Doesn't count one case as “sometimes”." : "Said never without checking x = 0.";
    diagnosis = { effect: "DOESNT_KNOW", note: sawEqual ? "Saw the sides match once, but said they never do." : "Said never without checking every kind of value." };
  } else if (role === "sometimes") {
    const thorough = n >= 3 && sawDiffer;
    summary = `Sometimes, after checking ${n} value${n === 1 ? "" : "s"}. ${thorough ? "Tested like a mathematician." : "Right, but checked very little."}`;
    signals.push(thorough ? "tested_thoroughly" : "checked_little");
    diagnosis = thorough ? { effect: "SECURE" } : { effect: "NEEDS_ANOTHER", note: "Said sometimes, with only a little checking behind it." };
  } else {
    summary = "Said there wasn't enough to say.";
    diagnosis = { effect: "DOESNT_KNOW", note: "Said there wasn't enough to decide." };
  }
  return {
    answer: said,
    game: { kind: "TEST_CLAIM", tested, verdict: raw.verdict },
    reading: { kind: "TEST_CLAIM", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty: role === "sometimes" ? 0.8 : role === "always" ? 0.85 : 0.5, diagnosis, facts: { tested: n, sawEqual, sawDiffer } },
  };
}

// ---------- Rapid set ----------

export const CANT_BE_FACTORISED = "Can't be factorised";

/**
 * What an option is, read from the option itself and its row: right, a perfect
 * square, the difference-of-squares pattern carried onto a plus sign, or something
 * else. Nothing is stored, so the reader needs nothing from the browser to know.
 */
export function tagRapidOption(row: RapidSetRow, trap: boolean, option: string): "right" | "square" | "pattern" | "other" {
  if (option === CANT_BE_FACTORISED) return trap ? "right" : "other";
  try { if (classifyFactorisation(option, row.q) === "CORRECT") return "right"; } catch { /* unreadable: falls through */ }
  if (/^\(.+\)\^2$/.test(option)) return "square";
  if (trap && /^\(x - (\d+)\)\(x \+ \1\)$/.test(option)) return "pattern";
  return "other";
}

export interface RapidRowData extends RapidSetRow {
  /** The option that is right, for the code that builds the item. */
  correct: number;
}

/** The four rows for a question: three difference-of-squares look-alikes of the same pattern, then x² + d². Same every time for one seed. */
export function rapidRows(seed: string): RapidRowData[] | null {
  const pickFrom = <T>(list: T[], k: number) => list[Math.floor(hashFraction(`${seed}|${k}`) * list.length)]!;
  const a = pickFrom([2, 3, 4, 5, 6], 1);
  const b = pickFrom([2, 3, 4, 5, 6, 7].filter((n) => n !== a), 2);
  const c = pickFrom([2, 3], 3);
  const d = pickFrom([3, 4, 5, 6], 4);
  const rows: RapidRowData[] = [];
  const addRow = (q: string, options: Array<[string, string]>, correctTag: string) => {
    const order = shuffled(`${seed}|row${rows.length}`, options);
    rows.push({ q, options: order.map(([t]) => t), correct: order.findIndex(([, tag]) => tag === correctTag) });
  };
  for (const k of [a, b]) {
    addRow(`x^2 - ${k * k}`, [[`(x - ${k})(x + ${k})`, "right"], [`(x - ${k})^2`, "square"], [`(x - ${k * k})(x + 1)`, "other"], [`(x + ${k})^2`, "other"]], "right");
  }
  addRow(`${c * c}x^2 - 1`, [[`(${c}x - 1)(${c}x + 1)`, "right"], [`(${c}x - 1)^2`, "square"], [`(${c * c}x - 1)(x + 1)`, "other"], [`(${c}x + 1)^2`, "other"]], "right");
  addRow(`x^2 + ${d * d}`, [[`(x - ${d})(x + ${d})`, "pattern"], [`(x + ${d})^2`, "square"], [`(x - ${d * d})(x + 1)`, "other"], [CANT_BE_FACTORISED, "right"]], "right");
  // Re-derived: the three sound rows have exactly one right option; the look-alike has no factorisation, only "can't be done".
  for (const [i, row] of rows.entries()) {
    const tags = row.options.map((o) => tagRapidOption(row, i === 3, o));
    if (tags.filter((t) => t === "right").length !== 1 || tags[row.correct] !== "right") return null;
  }
  return rows;
}

function hashFraction(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function readRapidSet(question: LotusQuestion, game: RapidSetGame, raw: RapidSetResponse): Read {
  if (!Array.isArray(game.rows) || game.rows.length !== 4) throw new LotusGameError("That doesn't match the game on screen.");
  const picks = raw.picks;
  if (!Array.isArray(picks) || picks.length !== 4 || picks.some((p, i) => !isInt(p) || p < 0 || p >= game.rows[i]!.options.length)) throw new LotusGameError("Answer all four before submitting.");
  const times = Array.isArray(raw.times) && raw.times.length === 4 ? raw.times.map((t) => Math.max(300, Math.min(clampMs(t) ?? 0, 600_000))) : [1, 1, 1, 1];
  // What each option is comes from the rows this server issued, read option by option.
  const tags = picks.map((p, i) => tagRapidOption(game.rows[i]!, i === 3, game.rows[i]!.options[p]!));
  const firstRight = [0, 1, 2].every((i) => tags[i] === "right");
  const base = (times[0]! + times[1]! + times[2]!) / 3;
  const ratio = times[3]! / base;
  const last = tags[3]!;
  const signals = [`row4_${last}`, firstRight ? "first_three_right" : "first_three_not_all_right"];
  let summary: string;
  let diagnosis: LotusGameDiagnosis;
  if (last === "pattern") {
    summary = `Autopilot on the fourth. Carried the difference-of-squares pattern onto a plus sign${ratio < 1.4 ? `, at their usual pace (${ratio.toFixed(1)}×)` : ""}. Treat the first three with care.`;
    diagnosis = mistakeWith(question, "NOT_DIFF_OF_SQUARES", "Carried the difference-of-squares pattern onto a sum of squares.");
  } else if (last === "square") {
    summary = "Noticed the fourth was different, but thinks it is a perfect square.";
    diagnosis = mistakeWith(question, "WROTE_PERFECT_SQUARE", "Wrote a sum of squares as a perfect square.");
  } else if (last === "right") {
    summary = ratio >= 1.4 ? `Noticed the switch. Slowed down (${ratio.toFixed(1)}× their usual pace) and checked.` : "Spotted the switch straight away.";
    diagnosis = firstRight ? { effect: "SECURE" } : { effect: "NEEDS_ANOTHER", note: "Spotted the look-alike, but not every one of the first three was right." };
    signals.push(ratio >= 1.4 ? "slowed_down" : "spotted_at_once");
  } else {
    summary = "Gave an answer to the fourth that fits neither the pattern nor the look-alike. Doesn't know yet.";
    diagnosis = { effect: "DOESNT_KNOW", note: "Gave an answer to the last one that fitted no pattern." };
  }
  return {
    answer: game.rows[3]!.options[picks[3]!]!,
    game: { kind: "RAPID_SET", picks, times },
    reading: { kind: "RAPID_SET", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty: last === "pattern" ? 0.85 : 0.7, diagnosis, facts: { firstThreeRight: firstRight, ratio: Math.round(ratio * 10) / 10 } },
  };
}

// ---------- Find every b ----------

/** Every whole b for which x² + bx + c has whole-number brackets. */
export function validBs(c: number): number[] {
  const out = new Set<number>();
  for (let p = -Math.abs(c); p <= Math.abs(c); p++) if (p !== 0 && c % p === 0) out.add(p + c / p);
  return [...out].sort((a, b) => a - b);
}

const showB = (n: number) => minus(n);

function readFindEveryB(question: LotusQuestion, game: FindEveryBGame, raw: FindEveryBResponse): Read {
  const picked = raw.picked;
  if (!Array.isArray(picked) || picked.length === 0 || picked.length > 2 * game.range || picked.some((n) => !isInt(n) || n === 0 || Math.abs(n) > game.range) || new Set(picked).size !== picked.length) {
    throw new LotusGameError("Pick at least one value.");
  }
  const valid = validBs(game.c);
  const found = picked.filter((n) => valid.includes(n));
  const wrong = picked.filter((n) => !valid.includes(n));
  const negatives = valid.filter((n) => n < 0);
  const foundNeg = found.filter((n) => n < 0);
  const missed = valid.filter((n) => !picked.includes(n));
  const mixedUp = wrong.some((n) => Math.abs(n) === Math.abs(game.c) || (game.c % Math.abs(n) === 0 && Math.abs(n) !== 1));
  const signals = [`found_${found.length}_of_${valid.length}`, ...(wrong.length ? ["picked_wrong"] : [])];
  let summary: string;
  let diagnosis: LotusGameDiagnosis;
  if (found.length === valid.length && wrong.length === 0) {
    summary = `All ${valid.length}. Found every b, negatives included.`;
    diagnosis = { effect: "SECURE" };
  } else if (found.length === valid.length - negatives.length && foundNeg.length === 0 && wrong.length === 0) {
    summary = `Found ${found.map(showB).join(", ")} and none of the negatives. Forgets that two negatives also multiply to +${game.c} (the “no negative pairs” mistake), now with solid evidence.`;
    signals.push("no_negative_pairs");
    diagnosis = mistakeWith(question, "SIGN_PAIR_ERROR", "Found the positive values of b and none of the negative ones.");
  } else if (mixedUp) {
    summary = `Found ${found.length} of ${valid.length}. Picked ${wrong.map(showB).join(", ")}, mixing b up with a factor of ${game.c}.`;
    signals.push("mixed_b_with_a_factor");
    diagnosis = mistakeWith(question, "WRONG_FACTOR_PAIR_SUM", "Picked a factor of the last number as if it were the middle number.");
  } else if (found.length <= 1) {
    summary = `Found ${found.length}. Knows an example, not the whole set.`;
    diagnosis = { effect: "DOESNT_KNOW", note: "Found an example but not the whole set." };
  } else {
    summary = `Found ${found.length} of ${valid.length}${missed.length ? `, missing ${missed.map(showB).join(", ")}` : ""}${wrong.length ? `; ${wrong.length} that don't work: ${wrong.map(showB).join(", ")}` : ""}.`;
    diagnosis = { effect: "NO_EVIDENCE", note: "Found some of the values but not a clear pattern." };
  }
  const sorted = [...picked].sort((a, b) => a - b);
  return {
    answer: sorted.map(showB).join(LOTUS_SELECT_SEPARATOR),
    game: { kind: "FIND_EVERY_B", picked: sorted },
    reading: { kind: "FIND_EVERY_B", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty: found.length === valid.length ? 0.9 : 0.7, diagnosis, facts: { found: found.length, wrong: wrong.length, of: valid.length } },
  };
}

// ---------- Stop the replay ----------

/** Sam checks (x + p)(x + q) by expanding and gets the sign of p × q wrong. */
export function replayData(p: number, q: number): { claim: string; lines: string[]; trueExpr: string } | null {
  if (p * q >= 0 || p + q === 0) return null;
  const mid = p + q;
  const midText = `${mid < 0 ? "−" : ""}${Math.abs(mid) === 1 ? "" : Math.abs(mid)}x`;
  const slipped = -p * q;
  const claim = `(x ${p < 0 ? "−" : "+"} ${Math.abs(p)})(x ${q < 0 ? "−" : "+"} ${Math.abs(q)})`;
  const lines = [
    "x × x = x²",
    `x × (${minus(q)}) + (${minus(p)}) × x = ${midText}`,
    `(${minus(p)}) × (${minus(q)}) = ${minus(slipped)}`,
    `So ${claim} = x² ${mid < 0 ? "−" : "+"} ${Math.abs(mid) === 1 ? "x" : `${Math.abs(mid)}x`} ${slipped < 0 ? "−" : "+"} ${Math.abs(slipped)}`,
  ];
  const trueExpr = `x^2${poly([[mid, "x"], [p * q, ""]]).replace(/^/, mid < 0 ? " " : " + ")}`;
  const slippedExpr = `x^2${poly([[mid, "x"], [slipped, ""]]).replace(/^/, mid < 0 ? " " : " + ")}`;
  // Re-derived: the first two lines are sound; the last two carry a constant that expanding does not give.
  if (!equalSafe(`(x + ${p})(x + ${q})`, trueExpr) || equalSafe(`(x + ${p})(x + ${q})`, slippedExpr)) return null;
  return { claim, lines, trueExpr };
}

export const REPLAY_LINE_OPTIONS = ["Line 1", "Line 2", "Line 3", "Line 4"];
const SLIP_LINE = 2;

function readReplay(question: LotusQuestion, game: ReplayGame, raw: ReplayResponse): Read {
  if (!isInt(raw.stopped) || raw.stopped < 0 || raw.stopped >= game.lines.length) throw new LotusGameError("Stop the replay at a line before submitting.");
  const lateMs = clampMs(raw.lateMs);
  const late = (lateMs ?? 0) / 1000;
  let summary: string;
  let diagnosis: LotusGameDiagnosis;
  const signals = [`stopped_line_${raw.stopped + 1}`];
  if (raw.stopped === SLIP_LINE) {
    const quick = late < 1.5;
    summary = `Stopped at line 3, ${late.toFixed(1)}s after the sign slip appeared. ${quick ? "Fast: fluent." : "Got there, after a moment."}`;
    signals.push(quick ? "stopped_quickly" : "stopped_after_a_moment");
    diagnosis = quick ? { effect: "SECURE" } : { effect: "NEEDS_ANOTHER", note: "Found the slip, after a moment." };
  } else if (raw.stopped > SLIP_LINE) {
    summary = `Stopped at line ${raw.stopped + 1}, after the slip. Missed the sign error in the line before.`;
    signals.push("missed_the_slip");
    diagnosis = mistakeWith(question, "EXPAND_CHECK_FAIL", "Let a wrong sign pass and stopped on a later line.");
  } else {
    summary = `False alarm at line ${raw.stopped + 1}. A line that is right looks wrong to them, which is a gap of its own.`;
    signals.push("false_alarm");
    diagnosis = { effect: "NO_EVIDENCE", note: "Stopped at a line that was right, so this says little about checking by expanding." };
  }
  return {
    answer: REPLAY_LINE_OPTIONS[raw.stopped]!,
    game: { kind: "REPLAY", stopped: raw.stopped, ...(lateMs !== undefined ? { lateMs } : {}) },
    reading: { kind: "REPLAY", summary, signals, skillId: question.answerKey.diagnostics!.skillId, certainty: raw.stopped === SLIP_LINE ? 0.8 : 0.6, diagnosis, facts: { stopped: raw.stopped + 1 } },
  };
}

// ---------- Chunk it ----------

export interface ChunkData { chunk: string; routes: Array<{ id: "BLOCK" | "EXPAND" | "ROOT"; lines: string[] }>; answer: string }

/** (x + a)² − b²: treat the bracket as one chunk, expand it first, or square-root each part. */
export function chunkData(a: number, b: number): ChunkData | null {
  if (a === b || a < 1 || b < 2) return null;
  const chunk = `x + ${a}`;
  const lo = a - b, hi = a + b;
  const answerBlock = `(x ${lo < 0 ? "-" : "+"} ${Math.abs(lo)})(x + ${hi})`;
  const answerExpand = `(x + ${hi})(x ${lo < 0 ? "-" : "+"} ${Math.abs(lo)})`;
  const root = `x ${lo < 0 ? "-" : "+"} ${Math.abs(lo)}`;
  const start = `(x + ${a})^2 - ${b * b}`;
  const routes: ChunkData["routes"] = [
    { id: "BLOCK", lines: [start, `A^2 - ${b}^2`, `(A - ${b})(A + ${b})`, `(x + ${a} - ${b})(x + ${a} + ${b})`, answerBlock] },
    { id: "EXPAND", lines: [start, `x^2 + ${2 * a}x + ${a * a} - ${b * b}`, `x^2 + ${2 * a}x ${a * a - b * b < 0 ? "-" : "+"} ${Math.abs(a * a - b * b)}`, answerExpand] },
    { id: "ROOT", lines: [start, `(x + ${a}) - ${b}`, root] },
  ];
  const expression = start;
  if (!(classifyFactorisation(answerBlock, expression) === "CORRECT" && classifyFactorisation(answerExpand, expression) === "CORRECT" && algebraicallyEqual(root, expression) === false)) return null;
  return { chunk, routes, answer: answerBlock };
}

function readChunkIt(question: LotusQuestion, game: ChunkItGame, raw: ChunkItResponse): Read {
  if (!isInt(raw.route) || raw.route < 0 || raw.route >= game.routes.length) throw new LotusGameError("Choose a first move before submitting.");
  const lines = game.routes[raw.route]!.lines;
  const answer = lines[lines.length - 1]!;
  const expression = question.answerKey.diagnostics!.expression!;
  const right = (() => { try { return classifyFactorisation(answer, expression) === "CORRECT"; } catch { return false; } })();
  const treatedAsOne = lines.some((l) => /^A\^2/.test(l));
  const expanded = lines.some((l) => /^x\^2 \+ \d+x/.test(l));
  const signals = [treatedAsOne ? "route_chunk" : expanded ? "route_expand" : "route_root"];
  let summary: string;
  let diagnosis: LotusGameDiagnosis;
  if (treatedAsOne && right) {
    summary = `Treated (${game.chunk}) as one chunk and saw A² − ${"b"}². That's structure sense: spotting a difference of squares wherever it hides.`;
    diagnosis = { effect: "SECURE" };
  } else if (expanded && right) {
    summary = "Right, the long way. Four lines and a product–sum search. They can do it but didn't see the structure, and marking the answer alone would call this full mastery.";
    diagnosis = { effect: "NEEDS_ANOTHER", note: "Reached the answer by expanding first rather than seeing the structure." };
  } else if (right) {
    summary = "Reached the right answer by a route that isn't one of the usual two.";
    diagnosis = { effect: "NEEDS_ANOTHER" };
  } else {
    summary = "Square-rooted each part. Thinks √(a − b) = √a − √b. A different misconception, worth its own follow-up.";
    signals.push("rooted_each_part");
    diagnosis = mistakeWith(question, "NOT_DIFF_OF_SQUARES", "Took the square root of each part of a difference.");
  }
  return {
    answer,
    game: { kind: "CHUNK_IT", route: raw.route },
    reading: { kind: "CHUNK_IT", summary: summary.replace("A² − b²", "a difference of squares"), signals, skillId: question.answerKey.diagnostics!.skillId, certainty: right ? 0.85 : 0.8, diagnosis, facts: { route: raw.route, right } },
  };
}

// ---------- dispatch ----------

export const MORE_GAME_KINDS = ["ORDER_STEPS", "TEST_CLAIM", "RAPID_SET", "FIND_EVERY_B", "REPLAY", "CHUNK_IT"] as const;
export type MoreGameKind = (typeof MORE_GAME_KINDS)[number];
export const isMoreGameKind = (kind: string): kind is MoreGameKind => (MORE_GAME_KINDS as readonly string[]).includes(kind);

export function readMoreGame(question: LotusQuestion, response: LotusGameResponse): Read {
  const game = question.game;
  if (!game || !isMoreGameKind(game.kind) || response.kind !== game.kind) throw new LotusGameError("That doesn't match the game on screen.");
  // Probe questions keep a copy of their own game: the one on screen is the one this server stored.
  switch (game.kind) {
    case "ORDER_STEPS": return readOrderSteps(question, game, response as OrderStepsResponse);
    case "TEST_CLAIM": return readTestClaim(question, game, response as TestClaimResponse);
    case "RAPID_SET": return readRapidSet(question, game, response as RapidSetResponse);
    case "FIND_EVERY_B": return readFindEveryB(question, game, response as FindEveryBResponse);
    case "REPLAY": return readReplay(question, game, response as ReplayResponse);
    case "CHUNK_IT": return readChunkIt(question, game, response as ChunkItResponse);
  }
}

