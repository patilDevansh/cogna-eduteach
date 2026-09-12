-- Cognitive Delay Mitigation — Performance Indexes
-- Phase 1: Add composite indexes for hot query paths

-- Diagnostic factor lookups (most frequent hot path)
CREATE INDEX IF NOT EXISTS "idx_diagnostic_factor_student_concept_type" 
  ON "DiagnosticFactor"("studentId", "conceptId", "factorType", "createdAt" DESC);

-- Retention estimate lookups (decision context)
CREATE INDEX IF NOT EXISTS "idx_retention_estimate_valid" 
  ON "RetentionEstimate"("studentId", "conceptId", "validUntil", "createdAt" DESC);

-- Attempt recent queries (diagnostic computations)
CREATE INDEX IF NOT EXISTS "idx_attempt_student_recent" 
  ON "Attempt"("studentId", "createdAt" DESC);

-- Attempt session queries (streak computation)
CREATE INDEX IF NOT EXISTS "idx_attempt_session_recent" 
  ON "Attempt"("sessionId", "createdAt" DESC);

-- Question eligibility (selection hot path)
CREATE INDEX IF NOT EXISTS "idx_question_concept_difficulty_intent" 
  ON "Question"("conceptId", "difficulty", "questionIntent", "reviewStatus");

-- Misconception remediation state lookups
CREATE INDEX IF NOT EXISTS "idx_misconception_remediation_student_concept" 
  ON "MisconceptionRemediationState"("studentId", "conceptId", "updatedAt" DESC);

-- Revision queue due items
CREATE INDEX IF NOT EXISTS "idx_revision_queue_due" 
  ON "RevisionQueueItem"("studentId", "status", "dueAt" DESC, "priority" DESC);

-- Concept prerequisites (decision fallback)
CREATE INDEX IF NOT EXISTS "idx_concept_prerequisite_concept" 
  ON "ConceptPrerequisite"("conceptId");

-- Mastery score lookups (decision context, used via studentId_conceptId unique constraint already)
-- Note: studentId_conceptId unique constraint already provides good index coverage

-- Learner profile lookups (decision context, primary key already indexed)
-- Note: studentId primary key already provides index
