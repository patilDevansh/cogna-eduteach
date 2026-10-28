/**
 * HELD-OUT simulated students for the factorisation diagnostic, set v3.
 *
 * Written BEFORE the fixes it measures, and never used to tune them. v1 and v2 were used to
 * design and to report the earlier fixes; both are tuning sets now. None of these students is
 * in v1, v2 or the P/X catalogues. Do not edit a student after its first run.
 *
 * It measures two problems found on v2, still open when this was written:
 *   P1. A foundation gap is missed silently when the wrong answers above it are unexplained:
 *       the review says "misunderstanding" but names no step, so the rules get no evidence, no
 *       gap is found above, the test is never sent down, and the report reads as an all-clear.
 *   P2. A solid child who gets tired near the end is given a gap.
 * and re-checks the two earlier fixes: untested skills named; a cause under a tagged skill.
 *
 * What is different from v2: the pretend AI labels a wrong answer the way a real reviewer is
 * asked to (lotus-labelling-models.ts: slip / guess / unreadable / misunderstanding with no
 * step), so slips are not confused with unexplained answers; tired spells start at several
 * points (16, 19, 21, 22); two students use the v1 answer model, whose wrong answers carry a
 * predicted mistake of the question's own skill, to exercise the "cause under a tagged skill"
 * fix on held-out data.
 *
 * Pre-declared criteria (the "before" figures are one run of 20 plays per student on the code
 * before the fixes, taken before they were written):
 *   A. Silent misses: 0 (a planted gap not found, and the report does not name its skill).
 *   B. Found (root or above) and found at the root: neither lower than before.
 *   C. No capable child is ever given a confirmed gap, tired or not; false gaps overall not higher.
 *   D. Median questions for children with a gap no more than 2 higher than before.
 *   E. Capable children reported ADVANCEMENT: not fewer than before (a rule that stops
 *      all-clears for children with a gap must not take them from solid children).
 *
 * Limits, as before: scripted students, a pretend AI, truth built on the same prerequisite map
 * as the rules. The labelling AI is a model of a reviewer, not a reviewer.
 */
import type { PersonaQuestionLike, PersonaResponsePlan } from "./lotus-factorisation-personas";
import type { HeldOutStudent } from "./lotus-heldout-students";
import { respond as respondV1 } from "./lotus-heldout-students";
import { respondV2 } from "./lotus-heldout-students-v2";

export interface HeldOutStudentV3 extends HeldOutStudent {
  /** REALISTIC (default): a predicted wrong answer only where the question lists a mistake behind the lacked skill. PREDICTED_FALLBACK: v1's model. */
  answerModel?: "REALISTIC" | "PREDICTED_FALLBACK";
}

const tidy = { confidenceBand: [55, 80] as [number, number], paceMsBand: [15_000, 35_000] as [number, number], workingStyle: "full-steps" as const };

export const HELDOUT_STUDENTS_V3: HeldOutStudentV3[] = [
  // ---- A. capable children ----
  { id: "W01_SOLID", group: "CAPABLE", lacks: {}, story: "Solid on everything.", behaviour: { ...tidy, confidenceBand: [80, 95] } },
  { id: "W02_THREE_SLIPS_APART", group: "CAPABLE", lacks: {}, story: "Solid; three miscopied answers well apart.", behaviour: { ...tidy, messy: { copySlipTurns: [5, 12, 19] } } },
  { id: "W03_SOLID_TIRED_FROM_22", group: "CAPABLE", lacks: {}, story: "Solid, tired and rushing for the last four questions.", behaviour: { ...tidy, messy: { tiredFromTurn: 22 } } },
  { id: "W04_SOLID_TIRED_FROM_19", group: "CAPABLE", lacks: {}, story: "Solid, tired and rushing for the last seven questions.", behaviour: { ...tidy, messy: { tiredFromTurn: 19 } } },
  { id: "W05_SOLID_TIRED_FROM_16", group: "CAPABLE", lacks: {}, story: "Solid, tired and rushing for the last ten questions.", behaviour: { ...tidy, messy: { tiredFromTurn: 16 } } },
  { id: "W06_SOLID_SCRUFFY", group: "CAPABLE", lacks: {}, story: "Solid; two unclosed brackets and one miscopied digit.", behaviour: { ...tidy, messy: { unreadableTurns: [4, 13], copySlipTurns: [9] } } },
  { id: "W07_SOLID_SLOW_UNSURE", group: "CAPABLE", lacks: {}, story: "Solid, slow and unsure of themselves.", behaviour: { confidenceBand: [15, 35], paceMsBand: [55_000, 95_000], workingStyle: "hesitant" } },
  // ---- B. one foundation skill missing, realistic answers (the cause is never named by a predicted code) ----
  { id: "W08_SIGNED_PRODUCTS", group: "FOUNDATION_GAP", lacks: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR" }, story: "Gets the sign wrong when multiplying or dividing negatives.", behaviour: tidy },
  { id: "W09_HCF_AS_LCM", group: "FOUNDATION_GAP", lacks: { FND_GCD_NUMERIC: "GAVE_LCM" }, story: "Gives the lowest common multiple when asked for the HCF.", behaviour: tidy },
  { id: "W10_LOWEST_POWER", group: "FOUNDATION_GAP", lacks: { FND_MIN_EXP_COMMON: "TOOK_HIGHEST_POWER" }, story: "Takes the highest power of a shared letter.", behaviour: tidy },
  { id: "W11_ONE_BRACKET", group: "FOUNDATION_GAP", lacks: { EXP_EXPAND_SINGLE: "FIRST_TERM_ONLY" }, story: "Multiplies only the first term inside a bracket.", behaviour: tidy },
  { id: "W12_SQUARE_ROOTS", group: "FOUNDATION_GAP", lacks: { FND_RECOGNISE_SQUARE: "ROOTED_NUMBER_ONLY" }, story: "Roots the number in a square but leaves the letter's power.", behaviour: tidy },
  { id: "W13_IDENTITY_MIDDLE", group: "FOUNDATION_GAP", lacks: { ID_SQUARE_DIFF: "DROPPED_MIDDLE_TERM" }, story: "Drops the middle term when expanding a square.", behaviour: tidy },
  { id: "W14_NEGATIVE_PAIRS", group: "FOUNDATION_GAP", lacks: { FND_FACTOR_PAIRS: "NO_NEGATIVE_PAIRS" }, story: "Never thinks of the negative factor pairs.", behaviour: tidy },
  // ---- C. one chapter skill missing ----
  { id: "W15_EXTRA_LETTER", group: "CHAPTER_GAP", lacks: { FAC_GCF_VARIABLE: "INCLUDED_NON_COMMON_VARIABLE" }, story: "Takes out a letter that is not in every term.", behaviour: tidy },
  { id: "W16_GROUP_MINUS", group: "CHAPTER_GAP", lacks: { FAC_GROUP_SIGN: "SIGN_NOT_FLIPPED_IN_GROUP" }, story: "Grouping is fine until the second pair starts with a minus.", behaviour: tidy },
  { id: "W17_STOPS_EARLY", group: "CHAPTER_GAP", lacks: { FAC_FACTOR_FULLY: "INCOMPLETE_FACTORISATION" }, story: "Factorises once and stops, without checking each bracket.", behaviour: tidy },
  { id: "W18_CANCELS_TERMS", group: "CHAPTER_GAP", lacks: { FAC_CANCEL_COMMON_FACTOR: "CANCELLED_TERMS_NOT_FACTORS" }, story: "Cancels terms instead of factors.", behaviour: tidy },
  // ---- D. several gaps ----
  { id: "W19_SIGNS_AND_SQUARES", group: "SEVERAL_GAPS", lacks: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR", FND_RECOGNISE_SQUARE: "ROOTED_NUMBER_ONLY" }, story: "Signed products and square roots both trip them.", behaviour: tidy },
  { id: "W20_POWERS_AND_PAIRS", group: "SEVERAL_GAPS", lacks: { FND_EXPONENT_PRODUCT: "MULTIPLIED_EXPONENTS", FAC_PAIR_PRODUCT_SUM: "WRONG_FACTOR_PAIR_SUM" }, story: "Multiplies the indices of powers, and can't find the pair for a trinomial.", behaviour: tidy },
  // ---- E. the cause sits under a skill a question only tags (v1 answer model) ----
  { id: "W21_HCF_CONFOUND", group: "FOUNDATION_GAP", answerModel: "PREDICTED_FALLBACK", lacks: { FND_GCD_NUMERIC: "GAVE_LCM" }, story: "HCF as LCM; every question that needs it goes wrong in a way the question lists.", behaviour: tidy },
  { id: "W22_PAIRS_CONFOUND", group: "FOUNDATION_GAP", answerModel: "PREDICTED_FALLBACK", lacks: { FND_FACTOR_PAIRS: "NO_NEGATIVE_PAIRS" }, story: "Negative factor pairs; every question that needs them goes wrong in a way the question lists.", behaviour: tidy },
  // ---- F. messy ----
  { id: "W23_SIGNS_THEN_TIRED", group: "MESSY", lacks: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR" }, story: "A signed-products gap, then tired and rushing from question 21.", behaviour: { ...tidy, messy: { tiredFromTurn: 21 } } },
  { id: "W24_SQUARES_PLUS_MESS", group: "MESSY", lacks: { FAC_DIFF_SQUARES: "WROTE_PERFECT_SQUARE" }, story: "Writes a perfect square for a difference of squares, plus two miscopied answers and an unclosed bracket.", behaviour: { ...tidy, messy: { copySlipTurns: [6, 14], unreadableTurns: [10] } } },
];

/** What the student submits for this question on this turn. */
export function respondV3(student: HeldOutStudentV3, question: PersonaQuestionLike, turn: number): PersonaResponsePlan {
  return student.answerModel === "PREDICTED_FALLBACK" ? respondV1(student, question, turn) : respondV2(student, question, turn);
}
