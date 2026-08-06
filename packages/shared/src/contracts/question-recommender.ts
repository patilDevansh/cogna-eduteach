/**
 * Question Recommender Agent output shape. Bounded by construction:
 * `selectedIndex` only ever means something once the caller checks it against
 * the actual legal-candidate array length — an index the AI invents outside
 * that range is rejected as a failed call, never coerced or clamped.
 * This is a *re-ranking* signal only; it can never nominate an action the
 * rule engine didn't already certify as legal. Applied to students only when
 * AI_QUESTION_RECOMMENDER_SERVE=true; otherwise shadow-logged.
 */

export interface QuestionRecommendation {
  selectedIndex: number;
  confidence: number; // 0..1
  reasoning: string;
}

export function assertQuestionRecommendationShape(v: unknown): QuestionRecommendation {
  if (!v || typeof v !== "object") {
    throw new Error("QuestionRecommendation: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.selectedIndex !== "number" || !Number.isInteger(o.selectedIndex) || o.selectedIndex < 0) {
    throw new Error(`QuestionRecommendation: selectedIndex must be a non-negative integer, got ${String(o.selectedIndex)}`);
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`QuestionRecommendation: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("QuestionRecommendation: reasoning required");
  }
  return v as QuestionRecommendation;
}
