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

/**
 * CUR-002 — Multi-Board Shared Skill Contracts
 * Represents observable mathematical skills with examples, non-examples,
 * alternative instructional methods, assessment conditions, conditional
 * prerequisite routes, and board terminology overlays.
 */

export type PrerequisiteRouteKind = "MANDATORY" | "ALTERNATIVE_ROUTE";

export interface PrerequisiteLink {
  targetSkillId: string;
  kind: PrerequisiteRouteKind;
  rationale: string;
}

export type PreferredBoardKind = "CBSE" | "ICSE" | "CAMBRIDGE_STAGE_9" | "UNIVERSAL";

export interface AlternativeMethod {
  name: string;
  description: string;
  preferredBoard?: PreferredBoardKind;
}

export interface AssessmentConditions {
  calculatorAllowed: boolean;
  formulaSheetProvided: boolean;
  allowedTimeMinutes: number;
  targetSuccessRate: number; // 0.0 to 1.0
}

export type CognitiveDepthTier =
  | "REMEMBER"
  | "UNDERSTAND"
  | "APPLY"
  | "ANALYZE"
  | "EVALUATE"
  | "CREATE";

export interface BoardTerminologyOverlay {
  objectiveId: string;
  localTitle: string;
  terminologyOverlay: Record<string, string>;
  localDepth: CognitiveDepthTier;
  isTestedInBoard: boolean;
}

export type SkillDomain =
  | "NUMBER"
  | "ALGEBRA"
  | "GEOMETRY"
  | "MENSURATION"
  | "STATISTICS_PROBABILITY";

export interface SharedSkillRecord {
  skillId: string;
  version: number;
  canonicalTitle: string;
  domain: SkillDomain;
  examples: string[];
  nonExamples: string[];
  alternativeMethods: AlternativeMethod[];
  assessmentConditions: AssessmentConditions;
  prerequisites: PrerequisiteLink[];
  boardMappings: Partial<Record<"CBSE" | "ICSE" | "CAMBRIDGE_STAGE_9", BoardTerminologyOverlay>>;
}
