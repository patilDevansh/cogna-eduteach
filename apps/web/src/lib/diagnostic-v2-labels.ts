/**
 * Debug/testing labels for diagnostic-v2 codes (?debug=1).
 * Codes stay visible; these are plain-English companions only.
 * Meanings mirror apps/api diagnostic-v2 stages, templates, and
 * childFacingSkillName / catalogue names — do not invent new ones.
 */

/** Stage machine ids (item stages + teaching / end). */
const STAGE_LABELS: Record<string, string> = {
  ENTRY_TWO_STEP: "Entry: two-step equation",
  ENTRY_VARIABLE_BOTH: "Entry: letter on both sides",
  NEG_DIST_MAIN: "Main: negative distribution equation",
  NEG_DIST_CONTRAST: "Contrast: bare expand (isolate the sign rule)",
  TRANSFER_NEG_DIST: "Transfer: fresh negative-distribution check",
  RULE_PROMPT: "Teaching: sign rule prompt",
  COMPLETE: "Session complete",
  COEFFICIENT_VERIFICATION: "Neutral division calculation check",
  ENTRY_FRAC_SIMPLE: "Entry: simple fraction equation",
  FRAC_CLEAR_MAIN: "Main: clear denominators",
  FRAC_CLEAR_CONTRAST: "Contrast: bare clear",
  TRANSFER_FRAC_CLEAR: "Transfer: fresh clear-fractions check",
  ENTRY_EXPAND_BINOMIAL: "Entry: expand two brackets",
  ID_DIFF_MAIN: "Main: difference of squares expand",
  ID_DIFF_CONTRAST: "Contrast: difference of squares",
  TRANSFER_ID_DIFF: "Transfer: factor difference of squares",
  ENTRY_FACTOR_EXPAND: "Entry: expand into a quadratic",
  FAC_MONIC_MAIN: "Main: factor monic trinomial",
  FAC_MONIC_CONTRAST: "Contrast: factor with mixed signs",
  TRANSFER_FAC_NONMONIC: "Transfer: factor non-monic trinomial",
  ENTRY_QUAD_STANDARD: "Entry: rearrange to standard form",
  QUAD_ZP_MAIN: "Main: zero-product roots",
  QUAD_ZP_CONTRAST: "Contrast: non-unit factor roots",
  TRANSFER_QUAD_ZP: "Transfer: factor then find roots",
};

/** Template ids used in this slice (see diagnostic-v2-template-render.ts). */
const TEMPLATE_LABELS: Record<string, string> = {
  TPL_TWO_STEP: "Template: two-step (no bracket)",
  TPL_VARIABLE_BOTH: "Template: variables on both sides",
  TPL_NEG_DISTRIBUTION: "Template: negative bracket equation",
  TPL_NEG_DISTRIBUTION_BARE: "Template: bare expand (one step)",
  TPL_TRANSFER_NEG_DISTRIBUTION: "Template: transfer check (same shape)",
};

/**
 * Same nine skills / same phrasing as childFacingSkillName in the API session
 * service (tutor-facing short English).
 */
const MICRO_SKILL_LABELS: Record<string, string> = {
  FND_SIGN_MUL_DIV: "multiplying and dividing with minus signs",
  LIN_DISTRIBUTE_NEG: "expanding brackets that have a minus in front",
  LIN_DISTRIBUTE_POS: "Distribute a positive multiplier across a bracket",
  LIN_COMBINE_LIKE: "tidying up like terms",
  LIN_REMOVE_CONSTANT: "moving a number across the equals sign",
  LIN_REMOVE_COEFFICIENT: "dividing to get the letter on its own",
  LIN_SOLVE_TWO_STEP: "two-step equations",
  LIN_SOLVE_VARIABLE_BOTH: "equations with the letter on both sides",
  LIN_CHECK_SOLUTION: "checking an answer by putting it back in",
  FND_FRACTION_EQUIV: "Create equivalent fractions",
  FND_FRACTION_OPS: "Perform fraction operations",
  LIN_CLEAR_FRACTIONS: "clearing fractions by multiplying both sides",
  LIN_SOLVE_FRACTIONS: "solving equations that have fractions in them",
  EXP_EXPAND_BINOMIALS: "multiplying two brackets",
  ID_DIFF_SQUARES: "difference of squares",
  ID_VERIFY_EXPANSION: "checking an expansion",
  ALG_IDENTIFY_STRUCTURE: "spotting the shape of an expression",
  FAC_READ_ABC_SIGNS: "reading a, b, c from a trinomial",
  FAC_PAIR_PRODUCT_SUM: "finding a product-and-sum factor pair",
  FAC_MONIC_TRINOMIAL: "factorising a monic trinomial",
  FAC_COMPUTE_AC: "computing a times c",
  FAC_SPLIT_MIDDLE: "splitting the middle term",
  FAC_NONMONIC_GROUP: "factorising a non-monic trinomial",
  FAC_VERIFY_EXPAND: "checking factors by expanding",
  QUAD_STANDARD_FORM: "rewriting a quadratic as equals zero",
  QUAD_FACTOR_EXPRESSION: "factorising a quadratic",
  QUAD_ZERO_PRODUCT: "using the zero-product rule",
  QUAD_CREATE_BRANCHES: "setting each factor to zero",
  QUAD_SOLVE_UNIT_FACTOR: "solving a linear factor",
  QUAD_VERIFY_ROOTS: "checking roots by substitution",
};

const ACTION_CODE_LABELS: Record<string, string> = {
  WRONG_COMMON_MULTIPLE: "used different multipliers on each side",
  DROPPED_TERM_WHEN_CLEARING: "dropped a term while clearing fractions",
  SIGN_ERROR_AFTER_CLEARING: "sign error after clearing",
  WRONG_MIDDLE_SIGN: "wrong middle term on difference of squares",
  FACTOR_PAIR_MISMATCH: "wrong factor pair",
  NOT_DIFF_OF_SQUARES: "not a difference of squares",
  DROPPED_SQUARE: "missing square term",
  WRONG_FACTOR_PAIR_PRODUCT: "right sum, wrong product in the factor pair",
  WRONG_FACTOR_PAIR_SUM: "right product, wrong sum in the factor pair",
  SIGN_ERROR_MIDDLE_SPLIT: "sign error on a factor constant",
  WRONG_GROUPING: "AC numbers grouped onto the wrong factors",
  INCOMPLETE_FACTORISATION: "factorisation left unfinished",
  EXPAND_CHECK_FAIL: "factors do not expand to the quadratic",
  NOT_INTEGER_FACTORABLE: "does not factor over the integers",
  MISSED_BRANCH: "only one factor set to zero",
  WRONG_ROOT_SIGN: "root has the wrong sign",
  DROPPED_ROOT: "one root missing or wrong",
  VERIFY_FAIL: "roots fail substitution check",
  WRONG_STANDARD_FORM: "incorrect rearrange to standard form",
};

/** Fixed item keys in this slice (same ids as stage for the pre-written bank). */
const ITEM_KEY_LABELS: Record<string, string> = {
  ENTRY_TWO_STEP: STAGE_LABELS.ENTRY_TWO_STEP!,
  ENTRY_VARIABLE_BOTH: STAGE_LABELS.ENTRY_VARIABLE_BOTH!,
  NEG_DIST_MAIN: STAGE_LABELS.NEG_DIST_MAIN!,
  NEG_DIST_CONTRAST: STAGE_LABELS.NEG_DIST_CONTRAST!,
  TRANSFER_NEG_DIST: STAGE_LABELS.TRANSFER_NEG_DIST!,
};

const ORIGIN_LABELS: Record<string, string> = {
  PRE_WRITTEN: "from the fixed question bank",
  GENERATED: "fresh instance from a template",
  AI_AUTHORED: "AI-authored (verifier-gated)",
};

const ALL_LABELS: Record<string, string> = {
  ...STAGE_LABELS,
  ...TEMPLATE_LABELS,
  ...MICRO_SKILL_LABELS,
  ...ITEM_KEY_LABELS,
  ...ORIGIN_LABELS,
  ...ACTION_CODE_LABELS,
};

/** SCREAMING_SNAKE diagnostic codes we know how to gloss. */
const CODE_TOKEN_RE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;

export function englishLabelForDiagnosticCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return ALL_LABELS[code] ?? null;
}

/**
 * Replace known codes in prose with `English (CODE)` so selector reasoning
 * reads as a sentence instead of a pile of machine ids.
 */
export function humanizeDiagnosticCodesInText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(CODE_TOKEN_RE, (code) => {
    const english = ALL_LABELS[code];
    return english ? `${english} (${code})` : code;
  });
}
