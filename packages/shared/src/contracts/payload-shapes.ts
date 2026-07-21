/**
 * Lightweight runtime contracts for web ↔ API hot path.
 * Prefer zod when available; for zero-dep shared package we use typed validators.
 */

import type { LearningDecision } from "./learning-decision";
import type { UiAction } from "./enums";

const UI_ACTIONS: UiAction[] = [
  "SHOW_QUESTION",
  "SHOW_EXPLANATION",
  "SHOW_HINT",
  "END_SESSION",
  "SUGGEST_BREAK",
];

export function isUiAction(v: unknown): v is UiAction {
  return typeof v === "string" && (UI_ACTIONS as string[]).includes(v);
}

export function assertLearningDecisionShape(d: unknown): LearningDecision {
  if (!d || typeof d !== "object") {
    throw new Error("LearningDecision: not an object");
  }
  const o = d as Record<string, unknown>;
  if (!isUiAction(o.uiAction)) {
    throw new Error(`LearningDecision: invalid uiAction ${String(o.uiAction)}`);
  }
  if (typeof o.learningIntent !== "string" || !o.learningIntent) {
    throw new Error("LearningDecision: learningIntent required");
  }
  if (o.contentStyle == null || typeof o.contentStyle !== "object") {
    throw new Error("LearningDecision: contentStyle required");
  }
  return d as LearningDecision;
}

export interface PracticeNextShape {
  decision: LearningDecision;
  payload?: unknown;
  studentMessage?: string;
}

export function assertPracticeNextShape(body: unknown): PracticeNextShape {
  if (!body || typeof body !== "object") {
    throw new Error("PracticeNext: not an object");
  }
  const o = body as Record<string, unknown>;
  const decision = assertLearningDecisionShape(o.decision);
  return {
    decision,
    payload: o.payload,
    studentMessage: typeof o.studentMessage === "string" ? o.studentMessage : undefined,
  };
}
