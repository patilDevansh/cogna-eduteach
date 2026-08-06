/**
 * Pure logic for the shadow-mode Practice Recommender Agent — no Prisma, no
 * NestJS. Same split as the other two agents' formulas files.
 */
import type { RevisionProposal } from "../../revision/revision.service";

/** The only enforcement that makes this "bounded": the AI's proposed order
 * must be an exact permutation of the rule-approved concept list — same
 * elements, same count, no duplicates, nothing invented or dropped. */
export function isValidPermutation(candidateIds: string[], proposedOrder: string[]): boolean {
  if (candidateIds.length !== proposedOrder.length) return false;
  const candidateSet = new Set(candidateIds);
  const seen = new Set<string>();
  for (const id of proposedOrder) {
    if (!candidateSet.has(id)) return false;
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === candidateSet.size;
}

export function topChoiceAgrees(ruleOrder: string[], aiOrder: string[]): boolean {
  return ruleOrder.length > 0 && aiOrder.length > 0 && ruleOrder[0] === aiOrder[0];
}

export function buildPracticeRecommenderPrompts(
  proposals: RevisionProposal[],
): { system: string; user: string } {
  const system =
    "You are re-ordering a short list of already-approved practice recommendations for a " +
    "student — every concept in the list has already been selected as appropriate by the " +
    "recommendation engine. You may only reorder the listed concepts; you may never add, " +
    "drop, or duplicate one. Never infer attention, mood, motivation, or any clinical trait — " +
    "base the order only on the listed priority, type, and reasoning. Return JSON only in this " +
    'exact shape: {"orderedConceptIds":string[], every concept id from the list below in your ' +
    'suggested order,"confidence":number between 0 and 1,"reasoning":string, one plain sentence}. ' +
    "No other keys.";

  const lines = proposals.map(
    (p, i) =>
      `[${i}] conceptId=${p.conceptId} type=${p.type} rulePriority=${p.priority.toFixed(3)} questionCount=${p.questionCount} reasoning="${p.reasoning}"`,
  );
  const user = `Approved concepts (rule order shown, but do not assume it is optimal):\n${lines.join("\n")}\n\nReturn all ${proposals.length} concept ids in your suggested order.`;

  return { system, user };
}
