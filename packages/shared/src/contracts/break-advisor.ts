/**
 * Shadow-mode Break Advisor Agent output shape. Bounded by construction:
 * `minutes` is always clamped to 1..10 in code (break-advisor.formulas.ts),
 * never trusted raw from the model. Never served to a student in this phase.
 */

export interface BreakRecommendation {
  suggestBreak: boolean;
  minutes: number; // always 1..10 after clamping
  confidence: number; // 0..1
  reasoning: string;
}

export function assertBreakRecommendationShape(v: unknown): BreakRecommendation {
  if (!v || typeof v !== "object") {
    throw new Error("BreakRecommendation: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.suggestBreak !== "boolean") {
    throw new Error("BreakRecommendation: suggestBreak must be boolean");
  }
  if (typeof o.minutes !== "number" || !Number.isFinite(o.minutes)) {
    throw new Error("BreakRecommendation: minutes must be a finite number");
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error(`BreakRecommendation: confidence must be 0..1, got ${String(o.confidence)}`);
  }
  if (typeof o.reasoning !== "string" || !o.reasoning.trim()) {
    throw new Error("BreakRecommendation: reasoning required");
  }
  return v as BreakRecommendation;
}
