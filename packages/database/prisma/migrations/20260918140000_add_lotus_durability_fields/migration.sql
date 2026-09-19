-- Lotus Phase 0 durability: pseudonymous id/retention on the session record,
-- and dedicated per-answer lifecycle/version fields plus a DB-level
-- duplicate-submission guard on the evidence record.

ALTER TABLE "LotusSessionRecord" ADD COLUMN "pseudonymId" TEXT;
ALTER TABLE "LotusSessionRecord" ADD COLUMN "retentionUntil" TIMESTAMP(3);

CREATE INDEX "LotusSessionRecord_pseudonymId_idx" ON "LotusSessionRecord"("pseudonymId");
CREATE INDEX "LotusSessionRecord_retentionUntil_idx" ON "LotusSessionRecord"("retentionUntil");

ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "questionId" TEXT;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "submissionId" TEXT;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "queuedAt" TIMESTAMP(3);
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "analysisStartedAt" TIMESTAMP(3);
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "analysisCompletedAt" TIMESTAMP(3);
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "installedSlot" INTEGER;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "shownAckAt" TIMESTAMP(3);
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "costCents" INTEGER;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "promptVersion" TEXT;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "modelVersion" TEXT;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "policyVersion" TEXT;
ALTER TABLE "LotusEvidenceRecord" ADD COLUMN "skillMapVersion" TEXT;

-- NULLs are distinct under a Postgres unique index, so SESSION_STATE events
-- (which never carry a questionId/submissionId) never collide with each
-- other or with ANSWER events; only two ANSWER events for the same question
-- and the same client-supplied submissionId collide, which is the guard.
CREATE UNIQUE INDEX "LotusEvidenceRecord_sessionRecordId_questionId_submissionI_key"
  ON "LotusEvidenceRecord"("sessionRecordId", "questionId", "submissionId");
