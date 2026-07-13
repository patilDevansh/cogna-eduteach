/** MVP 3.0 — Experiment contracts */

export type ExperimentStatus = "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";
export type ExperimentArm = "control" | "scored_v1" | string;

export interface ExperimentEligibility {
  unitId?: string;
  minSessionsCompleted?: number;
  excludeBaselineOnly?: boolean;
}

export interface ExperimentDefinition {
  experimentKey: string;
  status: ExperimentStatus;
  arms: ExperimentArm[];
  allocation: Record<ExperimentArm, number>; // must sum to 1.0
  eligibility: ExperimentEligibility;
  startAt: string; // ISO
  endAt?: string; // ISO
  rulesVersion: string; // experiment-rules-v1
}

export interface ExperimentAssignment {
  id: string;
  studentId: string;
  experimentKey: string;
  arm: ExperimentArm;
  assignedAt: string; // ISO
  sticky: true; // MVP 3.0 requires sticky assignment
  metadata?: Record<string, string>;
}
