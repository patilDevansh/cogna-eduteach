-- Parents link to school-made students through the phone number on the school's record (or a teacher's approval), replacing the one-time slip code.
-- DropIndex
DROP INDEX "Student_parentLinkCodeHash_key";

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ParentStudentLink" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'FAMILY';

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "parentLinkCodeExpiresAt",
DROP COLUMN "parentLinkCodeHash";

-- CreateTable
CREATE TABLE "StudentGuardianPhone" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'guardian',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGuardianPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerificationCode" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentLinkRequest" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "rollNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "studentId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentGuardianPhone_phone_idx" ON "StudentGuardianPhone"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardianPhone_studentId_phone_key" ON "StudentGuardianPhone"("studentId", "phone");

-- CreateIndex
CREATE INDEX "PhoneVerificationCode_parentId_createdAt_idx" ON "PhoneVerificationCode"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneVerificationCode_phone_createdAt_idx" ON "PhoneVerificationCode"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "ParentLinkRequest_classroomId_status_idx" ON "ParentLinkRequest"("classroomId", "status");

-- CreateIndex
CREATE INDEX "ParentLinkRequest_parentId_createdAt_idx" ON "ParentLinkRequest"("parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_phone_key" ON "Parent"("phone");

-- AddForeignKey
ALTER TABLE "StudentGuardianPhone" ADD CONSTRAINT "StudentGuardianPhone_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneVerificationCode" ADD CONSTRAINT "PhoneVerificationCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLinkRequest" ADD CONSTRAINT "ParentLinkRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLinkRequest" ADD CONSTRAINT "ParentLinkRequest_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

