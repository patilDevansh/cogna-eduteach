import type { LotusQuestion, LotusReasonCheck, LotusSkillEvidence } from "@cogna/shared";
import { createHash } from "node:crypto";
import { ownerOfMistake } from "./lotus-factorisation-catalogue";

/**
 * "How did you get it?" — the one-tap replacement for written working.
 *
 * Asked only when a wrong typed answer matches none of the question's known
 * mistakes (code already names the rest from the final answer alone). The
 * choices come from the question's own predicted mistakes, phrased the way a
 * student would say them, plus "not sure" and "guessed". What each choice
 * means is rebuilt here on the server from the question; the browser only
 * ever sees the words.
 */

export const REASON_PROMPT = "How did you get it?";

/** A mistake, in the student's words. Codes without a phrase are never offered. */
const IN_MY_WORDS: Record<string, string> = {
  DIVIDED_FIRST_TERM_ONLY: "I divided only the first term by the common factor",
  DIVIDED_ONE_TERM_ONLY: "I divided only one of the terms by the common factor",
  COMMON_NOT_HIGHEST: "I took out a common factor, but not the biggest one",
  PARTIAL_GCF: "I took out part of the common factor, not all of it",
  TOOK_HIGHEST_POWER: "I took out the highest power of the letter, not the lowest",
  INCLUDED_NON_COMMON_VARIABLE: "I took out a letter that isn't in every term",
  INDEX_NOT_REDUCED: "I took out the letter but didn't lower the power left inside",
  INCOMPLETE_FACTORISATION: "I stopped once I had one bracket",
  SKIPPED_COMMON_FACTOR_CHECK: "I didn't look for a common factor first",
  SUM_ACCEPTED_AS_FACTORISED: "I thought it was already factorised",
  WRONG_FACTOR_PAIR_SUM: "I found two numbers that multiply right, but didn't check they add right",
  WRONG_FACTOR_PAIR_PRODUCT: "I found two numbers that add right, but didn't check they multiply right",
  PRODUCT_SUM_SWAPPED: "I mixed up which number they multiply to and which they add to",
  SWAPPED_PRODUCT_SUM: "I mixed up which number they multiply to and which they add to",
  MISSED_PAIR: "I couldn't find the pair, so I used the closest one",
  SIGN_PAIR_ERROR: "I had the right numbers but wasn't sure about the signs",
  SIGNS_SWAPPED: "I put the plus and minus signs the wrong way round",
  FLIPPED_ONE_SIGN: "I changed one sign but not the other",
  WRONG_MIDDLE_SIGN: "I wasn't sure about the sign in the middle",
  DROPPED_SIGN: "I lost a minus sign along the way",
  KEPT_ORIGINAL_SIGNS: "I took out a minus but kept the signs inside the same",
  SIGN_NOT_FLIPPED_IN_GROUP: "I took a minus out of a pair but didn't change the signs inside",
  WROTE_PERFECT_SQUARE: "It looked like a perfect square, so I wrote it as one",
  WROTE_DIFF_OF_SQUARES: "It looked like a difference of two squares, so I used that",
  FACTORED_SUM_OF_SQUARES: "I factorised a sum of two squares like a difference",
  COEFFICIENT_NOT_ROOTED: "I took the square root of the letter but not of the number",
  ROOTED_NUMBER_ONLY: "I took the square root of the number but not of the letter",
  HALVED_NOT_ROOTED: "I halved the number instead of taking its square root",
  NOT_ROOTED: "I didn't take the square roots",
  SQUARED_WITHOUT_ROOT: "I didn't take the square roots",
  DROPPED_SQUARE: "I left out the square on the bracket",
  DROPPED_THE_ONE: "I left out the 1 when a whole term came out",
  PAIRS_SHARE_NOTHING: "I grouped terms that don't have anything in common",
  LEFTOVERS_MULTIPLIED: "I multiplied the leftover parts together",
  BRACKET_NOT_SEEN_AS_FACTOR: "I didn't treat the bracket as one thing to take out",
  CANCELLED_TERMS_NOT_FACTORS: "I cancelled parts that were added, not multiplied",
  COMBINED_UNLIKE_TERMS: "I added terms that aren't like terms",
  ADDED_INSTEAD: "I added where I should have multiplied",
  SQUARE_DISTRIBUTES: "I squared each part of the bracket separately",
};

const UNSURE = { id: "unsure", text: "I wasn't sure what to do" } as const;
const GUESSED = { id: "guessed", text: "I guessed" } as const;
const SLIP = { id: "slip", text: "I knew the method but slipped up" } as const;

/** Which typed answers earn the follow-up: wrong, readable, and not explained by a known mistake. */
export function needsReasonCheck(question: LotusQuestion, verificationStatus: string | undefined, instantEvidence: LotusSkillEvidence[], didNotKnow: boolean): boolean {
  const d = question.answerKey?.diagnostics;
  if (!d || didNotKnow || verificationStatus !== "VERIFIED_INCORRECT") return false;
  if (d.itemKind !== "FACTORISE" && d.itemKind !== "SIMPLIFY") return false;
  return !instantEvidence.some((e) => e.kind !== "SECURE");
}

/** The question's own mistakes the student might name, at most two, in a stable order. */
function mistakeOptions(question: LotusQuestion): Array<{ id: string; text: string; mistake: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; text: string; mistake: string }> = [];
  for (const p of question.answerKey?.diagnostics?.predictedMistakes ?? []) {
    const text = IN_MY_WORDS[p.mistake];
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ id: "", text, mistake: p.mistake });
  }
  // Stable per question, so a reload shows the same order; ids are opaque (no mistake codes reach the browser).
  const key = (code: string) => createHash("sha1").update(`${question.id}|${code}`).digest("hex");
  return out.sort((a, b) => key(a.mistake).localeCompare(key(b.mistake))).slice(0, 2).map((o, i) => ({ ...o, id: `r${i + 1}` }));
}

/** The follow-up for one answer: two of its mistakes (or one and "slipped up"), then "not sure" and "guessed". */
export function buildReasonCheck(question: LotusQuestion): LotusReasonCheck {
  const mistakes = mistakeOptions(question).map(({ id, text }) => ({ id, text }));
  const options = [...mistakes, ...(mistakes.length < 2 ? [SLIP] : []), UNSURE, GUESSED];
  return { prompt: REASON_PROMPT, options: options.map(({ id, text }) => ({ id, text })) };
}

/**
 * What a chosen reason records, rebuilt from the question. A named mistake or
 * a slip is one negative on the skill (suspected, never confirmed alone);
 * "not sure" is a support need; "guessed" records nothing about any skill.
 */
export function reasonEvidence(question: LotusQuestion, optionId: string): { valid: boolean; evidence: LotusSkillEvidence | null } {
  const d = question.answerKey?.diagnostics;
  if (!d) return { valid: false, evidence: null };
  if (optionId === GUESSED.id) return { valid: true, evidence: null };
  if (optionId === UNSURE.id) {
    return { valid: true, evidence: { skillId: d.skillId, kind: "DID_NOT_KNOW", source: "REASON", description: `Said: "${UNSURE.text}".` } };
  }
  if (optionId === SLIP.id) {
    return { valid: true, evidence: { skillId: d.skillId, kind: "MISTAKE", source: "REASON", description: `Said: "${SLIP.text}".` } };
  }
  const named = mistakeOptions(question).find((o) => o.id === optionId);
  if (!named) return { valid: false, evidence: null };
  return { valid: true, evidence: { skillId: ownerOfMistake(named.mistake, d), kind: "MISTAKE", mistake: named.mistake, source: "REASON", description: `Said: "${named.text}".` } };
}
