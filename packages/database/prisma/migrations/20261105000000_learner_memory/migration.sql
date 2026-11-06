-- Learner memory: what each test and lesson showed about each skill of a student, kept across tests.
CREATE TABLE "LearnerSkillEvidence" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "mistakes" JSONB NOT NULL DEFAULT '[]',
    "detail" JSONB NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerSkillEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnerSkillEvidence_source_sourceId_skillId_key" ON "LearnerSkillEvidence"("source", "sourceId", "skillId");
CREATE INDEX "LearnerSkillEvidence_studentId_observedAt_idx" ON "LearnerSkillEvidence"("studentId", "observedAt");

ALTER TABLE "LearnerSkillEvidence" ADD CONSTRAINT "LearnerSkillEvidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
