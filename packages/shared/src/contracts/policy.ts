import type { LearningDecision } from "./learning-decision";
import type { PolicyStatus } from "./enums";

export interface PolicyVersion {
  id: string;
  policyVersion: string;
  status: PolicyStatus;
  artifactRef: string; // model blob location (S3, etc.)
  safetyEvalId?: string;
  createdAt: Date;
  promotedAt?: Date;
  promotionRequestedBy?: string;
  promotionRequestedAt?: Date;
  promotionApprovedBy?: string;
  promotionApprovedAt?: Date;
  promotionRejectedBy?: string;
  promotionRejectedAt?: Date;
  promotionRejectedReason?: string;
  rolledBackAt?: Date;
  rolledBackBy?: string;
  rolledBackReason?: string;
}

export interface PolicyChoiceRecord {
  policyVersion: string;
  baselineDecision: LearningDecision;
  learnedDecision?: LearningDecision;
  selected: "baseline" | "learned";
  safetyGatePassed: boolean;
  shadow: boolean;
  inferenceTimeMs?: number;
}

export interface PolicyPromotionRequest {
  policyVersion: string;
  safetyEvalId: string;
  requestedBy: string;
  approvedBy?: string;
  reason: string;
}

export interface PolicyRollbackRequest {
  policyVersion: string;
  reason: string;
  requestedBy: string;
  emergencyRollback: boolean; // true = single-actor allowed
}
