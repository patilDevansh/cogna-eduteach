-- AlterTable
ALTER TABLE "PersonalizedVideoAssignment" ADD COLUMN "schoolId" TEXT;

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_schoolId_idx" ON "PersonalizedVideoAssignment"("schoolId");
