/**
 * MVP 4.0 — Curriculum and Planning contracts
 */

export type UnlockRule =
  | "ALL_PREREQ_UNITS_AT_THRESHOLD"
  | "MANUAL"
  | "DIAGNOSTIC_PLACEMENT";

export interface UnitDefinition {
  unitId: string;
  title: string;
  conceptIds: string[];
  prerequisiteUnitIds: string[];
  unlockRule: UnlockRule;
}

export interface CurriculumPlan {
  id: string;
  studentId: string;
  horizonWeeks: number; // 2..6
  weeks: Array<{
    weekIndex: number;
    primaryUnitId: string;
    focusConceptIds: string[];
    bridgeConceptIds: string[];
    maxNewConcepts: number;
  }>;
  rulesVersion: string; // planning-rules-v1
  createdAt: string;
  validUntil: string;
}

export type ConceptKind = "PREREQ" | "CORE";

export interface UnitConcept {
  unitId: string;
  conceptId: string;
  kind: ConceptKind;
}
