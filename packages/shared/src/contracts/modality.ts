import type { ModalityKind, ReviewStatus } from "./enums";

export interface ModalityAsset {
  id: string;
  assetId: string;
  modality: ModalityKind;
  conceptId: string;
  misconceptionId?: string;
  unitId: string;
  subjectId: string;
  storageRef: string; // S3/CDN reference
  transcriptRef?: string; // required for VOICE/VIDEO with math claims
  reviewStatus: ReviewStatus;
  retestQuestionId?: string; // link to APPROVED text question for retest
  durationMs?: number;
  createdAt: Date;
}

export interface ModalityOutcome {
  id: string;
  studentId: string;
  assetId: string;
  sessionId: string;
  completed: boolean;
  dwellMs: number;
  retestCorrect?: boolean;
  modelVersion: string; // tracks which rules/policy version selected this
  createdAt: Date;
}

export interface ModalityAssetSelector {
  conceptId: string;
  misconceptionId?: string;
  modalityPreference?: ModalityKind[];
  excludeAssetIds?: string[];
}

/** Modality payload when uiAction is SHOW_QUESTION or SHOW_EXPLANATION with modality asset */
export interface ModalityPayload {
  assetId: string;
  modality: ModalityKind;
  storageRef: string;
  durationMs?: number;
  retestQuestionId?: string;
  transcriptRef?: string;
}
