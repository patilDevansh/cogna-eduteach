-- CreateEnum
CREATE TYPE "PersonalizedVideoAssignmentStatus" AS ENUM ('PREPARING', 'UNDER_REVIEW', 'READY', 'FALLBACK', 'TEMPORARILY_UNAVAILABLE', 'ABSTAINED');

-- CreateEnum
CREATE TYPE "PersonalizedVideoEvidenceKind" AS ENUM ('WATCHED', 'COMPLETED', 'INDEPENDENT_EXIT');

-- CreateTable
CREATE TABLE "LotusSessionRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotusSessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotusEvidenceRecord" (
    "id" TEXT NOT NULL,
    "sessionRecordId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "questionText" TEXT,
    "submittedText" TEXT,
    "verificationStatus" TEXT,
    "verbatimText" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotusEvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizedVideoAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentKey" TEXT,
    "lotusSessionId" TEXT,
    "status" "PersonalizedVideoAssignmentStatus" NOT NULL DEFAULT 'PREPARING',
    "diagnosticState" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "learningObjective" TEXT NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "script" JSONB,
    "scriptSource" TEXT,
    "mathValidation" JSONB,
    "languageValidation" JSONB,
    "assetId" TEXT,
    "renderJobId" TEXT,
    "renderResult" JSONB,
    "fallbackReason" TEXT,
    "abstainReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizedVideoAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizedVideoEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "PersonalizedVideoEvidenceKind" NOT NULL,
    "dwellMs" INTEGER,
    "exitPrompt" TEXT,
    "exitAnswer" TEXT,
    "exitWorking" TEXT,
    "exitCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalizedVideoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LotusSessionRecord_sessionId_key" ON "LotusSessionRecord"("sessionId");

-- CreateIndex
CREATE INDEX "LotusSessionRecord_studentId_startedAt_idx" ON "LotusSessionRecord"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "LotusEvidenceRecord_sessionRecordId_createdAt_idx" ON "LotusEvidenceRecord"("sessionRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "LotusEvidenceRecord_sessionRecordId_eventType_idx" ON "LotusEvidenceRecord"("sessionRecordId", "eventType");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_studentId_createdAt_idx" ON "PersonalizedVideoAssignment"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_studentKey_idx" ON "PersonalizedVideoAssignment"("studentKey");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_status_idx" ON "PersonalizedVideoAssignment"("status");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_lotusSessionId_idx" ON "PersonalizedVideoAssignment"("lotusSessionId");

-- CreateIndex
CREATE INDEX "PersonalizedVideoEvent_assignmentId_createdAt_idx" ON "PersonalizedVideoEvent"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizedVideoEvent_studentId_kind_idx" ON "PersonalizedVideoEvent"("studentId", "kind");

-- AddForeignKey
ALTER TABLE "LotusEvidenceRecord"
ADD CONSTRAINT "LotusEvidenceRecord_sessionRecordId_fkey"
FOREIGN KEY ("sessionRecordId") REFERENCES "LotusSessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedVideoAssignment"
ADD CONSTRAINT "PersonalizedVideoAssignment_lotusSessionId_fkey"
FOREIGN KEY ("lotusSessionId") REFERENCES "LotusSessionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedVideoEvent"
ADD CONSTRAINT "PersonalizedVideoEvent_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "PersonalizedVideoAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
