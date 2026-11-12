/**
 * Versioned, independent rating oracle for Lotus factorisation qualification.
 *
 * This is deliberately derived from the public curriculum catalogue and the
 * published 1–5 rating contract, not from a completed Lotus report.  It
 * supplies a complete campaign-level truth table: a single 15-question paper
 * is not expected to rate all 38 skills, but the qualification campaign is.
 */
import type { LotusCompetencyRating, LotusCompetencyStatus } from "@cogna/shared";
import { FACTORISATION_SKILLS } from "../../src/lotus/lotus-factorisation-catalogue";
import { FOUNDATIONAL_OR_SIGN_SKILLS } from "../../src/lotus/lotus-factorisation";

export const LOTUS_QUALIFICATION_ORACLE_VERSION = "factorisation-rating-v1";

export type QualificationEvidencePattern =
  | "SLOW_CLEAN"
  | "FLUENT_CLEAN"
  | "FAST_MASTERY"
  | "REPEATED_GAP"
  | "NO_DIRECT_EVIDENCE";

export interface QualificationRatingCell {
  id: string;
  skillId: string;
  /** A synthetic learner persona's observable evidence for this microskill. */
  pattern: QualificationEvidencePattern;
  expectedRating?: LotusCompetencyRating;
  expectedStatus?: LotusCompetencyStatus;
}

const statusFor = (rating: LotusCompetencyRating): LotusCompetencyStatus => ({
  1: "CRITICAL_BLOCKER",
  2: "FRAGILE",
  3: "EMERGING",
  4: "FLUENT",
  5: "ADVANCED_MASTERY",
}[rating]);

/**
 * 38 skills × five valid evidence patterns = 190 exact oracle cells.
 * Rating 1 is only valid for the rating engine's foundational/sign set;
 * every other confirmed gap is rating 2.  `NO_DIRECT_EVIDENCE` must remain
 * unrated rather than being quietly interpreted as a low score.
 */
export const LOTUS_QUALIFICATION_RATING_MATRIX: QualificationRatingCell[] = FACTORISATION_SKILLS.flatMap((skill) => {
  // `calculateSkillRating` also treats every group-0 foundation as critical,
  // including the three expansion/identity prerequisites that are not named
  // in the explicit sign/foundation set.
  const confirmedRating: LotusCompetencyRating = FOUNDATIONAL_OR_SIGN_SKILLS.has(skill.id) || skill.group === 0 ? 1 : 2;
  return [
    { id: `${skill.id}:slow-clean`, skillId: skill.id, pattern: "SLOW_CLEAN" as const, expectedRating: 3, expectedStatus: statusFor(3) },
    { id: `${skill.id}:fluent-clean`, skillId: skill.id, pattern: "FLUENT_CLEAN" as const, expectedRating: 4, expectedStatus: statusFor(4) },
    { id: `${skill.id}:fast-mastery`, skillId: skill.id, pattern: "FAST_MASTERY" as const, expectedRating: 5, expectedStatus: statusFor(5) },
    { id: `${skill.id}:repeated-gap`, skillId: skill.id, pattern: "REPEATED_GAP" as const, expectedRating: confirmedRating, expectedStatus: statusFor(confirmedRating) },
    { id: `${skill.id}:unrated`, skillId: skill.id, pattern: "NO_DIRECT_EVIDENCE" as const },
  ];
});

export const LOTUS_QUALIFICATION_MICROSKILL_COUNT = FACTORISATION_SKILLS.length;
