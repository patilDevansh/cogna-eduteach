/**
 * The words that go with an offered assistance level.
 *
 * This text reaches a student and it states arithmetic, so it is
 * deterministic by construction and no model is involved at any point:
 *  - every sentence comes from the fixed per-micro-skill tables below,
 *  - the only variable parts are integers re-derived here from the line the
 *    student is looking at, using the verifier's own bracket matcher rather
 *    than a second, drifting regex.
 *
 * That is the repo's standing "no unchecked LLM math to students" rule applied
 * to the one place in this slice where the product genuinely wants to say a
 * number out loud ("what is (-2) x (-5)?"). The AI interpreter writes about
 * evidence; it never writes this.
 */
import type { AssistanceLevel, MicroSkillId } from "@cogna/shared";
import { matchSingleBracket } from "./linear-bracket-verifier";

/** Said when the student is about to try the same line again. Never states a number — nothing has been established yet. */
const REVIEW_OPPORTUNITY_TEXT =
  "Have another look at that line whenever you're ready — you can just write it again.";

/**
 * One rule, in the plainest form that is still true. No worked numbers here:
 * a rule prompt is meant to remind, not to solve. The negative-distribution
 * entry is the exception, and only because its whole diagnostic point is the
 * sign of one specific product.
 */
const RULE_PROMPT_TEXT: Record<MicroSkillId, string> = {
  FND_SIGN_MUL_DIV:
    "Two negatives multiplied together give a positive. A negative times a positive gives a negative.",
  LIN_DISTRIBUTE_NEG:
    "The number outside the bracket multiplies every term inside it — including its sign.",
  LIN_DISTRIBUTE_POS:
    "The number outside the bracket multiplies every term inside it, not just the first one.",
  LIN_COMBINE_LIKE: "You can only add or subtract terms that have the same letter part.",
  LIN_REMOVE_CONSTANT:
    "Whatever you add or subtract on one side, do exactly the same on the other side.",
  LIN_REMOVE_COEFFICIENT:
    "To undo multiplying by a number, divide both sides by that same number.",
  LIN_SOLVE_TWO_STEP:
    "Deal with the number being added or subtracted first, then the number multiplying the letter.",
  LIN_SOLVE_VARIABLE_BOTH:
    "Collect the letter terms on one side first, then the plain numbers on the other.",
  LIN_CHECK_SOLUTION:
    "Put your answer back into the original equation and check both sides come out the same.",
  FND_FRACTION_EQUIV:
    "Multiplying the top and bottom of a fraction by the same number keeps its value the same.",
  FND_FRACTION_OPS:
    "When you multiply a fraction by a whole number, that number multiplies the top.",
  LIN_CLEAR_FRACTIONS:
    "Multiply every term on both sides by the same common multiple of the denominators — not a different number on each side.",
  LIN_SOLVE_FRACTIONS:
    "Clear the fractions first by multiplying through, then finish the equation like a normal linear one.",
  ALG_IDENTIFY_STRUCTURE:
    "Look at the shape first — two brackets multiplied, or a square minus a number — before you expand or factor.",
  EXP_EXPAND_BINOMIALS:
    "Multiply each term in the first bracket by each term in the second, then tidy like terms.",
  ID_DIFF_SQUARES:
    "When the brackets are (x + a)(x − a), the middle terms cancel and you get x² − a².",
  ID_VERIFY_EXPANSION:
    "Expand your factors again (or factor your expansion) and check you get back to the same expression.",
  FAC_READ_ABC_SIGNS:
    "Write down a (the number with x²), b (the number with x), and c (the plain number), including their signs.",
  FAC_PAIR_PRODUCT_SUM:
    "You need two numbers that multiply to the constant and add to the middle coefficient.",
  FAC_MONIC_TRINOMIAL:
    "For x² + bx + c, find two numbers that multiply to c and add to b, then write (x + …)(x + …).",
  FAC_COMPUTE_AC:
    "When there is a number in front of x², first multiply a times c — that product is what the factor pair must make.",
  FAC_SPLIT_MIDDLE:
    "Split the middle term into two pieces that multiply to a×c and add to b, then group.",
  FAC_NONMONIC_GROUP:
    "Group the four terms into two pairs, factor each pair, then pull out the common bracket.",
  FAC_VERIFY_EXPAND:
    "Multiply your two brackets back out — you should get exactly the quadratic you started with.",
  QUAD_STANDARD_FORM:
    "Move every term to one side so the equation ends with = 0.",
  QUAD_FACTOR_EXPRESSION:
    "Factor the quadratic first, then you can use the zero-product rule.",
  QUAD_ZERO_PRODUCT:
    "If two things multiply to zero, at least one of them must be zero — set each bracket equal to zero.",
  QUAD_CREATE_BRANCHES:
    "Write a separate little equation for each factor: first bracket = 0, and second bracket = 0.",
  QUAD_SOLVE_UNIT_FACTOR:
    "Solve each linear factor for the letter — remember to divide by the coefficient if it is not 1.",
  QUAD_VERIFY_ROOTS:
    "Put each root back into the original equation and check both sides match.",
};

/** Said once the student has told us twice that they don't know. Fuller than a rule prompt, still one or two sentences. */
const FULL_EXPLANATION_TEXT: Record<MicroSkillId, string> = {
  FND_SIGN_MUL_DIV:
    "Count the minus signs. Two of them cancel out and the answer is positive; one on its own leaves the answer negative.",
  LIN_DISTRIBUTE_NEG:
    "Multiply the number outside the bracket by each term inside, one at a time, and keep track of the signs as you go.",
  LIN_DISTRIBUTE_POS:
    "Multiply the number outside the bracket by the first term inside, then by the second term, and write both results.",
  LIN_COMBINE_LIKE:
    "Group the terms with the same letter together and add their number parts; leave the plain numbers in their own group.",
  LIN_REMOVE_CONSTANT:
    "To move a number off the letter's side, do the opposite operation — and do it to both sides so the equation stays balanced.",
  LIN_REMOVE_COEFFICIENT:
    "The letter still has a number stuck to it. Divide both sides by that number and the letter is left on its own.",
  LIN_SOLVE_TWO_STEP:
    "There are two things attached to the letter. Undo the adding or subtracting first, then undo the multiplying.",
  LIN_SOLVE_VARIABLE_BOTH:
    "Subtract the smaller letter term from both sides so the letter only appears once, then finish it like an ordinary two-step equation.",
  LIN_CHECK_SOLUTION:
    "Swap your answer in wherever the letter appears in the original equation, work out each side, and see whether they match.",
  FND_FRACTION_EQUIV:
    "If you multiply (or divide) the top and the bottom by the same number, the fraction's value does not change — that is how equivalent fractions work.",
  FND_FRACTION_OPS:
    "Treat the whole fraction as one piece. When you multiply through an equation, every fraction and every plain number gets multiplied by that same amount.",
  LIN_CLEAR_FRACTIONS:
    "Find one number that is a multiple of every denominator. Multiply every term on the left and every term on the right by that same number so the fractions disappear together.",
  LIN_SOLVE_FRACTIONS:
    "Once the fractions are gone, collect like terms and finish with the usual two-step moves — move the constant, then divide by the coefficient.",
  ALG_IDENTIFY_STRUCTURE:
    "Name the pieces you see: is this a product of two brackets, or already a difference of squares like x² − 9?",
  EXP_EXPAND_BINOMIALS:
    "Write four products (first×first, first×second, second×first, second×second), then combine the middle terms if they match.",
  ID_DIFF_SQUARES:
    "(x + a)(x − a) always expands to x² − a² — there is no middle x term. Factoring goes the other way: x² − 16 becomes (x + 4)(x − 4).",
  ID_VERIFY_EXPANSION:
    "Whatever you wrote, reverse the step once. If expanding and factoring do not match, fix the constants first.",
  FAC_READ_ABC_SIGNS:
    "In 2x² − 5x − 3, a is 2, b is −5, and c is −3. Keep every minus with its number.",
  FAC_PAIR_PRODUCT_SUM:
    "List factor pairs of the constant. Keep the pair whose sum (or weighted sum) matches the middle term.",
  FAC_MONIC_TRINOMIAL:
    "For x² + 5x + 6 the pair is 2 and 3, so the factors are (x + 2)(x + 3). Order of the brackets does not matter.",
  FAC_COMPUTE_AC:
    "For 2x² − 5x − 3, a×c = 2 × (−3) = −6. Find two numbers that multiply to −6 and add to −5.",
  FAC_SPLIT_MIDDLE:
    "Those two numbers rewrite the middle term, so you can group and factor by grouping.",
  FAC_NONMONIC_GROUP:
    "2x² − 5x − 3 becomes (2x + 1)(x − 3). Expand to check: 2x·x + 2x·(−3) + 1·x + 1·(−3).",
  FAC_VERIFY_EXPAND:
    "Expand carefully term by term. If you do not get the original quadratic back, one of the constants is wrong.",
  QUAD_STANDARD_FORM:
    "From x² + 5x = −6, add 6 to both sides to get x² + 5x + 6 = 0.",
  QUAD_FACTOR_EXPRESSION:
    "Once it is = 0, factor the left side the same way you factor any trinomial.",
  QUAD_ZERO_PRODUCT:
    "(x + 2)(x − 3) = 0 means x + 2 = 0 or x − 3 = 0, so x = −2 or x = 3.",
  QUAD_CREATE_BRANCHES:
    "Do not skip a branch. Both equations matter, and both roots belong in the answer.",
  QUAD_SOLVE_UNIT_FACTOR:
    "From 2x + 1 = 0 you get 2x = −1, so x = −1/2. From x − 3 = 0 you get x = 3.",
  QUAD_VERIFY_ROOTS:
    "Substitute each root into the original equation. If a side does not match, that root is wrong.",
};

/**
 * The one place a number is spoken. `A(x - B)` is re-read from the line the
 * student has in front of them and the product is computed here — the same two
 * integers the verifier itself multiplies when it decides whether the line was
 * right, so the guidance and the grading can never disagree.
 *
 * Returns null when the line is not a single-bracket form, in which case the
 * caller falls back to the plain rule sentence rather than inventing numbers.
 */
export function signProductQuestion(line: string): string | null {
  const bracket = matchSingleBracket(line);
  if (!bracket) return null;
  const { multiplier, inner } = bracket;
  if (multiplier >= 0 || inner.b >= 0) return null;
  return `What is (${multiplier}) x (${inner.b})? Two negatives multiplied together give a positive, so it is ${multiplier * inner.b}, not ${-(multiplier * inner.b)}.`;
}

/**
 * The text for an offered assistance level. `line` is whatever the student is
 * currently looking at — the item's opening line, or the last line they had
 * accepted — and is only ever read for its integers.
 */
export function assistanceTextFor(input: {
  level: AssistanceLevel;
  microSkillId: MicroSkillId;
  line: string;
}): string | undefined {
  switch (input.level) {
    case "REVIEW_OPPORTUNITY":
      return REVIEW_OPPORTUNITY_TEXT;
    case "RULE_PROMPT": {
      const rule = RULE_PROMPT_TEXT[input.microSkillId];
      if (input.microSkillId === "LIN_DISTRIBUTE_NEG" || input.microSkillId === "FND_SIGN_MUL_DIV") {
        const question = signProductQuestion(input.line);
        if (question) return `${rule} ${question}`;
      }
      return rule;
    }
    case "FULL_EXPLANATION": {
      const explanation = FULL_EXPLANATION_TEXT[input.microSkillId];
      if (input.microSkillId === "LIN_DISTRIBUTE_NEG" || input.microSkillId === "FND_SIGN_MUL_DIV") {
        const question = signProductQuestion(input.line);
        if (question) return `${explanation} ${question}`;
      }
      return explanation;
    }
    default:
      // The four levels this phase never offers, plus NONE. Deliberately no
      // placeholder text: an unoffered level must render as nothing at all.
      return undefined;
  }
}
