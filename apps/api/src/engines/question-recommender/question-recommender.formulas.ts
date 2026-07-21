/**
 * Pure logic for the Question Recommender Agent — no Prisma, no NestJS.
 * Same split as break-advisor.formulas.ts / student-analysis.formulas.ts.
 */
import type { ScoredCandidate } from "@cogna/shared";

/** The only enforcement that makes this "bounded": an index outside the real candidate array is never legal, full stop — no clamping, no nearest-match, just rejection. */
export function isValidCandidateIndex(index: number, candidateCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < candidateCount;
}

export function agreesWithRule(ruleIndex: number, aiIndex: number): boolean {
  return ruleIndex === aiIndex;
}

/**
 * Resolve which scored-candidate index to serve.
 * AI wins only when serve is on AND the index is in-bounds; otherwise rules win.
 * Out-of-range AI indexes are never clamped — that is the bounds guarantee.
 */
export function resolveServedSelection(
  ruleSelectedIndex: number,
  aiSelectedIndex: number | null | undefined,
  serveEnabled: boolean,
  candidateCount: number,
): { selectedIndex: number; source: "rule" | "ai" } {
  if (
    serveEnabled &&
    aiSelectedIndex != null &&
    isValidCandidateIndex(aiSelectedIndex, candidateCount)
  ) {
    return { selectedIndex: aiSelectedIndex, source: "ai" };
  }
  return { selectedIndex: ruleSelectedIndex, source: "rule" };
}

export function isQuestionRecommenderGenerateEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.AI_QUESTION_RECOMMENDER_GENERATE === "true";
}

export function isQuestionRecommenderServeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.AI_QUESTION_RECOMMENDER_SERVE === "true";
}

export function buildRecommenderPrompts(
  candidates: ScoredCandidate[],
): { system: string; user: string } {
  const system =
    "You are re-ranking a short list of already-approved next actions for a student's maths " +
    "practice — every option in the list has already been checked as safe and appropriate by " +
    "the rules engine. You may only choose one of the listed options by its index; you may " +
    "never invent a new action. Never infer attention, mood, effort, or any clinical trait — " +
    "base your choice only on the listed rule score and legality reason. Return JSON only in " +
    'this exact shape: {"selectedIndex":integer, index of your chosen candidate,"confidence":number between 0 and 1,"reasoning":string, one plain sentence}. ' +
    "No other keys.";

  const lines = candidates.map(
    (c, i) =>
      `[${i}] intent=${c.candidate.learningIntent} action=${c.candidate.uiAction} concept=${c.candidate.parameters.conceptId ?? "n/a"} difficulty=${c.candidate.parameters.difficulty ?? "n/a"} ruleScore=${c.score.toFixed(3)} legality="${c.candidate.legalityReason}"`,
  );
  const user = `Candidates:\n${lines.join("\n")}\n\nPick the single best index for this student right now.`;

  return { system, user };
}
