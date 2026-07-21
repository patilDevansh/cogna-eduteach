/**
 * Shadow-mode Practice Recommender Agent output shape. Bounded by
 * construction: `orderedConceptIds` only means something once the caller
 * (practice-recommender-agent.service.ts) checks it's an exact permutation
 * of the already rule-approved RevisionProposal[] list — adding, dropping,
 * or duplicating a concept is rejected outright, never coerced. This agent
 * only ever re-orders what the recommendation engine already proposed.
 */

export interface PracticeRecommendation {
  orderedConceptIds: string[];
  confidence: number; // 0..1
  reasoning: string;
}

export function assertPracticeRecommendationShape(v: unknown): PracticeRecommendation {
  if (!v || typeof v !== "object") {
    throw new Error("PracticeRecommendation: not an object");
  }
  const o = v as Record<string, unknown>;
  if (
    !Array.isArray(o.orderedConceptIds) ||
    o.orderedConceptIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new Error("PracticeRecommendation: orderedConceptIds must be a non-empty-string array");
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`PracticeRecommendation: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("PracticeRecommendation: reasoning required");
  }
  return v as PracticeRecommendation;
}
