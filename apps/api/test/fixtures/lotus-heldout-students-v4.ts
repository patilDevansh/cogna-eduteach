/**
 * HELD-OUT simulated students for the factorisation diagnostic, set v4.
 *
 * Written BEFORE the change it measures (asking the seven added skills in the live test, and making the
 * two soft prerequisites count), and never used to tune it. v1-v3 are tuning sets now. None of these
 * students is in v1, v2, v3 or the P/X catalogues. Do not edit a student after its first run.
 *
 * What it measures, still open when this was written (map factorisation-2.0.0, 38 skills):
 *   P1. A gap in one of the seven added skills. Five of them sit above nothing, so the 25 questions never
 *       ask about them: such a child should at least be named in the report, not given an all-clear.
 *   P2. The two added skills that sit under a skill the test visits (dividing powers, irreducible factors)
 *       are soft prerequisites: found only if a going-down check happens to reach them.
 *   P3. Three problems left open by v3: a gap on a late skill; a solid child who tires near the end; foundation
 *       roots reached only about 40% of the time (factor pairs, expand one bracket).
 *
 * Groups: A capable children (6), B one added skill missing (7), C one older skill missing, chosen where v1-v3
 * were weak or silent (7), D two gaps that involve an added skill (2), E messy (2).
 *
 * Pre-declared criteria for the change that follows (the "before" figures are one run of 20 plays per
 * student on the code as it stands, taken before that change is written and recorded in
 * docs/mvp-10.0/HELDOUT_SCORECARD.md):
 *   A. Silent misses among the seven added-skill students (B): 0.
 *   B. A gap found at all (root or above) for the B students: at least 80%; overall and at the root: not lower than before.
 *   C. No capable child is ever given a confirmed gap; false-gap plays not higher than before.
 *   D. Median questions for children with a gap no more than 2 higher than before; never more than 25.
 *   E. Capable children reported ADVANCEMENT: not fewer than before.
 *
 * Limits, as before: scripted students, a pretend AI that labels the way a real reviewer is asked to,
 * truth built on the same prerequisite map as the rules. A student lacking an added skill answers wrong on
 * every question that uses it, with a listed wrong answer where the question lists one.
 */
import type { PersonaQuestionLike, PersonaResponsePlan } from "./lotus-factorisation-personas";
import type { HeldOutStudent } from "./lotus-heldout-students";
import { respondV2 } from "./lotus-heldout-students-v2";

export interface HeldOutStudentV4 extends HeldOutStudent {
  /** True for a student whose gap is in one of the seven added skills (group B). */
  addedSkill?: true;
}

const tidy = { confidenceBand: [55, 80] as [number, number], paceMsBand: [15_000, 35_000] as [number, number], workingStyle: "full-steps" as const };

export const HELDOUT_STUDENTS_V4: HeldOutStudentV4[] = [
  // ---- A. capable children ----
  { id: "X01_SOLID", group: "CAPABLE", lacks: {}, story: "Solid on everything.", behaviour: { ...tidy, confidenceBand: [80, 95] } },
  { id: "X02_SLIPS_AT_3_11_17", group: "CAPABLE", lacks: {}, story: "Solid; three miscopied answers at questions 3, 11 and 17.", behaviour: { ...tidy, messy: { copySlipTurns: [3, 11, 17] } } },
  { id: "X03_SOLID_TIRED_FROM_20", group: "CAPABLE", lacks: {}, story: "Solid, tired and rushing for the last six questions.", behaviour: { ...tidy, messy: { tiredFromTurn: 20 } } },
  { id: "X04_SOLID_TIRED_FROM_24", group: "CAPABLE", lacks: {}, story: "Solid, tired and rushing for the last two questions.", behaviour: { ...tidy, messy: { tiredFromTurn: 24 } } },
  { id: "X05_SOLID_SCRUFFY", group: "CAPABLE", lacks: {}, story: "Solid; one unclosed bracket and two miscopied digits.", behaviour: { ...tidy, messy: { unreadableTurns: [6], copySlipTurns: [12, 18] } } },
  { id: "X06_SOLID_SLOW_UNSURE", group: "CAPABLE", lacks: {}, story: "Solid, slow and unsure of themselves.", behaviour: { confidenceBand: [20, 40], paceMsBand: [50_000, 90_000], workingStyle: "hesitant" } },
  // ---- B. one of the seven added skills missing ----
  { id: "X07_DIVIDING_POWERS", group: "FOUNDATION_GAP", addedSkill: true, lacks: { FND_EXPONENT_QUOTIENT: "DIVIDED_EXPONENTS" }, story: "Divides the indices instead of subtracting them: x^6 over x^2 gives x^3.", behaviour: tidy },
  { id: "X08_COMPOSITE_STOP", group: "FOUNDATION_GAP", addedSkill: true, lacks: { FND_IRREDUCIBLE_FACTORS: "STOPPED_AT_COMPOSITE_FACTOR" }, story: "Writes a term as a product but leaves a factor that can still be split.", behaviour: tidy },
  { id: "X09_GIVEN_ORDER_ONLY", group: "CHAPTER_GAP", addedSkill: true, lacks: { FAC_REARRANGE_TO_GROUP: "TRIED_GIVEN_ORDER_ONLY" }, story: "Groups four terms only in the order given and gives up when the pairs share nothing.", behaviour: tidy },
  { id: "X10_BRACKET_EXPANDER", group: "CHAPTER_GAP", addedSkill: true, lacks: { ID_BRACKET_AS_ONE: "EXPANDED_BRACKET_FIRST" }, story: "Expands a squared bracket before looking for a difference of squares.", behaviour: tidy },
  { id: "X11_SPLIT_MIDDLE_WRONG", group: "CHAPTER_GAP", addedSkill: true, lacks: { FAC_SPLIT_MIDDLE: "SPLIT_PAIR_DOES_NOT_SUM" }, story: "Splits the middle term into two parts that don't add back to it.", behaviour: tidy },
  { id: "X12_COEFFICIENT_ONLY", group: "CHAPTER_GAP", addedSkill: true, lacks: { DIV_TERM_BY_TERM: "DIVIDED_COEFFICIENT_ONLY" }, story: "Divides the numbers in a term by a term and leaves the letters alone.", behaviour: tidy },
  { id: "X13_LEFT_TERM_UNDIVIDED", group: "CHAPTER_GAP", addedSkill: true, lacks: { DIV_EXPR_BY_TERM: "LEFT_TERM_UNDIVIDED" }, story: "Divides an expression by a term but leaves the first term as it was.", behaviour: tidy },
  // ---- C. one older skill missing, where v1-v3 were weak or silent ----
  { id: "X14_MISSES_A_PAIR", group: "FOUNDATION_GAP", lacks: { FND_FACTOR_PAIRS: "MISSED_PAIR" }, story: "Lists the factor pairs of a number but leaves one out.", behaviour: tidy },
  { id: "X15_DROPS_THE_POWER", group: "FOUNDATION_GAP", lacks: { EXP_EXPAND_SINGLE: "DROPPED_VARIABLE_POWER" }, story: "Multiplies out one bracket but loses the power on the letter.", behaviour: tidy },
  { id: "X16_SIGNED_SUMS", group: "FOUNDATION_GAP", lacks: { FND_SIGN_ADD_SUB: "SIGN_SUM_ERROR" }, story: "Gets the sign wrong when adding or subtracting negatives.", behaviour: tidy },
  { id: "X17_NEGATIVE_FACTOR", group: "CHAPTER_GAP", lacks: { FAC_GCF_NEGATIVE: "KEPT_ORIGINAL_SIGNS" }, story: "Takes out a negative common factor but keeps every sign inside as it was.", behaviour: tidy },
  { id: "X18_REVERSED_BRACKET", group: "CHAPTER_GAP", lacks: { FAC_COMMON_BINOMIAL: "REVERSED_BRACKET_MISSED" }, story: "Doesn't see (2 - x) as the same bracket as (x - 2).", behaviour: tidy },
  { id: "X19_CHECKS_FIRST_TERM", group: "CHAPTER_GAP", lacks: { FAC_VERIFY_EXPAND: "CHECKED_FIRST_TERM_ONLY" }, story: "Checks a factorisation by expanding but only compares the first term.", behaviour: tidy },
  { id: "X20_PLUS_SQUARE_MIDDLE", group: "CHAPTER_GAP", lacks: { FAC_PERFECT_SQUARE_PLUS: "MIDDLE_TERM_NOT_CHECKED" }, story: "Writes a perfect square without checking the middle term.", behaviour: tidy },
  // ---- D. two gaps that involve an added skill ----
  { id: "X21_QUOTIENT_AND_SIGNS", group: "SEVERAL_GAPS", addedSkill: true, lacks: { FND_EXPONENT_QUOTIENT: "DIVIDED_EXPONENTS", FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR" }, story: "Divides indices, and gets the sign wrong when dividing negatives.", behaviour: tidy },
  { id: "X22_PAIRS_AND_SPLITTING", group: "SEVERAL_GAPS", addedSkill: true, lacks: { FND_FACTOR_PAIRS: "NO_NEGATIVE_PAIRS", FAC_SPLIT_MIDDLE: "SPLIT_PAIR_DOES_NOT_SUM" }, story: "Never thinks of negative factor pairs, and splits the middle term wrongly.", behaviour: tidy },
  // ---- E. messy ----
  { id: "X23_QUOTIENT_PLUS_MESS", group: "MESSY", addedSkill: true, lacks: { FND_EXPONENT_QUOTIENT: "DIVIDED_EXPONENTS" }, story: "Divides indices, plus two miscopied answers and an unclosed bracket.", behaviour: { ...tidy, messy: { copySlipTurns: [7, 15], unreadableTurns: [11] } } },
  { id: "X24_BRACKET_THEN_TIRED", group: "MESSY", lacks: { FAC_COMMON_BINOMIAL: "BRACKET_NOT_SEEN_AS_FACTOR" }, story: "A common-bracket gap, then tired and rushing from question 20.", behaviour: { ...tidy, messy: { tiredFromTurn: 20 } } },
];

/** What the student submits for this question on this turn. */
export function respondV4(student: HeldOutStudentV4, question: PersonaQuestionLike, turn: number): PersonaResponsePlan {
  return respondV2(student, question, turn);
}
