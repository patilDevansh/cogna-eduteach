/**
 * The Cogna Core Skill Map layer for factorisation (the reference chapter).
 *
 * The skill map is Cogna's shared description of the maths, not part of one test:
 * every interaction records evidence against it. This file adds what the plain
 * skill list in lotus-factorisation-catalogue.ts cannot say: what each skill
 * means (a card), which skill owns each mistake, what kind of link joins two
 * skills, how the skills line up with other chapters, and how well the questions
 * cover the map today. Nothing here changes how a live test runs; the checks in
 * checkSkillMap() keep the map honest as it grows. The seven proposed skills and
 * two proposed merges are data only: a skill goes live when it has questions.
 */
import { createHash } from "node:crypto";
import { FACTORISATION_SKILLS, FACTORISATION_SLOTS } from "./lotus-factorisation-catalogue";
import { SKILL_FAMILIES, buildSkillCheck } from "./lotus-skill-checks";
import { GRADE_8_DRAFTS } from "./syllabus";

/** Bump when a skill, link, owner or card changes, so old records can be read against the map they were made with. */
export const SKILL_MAP_VERSION = "factorisation-1.1.0";

/** Where a skill comes from. NCERT is a reference, not a limit: COGNA marks skills we added because they help the child more. */
export type SkillSource = "NCERT_CH12" | "FOUNDATION" | "COGNA";

export interface SkillCard {
  id: string;
  /** One observable line: what the child can do. */
  definition: string;
  /** What is in and out of scope for this skill. */
  boundary: string;
  example: string;
  nonExample: string;
  /** The forms the skill shows up in; evidence is recorded against these. */
  conditions: string[];
  /** What teaching this skill focuses on (different from its neighbours). */
  teachingFocus: string;
  source: SkillSource;
}

const SCOPE = "Whole-number coefficients and powers.";
// id, definition, example, non-example, boundary, conditions, teaching focus
type CardRow = [string, string, string, string, string, string[], string];
const FOUNDATION_ROWS: CardRow[] = [
  ["FND_FACTOR_PAIRS", "List every pair of integers that multiply to a number, including negative pairs", "12: 3 × 4 and (−3) × (−4)", "12 = 3 × 4 only", SCOPE + " Integers, not fractions.", ["positive number", "negative number"], "Systematic listing, then the negative twin of each pair"],
  ["FND_GCD_NUMERIC", "Find the highest number dividing two or three numbers", "HCF(12, 18) = 6", "LCM(12, 18) = 36", SCOPE, ["two numbers", "three numbers"], "Highest common, not smallest common multiple"],
  ["FND_EXPONENT_PRODUCT", "Multiply powers of one letter by adding indices", "x² · x³ = x⁵", "x² · x³ = x⁶", SCOPE, ["same letter", "with a number in front"], "Indices add; bases stay"],
  ["FND_MIN_EXP_COMMON", "Pick the lowest power of a letter shared by every term", "x², x³, x⁴ → x²", "x², x³, x⁴ → x⁴", SCOPE, ["same letter in all terms", "a letter missing from one term"], "Lowest shared power, and only letters in every term"],
  ["FND_SIGN_MUL_DIV", "Get the sign right when multiplying or dividing negative numbers", "−15 ÷ −3 = 5", "−15 ÷ −3 = −5", "Integers.", ["multiply", "divide"], "Same signs give plus, different signs give minus"],
  ["FND_SIGN_ADD_SUB", "Add and subtract with negative numbers", "−4 + (−5) = −9", "−4 + (−5) = −1", "Integers.", ["same signs", "different signs"], "Number-line moves; size first, then sign"],
  ["FND_RECOGNISE_SQUARE", "Spot numbers, terms and powers that are perfect squares", "49a² = (7a)², x⁴ = (x²)²", "50a² is not a perfect square", SCOPE, ["number", "letter power", "number with letter"], "Root of the number and half the power, both"],
  ["ALG_IDENTIFY_STRUCTURE", "Split an expression into signed terms and coefficients", "3x² − 5x + 2: −5x is a term", "3x² − 5x + 2 has two terms", SCOPE, ["plain", "with a minus"], "A term carries its sign; factors multiply, terms add"],
  ["EXP_EXPAND_SINGLE", "Multiply every term inside a bracket by the factor outside", "3(x − 4) = 3x − 12", "3(x − 4) = 3x − 4", SCOPE, ["number outside", "letter outside", "negative outside"], "Every term, including the sign"],
  ["EXP_EXPAND_BINOMIALS", "Make all four products and collect like terms", "(x + 3)(x − 5) = x² − 2x − 15", "(x + 3)(x − 5) = x² − 15", SCOPE, ["both plus", "one minus", "both minus"], "Four products, then combine like terms"],
  ["ID_SQUARE_DIFF", "Expand (a ± b)² and (a − b)(a + b) by identity", "(y − 3)² = y² − 6y + 9", "(y − 3)² = y² − 9", SCOPE, ["plus square", "minus square", "difference"], "Why the middle term appears; squares do not distribute"],
];
const CHAPTER_ROWS: CardRow[] = [
  ["FAC_MEANING", "Tell a product from a sum; know only factors cancel", "2y(x + 1) + 3(x + 1) is not yet factorised", "2y(x + 1) + 3(x + 1) is factorised", SCOPE, ["a sum of products", "a true product"], "Factors multiply; terms add"],
  ["FAC_CHOOSE_METHOD", "Pick a valid first move; a common factor first is the usual strategy and other valid routes are accepted", "3x² − 12 → take out 3", "3x² − 12 → treat as x² + 12", SCOPE, ["common factor first", "identity shape visible", "trinomial"], "Look for a common factor before anything else"],
  ["FAC_GCF_NUMERIC", "Find the highest number dividing every term", "12x + 18 → 6", "12x + 18 → 2", SCOPE, ["two terms", "three or more terms", "leaves a 1"], "Highest common number of the coefficients"],
  ["FAC_GCF_VARIABLE", "Find shared letters at their lowest power", "x² + 5x → x", "x² + 5x → x²", SCOPE, ["same letter", "letter not in every term"], "Only letters in every term, lowest power"],
  ["FAC_DIVIDE_TERMS", "Divide each term by the factor, keeping a 1 where needed", "3x² + 3x = 3x(x + 1)", "3x² + 3x = 3x(x)", SCOPE, ["number only", "letter only", "leaves a 1"], "Every term is divided; a whole term leaves a 1"],
  ["FAC_GCF_NEGATIVE", "Take out a negative and change every sign inside", "−4x − 8 = −4(x + 2)", "−4x − 8 = −4(x − 2)", SCOPE, ["all terms negative", "first term negative only"], "Dividing by a negative flips every sign"],
  ["FAC_COMMON_MONOMIAL", "Take out the number and letters together", "10x² − 18x³ = 2x²(5 − 9x)", "10x² − 18x³ = 2(5x² − 9x³)", SCOPE, ["numbers only", "letters only", "both", "three or more terms"], "Number and letters together, at the highest common"],
  ["FAC_COMMON_BINOMIAL", "Treat a repeated bracket as one factor, including a reversed one", "3(x − 2) + y(x − 2) = (x − 2)(3 + y)", "3(x − 2) + y(x − 2) = 3y(x − 2)", SCOPE, ["same bracket", "reversed bracket"], "A bracket is a factor like any other"],
  ["FAC_GROUP_TERMS", "Pair terms so both pairs share a bracket", "2xy + 2y + 3x + 3 = (x + 1)(2y + 3)", "2xy + 2y + 3x + 3 = 2y(x + 1) + 3(x + 1)", SCOPE, ["already in order", "needs rearranging"], "Take a factor from each pair, then the shared bracket"],
  ["FAC_GROUP_SIGN", "Take a negative out of the second pair", "6xy − 4y − 9x + 6 = (3x − 2)(2y − 3)", "6xy − 4y − 9x + 6 = (3x − 2)(2y + 3)", SCOPE, ["second pair starts with a minus", "reversed bracket"], "A minus in front flips the pair's signs"],
  ["ID_REVERSE_PATTERN", "Recognise a² − b², (a + b)², (a − b)² from the expanded form", "4y² − 12y + 9 → (a − b)²", "4y² − 12y + 9 → a² − b²", SCOPE, ["three terms", "two terms"], "Count terms, check squares and the middle"],
  ["FAC_DIFF_SQUARES", "Factorise a² − b²; a sum of squares stays as it is", "x² − 9 = (x − 3)(x + 3)", "x² + 9 can't be factorised", SCOPE, ["plain", "number in front", "two letters", "higher powers", "a bracket as one quantity"], "Roots of both squares, one plus and one minus"],
  ["FAC_PERFECT_SQUARE_PLUS", "Factorise a² + 2ab + b²", "x² + 6x + 9 = (x + 3)²", "x² + 6x + 9 = (x + 9)(x − 1)", SCOPE, ["plain", "number in front", "two letters"], "Check the middle term is twice the roots' product"],
  ["FAC_PERFECT_SQUARE_MINUS", "Factorise a² − 2ab + b², keeping the minus", "4y² − 12y + 9 = (2y − 3)²", "4y² − 12y + 9 = (2y + 3)²", SCOPE, ["plain", "number in front", "two letters"], "The middle sign shows the bracket's sign"],
  ["FAC_READ_ABC_SIGNS", "Read the coefficient and constant with their signs", "x² − 7x + 12: b = −7, c = 12", "x² − 7x + 12: b = 7", SCOPE, ["positive b and c", "negative b", "negative c"], "A sign belongs to the number after it"],
  ["FAC_PAIR_PRODUCT_SUM", "Find two numbers with product c and sum b, using what the signs imply", "12, −7 → −3 and −4", "12, −7 → 3 and 4", SCOPE, ["both positive", "both negative", "one negative"], "Signs of the pair come from c and b"],
  ["FAC_MONIC_TRINOMIAL", "Write the trinomial as two brackets, by either route", "x² − x − 12 = (x − 4)(x + 3)", "x² − x − 12 = (x + 4)(x − 3)", "x² + bx + c only; ax² + bx + c is the next layer up.", ["both positive", "both negative", "one negative"], "Pair, brackets, expand to check"],
  ["FAC_FACTOR_FULLY", "Keep going until no factor splits further using this map's methods", "3x² − 12 = 3(x − 2)(x + 2); x² − 2 stays", "3x² − 12 = 3(x² − 4)", "Whole numbers; irreducible over the integers.", ["common factor then identity", "common factor then trinomial", "identity twice"], "Check every bracket for another factor"],
  ["FAC_VERIFY_EXPAND", "Expand a factorisation to test it", "(x − 2)(x + 3) ≠ x² − 5x + 6", "Checking only the first term", SCOPE, ["true factorisation", "false factorisation"], "Expand fully, compare every term"],
  ["FAC_CANCEL_COMMON_FACTOR", "Factorise, then cancel only common factors, never terms", "(x² − 9)/(x² − 6x + 9) = (x + 3)/(x − 3)", "(7x + 5)/5 = 7x", "Restrictions on x are not assessed at this level.", ["numeric", "algebraic"], "Cancel factors after factorising, never terms"],
];

/** Every skill's card. The rest of the twelve things a skill carries (owned mistakes, shared patterns, questions that test it alone, needs) are computed below. */
export const SKILL_CARDS: SkillCard[] = [
  ...FOUNDATION_ROWS.map((r) => row(r, "FOUNDATION")),
  ...CHAPTER_ROWS.map((r) => row(r, "NCERT_CH12")),
];
function row([id, definition, example, nonExample, boundary, conditions, teachingFocus]: CardRow, source: SkillSource): SkillCard {
  return { id, definition, example, nonExample, boundary, conditions, teachingFocus, source };
}
const CARD_BY_ID = new Map(SKILL_CARDS.map((c) => [c.id, c]));
export function skillCard(id: string): SkillCard | undefined { return CARD_BY_ID.get(id); }

/**
 * One owner per mistake. A mistake listed under several skills is blamed on one,
 * so the report, the lesson and the class report all say the same thing. Only the
 * codes listed under more than one skill need an entry; the owner is the skill
 * where the mistake first shows in a question. (Once "recognising which identity
 * fits" has a question of its own, WROTE_DIFF_OF_SQUARES should move to it. The live blame rule in ownerOfMistake still prefers
 * the question's own skill; switching it to this table is a separate change.)
 */
export const MISTAKE_OWNER_OVERRIDES: Record<string, string> = {
  GAVE_LCM: "FND_GCD_NUMERIC",
  COMMON_NOT_HIGHEST: "FND_GCD_NUMERIC",
  TOOK_HIGHEST_POWER: "FND_MIN_EXP_COMMON",
  COEFFICIENT_NOT_ROOTED: "FAC_DIFF_SQUARES",
  WROTE_DIFF_OF_SQUARES: "FAC_PERFECT_SQUARE_PLUS",
  WRONG_FACTOR_PAIR_SUM: "FAC_PAIR_PRODUCT_SUM",
  WRONG_FACTOR_PAIR_PRODUCT: "FAC_PAIR_PRODUCT_SUM",
  SIGN_PAIR_ERROR: "FAC_PAIR_PRODUCT_SUM",
  PRODUCT_SUM_SWAPPED: "FAC_PAIR_PRODUCT_SUM",
};
const listedUnder = new Map<string, string[]>();
for (const s of FACTORISATION_SKILLS) for (const m of s.mistakes) listedUnder.set(m, [...(listedUnder.get(m) ?? []), s.id]);

/** The one skill that owns a mistake. */
export function mistakeOwner(code: string): string | undefined {
  const owners = listedUnder.get(code);
  if (!owners) return undefined;
  return owners.length === 1 ? owners[0] : MISTAKE_OWNER_OVERRIDES[code];
}
/** The mistakes a skill owns (a mistake is owned once, by one skill). */
export function ownedMistakes(skillId: string): string[] {
  return [...listedUnder.keys()].filter((m) => mistakeOwner(m) === skillId);
}

export type LinkKind = "NEEDS" | "EITHER_OR" | "THIS_QUESTION_ONLY" | "SHARED_MISTAKE" | "ACROSS_CHAPTERS" | "CHECKS";
export interface SkillLink {
  /** The skill that has the need, or is checked, or is the same skill in this chapter. */
  from: string;
  to: string;
  kind: LinkKind;
  /** EITHER_OR: links with the same group are alternative routes to `from`. */
  group?: string;
  /** THIS_QUESTION_ONLY: when the need applies. */
  when?: string;
  note?: string;
}

/** A need that depends on the question, so it is not a fixed prerequisite for every question. */
const CONDITIONAL: Array<[string, string, string]> = [
  ["FAC_DIVIDE_TERMS", "FND_EXPONENT_PRODUCT", "the common factor has a letter power, as in x³ + x²; not for 6x + 9"],
  ["FAC_FACTOR_FULLY", "FAC_COMMON_MONOMIAL", "a common factor must come out first, as in 3x² − 12"],
  ["FAC_FACTOR_FULLY", "FAC_DIFF_SQUARES", "a bracket is itself a difference of squares, as in x⁴ − 16"],
  ["FAC_FACTOR_FULLY", "FAC_MONIC_TRINOMIAL", "a bracket is a trinomial, as in 2x² + 10x + 12"],
];
const conditionalKey = new Set(CONDITIONAL.map(([a, b]) => `${a}>${b}`));

/** The routes to a monic trinomial: write the brackets from the pair, or split the middle term and group. Route B needs the proposed skill. */
const TRINOMIAL_ROUTES: SkillLink[] = [
  { from: "FAC_MONIC_TRINOMIAL", to: "FAC_PAIR_PRODUCT_SUM", kind: "EITHER_OR", group: "trinomial-route", note: "Route A: write the brackets straight from the pair" },
  { from: "FAC_MONIC_TRINOMIAL", to: "FAC_GROUP_TERMS", kind: "EITHER_OR", group: "trinomial-route", note: "Route B: split the middle term, then group, with a minus where the signs need it (also needs the proposed skill FAC_SPLIT_MIDDLE)" },
];

/** The same skill in another chapter's map, so evidence from either reaches both. */
const ACROSS: Array<[string, string[]]> = [
  ["FND_SIGN_MUL_DIV", ["RN_SIGNED_INT", "LE_SIGNED_ARITH"]],
  ["FND_SIGN_ADD_SUB", ["RN_SIGNED_INT", "LE_SIGNED_ARITH"]],
  ["EXP_EXPAND_SINGLE", ["LE_EXPAND_BRACKET", "AE_MONO_POLY"]],
  ["EXP_EXPAND_BINOMIALS", ["AE_BINOMIAL_BINOMIAL"]],
  ["ID_SQUARE_DIFF", ["AE_IDENTITY_SQ_PLUS", "AE_IDENTITY_SQ_MINUS", "AE_IDENTITY_DIFF"]],
  ["FND_EXPONENT_PRODUCT", ["EP_PRODUCT_LAW", "AE_MONO_MONO"]],
  ["FND_RECOGNISE_SQUARE", ["SQ_ROOT_MEANING", "SQ_PERFECT"]],
  ["ALG_IDENTIFY_STRUCTURE", ["AE_TERMS"]],
];
/** A skill that can verify another. Expanding checks any factorisation. */
const CHECKS: Array<[string, string[]]> = [
  ["FAC_VERIFY_EXPAND", ["FAC_COMMON_MONOMIAL", "FAC_GROUP_TERMS", "FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_PLUS", "FAC_PERFECT_SQUARE_MINUS", "FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY"]],
];

export interface SharedPattern {
  id: string;
  name: string;
  /** The wrong rule behind it, in words. */
  rule: string;
  /** The mistake codes that show it. */
  mistakes: string[];
  /** The skills it touches. */
  skills: string[];
  /** The foundation question asked before any lesson is built on the pattern. */
  directCheck: string;
}
/** A pattern is a hypothesis: it triggers one direct question on the foundation. It is never a gap without its own evidence. */
export const SHARED_PATTERNS: SharedPattern[] = [
  { id: "SIGN_HANDLING", name: "Sign handling", rule: "Signs are dropped, kept or flipped without a rule",
    mistakes: ["SIGN_PRODUCT_ERROR", "SIGN_SUM_ERROR", "KEPT_ORIGINAL_SIGNS", "FLIPPED_ONE_SIGN", "SIGN_NOT_FLIPPED_IN_GROUP", "WRONG_MIDDLE_SIGN", "SIGN_PAIR_ERROR", "SIGNS_SWAPPED", "DROPPED_SIGN"],
    skills: ["FND_SIGN_MUL_DIV", "FND_SIGN_ADD_SUB", "FAC_GCF_NEGATIVE", "FAC_GROUP_SIGN", "FAC_PERFECT_SQUARE_MINUS", "FAC_READ_ABC_SIGNS", "FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"],
    directCheck: "A signed-number question such as −8 ÷ −4" },
  { id: "TERMS_AS_FACTORS", name: "Terms treated as factors", rule: "A term is treated as if it multiplies, so it can be cancelled or divided alone",
    mistakes: ["TERMS_VS_FACTORS", "SUM_ACCEPTED_AS_FACTORISED", "CANCELLED_TERMS_NOT_FACTORS", "DIVIDED_ONE_TERM_ONLY", "DIVIDED_FIRST_TERM_ONLY"],
    skills: ["FAC_MEANING", "FAC_DIVIDE_TERMS", "FAC_CANCEL_COMMON_FACTOR"],
    directCheck: "Put x = 1 in the claimed equality and compare both sides" },
  { id: "EVERYTHING_DISTRIBUTES", name: "Everything distributes", rule: "A power or bracket is shared out over a sum, as if (a + b)² = a² + b²",
    mistakes: ["SQUARE_DISTRIBUTES", "DROPPED_MIDDLE_TERM", "SQUARED_WITHOUT_ROOT", "MIDDLE_TERM_NOT_CHECKED"],
    skills: ["ID_SQUARE_DIFF", "FAC_PERFECT_SQUARE_PLUS", "FAC_DIFF_SQUARES"],
    directCheck: "Expand (x − 3)² and ask whether it is x² − 9" },
  { id: "ROOT_OF_COEFFICIENT", name: "Root of the number in front", rule: "The number in front of a square is not square-rooted",
    mistakes: ["COEFFICIENT_NOT_ROOTED", "ROOTED_NUMBER_ONLY", "NOT_ROOTED", "HALVED_NOT_ROOTED"],
    skills: ["FND_RECOGNISE_SQUARE", "FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_PLUS", "FAC_PERFECT_SQUARE_MINUS"],
    directCheck: "Write 49a² as a square of a single term" },
];

const NEEDS_LINKS: SkillLink[] = FACTORISATION_SKILLS.flatMap((s) => s.dependsOn.map((d): SkillLink =>
  conditionalKey.has(`${s.id}>${d}`) ? { from: s.id, to: d, kind: "THIS_QUESTION_ONLY", when: CONDITIONAL.find(([a, b]) => a === s.id && b === d)![2] }
    : { from: s.id, to: d, kind: "NEEDS" }));
const EXTRA_CONDITIONAL: SkillLink[] = CONDITIONAL.filter(([a, b]) => !NEEDS_LINKS.some((l) => l.from === a && l.to === b)).map(([from, to, when]) => ({ from, to, kind: "THIS_QUESTION_ONLY" as const, when }));
const PATTERN_LINKS: SkillLink[] = SHARED_PATTERNS.flatMap((p) => p.skills.slice(1).map((s): SkillLink => ({ from: s, to: p.skills[0], kind: "SHARED_MISTAKE", group: p.id, note: p.name })));

/** Every typed link between skills. The first four kinds stay inside factorisation; ACROSS_CHAPTERS reaches other chapters. */
export const SKILL_LINKS: SkillLink[] = [
  ...NEEDS_LINKS, ...EXTRA_CONDITIONAL, ...TRINOMIAL_ROUTES, ...PATTERN_LINKS,
  ...ACROSS.flatMap(([from, others]) => others.map((to): SkillLink => ({ from, to, kind: "ACROSS_CHAPTERS" }))),
  ...CHECKS.flatMap(([from, targets]) => targets.map((to): SkillLink => ({ from, to, kind: "CHECKS" }))),
];

/** Skills proposed for the map. Data only: each goes live when it has two code-checked questions. */
export interface ProposedSkill { id: string; name: string; group: number; needs: string[]; mistakes: string[]; source: SkillSource; example: string; reason: string }
export const PROPOSED_SKILLS: ProposedSkill[] = [
  { id: "FND_EXPONENT_QUOTIENT", name: "Dividing powers", group: 0, needs: ["FND_EXPONENT_PRODUCT"], mistakes: ["DIVIDED_EXPONENTS", "ADDED_EXPONENTS_IN_QUOTIENT"], source: "COGNA", example: "x⁵ ÷ x³ = x²", reason: "Dividing every term depends on it; the map has only multiplying" },
  { id: "DIV_TERM_BY_TERM", name: "Dividing a term by a term", group: 7, needs: ["FND_SIGN_MUL_DIV", "FND_EXPONENT_QUOTIENT"], mistakes: ["DIVIDED_COEFFICIENT_ONLY", "SIGN_QUOTIENT_ERROR"], source: "NCERT_CH12", example: "−36y³ ÷ 9y² = −4y", reason: "First step of dividing expressions (NCERT 12.3.1)" },
  { id: "DIV_EXPR_BY_TERM", name: "Dividing an expression by a term", group: 7, needs: ["DIV_TERM_BY_TERM"], mistakes: ["LEFT_TERM_UNDIVIDED"], source: "NCERT_CH12", example: "(5x² − 6x) ÷ 3x", reason: "Builds on term ÷ term (NCERT 12.3.2)" },
  { id: "FAC_SPLIT_MIDDLE", name: "Splitting the middle term", group: 5, needs: ["FAC_PAIR_PRODUCT_SUM", "FAC_GROUP_TERMS"], mistakes: ["SPLIT_PAIR_DOES_NOT_SUM", "SPLIT_THEN_NO_GROUP"], source: "NCERT_CH12", example: "y² − 3y − 4y + 12", reason: "A second route to trinomials that schools teach (NCERT examples 10–11)" },
  { id: "FAC_REARRANGE_TO_GROUP", name: "Rearranging terms to group", group: 3, needs: ["FAC_GROUP_TERMS"], mistakes: ["TRIED_GIVEN_ORDER_ONLY"], source: "NCERT_CH12", example: "15pq + 15 + 9q + 25p", reason: "Tested today with no skill behind it (NCERT exercise 12.1)" },
  { id: "ID_BRACKET_AS_ONE", name: "A bracket as one quantity", group: 4, needs: ["FAC_DIFF_SQUARES"], mistakes: ["EXPANDED_BRACKET_FIRST", "TREATED_BRACKET_AS_TWO_TERMS"], source: "NCERT_CH12", example: "(l + m)² − 4lm", reason: "Needed for harder identity questions (NCERT exercise 12.2)" },
  { id: "FND_IRREDUCIBLE_FACTORS", name: "Irreducible factors", group: 0, needs: ["FND_FACTOR_PAIRS"], mistakes: ["STOPPED_AT_COMPOSITE_FACTOR"], source: "NCERT_CH12", example: "12x²y = 2 × 2 × 3 × x × x × y", reason: "Step one of taking out the full common factor" },
];
/** Two pairs of near-duplicates: each pair shares its mistakes, so no question can tell them apart. The first id stays, the second joins it. */
export const PROPOSED_MERGES: Array<{ keep: string; retire: string }> = [
  { keep: "FND_GCD_NUMERIC", retire: "FAC_GCF_NUMERIC" },
  { keep: "FND_MIN_EXP_COMMON", retire: "FAC_GCF_VARIABLE" },
];

/**
 * How well the questions cover the map today. Skills with no question of their
 * own can't be told apart from the skills under them; mistakes no question is
 * built to show can only be caught by chance.
 */
export interface SkillMapCoverage {
  skills: number;
  /** In the live test's 25 slots. */
  skillsWithoutOwnQuestion: string[];
  mistakes: number;
  mistakesNoQuestionTargets: string[];
  mistakesListedUnderSeveralSkills: string[];
  /** Counting the question families too (short code-made checks, not yet placed in the live test). */
  skillsWithoutAnyQuestion: string[];
  mistakesNoQuestionAnywhere: string[];
}
let familyMistakes: Set<string> | undefined;
/** Every mistake some question family is built to show, found by building each condition from a few seeds. */
function mistakesFamiliesTarget(): Set<string> {
  if (familyMistakes) return familyMistakes;
  const found = new Set<string>();
  for (const f of SKILL_FAMILIES) for (const c of f.conditions) for (let i = 0; i < 12; i++) {
    for (const p of buildSkillCheck(f.skillId, `coverage-${i}`, c)?.answerKey.diagnostics?.predictedMistakes ?? []) found.add(p.mistake);
  }
  return (familyMistakes = found);
}
export function skillMapCoverage(): SkillMapCoverage {
  const hasSlot = new Set(FACTORISATION_SLOTS.map((s) => s.skillId));
  const targeted = new Set(FACTORISATION_SLOTS.flatMap((s) => s.mistakes));
  const familySkills = new Set(SKILL_FAMILIES.map((f) => f.skillId));
  const familyTargets = mistakesFamiliesTarget();
  return {
    skills: FACTORISATION_SKILLS.length,
    skillsWithoutOwnQuestion: FACTORISATION_SKILLS.filter((s) => !hasSlot.has(s.id)).map((s) => s.id),
    mistakes: listedUnder.size,
    mistakesNoQuestionTargets: [...listedUnder.keys()].filter((m) => !targeted.has(m)),
    mistakesListedUnderSeveralSkills: [...listedUnder].filter(([, v]) => v.length > 1).map(([k]) => k),
    skillsWithoutAnyQuestion: FACTORISATION_SKILLS.filter((s) => !hasSlot.has(s.id) && !familySkills.has(s.id)).map((s) => s.id),
    mistakesNoQuestionAnywhere: [...listedUnder.keys()].filter((m) => !targeted.has(m) && !familyTargets.has(m)),
  };
}
/** Where coverage stood on 28 October 2026. The checks let it improve and refuse to let it slip. */
export const COVERAGE_BASELINE = { skillsWithoutOwnQuestion: 14, mistakesNoQuestionTargets: 27, skillsWithoutAnyQuestion: 0, mistakesNoQuestionAnywhere: 0 };

/** A short stable id for the map as it is, so a record can say which map it was made against. */
export function skillMapFingerprint(): string {
  const body = JSON.stringify({
    v: SKILL_MAP_VERSION,
    skills: FACTORISATION_SKILLS.map((s) => [s.id, s.group, s.dependsOn, s.mistakes]),
    owners: Object.entries(MISTAKE_OWNER_OVERRIDES),
    links: SKILL_LINKS.map((l) => [l.from, l.to, l.kind, l.group ?? null]),
  });
  return createHash("sha256").update(body).digest("hex").slice(0, 12);
}

/** Skills in the other chapters' drafts, including chapters that don't run a live test yet. */
const OTHER_CHAPTER_SKILLS = new Set(GRADE_8_DRAFTS.flatMap((d) => d.skills.map((k) => k.id)));

const WRITTEN_FIELDS: Array<keyof SkillCard> = ["definition", "boundary", "example", "nonExample", "teachingFocus"];
const LINK_KINDS: LinkKind[] = ["NEEDS", "EITHER_OR", "THIS_QUESTION_ONLY", "SHARED_MISTAKE", "ACROSS_CHAPTERS", "CHECKS"];

/** Automatic checks on the map. An empty list means the map is consistent; each problem names what to fix. */
export function checkSkillMap(): string[] {
  const problems: string[] = [];
  const live = new Set(FACTORISATION_SKILLS.map((s) => s.id));
  const proposed = new Set(PROPOSED_SKILLS.map((s) => s.id));
  if (!SKILL_MAP_VERSION) problems.push("The map has no version number.");

  for (const s of FACTORISATION_SKILLS) {
    const card = CARD_BY_ID.get(s.id);
    if (!card) { problems.push(`${s.id} has no skill card.`); continue; }
    for (const f of WRITTEN_FIELDS) if (!String(card[f] ?? "").trim()) problems.push(`${s.id} card is missing ${f}.`);
    if (!card.conditions.length) problems.push(`${s.id} card lists no conditions.`);
  }
  for (const c of SKILL_CARDS) if (!live.has(c.id)) problems.push(`Card ${c.id} is for a skill that isn't in the map.`);

  for (const [code, owners] of listedUnder) {
    if (owners.length === 1) continue;
    const declared = MISTAKE_OWNER_OVERRIDES[code];
    if (!declared) problems.push(`${code} is listed under ${owners.join(", ")} and has no declared owner.`);
    else if (!owners.includes(declared)) problems.push(`${code}'s declared owner ${declared} doesn't list it.`);
  }
  for (const code of Object.keys(MISTAKE_OWNER_OVERRIDES)) if ((listedUnder.get(code)?.length ?? 0) < 2) problems.push(`${code} has an owner override but isn't shared.`);

  const connected = new Set<string>();
  for (const l of SKILL_LINKS) {
    if (!LINK_KINDS.includes(l.kind)) problems.push(`Link ${l.from} → ${l.to} has an unknown kind ${l.kind}.`);
    if (!live.has(l.from)) problems.push(`Link ${l.kind} starts at unknown skill ${l.from}.`);
    if (l.kind === "ACROSS_CHAPTERS") { if (!OTHER_CHAPTER_SKILLS.has(l.to) || live.has(l.to)) problems.push(`Across-chapter link ${l.from} → ${l.to} must reach a skill in another chapter.`); }
    else if (!live.has(l.to)) problems.push(`Link ${l.from} → ${l.to} ends at an unknown skill.`);
    if (l.kind === "THIS_QUESTION_ONLY" && !l.when) problems.push(`Link ${l.from} → ${l.to} doesn't say when it applies.`);
    connected.add(l.from); connected.add(l.to);
  }
  for (const id of live) if (!connected.has(id)) problems.push(`${id} is disconnected.`);
  for (const g of new Set(SKILL_LINKS.filter((l) => l.kind === "EITHER_OR").map((l) => l.group))) {
    if (SKILL_LINKS.filter((l) => l.kind === "EITHER_OR" && l.group === g).length < 2) problems.push(`Either-or group ${g} has fewer than two routes.`);
  }

  for (const p of SHARED_PATTERNS) {
    for (const m of p.mistakes) if (!listedUnder.has(m)) problems.push(`Pattern ${p.id} names unknown mistake ${m}.`);
    for (const s of p.skills) if (!live.has(s)) problems.push(`Pattern ${p.id} names unknown skill ${s}.`);
    if (p.mistakes.length < 2 || p.skills.length < 2) problems.push(`Pattern ${p.id} must span at least two mistakes and two skills.`);
  }

  for (const s of PROPOSED_SKILLS) {
    if (live.has(s.id)) problems.push(`Proposed skill ${s.id} is already in the map.`);
    for (const n of s.needs) if (!live.has(n) && !proposed.has(n)) problems.push(`Proposed skill ${s.id} needs unknown skill ${n}.`);
    for (const m of s.mistakes) if (listedUnder.has(m)) problems.push(`Proposed mistake ${m} (${s.id}) already belongs to ${listedUnder.get(m)!.join(", ")}.`);
  }
  for (const m of PROPOSED_MERGES) for (const id of [m.keep, m.retire]) if (!live.has(id)) problems.push(`Proposed merge names unknown skill ${id}.`);

  const cov = skillMapCoverage();
  if (cov.skillsWithoutOwnQuestion.length > COVERAGE_BASELINE.skillsWithoutOwnQuestion) problems.push(`${cov.skillsWithoutOwnQuestion.length} skills have no question of their own (baseline ${COVERAGE_BASELINE.skillsWithoutOwnQuestion}).`);
  if (cov.mistakesNoQuestionTargets.length > COVERAGE_BASELINE.mistakesNoQuestionTargets) problems.push(`${cov.mistakesNoQuestionTargets.length} mistakes have no question built to show them (baseline ${COVERAGE_BASELINE.mistakesNoQuestionTargets}).`);
  if (cov.skillsWithoutAnyQuestion.length > COVERAGE_BASELINE.skillsWithoutAnyQuestion) problems.push(`Skills with no question anywhere: ${cov.skillsWithoutAnyQuestion.join(", ")}.`);
  if (cov.mistakesNoQuestionAnywhere.length > COVERAGE_BASELINE.mistakesNoQuestionAnywhere) problems.push(`Mistakes with no question anywhere: ${cov.mistakesNoQuestionAnywhere.join(", ")}.`);
  return problems;
}
