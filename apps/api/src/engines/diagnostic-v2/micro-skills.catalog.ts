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

export type TopicId = "LINEAR_EQUATIONS" | "BRACKETS_SIGNS_FRACTIONS";

export type CompetencyFamilyId =
  | "EQUALITY_AND_INVERSE_OPERATIONS"
  | "SIMPLIFYING_BEFORE_ISOLATING"
  | "SOLVING_DIFFERENT_FORMS"
  | "CHECKING_AND_APPLYING"
  | "SIGNED_NUMBER_ARITHMETIC"
  | "FRACTIONS_AND_ORDER"
  | "DISTRIBUTING_AND_CLEARING";

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
