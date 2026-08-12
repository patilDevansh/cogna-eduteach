ALTER TABLE "DiagnosticV2Hypothesis"
ADD COLUMN "attemptId" TEXT,
ADD COLUMN "stepId" TEXT;

CREATE INDEX "DiagnosticV2Hypothesis_attemptId_stepId_idx"
ON "DiagnosticV2Hypothesis"("attemptId", "stepId");
