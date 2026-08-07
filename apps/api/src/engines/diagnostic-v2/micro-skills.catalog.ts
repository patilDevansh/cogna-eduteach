/**
 * Micro-skills this module actually evidences — Phase A negative-distribution
 * column plus Phase B1 fraction-linear column through Topics 1–2 of the full
 * 73-skill catalogue at docs/diagnostic-microskill-slice/micro-skill-catalogue.md.
 *
 * Deliberately NOT closed at a fixed count: later phases extend this array
 * topic by topic. Nothing downstream may hardcode the count — see
 * assertCatalogueIntegrity().
 */
import type { MicroSkillId } from "@cogna/shared";

export type TopicId =
  | "LINEAR_EQUATIONS"
  | "BRACKETS_SIGNS_FRACTIONS"
  | "ALGEBRAIC_IDENTITIES"
  | "FACTORISATION"
  | "QUADRATICS";

export type CompetencyFamilyId =
  | "EQUALITY_AND_INVERSE_OPERATIONS"
  | "SIMPLIFYING_BEFORE_ISOLATING"
  | "SOLVING_DIFFERENT_FORMS"
  | "CHECKING_AND_APPLYING"
  | "SIGNED_NUMBER_ARITHMETIC"
  | "FRACTIONS_AND_ORDER"
  | "DISTRIBUTING_AND_CLEARING"
  | "READING_ALGEBRA"
  | "WORKING_WITH_EXPRESSIONS"
  | "RECOGNISING_IDENTITIES"
  | "TRINOMIAL_FACTORISATION"
  | "FACTOR_FINISHING"
  | "QUADRATIC_PREP"
  | "QUADRATIC_ROOTS";

/** Mirrors the MicroSkillDefinition authoring contract (Master Prompt §6.8), scoped to what this phase needs. */
export interface MicroSkillDefinition {
  id: MicroSkillId;
  name: string;
  topicId: TopicId;
  competencyFamilyId: CompetencyFamilyId;
  prerequisiteMicroSkillIds: MicroSkillId[];
  /** EXECUTABLE = has a verifier and content in this phase. The other catalogue skills are simply absent here, not listed as non-executable stubs. */
  status: "EXECUTABLE";
}

export const MICRO_SKILL_CATALOGUE: readonly MicroSkillDefinition[] = [
  {
    id: "FND_SIGN_MUL_DIV",
    name: "Multiply and divide signed numbers",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "SIGNED_NUMBER_ARITHMETIC",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_DISTRIBUTE_POS",
    name: "Distribute a positive multiplier across a bracket",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "DISTRIBUTING_AND_CLEARING",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    // The Phase A primary diagnostic target.
    id: "LIN_DISTRIBUTE_NEG",
    name: "Distribute a negative multiplier and preserve sign products",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "DISTRIBUTING_AND_CLEARING",
    prerequisiteMicroSkillIds: ["FND_SIGN_MUL_DIV", "LIN_DISTRIBUTE_POS"],
    status: "EXECUTABLE",
  },
  {
    id: "FND_FRACTION_EQUIV",
    name: "Create equivalent fractions",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "FRACTIONS_AND_ORDER",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "FND_FRACTION_OPS",
    name: "Perform fraction operations",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "FRACTIONS_AND_ORDER",
    prerequisiteMicroSkillIds: ["FND_FRACTION_EQUIV"],
    status: "EXECUTABLE",
  },
  {
    // The Phase B1 primary diagnostic target.
    id: "LIN_CLEAR_FRACTIONS",
    name: "Clear fractions validly by multiplying through by a common multiple",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "DISTRIBUTING_AND_CLEARING",
    prerequisiteMicroSkillIds: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_SOLVE_FRACTIONS",
    name: "Solve an equation with fractions",
    topicId: "BRACKETS_SIGNS_FRACTIONS",
    competencyFamilyId: "DISTRIBUTING_AND_CLEARING",
    prerequisiteMicroSkillIds: ["LIN_CLEAR_FRACTIONS", "LIN_SOLVE_TWO_STEP"],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_COMBINE_LIKE",
    name: "Combine like terms without combining unlike terms",
    topicId: "LINEAR_EQUATIONS",
    competencyFamilyId: "SIMPLIFYING_BEFORE_ISOLATING",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_REMOVE_CONSTANT",
    name: "Use an additive inverse to remove a constant term",
    topicId: "LINEAR_EQUATIONS",
    competencyFamilyId: "EQUALITY_AND_INVERSE_OPERATIONS",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_REMOVE_COEFFICIENT",
    name: "Divide by a non-unit coefficient to isolate the variable",
    topicId: "LINEAR_EQUATIONS",
    competencyFamilyId: "EQUALITY_AND_INVERSE_OPERATIONS",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_SOLVE_TWO_STEP",
    name: "Solve a two-step linear equation",
    topicId: "LINEAR_EQUATIONS",
    competencyFamilyId: "SOLVING_DIFFERENT_FORMS",
    prerequisiteMicroSkillIds: ["LIN_REMOVE_CONSTANT", "LIN_REMOVE_COEFFICIENT"],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_SOLVE_VARIABLE_BOTH",
    name: "Solve a linear equation with variables on both sides",
    topicId: "LINEAR_EQUATIONS",
    competencyFamilyId: "SOLVING_DIFFERENT_FORMS",
    prerequisiteMicroSkillIds: ["LIN_COMBINE_LIKE", "LIN_SOLVE_TWO_STEP"],
    status: "EXECUTABLE",
  },
  {
    id: "LIN_CHECK_SOLUTION",
    name: "Verify a proposed solution by substitution",
    topicId: "LINEAR_EQUATIONS",
    competencyFamilyId: "CHECKING_AND_APPLYING",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "ALG_IDENTIFY_STRUCTURE",
    name: "Identify the structure of an algebraic expression",
    topicId: "ALGEBRAIC_IDENTITIES",
    competencyFamilyId: "READING_ALGEBRA",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "EXP_EXPAND_BINOMIALS",
    name: "Expand a product of two binomials",
    topicId: "ALGEBRAIC_IDENTITIES",
    competencyFamilyId: "WORKING_WITH_EXPRESSIONS",
    prerequisiteMicroSkillIds: ["ALG_IDENTIFY_STRUCTURE"],
    status: "EXECUTABLE",
  },
  {
    id: "ID_DIFF_SQUARES",
    name: "Use the difference-of-squares identity",
    topicId: "ALGEBRAIC_IDENTITIES",
    competencyFamilyId: "RECOGNISING_IDENTITIES",
    prerequisiteMicroSkillIds: ["EXP_EXPAND_BINOMIALS"],
    status: "EXECUTABLE",
  },
  {
    id: "ID_VERIFY_EXPANSION",
    name: "Verify an expansion or factorisation",
    topicId: "ALGEBRAIC_IDENTITIES",
    competencyFamilyId: "RECOGNISING_IDENTITIES",
    prerequisiteMicroSkillIds: ["EXP_EXPAND_BINOMIALS"],
    status: "EXECUTABLE",
  },
  // ── Phase B3 factorisation ───────────────────────────────────────────────
  {
    id: "FAC_READ_ABC_SIGNS",
    name: "Read signed a, b, c from a trinomial",
    topicId: "FACTORISATION",
    competencyFamilyId: "TRINOMIAL_FACTORISATION",
    prerequisiteMicroSkillIds: ["ALG_IDENTIFY_STRUCTURE"],
    status: "EXECUTABLE",
  },
  {
    id: "FAC_PAIR_PRODUCT_SUM",
    name: "Find a factor pair by product and sum",
    topicId: "FACTORISATION",
    competencyFamilyId: "TRINOMIAL_FACTORISATION",
    prerequisiteMicroSkillIds: ["FAC_READ_ABC_SIGNS"],
    status: "EXECUTABLE",
  },
  {
    id: "FAC_MONIC_TRINOMIAL",
    name: "Factor a monic trinomial",
    topicId: "FACTORISATION",
    competencyFamilyId: "TRINOMIAL_FACTORISATION",
    prerequisiteMicroSkillIds: ["FAC_PAIR_PRODUCT_SUM", "EXP_EXPAND_BINOMIALS"],
    status: "EXECUTABLE",
  },
  {
    id: "FAC_COMPUTE_AC",
    name: "Compute a×c for a non-monic trinomial",
    topicId: "FACTORISATION",
    competencyFamilyId: "TRINOMIAL_FACTORISATION",
    prerequisiteMicroSkillIds: ["FAC_READ_ABC_SIGNS"],
    status: "EXECUTABLE",
  },
  {
    id: "FAC_SPLIT_MIDDLE",
    name: "Split the middle term using an AC pair",
    topicId: "FACTORISATION",
    competencyFamilyId: "TRINOMIAL_FACTORISATION",
    prerequisiteMicroSkillIds: ["FAC_COMPUTE_AC", "FAC_PAIR_PRODUCT_SUM"],
    status: "EXECUTABLE",
  },
  {
    id: "FAC_NONMONIC_GROUP",
    name: "Group a non-monic trinomial into linear factors",
    topicId: "FACTORISATION",
    competencyFamilyId: "TRINOMIAL_FACTORISATION",
    prerequisiteMicroSkillIds: ["FAC_SPLIT_MIDDLE", "FAC_MONIC_TRINOMIAL"],
    status: "EXECUTABLE",
  },
  {
    id: "FAC_VERIFY_EXPAND",
    name: "Verify a factorisation by expanding",
    topicId: "FACTORISATION",
    competencyFamilyId: "FACTOR_FINISHING",
    prerequisiteMicroSkillIds: ["EXP_EXPAND_BINOMIALS"],
    status: "EXECUTABLE",
  },
  // ── Phase B4 quadratics ──────────────────────────────────────────────────
  {
    id: "QUAD_STANDARD_FORM",
    name: "Rearrange a quadratic into standard form",
    topicId: "QUADRATICS",
    competencyFamilyId: "QUADRATIC_PREP",
    prerequisiteMicroSkillIds: [],
    status: "EXECUTABLE",
  },
  {
    id: "QUAD_FACTOR_EXPRESSION",
    name: "Factorise a quadratic expression (bridge to Topic 4)",
    topicId: "QUADRATICS",
    competencyFamilyId: "QUADRATIC_PREP",
    prerequisiteMicroSkillIds: ["FAC_MONIC_TRINOMIAL", "QUAD_STANDARD_FORM"],
    status: "EXECUTABLE",
  },
  {
    id: "QUAD_ZERO_PRODUCT",
    name: "Apply the zero-product rule to find roots",
    topicId: "QUADRATICS",
    competencyFamilyId: "QUADRATIC_ROOTS",
    prerequisiteMicroSkillIds: ["QUAD_FACTOR_EXPRESSION"],
    status: "EXECUTABLE",
  },
  {
    id: "QUAD_CREATE_BRANCHES",
    name: "Set every factor equal to zero",
    topicId: "QUADRATICS",
    competencyFamilyId: "QUADRATIC_ROOTS",
    prerequisiteMicroSkillIds: ["QUAD_ZERO_PRODUCT"],
    status: "EXECUTABLE",
  },
  {
    id: "QUAD_SOLVE_UNIT_FACTOR",
    name: "Solve a linear factor for its root",
    topicId: "QUADRATICS",
    competencyFamilyId: "QUADRATIC_ROOTS",
    prerequisiteMicroSkillIds: ["QUAD_CREATE_BRANCHES"],
    status: "EXECUTABLE",
  },
  {
    id: "QUAD_VERIFY_ROOTS",
    name: "Verify roots by substitution",
    topicId: "QUADRATICS",
    competencyFamilyId: "QUADRATIC_ROOTS",
    prerequisiteMicroSkillIds: ["QUAD_ZERO_PRODUCT"],
    status: "EXECUTABLE",
  },
] as const;

const BY_ID = new Map<string, MicroSkillDefinition>(
  MICRO_SKILL_CATALOGUE.map((s) => [s.id, s]),
);

export function findMicroSkill(id: string): MicroSkillDefinition | undefined {
  return BY_ID.get(id);
}

/** Layer 2/3 lookup — what gets denormalized onto every step and evidence row so coverage can be queried without re-deriving it from this file. */
export function layersForMicroSkill(
  id: string | undefined,
): { topicId: string | null; competencyFamilyId: string | null } {
  const skill = id ? BY_ID.get(id) : undefined;
  return {
    topicId: skill?.topicId ?? null,
    competencyFamilyId: skill?.competencyFamilyId ?? null,
  };
}

/**
 * Guards the two things that would silently corrupt evidence: a duplicate id,
 * or a prerequisite pointing at a skill that isn't in the catalogue. Checks
 * the catalogue is internally consistent — deliberately not a fixed count, so
 * later phases can extend the array without editing this assertion.
 */
export function assertCatalogueIntegrity(
  catalogue: readonly MicroSkillDefinition[] = MICRO_SKILL_CATALOGUE,
): void {
  const seen = new Set<string>();
  for (const skill of catalogue) {
    if (seen.has(skill.id)) {
      throw new Error(`Micro-skill catalogue: duplicate id ${skill.id}`);
    }
    seen.add(skill.id);
  }
  for (const skill of catalogue) {
    for (const prereq of skill.prerequisiteMicroSkillIds) {
      if (!seen.has(prereq)) {
        throw new Error(
          `Micro-skill catalogue: ${skill.id} requires ${prereq}, which is not in the catalogue`,
        );
      }
    }
  }
}
