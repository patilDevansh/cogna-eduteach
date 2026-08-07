/**
 * Deterministic DiagnosticV2 student/parent summary helpers (no LLM).
 * Shared by the session service and D.v2 report polish.
 */
import type {
  DiagnosticV2SummaryOverview,
  DiagnosticV2SummarySkillView,
  MicroSkillId,
  MicroSkillStatus,
} from "@cogna/shared";

/**
 * The catalogue's skill names are precise and unreadable to a 13-year-old
 * ("distribute a negative multiplier and preserve sign products"). These are
 * the same skills said out loud.
 */
const CHILD_FACING_SKILL_NAMES: Record<MicroSkillId, string> = {
  FND_SIGN_MUL_DIV: "multiplying and dividing with minus signs",
  LIN_DISTRIBUTE_NEG: "expanding brackets that have a minus in front",
  LIN_DISTRIBUTE_POS: "expanding brackets",
  LIN_COMBINE_LIKE: "tidying up like terms",
  LIN_REMOVE_CONSTANT: "moving a number across the equals sign",
  LIN_REMOVE_COEFFICIENT: "dividing to get the letter on its own",
  LIN_SOLVE_TWO_STEP: "two-step equations",
  LIN_SOLVE_VARIABLE_BOTH: "equations with the letter on both sides",
  LIN_CHECK_SOLUTION: "checking an answer by putting it back in",
  FND_FRACTION_EQUIV: "writing the same fraction in a different way",
  FND_FRACTION_OPS: "working with fractions",
  LIN_CLEAR_FRACTIONS: "clearing fractions by multiplying both sides",
  LIN_SOLVE_FRACTIONS: "solving equations that have fractions in them",
  ALG_IDENTIFY_STRUCTURE: "spotting the shape of an expression",
  EXP_EXPAND_BINOMIALS: "multiplying two brackets",
  ID_DIFF_SQUARES: "difference of squares",
  ID_VERIFY_EXPANSION: "checking an expansion",
  FAC_READ_ABC_SIGNS: "reading the numbers in a trinomial",
  FAC_PAIR_PRODUCT_SUM: "finding two numbers that multiply and add correctly",
  FAC_MONIC_TRINOMIAL: "factorising a trinomial that starts with x²",
  FAC_COMPUTE_AC: "working out a times c",
  FAC_SPLIT_MIDDLE: "splitting the middle term",
  FAC_NONMONIC_GROUP: "factorising a trinomial with a number in front of x²",
  FAC_VERIFY_EXPAND: "checking factors by expanding them",
  QUAD_STANDARD_FORM: "rewriting a quadratic so it equals zero",
  QUAD_FACTOR_EXPRESSION: "factorising a quadratic",
  QUAD_ZERO_PRODUCT: "using the zero-product rule to find roots",
  QUAD_CREATE_BRANCHES: "setting each factor equal to zero",
  QUAD_SOLVE_UNIT_FACTOR: "solving a bracket for the letter",
  QUAD_VERIFY_ROOTS: "checking roots in the original equation",
};

export function childFacingSkillName(microSkillId: string): string {
  return CHILD_FACING_SKILL_NAMES[microSkillId as MicroSkillId] ?? "this skill";
}

/** Long lists stop being readable — name a few things the student did well, not all of them. */
const MAX_SKILLS_NAMED_IN_SUMMARY = 3;

export function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Deterministic, never a model call: the summary is assembled from the
 * hypotheses that were already written (AI- or rule-authored), so this endpoint
 * stays fast and cannot introduce new unreviewed student-facing text until
 * D.v2 optionally polishes the result.
 */
export function buildChildFacingSummary(
  states: Array<{ microSkillId: string; status: MicroSkillStatus }>,
  hypotheses: Array<{ microSkillId: string; childFacingSummary: string | null }>,
): string {
  // RELIABLE first: if the list has to be trimmed, keep the strongest evidence.
  const solid = [
    ...states.filter((s) => s.status === "RELIABLE"),
    ...states.filter((s) => s.status === "DEVELOPING"),
  ]
    .slice(0, MAX_SKILLS_NAMED_IN_SUMMARY)
    .map((s) => childFacingSkillName(s.microSkillId));
  const gaps = states.filter((s) => s.status === "LIKELY_GAP");

  const parts: string[] = [];
  if (solid.length > 0) {
    parts.push(`You handled ${joinWords(solid)} on your own today.`);
  } else {
    parts.push("Thanks for working through those questions.");
  }

  for (const gap of gaps) {
    const latest = [...hypotheses].reverse().find((h) => h.microSkillId === gap.microSkillId);
    parts.push(
      latest?.childFacingSummary ??
        `Next time we'll spend a bit of time on ${childFacingSkillName(gap.microSkillId)}.`,
    );
  }

  if (gaps.length > 0) {
    parts.push("We'll come back to it in a few days to make sure it stuck.");
  }

  return parts.join(" ");
}

/**
 * Structured overview for the student end screen (qualitative status + names).
 * Same inputs as `buildChildFacingSummary` — never invents skills the session
 * did not touch.
 */
export function buildSummaryOverview(input: {
  itemsAttempted: number;
  itemsCompleted: number;
  states: Array<{ microSkillId: string; status: MicroSkillStatus }>;
  hypotheses: Array<{ microSkillId: string; childFacingSummary: string | null }>;
}): DiagnosticV2SummaryOverview {
  const hypBySkill = new Map<string, string | null>();
  for (const h of input.hypotheses) hypBySkill.set(h.microSkillId, h.childFacingSummary);

  const skills: DiagnosticV2SummarySkillView[] = input.states.map((s) => ({
    microSkillId: s.microSkillId,
    childFacingName: childFacingSkillName(s.microSkillId),
    status: s.status,
    note: hypBySkill.get(s.microSkillId) ?? null,
  }));

  const solid = [
    ...skills.filter((s) => s.status === "RELIABLE"),
    ...skills.filter((s) => s.status === "DEVELOPING"),
  ];
  const gaps = skills.filter((s) => s.status === "LIKELY_GAP");

  return {
    itemsAttempted: input.itemsAttempted,
    itemsCompleted: input.itemsCompleted,
    solidSkillNames: solid.slice(0, MAX_SKILLS_NAMED_IN_SUMMARY).map((s) => s.childFacingName),
    gapSkillNames: gaps.map((s) => s.childFacingName),
    skills,
  };
}
