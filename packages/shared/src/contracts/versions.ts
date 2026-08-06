export const MASTERY_FORMULA_V1 = "mastery-formula-v1";
export const DIAGNOSTIC_RULES_V1 = "diagnostic-rules-v1";
export const DECISION_RULES_V1 = "decision-rules-v1";
export const QUESTION_SELECTOR_V1 = "question-selector-v1";
export const RECOMMENDATION_RULES_V1 = "recommendation-rules-v1";
export const REPORT_TEMPLATES_V1 = "report-templates-v1";

/** MVP 1.0 historical engine versions — keep for replay of stored decisions. */
export const ENGINE_VERSIONS = {
  masteryFormula: MASTERY_FORMULA_V1,
  diagnosticRules: DIAGNOSTIC_RULES_V1,
  decisionRules: DECISION_RULES_V1,
  questionSelector: QUESTION_SELECTOR_V1,
  recommendationRules: RECOMMENDATION_RULES_V1,
  reportTemplates: REPORT_TEMPLATES_V1,
} as const;

// ─── MVP 2.0 version strings ───────────────────────────────────────────────

export const MASTERY_FORMULA_V2 = "mastery-formula-v2";
export const DIAGNOSTIC_RULES_V2 = "diagnostic-rules-v2";
export const DECISION_RULES_V2 = "decision-rules-v2";
export const RETENTION_RULES_V2 = "retention-rules-v2";
export const RECOMMENDATION_RULES_V2 = "recommendation-rules-v2";
export const REPORT_TEMPLATES_V2 = "report-templates-v2";
export const CONTENT_REVIEW_RULES_V2 = "content-review-rules-v2";

export const ENGINE_VERSIONS_V2 = {
  masteryFormula: MASTERY_FORMULA_V2,
  diagnosticRules: DIAGNOSTIC_RULES_V2,
  decisionRules: DECISION_RULES_V2,
  retentionRules: RETENTION_RULES_V2,
  recommendationRules: RECOMMENDATION_RULES_V2,
  reportTemplates: REPORT_TEMPLATES_V2,
  contentReviewRules: CONTENT_REVIEW_RULES_V2,
} as const;

// ─── MVP 3.0 version strings ───────────────────────────────────────────────

export const DECISION_RULES_V3 = "decision-rules-v3";
export const CANDIDATE_SCORE_RULES_V1 = "candidate-score-rules-v1";
export const EXPERIMENT_RULES_V1 = "experiment-rules-v1";
export const CONTENT_DRAFT_RULES_V1 = "content-draft-rules-v1";
export const CONTENT_VALIDATION_RULES_V1 = "content-validation-rules-v1";

export const ENGINE_VERSIONS_V3 = {
  // Carry forward from MVP 2.0
  masteryFormula: MASTERY_FORMULA_V2,
  diagnosticRules: DIAGNOSTIC_RULES_V2,
  retentionRules: RETENTION_RULES_V2,
  recommendationRules: RECOMMENDATION_RULES_V2,
  reportTemplates: REPORT_TEMPLATES_V2,
  contentReviewRules: CONTENT_REVIEW_RULES_V2,
  // MVP 3.0 new
  decisionRules: DECISION_RULES_V3,
  candidateScoreRules: CANDIDATE_SCORE_RULES_V1,
  experimentRules: EXPERIMENT_RULES_V1,
  contentDraftRules: CONTENT_DRAFT_RULES_V1,
  contentValidationRules: CONTENT_VALIDATION_RULES_V1,
} as const;

// ─── MVP 4.0 version strings ───────────────────────────────────────────────

export const CURRICULUM_RULES_V1 = "curriculum-rules-v1";
export const PLANNING_RULES_V1 = "planning-rules-v1";
export const DECISION_RULES_V4 = "decision-rules-v4"; // unit-aware
export const RECOMMENDATION_RULES_V4 = "recommendation-rules-v4";

export const ENGINE_VERSIONS_V4 = {
  // Carry forward from MVP 2.0/3.0
  masteryFormula: MASTERY_FORMULA_V2,
  diagnosticRules: DIAGNOSTIC_RULES_V2,
  retentionRules: RETENTION_RULES_V2,
  reportTemplates: REPORT_TEMPLATES_V2,
  contentReviewRules: CONTENT_REVIEW_RULES_V2,
  candidateScoreRules: CANDIDATE_SCORE_RULES_V1,
  experimentRules: EXPERIMENT_RULES_V1,
  contentDraftRules: CONTENT_DRAFT_RULES_V1,
  contentValidationRules: CONTENT_VALIDATION_RULES_V1,
  // MVP 4.0 new
  curriculumRules: CURRICULUM_RULES_V1,
  planningRules: PLANNING_RULES_V1,
  decisionRules: DECISION_RULES_V4,
  recommendationRules: RECOMMENDATION_RULES_V4,
} as const;

// ─── MVP 5.0 version strings ───────────────────────────────────────────────

export const POLICY_RULES_V5 = "policy-rules-v5";
export const LEARNED_POLICY_V1 = "learned-policy-v1";
export const MODALITY_RULES_V1 = "modality-rules-v1";
export const SUBJECT_GRAPH_RULES_V1 = "subject-graph-rules-v1";
export const SAFETY_EVAL_RULES_V1 = "safety-eval-rules-v1";

export const ENGINE_VERSIONS_V5 = {
  // Carry forward from MVP 2.0/3.0/4.0
  masteryFormula: MASTERY_FORMULA_V2,
  diagnosticRules: DIAGNOSTIC_RULES_V2,
  retentionRules: RETENTION_RULES_V2,
  reportTemplates: REPORT_TEMPLATES_V2,
  contentReviewRules: CONTENT_REVIEW_RULES_V2,
  candidateScoreRules: CANDIDATE_SCORE_RULES_V1,
  experimentRules: EXPERIMENT_RULES_V1,
  contentDraftRules: CONTENT_DRAFT_RULES_V1,
  contentValidationRules: CONTENT_VALIDATION_RULES_V1,
  curriculumRules: CURRICULUM_RULES_V1,
  planningRules: PLANNING_RULES_V1,
  recommendationRules: RECOMMENDATION_RULES_V4,
  // MVP 5.0 new
  policyRules: POLICY_RULES_V5,
  learnedPolicy: LEARNED_POLICY_V1,
  modalityRules: MODALITY_RULES_V1,
  subjectGraphRules: SUBJECT_GRAPH_RULES_V1,
  safetyEvalRules: SAFETY_EVAL_RULES_V1,
} as const;

// ─── MVP 9.0.1 Phase A — micro-skill step diagnostic (standalone track) ────
// Not part of the mvp-1.0-9.0 ENGINE_VERSIONS_V* lineage — this is an
// additive, separate diagnostic mechanism. See COGNA 9.0.1/BUILD_PLAN.md.

export const STEP_VERIFICATION_RULES_V1 = "step-verification-rules-v1";
export const EVIDENCE_POLICY_MICROSKILL_V1 = "evidence-policy-microskill-v1";

// Phase A2 — the gate every AI-authored question must clear before a student
// sees it. Versioned separately from the step verifier because loosening a
// gate is a product decision that must be visible in the audit trail.
export const AUTHORED_ITEM_GATE_V1 = "authored-item-gate-v1";
