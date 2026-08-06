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
