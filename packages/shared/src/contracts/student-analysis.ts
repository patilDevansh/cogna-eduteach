/**
 * Shadow-mode Student Analysis Agent output shape. Never shown to a student
 * or parent — logged to AiDecisionAuditLog for offline comparison against
 * the existing rule-based diagnostic engine. Same hand-written runtime-guard
 * convention as payload-shapes.ts / analytics.ts (no zod).
 */

export type MasteryDirection = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_EVIDENCE";

const MASTERY_DIRECTIONS: MasteryDirection[] = [
  "IMPROVING",
  "STABLE",
  "DECLINING",
  "INSUFFICIENT_EVIDENCE",
];

export function isMasteryDirection(v: unknown): v is MasteryDirection {
  return typeof v === "string" && (MASTERY_DIRECTIONS as string[]).includes(v);
}

export interface ConceptAssessment {
  conceptId: string;
  direction: MasteryDirection;
  confidence: number; // 0..1
  reasoning: string;
}

export interface StudentAnalysisSnapshot {
  studentId: string;
  sessionId: string;
  conceptAssessments: ConceptAssessment[];
  modelVersion: string;
}

export function assertConceptAssessmentShape(v: unknown): ConceptAssessment {
  if (!v || typeof v !== "object") {
    throw new Error("ConceptAssessment: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.conceptId !== "string" || !o.conceptId) {
    throw new Error("ConceptAssessment: conceptId required");
  }
  if (!isMasteryDirection(o.direction)) {
    throw new Error(`ConceptAssessment: invalid direction ${String(o.direction)}`);
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`ConceptAssessment: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("ConceptAssessment: reasoning required");
  }
  return v as ConceptAssessment;
}

export function assertStudentAnalysisSnapshotShape(v: unknown): StudentAnalysisSnapshot {
  if (!v || typeof v !== "object") {
    throw new Error("StudentAnalysisSnapshot: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.studentId !== "string" || !o.studentId) {
    throw new Error("StudentAnalysisSnapshot: studentId required");
  }
  if (typeof o.sessionId !== "string" || !o.sessionId) {
    throw new Error("StudentAnalysisSnapshot: sessionId required");
  }
  if (!Array.isArray(o.conceptAssessments)) {
    throw new Error("StudentAnalysisSnapshot: conceptAssessments must be an array");
  }
  o.conceptAssessments.forEach(assertConceptAssessmentShape);
  if (typeof o.modelVersion !== "string" || !o.modelVersion) {
    throw new Error("StudentAnalysisSnapshot: modelVersion required");
  }
  return v as StudentAnalysisSnapshot;
}
