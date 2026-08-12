/**
 * Client-side mirror of the fixed stage backbone in
 * apps/api/.../diagnostic-v2-session.service.ts (ITEM_STAGE_ORDER and
 * friends). Display-only: never used to decide what item comes next, only to
 * show a student which of the currently enabled topics they are on without needing the
 * debug view (which is stripped for real students).
 */

export interface TopicDef {
  /** Same track id the intro screen's radio buttons use. */
  trackKey: string;
  name: string;
  stages: string[];
}

export const COMBINED_TOPIC_ORDER: TopicDef[] = [
  {
    trackKey: "NEGATIVE_DISTRIBUTION",
    name: "Brackets & negative signs",
    stages: ["ENTRY_TWO_STEP", "ENTRY_VARIABLE_BOTH", "NEG_DIST_MAIN", "NEG_DIST_CONTRAST", "TRANSFER_NEG_DIST"],
  },
  {
    trackKey: "FRACTION_LINEAR",
    name: "Equations with fractions",
    stages: ["ENTRY_FRAC_SIMPLE", "FRAC_CLEAR_MAIN", "FRAC_CLEAR_CONTRAST", "TRANSFER_FRAC_CLEAR"],
  },
];

export interface TopicProgress {
  topicIndex: number;
  topicCount: number;
  topicName: string;
}

/** Resolves an item's stageId to its topic within the combined-algebra backbone. Returns null for a stage outside every topic's list (RULE_PROMPT, COMPLETE, or an unrecognised id) — callers should just omit topic display in that case rather than guess. */
export function topicProgressForStage(stageId: string | null | undefined): TopicProgress | null {
  if (!stageId) return null;
  const topicIndex = COMBINED_TOPIC_ORDER.findIndex((t) => t.stages.includes(stageId));
  if (topicIndex === -1) return null;
  return {
    topicIndex,
    topicCount: COMBINED_TOPIC_ORDER.length,
    topicName: COMBINED_TOPIC_ORDER[topicIndex]!.name,
  };
}
