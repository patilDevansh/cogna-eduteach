import { Injectable } from "@nestjs/common";
import type {
  LinearEquationParams,
  RenderedQuestion,
  TwoBinomialParams,
  VariableBothSidesParams,
} from "./template-render.types";

export const LINEAR_ONE_STEP_TEMPLATE_ID = "c-lite-linear-one-step-v1";
export const LINEAR_WORD_PROBLEM_TEMPLATE_ID = "c-lite-linear-word-problem-v1";
export const VARIABLE_BOTH_SIDES_TEMPLATE_ID = "c-lite-variable-both-sides-v1";
export const TWO_BINOMIAL_EXPAND_TEMPLATE_ID = "c-lite-two-binomial-expand-v1";
export const TWO_BINOMIAL_FACTOR_TEMPLATE_ID = "c-lite-two-binomial-factor-v1";

/** All ids render deterministically from closed-form arithmetic verified independently
 * (regex + arithmetic re-derivation, not just the generator's own formula) in the same
 * session that authored scripts/generate-algebra-bank-v2.mjs and generate-factorisation-bank.mjs. */
export const TRUSTED_TEMPLATE_IDS = new Set([
  LINEAR_ONE_STEP_TEMPLATE_ID,
  LINEAR_WORD_PROBLEM_TEMPLATE_ID,
  VARIABLE_BOTH_SIDES_TEMPLATE_ID,
  TWO_BINOMIAL_EXPAND_TEMPLATE_ID,
  TWO_BINOMIAL_FACTOR_TEMPLATE_ID,
]);

/** Coefficient magnitude for a term, omitting "1" (so "1x" renders as "x"). */
function coeffLabel(n: number): string {
  return Math.abs(n) === 1 ? "" : String(Math.abs(n));
}

/** Signed "+ 5x" / "- 5x" / "+ x" / "" term, spaced or compact. */
function signedTerm(n: number, suffix: string, spaced: boolean): string {
  if (n === 0) return "";
  const sign = n > 0 ? "+" : "-";
  const sep = spaced ? " " : "";
  return `${sep}${sign}${sep}${coeffLabel(n)}${suffix}`;
}

interface WordContext {
  /** Natural-language stem — deliberately never uses the literal letter "x". */
  stem: (a: number, b: number, c: number) => string;
  /** What "x" stands for in this story, used in the first explanation step. */
  unknown: string;
}

/**
 * Rotating real-world framings for a·x + b = c so a student doesn't see the
 * same "solve for x" shape every time. The math underneath is unchanged.
 */
const WORD_CONTEXTS: WordContext[] = [
  {
    unknown: "the number of tickets bought",
    stem: (a, b, c) =>
      b >= 0
        ? `Tickets to a school fair cost ₹${a} each, plus a fixed ₹${b} booking fee. A family paid ₹${c} in total. How many tickets did they buy?`
        : `Tickets to a school fair cost ₹${a} each. With a ₹${Math.abs(b)} discount off the total, a family paid ₹${c}. How many tickets did they buy?`,
  },
  {
    unknown: "the number of weeks",
    stem: (a, b, c) =>
      b >= 0
        ? `Priya already had ₹${b} saved and adds ₹${a} to her savings every week. After how many weeks will she have ₹${c} in total?`
        : `Priya still owes ₹${Math.abs(b)} and saves ₹${a} every week toward it. After how many weeks will her net savings reach ₹${c}?`,
  },
  {
    unknown: "the number of goats",
    stem: (a, b, c) =>
      b >= 0
        ? `A farmer has ${a} times as many sheep as goats, plus ${b} extra sheep bought later — ${c} sheep in total. How many goats does the farmer have?`
        : `A farmer has ${a} times as many sheep as goats. After selling ${Math.abs(b)} sheep, ${c} sheep remain. How many goats does the farmer have?`,
  },
  {
    unknown: "the number of days",
    stem: (a, b, c) =>
      b >= 0
        ? `Dev already had ${b} pages written in his journal and writes ${a} more pages every day. After how many days will he reach ${c} pages in total?`
        : `Dev tore ${Math.abs(b)} pages out of his journal, then wrote ${a} pages every day after that. After how many days did his journal reach ${c} pages?`,
  },
];

/**
 * Deterministic stems / hints / explanations from C-lite params.
 * Form: a·x + b = c  where c = a·x + b and x is the solution.
 */
@Injectable()
export class TemplateRenderService {
  renderLinearOneStep(params: LinearEquationParams): RenderedQuestion {
    const { conceptId, a, b, x } = params;
    this.assertValidParams(params);

    const c = a * x + b;
    const stem = this.formatStem(a, b, c);
    const acceptedAnswers = this.buildAcceptedAnswers(x);
    const hints = this.buildHints(a, b, c);
    const explanationSteps = this.buildExplanationSteps(a, b, c, x);

    return {
      conceptId,
      stem,
      acceptedAnswers,
      hints,
      explanationSteps,
      templateId: LINEAR_ONE_STEP_TEMPLATE_ID,
      c,
      params: { conceptId, a, b, x },
    };
  }

  /**
   * Same verified a·x+b=c arithmetic as renderLinearOneStep, wrapped in a
   * rotating real-world story instead of bare equation notation.
   */
  renderLinearWordProblem(params: LinearEquationParams, contextIndex: number): RenderedQuestion {
    const { conceptId, a, b, x } = params;
    this.assertValidParams(params);

    const context = WORD_CONTEXTS[((contextIndex % WORD_CONTEXTS.length) + WORD_CONTEXTS.length) % WORD_CONTEXTS.length]!;
    const c = a * x + b;
    const stem = context.stem(a, b, c);
    const acceptedAnswers = this.buildAcceptedAnswers(x);
    const hints = this.buildWordProblemHints(context.unknown, b);
    const explanationSteps = this.buildWordProblemExplanationSteps(context.unknown, a, b, c, x);

    return {
      conceptId,
      stem,
      acceptedAnswers,
      hints,
      explanationSteps,
      templateId: LINEAR_WORD_PROBLEM_TEMPLATE_ID,
      c,
      params: { conceptId, a, b, x },
    };
  }

  /**
   * a·x + b = c·x + d, solved for x. Reuses the exact closed-form formula
   * verified in scripts/generate-algebra-bank-v2.mjs's genC7 (independently
   * re-derived via regex+arithmetic cross-check, not just trusted).
   */
  renderVariableBothSides(params: VariableBothSidesParams): RenderedQuestion {
    const { conceptId, a, b, c, d } = params;
    if (!Number.isInteger(a) || !Number.isInteger(c) || a === c || a === 0 || c === 0) {
      throw new Error("TemplateRender: variable-both-sides needs distinct non-zero integer a, c");
    }
    const diffAC = a - c;
    if ((d - b) % diffAC !== 0) {
      throw new Error("TemplateRender: variable-both-sides params do not yield an integer solution");
    }
    const x = (d - b) / diffAC;

    const aLabel = coeffLabel(a) || "1";
    const cLabel = coeffLabel(c) || "1";
    const bTerm = b === 0 ? "" : b > 0 ? ` + ${b}` : ` - ${Math.abs(b)}`;
    const dTerm = d === 0 ? "" : d > 0 ? ` + ${d}` : ` - ${Math.abs(d)}`;
    const stem = `Solve for x: ${coeffLabel(a)}x${bTerm} = ${coeffLabel(c)}x${dTerm}`;

    const acceptedAnswers = this.buildAcceptedAnswers(x);
    const hints = [
      "Collect the x terms on one side and the numbers on the other — watch every sign as a term crosses the equals sign.",
      "Move the smaller x term across first; move every standalone number the same way.",
      "Check your solution makes both original sides equal when substituted.",
    ];
    const explanationSteps = [
      `${aLabel}x - ${cLabel}x = ${d} - (${b})`,
      `${diffAC}x = ${d - b}`,
      `x = ${x}`,
    ];

    return {
      conceptId,
      stem,
      acceptedAnswers,
      hints,
      explanationSteps,
      templateId: VARIABLE_BOTH_SIDES_TEMPLATE_ID,
      params: { conceptId, a, b, c, d, x },
    };
  }

  /**
   * The (x+a)(x+b) <-> x^2+(a+b)x+ab identity, run forward (expand) or backward
   * (factorise). Reuses the exact closed-form formulas verified this session in
   * scripts/generate-algebra-bank-v2.mjs (genID_C4) and generate-factorisation-bank.mjs
   * (genFAC_C4), including their coefficient-1 and formatting fixes.
   */
  renderTwoBinomial(params: TwoBinomialParams): RenderedQuestion {
    const { conceptId, a, b, direction } = params;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === 0 || b === 0) {
      throw new Error("TemplateRender: two-binomial needs non-zero integer a, b");
    }
    const mid = a + b;
    const last = a * b;
    const midTermSpaced = signedTerm(mid, "x", true);
    const lastTermSpaced = signedTerm(last, "", true);
    const expandedSpaced = `x^2${midTermSpaced}${lastTermSpaced}`;
    const expandedCompact = `x^2${signedTerm(mid, "x", false)}${signedTerm(last, "", false)}`;
    const factorLabel = (v: number) => (v > 0 ? `+${v}` : `${v}`);
    const factoredCompact = `(x${factorLabel(a)})(x${factorLabel(b)})`;
    const factoredSpaced = `(x ${a > 0 ? "+" : "-"} ${Math.abs(a)})(x ${b > 0 ? "+" : "-"} ${Math.abs(b)})`;

    if (direction === "expand") {
      const stem = `Expand using the identity: ${factoredSpaced}`;
      return {
        conceptId,
        stem,
        acceptedAnswers: [expandedCompact, expandedSpaced],
        hints: [
          "Use (x+a)(x+b) = x^2 + (a+b)x + ab.",
          "The middle term's coefficient ADDS a and b. The constant term MULTIPLIES them — different operations.",
        ],
        explanationSteps: [
          `(x+a)(x+b) = x^2 + (a+b)x + ab, with a=${a}, b=${b}`,
          expandedSpaced,
        ],
        templateId: TWO_BINOMIAL_EXPAND_TEMPLATE_ID,
        params: { conceptId, a, b, direction },
      };
    }

    const stem = `Factorise: ${expandedSpaced}`;
    return {
      conceptId,
      stem,
      acceptedAnswers: [factoredCompact, factoredSpaced],
      hints: [
        "Find two numbers whose PRODUCT is the constant term and whose SUM is the middle coefficient.",
        "Check both conditions together — a pair can satisfy one and not the other.",
      ],
      explanationSteps: [
        "Find two numbers that multiply to the constant and add to the middle coefficient.",
        `${a} and ${b}: sum=${mid}, product=${last}`,
        factoredSpaced,
      ],
      templateId: TWO_BINOMIAL_FACTOR_TEMPLATE_ID,
      params: { conceptId, a, b, direction },
    };
  }

  private buildWordProblemHints(unknown: string, b: number): string[] {
    return [
      `Start by naming ${unknown} — call it x — and turn the story into an equation.`,
      b >= 0
        ? "Once you have the equation, undo the added amount first, then undo the multiplication."
        : "Once you have the equation, undo the subtracted amount first, then undo the multiplication.",
      "Check your answer makes sense back in the story, not just in the equation.",
    ];
  }

  private buildWordProblemExplanationSteps(
    unknown: string,
    a: number,
    b: number,
    c: number,
    x: number,
  ): string[] {
    const afterSubtract = c - b;
    const equation = b >= 0 ? `${a}x + ${b} = ${c}` : `${a}x - ${Math.abs(b)} = ${c}`;
    const step1 = `Let x be ${unknown}. Turned into an equation: ${equation}`;
    const step2 =
      b >= 0
        ? `Subtract ${b} from both sides: ${a}x = ${c} - ${b} = ${afterSubtract}`
        : `Add ${Math.abs(b)} to both sides: ${a}x = ${c} + ${Math.abs(b)} = ${afterSubtract}`;
    const step3 = `Divide both sides by ${a}: x = ${afterSubtract} / ${a} = ${x}`;
    return [step1, step2, step3];
  }

  private assertValidParams(params: LinearEquationParams): void {
    const { a, b, x } = params;
    if (!Number.isInteger(a) || a === 0) {
      throw new Error("TemplateRender: a must be a non-zero integer");
    }
    if (!Number.isInteger(b) || !Number.isInteger(x)) {
      throw new Error("TemplateRender: b and x must be integers");
    }
  }

  private formatStem(a: number, b: number, c: number): string {
    const left =
      b === 0
        ? `${a}x`
        : b > 0
          ? `${a}x + ${b}`
          : `${a}x - ${Math.abs(b)}`;
    return `Solve for x: ${left} = ${c}`;
  }

  private buildAcceptedAnswers(x: number): string[] {
    return [String(x), `x=${x}`, `x = ${x}`];
  }

  /** Hints never include the numeric solution (or bare numbers that match it). */
  private buildHints(_a: number, b: number, _c: number): string[] {
    const moveHint =
      b === 0
        ? "The constant on the left is already gone — focus on the coefficient of x."
        : b > 0
          ? "Start by isolating the x term: undo the constant added on the left."
          : "Start by isolating the x term: undo the constant subtracted on the left.";

    return [
      moveHint,
      "Next, undo the coefficient of x using the inverse of multiplication.",
      "Check that your solution makes both sides of the equation equal when substituted.",
    ];
  }

  private buildExplanationSteps(
    a: number,
    b: number,
    c: number,
    x: number,
  ): string[] {
    const afterSubtract = c - b;
    const step1 =
      b === 0
        ? `The equation is already ${a}x = ${c}.`
        : b > 0
          ? `Subtract ${b} from both sides: ${a}x = ${c} - ${b} = ${afterSubtract}.`
          : `Add ${Math.abs(b)} to both sides: ${a}x = ${c} + ${Math.abs(b)} = ${afterSubtract}.`;

    const step2 = `Divide both sides by ${a}: x = ${afterSubtract} / ${a} = ${x}.`;
    const step3 = `Check: substitute x = ${x} into the left side to confirm it equals ${c}.`;

    return [step1, step2, step3];
  }
}
