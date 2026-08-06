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
  LIN_DISTRIBUTE_POS: "expanding brackets",
  LIN_COMBINE_LIKE: "tidying up like terms",
  LIN_REMOVE_CONSTANT: "moving a number across the equals sign",
  LIN_REMOVE_COEFFICIENT: "dividing to get the letter on its own",
  LIN_SOLVE_TWO_STEP: "two-step equations",
  LIN_SOLVE_VARIABLE_BOTH: "equations with the letter on both sides",
  LIN_CHECK_SOLUTION: "checking an answer by putting it back in",
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
