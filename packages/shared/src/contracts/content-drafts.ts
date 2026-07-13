/** MVP 3.0 — Content draft contracts */

export const DRAFT_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "VALIDATED",
  "VALIDATION_FAILED",
  "PENDING_REVIEW",
  "REJECTED",
  "APPROVED_PROMOTED",
] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_TYPES = [
  "QUESTION",
  "EXPLANATION_TEMPLATE",
  "HINT_LADDER",
] as const;

export type DraftType = (typeof DRAFT_TYPES)[number];

export const DRAFT_SOURCES = ["HUMAN", "LLM_ASSISTED", "PROGRAMMATIC"] as const;

export type DraftSource = (typeof DRAFT_SOURCES)[number];

export interface ContentDraft {
  id: string;
  draftType: DraftType;
  conceptId: string;
  difficulty?: number;
  targetMisconception?: string;
  payload: Record<string, unknown>; // mirrors question/explanation schema
  source: DraftSource;
  provider?: string;
  promptVersion?: string;
  status: DraftStatus;
  validationErrors?: string[];
  reviewNotes?: string;
  promotedContentId?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
