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
