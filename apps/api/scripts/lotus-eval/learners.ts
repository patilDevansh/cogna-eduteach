/**
 * Lotus full evaluation, learner set E1. FROZEN on 2026-11-07, before the first run.
 *
 * New learners: none is in the v1–v4 held-out sets, the P/X persona catalogues or the blind evaluation.
 * Do not edit a learner after its first run; add a new set instead.
 *
 * Every learner has a complete profile:
 *   gaps   – skills they can't do. Any question that uses the skill, or a skill built on it, goes wrong.
 *   shaky  – skills they get right only about half the time, and doubt when they get them right.
 *   style  – how a gap shows: a known wrong answer, an unexpected wrong answer, or "I don't know".
 * Every other skill is secure.
 */

export type GapStyle = { predicted: number; unpredicted: number; dontKnow: number };

export interface Learner {
  id: string;
  group: "CAPABLE" | "ONE_ROOT" | "SEVERAL";
  story: string;
  /** Skill id → the mistake this learner makes on it. */
  gaps: Record<string, string>;
  /** Skill id → chance of getting it right. */
  shaky: Record<string, number>;
  /** How a gap shows. Defaults to MIXED. */
  style?: Partial<Record<string, GapStyle>> & { default?: GapStyle };
  behaviour: {
    /** Seconds per question, low–high. */
    pace: [number, number];
    /** Self-rated confidence, low–high (0–100), when right. */
    confidence: [number, number];
    /** Miscopies the last sign or digit on these questions (typed only). */
    copySlips?: number[];
    /** Rushes and answers wrong at random from this question on. */
    tiredFrom?: number;
    /** Puts one chip on a wrong option even when sure. */
    alwaysHedges?: boolean;
    /** Answers very fast and wrong on these questions. */
    rushedWrong?: number[];
  };
}

export const MIXED: GapStyle = { predicted: 0.6, unpredicted: 0.25, dontKnow: 0.15 };
const QUIET: GapStyle = { predicted: 0, unpredicted: 0, dontKnow: 1 };
const UNEXPECTED: GapStyle = { predicted: 0.3, unpredicted: 0.7, dontKnow: 0 };
const steady = { pace: [20, 45] as [number, number], confidence: [55, 85] as [number, number] };

export const LEARNERS_E1: Learner[] = [
  // ---- capable (6) ----
  { id: "E01_ALL_SECURE", group: "CAPABLE", story: "Secure on everything, quick and sure.", gaps: {}, shaky: {}, behaviour: { pace: [15, 30], confidence: [80, 95] } },
  { id: "E02_TWO_COPY_SLIPS", group: "CAPABLE", story: "Secure; miscopies a sign on questions 4 and 13.", gaps: {}, shaky: {}, behaviour: { ...steady, copySlips: [4, 13] } },
  { id: "E03_SLOW_UNSURE", group: "CAPABLE", story: "Secure, but slow and rates themselves low.", gaps: {}, shaky: {}, behaviour: { pace: [60, 100], confidence: [15, 35] } },
  { id: "E04_RUSHES_TWICE", group: "CAPABLE", story: "Secure; rushes two questions and gets them wrong.", gaps: {}, shaky: {}, behaviour: { ...steady, rushedWrong: [7, 16] } },
  { id: "E05_TIRED_FROM_18", group: "CAPABLE", story: "Secure, then tired and rushing from question 18.", gaps: {}, shaky: {}, behaviour: { ...steady, tiredFrom: 18 } },
  { id: "E06_ALWAYS_HEDGES", group: "CAPABLE", story: "Secure, but always puts one chip on another answer.", gaps: {}, shaky: {}, behaviour: { ...steady, alwaysHedges: true } },

  // ---- one root gap (8) ----
  { id: "E07_DIVIDES_INDICES", group: "ONE_ROOT", story: "Divides indices instead of subtracting; unsure about common letters.",
    gaps: { FND_EXPONENT_QUOTIENT: "DIVIDED_EXPONENTS" }, shaky: { FAC_GCF_VARIABLE: 0.5 }, behaviour: steady },
  { id: "E08_DROPS_POWER", group: "ONE_ROOT", story: "Loses the power on the letter when expanding one bracket; shaky adding negatives.",
    gaps: { EXP_EXPAND_SINGLE: "DROPPED_VARIABLE_POWER" }, shaky: { FND_SIGN_ADD_SUB: 0.5 }, behaviour: steady },
  { id: "E09_SIGN_PRODUCTS", group: "ONE_ROOT", story: "Gets the sign of a product of negatives wrong; shaky on what factorised means.",
    gaps: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR" }, shaky: { FAC_MEANING: 0.5 }, behaviour: steady },
  { id: "E10_COMMON_NOT_HIGHEST", group: "ONE_ROOT", story: "Finds a common number but not the highest; shaky on dividing powers.",
    gaps: { FND_GCD_NUMERIC: "COMMON_NOT_HIGHEST" }, shaky: { FND_EXPONENT_QUOTIENT: 0.5 }, style: { default: UNEXPECTED }, behaviour: steady },
  { id: "E11_NO_DIFF_SQUARES", group: "ONE_ROOT", story: "Doesn't know the difference of squares and says so; shaky on perfect squares with a plus.",
    gaps: { FAC_DIFF_SQUARES: "NOT_DIFF_OF_SQUARES" }, shaky: { FAC_PERFECT_SQUARE_PLUS: 0.5 }, style: { default: QUIET }, behaviour: steady },
  { id: "E12_SPLITS_WRONG", group: "ONE_ROOT", story: "Splits the middle term into parts that don't add back; shaky on grouping.",
    gaps: { FAC_SPLIT_MIDDLE: "SPLIT_PAIR_DOES_NOT_SUM" }, shaky: { FAC_GROUP_TERMS: 0.5 }, behaviour: steady },
  { id: "E13_GROUP_MINUS", group: "ONE_ROOT", story: "Doesn't flip the sign when the second pair starts with a minus; shaky on a negative common factor.",
    gaps: { FAC_GROUP_SIGN: "SIGN_NOT_FLIPPED_IN_GROUP" }, shaky: { FAC_GCF_NEGATIVE: 0.5 }, behaviour: steady },
  { id: "E14_SKIPS_COMMON_FACTOR", group: "ONE_ROOT", story: "Jumps to an identity without looking for a common factor; shaky on factorising fully.",
    gaps: { FAC_CHOOSE_METHOD: "SKIPPED_COMMON_FACTOR_CHECK" }, shaky: { FAC_FACTOR_FULLY: 0.5 }, behaviour: steady },

  // ---- several gaps (10) ----
  { id: "E15_SIGNS_THEN_PAIRS", group: "SEVERAL", story: "Sign products wrong, and that breaks product–sum pairs; shaky reading a trinomial's signs.",
    gaps: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR", FAC_PAIR_PRODUCT_SUM: "SIGN_PAIR_ERROR" }, shaky: { FAC_READ_ABC_SIGNS: 0.5 }, behaviour: steady },
  { id: "E16_BRACKET_AND_DOS", group: "SEVERAL", story: "Can't take out a common bracket, and doesn't know the difference of squares.",
    gaps: { FAC_COMMON_BINOMIAL: "BRACKET_NOT_SEEN_AS_FACTOR", FAC_DIFF_SQUARES: "WROTE_PERFECT_SQUARE" }, shaky: { FAC_MEANING: 0.5 }, behaviour: steady },
  { id: "E17_PAIRS_AND_SPLIT", group: "SEVERAL", story: "Misses factor pairs, and splits the middle term wrongly.",
    gaps: { FND_FACTOR_PAIRS: "MISSED_PAIR", FAC_SPLIT_MIDDLE: "SPLIT_PAIR_DOES_NOT_SUM" }, shaky: { FAC_MONIC_TRINOMIAL: 0.5 }, behaviour: steady },
  { id: "E18_DIVIDE_MINUS_CHECK", group: "SEVERAL", story: "Divides only the first term, gets the minus square's middle sign wrong, and checks only the first term.",
    gaps: { FAC_DIVIDE_TERMS: "DIVIDED_FIRST_TERM_ONLY", FAC_PERFECT_SQUARE_MINUS: "WRONG_MIDDLE_SIGN", FAC_VERIFY_EXPAND: "CHECKED_FIRST_TERM_ONLY" },
    shaky: { FAC_GCF_VARIABLE: 0.5 }, behaviour: steady },
  { id: "E19_LOWEST_POWER_NEG_TRI", group: "SEVERAL", story: "Takes the highest power as common, keeps signs when taking out a negative, and swaps signs in trinomials.",
    gaps: { FND_MIN_EXP_COMMON: "TOOK_HIGHEST_POWER", FAC_GCF_NEGATIVE: "KEPT_ORIGINAL_SIGNS", FAC_MONIC_TRINOMIAL: "SIGNS_SWAPPED" },
    shaky: { FAC_PAIR_PRODUCT_SUM: 0.5 }, behaviour: steady },
  { id: "E20_SQUARES_AND_GROUPING", group: "SEVERAL", story: "Halves instead of rooting, and groups into pairs that share nothing.",
    gaps: { FND_RECOGNISE_SQUARE: "HALVED_NOT_ROOTED", FAC_GROUP_TERMS: "PAIRS_SHARE_NOTHING" }, shaky: { FAC_COMMON_BINOMIAL: 0.5 }, behaviour: steady },
  { id: "E21_FOUR_GAPS", group: "SEVERAL", story: "Divides indices, adds negatives wrongly, thinks a sum is factorised, and stops before factorising fully.",
    gaps: { FND_EXPONENT_QUOTIENT: "DIVIDED_EXPONENTS", FND_SIGN_ADD_SUB: "SIGN_SUM_ERROR", FAC_MEANING: "SUM_ACCEPTED_AS_FACTORISED", FAC_FACTOR_FULLY: "INCOMPLETE_FACTORISATION" },
    shaky: {}, behaviour: steady },
  { id: "E22_PATTERN_AND_CANCEL", group: "SEVERAL", story: "Can't tell which identity fits, and cancels terms instead of factors.",
    gaps: { ID_REVERSE_PATTERN: "SHAPE_MISREAD", FAC_CANCEL_COMMON_FACTOR: "CANCELLED_TERMS_NOT_FACTORS" }, shaky: { FND_RECOGNISE_SQUARE: 0.5 }, behaviour: steady },
  { id: "E23_NUMBER_AND_READ_SIGNS", group: "SEVERAL", story: "Takes out a common number but not the highest, and drops signs reading a trinomial.",
    gaps: { FAC_GCF_NUMERIC: "COMMON_NOT_HIGHEST", FAC_READ_ABC_SIGNS: "DROPPED_SIGN" }, shaky: { FAC_DIVIDE_TERMS: 0.5 }, style: { default: UNEXPECTED }, behaviour: steady },
  { id: "E24_LIVE_TEST_STUDENT", group: "SEVERAL", story: "Like the 6 Nov live test: divides only the first term, doesn't know the difference of squares, mixes up square patterns, skips the common factor; tires late.",
    gaps: { FAC_DIVIDE_TERMS: "DIVIDED_FIRST_TERM_ONLY", FAC_DIFF_SQUARES: "NOT_DIFF_OF_SQUARES", FAC_PERFECT_SQUARE_PLUS: "WROTE_DIFF_OF_SQUARES", FAC_CHOOSE_METHOD: "SKIPPED_COMMON_FACTOR_CHECK" },
    shaky: { FAC_GCF_VARIABLE: 0.5 }, style: { FAC_DIFF_SQUARES: QUIET }, behaviour: { ...steady, tiredFrom: 22 } },
];
