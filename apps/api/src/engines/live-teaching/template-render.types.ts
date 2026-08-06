/** C-lite params for one-step linear equations: a·x + b = c, with solution x. */
export interface LinearEquationParams {
  conceptId: string;
  a: number;
  b: number;
  /** Final solution (accepted answer). */
  x: number;
}

/** C-lite params for variable-on-both-sides equations: a·x + b = c·x + d, with solution x. */
export interface VariableBothSidesParams {
  conceptId: string;
  a: number;
  b: number;
  c: number;
  d: number;
  /** Final solution (accepted answer), always an integer by construction. */
  x: number;
}

/**
 * C-lite params for the (x+a)(x+b) <-> x^2+(a+b)x+ab identity, used both to
 * expand (ID_C4_TWO_BINOMIAL_IDENTITY) and to factorise (FAC_C4_TRINOMIAL) —
 * same underlying arithmetic, opposite direction of the same question.
 */
export interface TwoBinomialParams {
  conceptId: string;
  a: number;
  b: number;
  direction: "expand" | "factor";
}

export type RenderedQuestionParams = LinearEquationParams | VariableBothSidesParams | TwoBinomialParams;

export function isVariableBothSidesParams(p: RenderedQuestionParams): p is VariableBothSidesParams {
  return "d" in p;
}

export function isTwoBinomialParams(p: RenderedQuestionParams): p is TwoBinomialParams {
  return "direction" in p;
}

export function isLinearEquationParams(p: RenderedQuestionParams): p is LinearEquationParams {
  return !isVariableBothSidesParams(p) && !isTwoBinomialParams(p);
}

export interface RenderedQuestion {
  conceptId: string;
  stem: string;
  acceptedAnswers: string[];
  hints: string[];
  explanationSteps: string[];
  /** Marks deterministic template render — verifier soft-passes steps. */
  templateId: string;
  /** Right-hand side a*x + b, for re-solve checks — only set for the LinearEquationParams family. */
  c?: number;
  params: RenderedQuestionParams;
}
