/** MVP 3.0 — Feature flags */

/**
 * EXPERIMENTS_ENABLED controls sticky experiment assignment and branching.
 * - false (default): no experiment writes; control behavior only
 * - true: enable experiment registry, sticky assignment, and decision branching
 */
export function experimentsEnabled(): boolean {
  return process.env.EXPERIMENTS_ENABLED === "true";
}

/**
 * CONTENT_LLM_DRAFTS_ENABLED controls LLM-assisted content drafting.
 * - false (default): no LLM draft jobs; human/programmatic authoring only
 * - true: enable LLM draft jobs with validation + human review gates
 *
 * Note: LLM drafts NEVER reach students without APPROVED status.
 * This flag only enables the draft → validate → review pipeline.
 */
export function contentLlmDraftsEnabled(): boolean {
  return process.env.CONTENT_LLM_DRAFTS_ENABLED === "true";
}

/**
 * Feature flag precedence (safety):
 * 1. EXPERIMENTS_ENABLED=false → all students use control policy (decision-rules-v2)
 * 2. EXPERIMENTS_ENABLED=true + no assignment → control policy
 * 3. EXPERIMENTS_ENABLED=true + assigned to "control" arm → control policy
 * 4. EXPERIMENTS_ENABLED=true + assigned to "scored_v1" arm → candidate scorer applied
 *
 * LLM drafts:
 * 1. CONTENT_LLM_DRAFTS_ENABLED=false → LLM draft jobs skip; drafts remain in queue
 * 2. CONTENT_LLM_DRAFTS_ENABLED=true → draft jobs run; validation + review gates enforced
 * 3. Only APPROVED content reaches students (independent of this flag)
 */
