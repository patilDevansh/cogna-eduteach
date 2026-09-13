CREATE TABLE "DiagnosticV2EvidenceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptId" TEXT,
    "stepId" TEXT,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "questionNumber" INTEGER,
    "stepNumber" INTEGER,
    "questionText" TEXT,
    "submittedText" TEXT,
    "verbatimText" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticV2EvidenceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiagnosticV2EvidenceRecord_sessionId_createdAt_idx"
ON "DiagnosticV2EvidenceRecord"("sessionId", "createdAt");

CREATE INDEX "DiagnosticV2EvidenceRecord_sessionId_eventType_createdAt_idx"
ON "DiagnosticV2EvidenceRecord"("sessionId", "eventType", "createdAt");

CREATE INDEX "DiagnosticV2EvidenceRecord_attemptId_stepId_idx"
ON "DiagnosticV2EvidenceRecord"("attemptId", "stepId");

ALTER TABLE "DiagnosticV2EvidenceRecord"
ADD CONSTRAINT "DiagnosticV2EvidenceRecord_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "DiagnosticV2Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
