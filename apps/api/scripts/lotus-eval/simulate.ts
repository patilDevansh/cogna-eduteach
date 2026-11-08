/**
 * Turns a learner profile into what a student sends for one question: an answer, a confidence, a time, and the
 * real game play (chips, drafts, picks) for the game the server issued. Seeded, so a run can be replayed.
 *
 * The learner reads the question's answer key to know the right answer and the listed wrong answers, the way a
 * scripted student must. It is never shown Cogna's marking, reviews or plan.
 */
import type { LotusGameResponse, LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import { LOTUS_SPLIT_TOKENS } from "@cogna/shared";
import { dependsOnTransitively, findSkill, skillsUsedBy } from "../../src/lotus/lotus-factorisation-catalogue";
import { normalizeMathText } from "../../src/lotus/lotus-algebra";
import { MIXED, type GapStyle, type Learner } from "./learners";

export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Kind = "RIGHT" | "DOUBTED_RIGHT" | "PREDICTED_WRONG" | "UNPREDICTED_WRONG" | "DONT_KNOW" | "SLIP" | "RUSHED";

export interface Intent {
  kind: Kind;
  /** The skill that decided it (gap or shaky), if any. */
  because?: string;
  answer: string;
  /** For a doubt: the wrong answer they half-believe. For a wrong answer: the right answer they nearly wrote. */
  other?: string;
  confidence: number;
  seconds: number;
}

const same = (a: string, b: string) => normalizeMathText(a) === normalizeMathText(b);
const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
const between = (r: () => number, [lo, hi]: [number, number]) => Math.round(lo + r() * (hi - lo));

function usedSkills(q: LotusQuestion): string[] {
  const d = q.answerKey.diagnostics;
  return d ? skillsUsedBy({ skillId: d.skillId, taggedSkills: d.taggedSkills ?? [], stepSkills: d.stepSkills ?? [] }) : [];
}

/** The question needs the skill, directly or through a skill built on it. */
export function needs(q: LotusQuestion, skill: string): boolean {
  return usedSkills(q).some((used) => dependsOnTransitively(used, skill));
}

function wrongAnswers(q: LotusQuestion): Array<{ answer: string; mistake: string }> {
  const correct = q.answerKey.canonicalAnswer;
  return (q.answerKey.diagnostics?.predictedMistakes ?? []).filter((p) => !same(p.answer, correct));
}

function choices(q: LotusQuestion): string[] | undefined {
  const g = q.game as { options?: string[]; claims?: string[] } | undefined;
  return g?.options ?? g?.claims ?? q.options;
}

/** A wrong answer code would not have listed: a changed digit in the right answer, or an unlisted option. */
function unexpected(q: LotusQuestion, r: () => number): string {
  const correct = q.answerKey.canonicalAnswer;
  const listed = wrongAnswers(q).map((p) => p.answer);
  const opts = choices(q);
  if (opts?.length && q.game?.kind !== "EDIT_HISTORY" && q.game?.kind !== "READBACK") {
    const unlisted = opts.filter((o) => !same(o, correct) && !listed.some((l) => same(l, o)));
    return pick(r, unlisted.length ? unlisted : opts.filter((o) => !same(o, correct)).length ? opts.filter((o) => !same(o, correct)) : opts);
  }
  const digits = [...correct.matchAll(/\d/g)].map((m) => m.index!);
  for (let tries = 0; tries < 12 && digits.length; tries++) {
    const at = pick(r, digits);
    const bumped = `${correct.slice(0, at)}${(Number(correct[at]) + 1 + Math.floor(r() * 7)) % 10}${correct.slice(at + 1)}`;
    if (!same(bumped, correct) && !listed.some((l) => same(l, bumped))) return bumped;
  }
  return `${correct} + 1`;
}

function knownWrong(q: LotusQuestion, skill: string, code: string): string | undefined {
  const own = new Set(findSkill(skill)?.mistakes ?? []);
  const wrong = wrongAnswers(q);
  return (wrong.find((p) => p.mistake === code) ?? wrong.find((p) => own.has(p.mistake)))?.answer;
}

function copySlip(answer: string): string {
  const at = Math.max(answer.lastIndexOf(" + "), answer.lastIndexOf(" - "));
  if (at > 0) return `${answer.slice(0, at)} ${answer[at + 1] === "+" ? "-" : "+"} ${answer.slice(at + 3)}`;
  const d = answer.search(/\d(?!.*\d)/);
  return d >= 0 ? `${answer.slice(0, d)}${(Number(answer[d]) + 1) % 10}${answer.slice(d + 1)}` : `${answer} + 1`;
}

const typedQuestion = (q: LotusQuestion) => !choices(q)?.length || q.game?.kind === "EDIT_HISTORY" || q.game?.kind === "READBACK";

export function decide(learner: Learner, q: LotusQuestion, turn: number, r: () => number): Intent {
  const b = learner.behaviour;
  const correct = q.answerKey.canonicalAnswer;
  const conf = () => between(r, b.confidence);
  const secs = () => between(r, b.pace);
  if (b.rushedWrong?.includes(turn) || (b.tiredFrom !== undefined && turn >= b.tiredFrom && r() < 0.7)) {
    const wrong = wrongAnswers(q);
    return { kind: "RUSHED", answer: wrong.length && r() < 0.5 ? pick(r, wrong).answer : unexpected(q, r), confidence: 30, seconds: 3 + Math.floor(r() * 4) };
  }
  for (const [skill, code] of Object.entries(learner.gaps)) {
    if (!needs(q, skill)) continue;
    const style: GapStyle = learner.style?.[skill] ?? learner.style?.default ?? MIXED;
    const roll = r();
    if (roll < style.dontKnow) return { kind: "DONT_KNOW", because: skill, answer: "I don't know", confidence: 10, seconds: secs() };
    const known = knownWrong(q, skill, code);
    if (known && roll < style.dontKnow + style.predicted) return { kind: "PREDICTED_WRONG", because: skill, answer: known, other: correct, confidence: conf(), seconds: secs() };
    return { kind: "UNPREDICTED_WRONG", because: skill, answer: unexpected(q, r), other: correct, confidence: Math.max(20, conf() - 20), seconds: secs() };
  }
  for (const [skill, chance] of Object.entries(learner.shaky)) {
    if (!usedSkills(q).includes(skill)) continue;
    const known = knownWrong(q, skill, findSkill(skill)?.mistakes[0] ?? "") ?? wrongAnswers(q)[0]?.answer;
    if (r() < chance) return { kind: "DOUBTED_RIGHT", because: skill, answer: correct, other: known, confidence: 40, seconds: secs() + 10 };
    return { kind: known ? "PREDICTED_WRONG" : "UNPREDICTED_WRONG", because: skill, answer: known ?? unexpected(q, r), other: correct, confidence: 45, seconds: secs() + 10 };
  }
  if (b.copySlips?.includes(turn) && typedQuestion(q)) return { kind: "SLIP", answer: copySlip(correct), other: correct, confidence: conf(), seconds: secs() };
  if (b.alwaysHedges) return { kind: "DOUBTED_RIGHT", answer: correct, other: wrongAnswers(q)[0]?.answer, confidence: conf(), seconds: secs() };
  return { kind: "RIGHT", answer: correct, confidence: conf(), seconds: secs() };
}

/** (x + p)(x + q) → p, q, when the answer has that shape. */
function pairOf(answer: string): { p: number; q: number } | undefined {
  const m = normalizeMathText(answer).replace(/\s/g, "").match(/^\(x([+-])(\d+)\)\(x([+-])(\d+)\)$/);
  return m ? { p: (m[1] === "-" ? -1 : 1) * Number(m[2]), q: (m[3] === "-" ? -1 : 1) * Number(m[4]) } : undefined;
}

function drafts(final: string, other: string | undefined, kind: Kind, seconds: number) {
  const end = seconds * 1000;
  const half = Math.max(1, Math.floor(final.length / 2));
  // A doubt or a near-miss shows as an earlier full draft of the other answer, then the final.
  const steps = (kind === "DOUBTED_RIGHT" || kind === "PREDICTED_WRONG") && other
    ? [other.slice(0, Math.max(1, Math.floor(other.length / 2))), other, final.slice(0, half), final]
    : [final.slice(0, half), final];
  return steps.map((v, i) => ({ t: Math.round(((i + 1) / steps.length) * end), v }));
}

/** The response for the game the server issued. Unsupported games get a plain typed answer (recorded as such). */
export function respond(q: LotusQuestion, intent: Intent, submissionId: string): { response: LotusStudentResponse; played: string } {
  const base: LotusStudentResponse = {
    answer: intent.answer, working: "", confidence: intent.confidence, responseTimeMs: intent.seconds * 1000,
    didNotKnow: intent.kind === "DONT_KNOW", submissionId, questionId: q.id,
  } as LotusStudentResponse;
  if (intent.kind === "DONT_KNOW") return { response: { ...base, answer: "I don't know" }, played: "DONT_KNOW" };
  const g = q.game;
  let game: LotusGameResponse | undefined;
  const idx = (opts: string[], a: string) => opts.findIndex((o) => same(o, a));
  if (g?.kind === "SPLIT_CONFIDENCE") {
    let main = idx(g.options, intent.answer);
    if (main < 0) main = g.options.findIndex((o) => !same(o, q.answerKey.canonicalAnswer));
    const counts = g.options.map(() => 0);
    const side = intent.other ? idx(g.options, intent.other) : -1;
    if ((intent.kind === "DOUBTED_RIGHT" || intent.kind === "UNPREDICTED_WRONG") && side >= 0 && side !== main) { counts[main] = LOTUS_SPLIT_TOKENS - 1; counts[side] = 1; }
    else counts[Math.max(0, main)] = LOTUS_SPLIT_TOKENS;
    game = { kind: "SPLIT_CONFIDENCE", counts };
  } else if (g?.kind === "EDIT_HISTORY" || g?.kind === "READBACK") {
    game = { kind: g.kind, history: drafts(intent.answer, intent.other, intent.kind, intent.seconds) } as LotusGameResponse;
  } else if (g?.kind === "TWO_NUMBERS" || g?.kind === "TWO_MOVES" || g?.kind === "COMMIT_THEN_CHOOSE") {
    const pair = pairOf(intent.answer);
    if (pair && Math.abs(pair.p) <= g.range && Math.abs(pair.q) <= g.range && pair.p !== 0 && pair.q !== 0) {
      if (g.kind === "TWO_NUMBERS") game = { kind: "TWO_NUMBERS", tries: [{ p: pair.p, q: pair.q }], final: pair };
      else if (g.kind === "TWO_MOVES") game = { kind: "TWO_MOVES", numbers: { n1: pair.p, n2: pair.q }, signs: [pair.p < 0 ? "-" : "+", pair.q < 0 ? "-" : "+"] };
      else { const at = idx(g.options, intent.answer); if (at >= 0) game = { kind: "COMMIT_THEN_CHOOSE", guess: pair, pick: at }; }
    }
  } else if (g?.kind === "TRUE_FALSE") {
    game = { kind: "TRUE_FALSE", verdicts: g.claims.map((c) => same(c, intent.answer) ? "true" : intent.kind === "DOUBTED_RIGHT" && intent.other && same(c, intent.other) ? "unsure" : "false") };
  }
  if (game) return { response: { ...base, game }, played: g!.kind };
  // Plain answer: typed questions carry their drafts as a typing record.
  if (typedQuestion(q)) return { response: { ...base, typing: drafts(intent.answer, intent.other, intent.kind, intent.seconds) }, played: g ? `PLAIN(${g.kind})` : "TYPED" };
  return { response: base, played: g ? `PLAIN(${g.kind})` : "CHOICE" };
}
