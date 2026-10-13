import { findSkill } from "../lotus/lotus-factorisation-catalogue";

/**
 * Which kind of lesson a student gets after a check.
 * - SHORT: the 20-second lesson on their own answer. For a small gap: one skill, one mistake
 *   code already recognised, and the skills underneath it secure. No AI writing, ready at once.
 * - VIDEO: a narrated lesson written for the student and rendered as a video, for anything bigger.
 */
export type LessonFormat = "SHORT" | "VIDEO";

export interface LessonFormatInput {
  /** The check's skill results. */
  skills: Array<{ skillId: string; state: string }>;
  targetSkillId: string;
  /** The student's wrong answers on the target skill; `mistake` is set when code recognised it. */
  studentItems: Array<{ mistake?: string }>;
  /** Whether a short lesson can be built from the student's own answer. */
  shortLessonAvailable: boolean;
}

const OPEN = new Set(["CONFIRMED", "SUSPECTED"]);

/** Every skill the target builds on, directly or further down. */
function foundationsOf(skillId: string, seen = new Set<string>()): Set<string> {
  for (const dep of findSkill(skillId)?.dependsOn ?? []) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    foundationsOf(dep, seen);
  }
  return seen;
}

export function chooseLessonFormat(input: LessonFormatInput): { format: LessonFormat; reason: string } {
  if (!input.shortLessonAvailable) return { format: "VIDEO", reason: "A short lesson can't be built from this answer." };
  const gaps = input.skills.filter((s) => s.state === "CONFIRMED");
  if (gaps.length > 1) return { format: "VIDEO", reason: "More than one skill needs work." };
  const foundations = foundationsOf(input.targetSkillId);
  if (input.skills.some((s) => foundations.has(s.skillId) && OPEN.has(s.state))) {
    return { format: "VIDEO", reason: "A skill underneath this one also needs work." };
  }
  if (!input.studentItems.length || input.studentItems.some((item) => !item.mistake)) {
    return { format: "VIDEO", reason: "The mistake needs explaining, not just correcting." };
  }
  return { format: "SHORT", reason: "One recognised mistake on one skill, with the skills underneath it secure." };
}
