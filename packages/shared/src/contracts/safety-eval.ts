export interface SafetyEval {
  id: string;
  policyVersion: string;
  metricsJson: SafetyMetrics;
  passed: boolean;
  rulesVersion: string; // safety-eval-rules-v1
  createdAt: Date;
}

export interface SafetyMetrics {
  masteryDelta: number; // vs baseline
  masteryDeltaPassed: boolean; // >= -0.02
  misconceptionFPRate: number;
  misconceptionFPRatePassed: boolean; // <= 0.05
  sessionLengthViolationRate: number;
  sessionLengthViolationRatePassed: boolean; // = 0
  hardConstraintImitation: number;
  hardConstraintImitationPassed: boolean; // >= 0.995
  nonApprovedContentAttempts: number;
  nonApprovedContentAttemptsPassed: boolean; // = 0
  explanationAfterIncorrectRate: number;
  explanationAfterIncorrectRatePassed: boolean; // within [baseline-0.1, baseline+0.1]
  retentionItemSkippedRate: number;
  retentionItemSkippedRatePassed: boolean; // <= baseline + 0.05
  baselineExplanationAfterIncorrectRate: number; // for comparison
  baselineRetentionItemSkippedRate: number; // for comparison
  evaluationSetSize: number;
}

export interface SafetyEvalRequest {
  policyVersion: string;
  artifactRef: string;
  evaluationSetRef: string; // held-out dataset location
  rulesVersion: string;
}
