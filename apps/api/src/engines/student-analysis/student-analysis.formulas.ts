/**
 * Pure logic for the shadow-mode Student Analysis Agent — no Prisma, no
 * NestJS. Mirrors the diagnostic-formulas.ts / parent-analytics.formulas.ts
 * split already used elsewhere in this codebase.
 */
import type { ConceptAssessment, MasteryDirection } from "@cogna/shared";

export interface MasteryUpdateLike {
  conceptId: string;
  previousValue: number;
  newValue: number;
}

/** Below this delta, a mastery change is noise, not a real direction. */
const STABLE_THRESHOLD = 0.02;

export function directionFromDelta(previousValue: number, newValue: number): MasteryDirection {
  const delta = newValue - previousValue;
  if (delta > STABLE_THRESHOLD) return "IMPROVING";
  if (delta < -STABLE_THRESHOLD) return "DECLINING";
  return "STABLE";
}

/** The rule-based comparison baseline — always computed, logged even when the AI call never runs. */
export function buildRuleDirections(updates: MasteryUpdateLike[]): Map<string, MasteryDirection> {
  const map = new Map<string, MasteryDirection>();
  for (const u of updates) {
    map.set(u.conceptId, directionFromDelta(u.previousValue, u.newValue));
  }
  return map;
}

export interface AgreementResult {
  /** null when there is nothing comparable (no overlapping concepts, or AI abstained on all of them). */
  agreementRate: number | null;
  comparedCount: number;
  agreedCount: number;
}

/** INSUFFICIENT_EVIDENCE claims are excluded — abstaining isn't a comparable prediction. */
export function computeAgreementRate(
  ruleDirections: Map<string, MasteryDirection>,
  aiAssessments: ConceptAssessment[],
): AgreementResult {
  let compared = 0;
  let agreed = 0;
  for (const a of aiAssessments) {
    if (a.direction === "INSUFFICIENT_EVIDENCE") continue;
    const ruleDirection = ruleDirections.get(a.conceptId);
    if (!ruleDirection) continue;
    compared++;
    if (a.direction === ruleDirection) agreed++;
  }
  return {
    agreementRate: compared > 0 ? agreed / compared : null,
    comparedCount: compared,
    agreedCount: agreed,
  };
}

export function buildAnalysisPrompts(updates: MasteryUpdateLike[]): { system: string; user: string } {
  const system =
    "You analyze a student's recent maths practice and assess, per concept, whether their " +
    "mastery is improving, stable, declining, or if there isn't enough evidence yet. " +
    "Never infer attention, mood, effort, or any clinical/diagnostic trait — only what the " +
    "practice data shows. Return JSON only in this exact shape: " +
    '{"conceptAssessments":[{"conceptId":string,"direction":"IMPROVING"|"STABLE"|"DECLINING"|"INSUFFICIENT_EVIDENCE","confidence":number between 0 and 1,"reasoning":string, one plain sentence}]}. ' +
    "One entry per concept listed below. No other keys, no extra commentary.";

  const lines = updates.map(
    (u) => `${u.conceptId}: mastery estimate went from ${u.previousValue.toFixed(2)} to ${u.newValue.toFixed(2)}`,
  );
  const user =
    lines.length > 0
      ? `Recent mastery changes for this session:\n${lines.join("\n")}`
      : "No mastery changes were recorded for this session.";

  return { system, user };
}
