ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TEACHER';

CREATE TYPE "ClassroomRunPhase" AS ENUM ('ENROLLMENT','DIAGNOSTIC','CLASS_REPORT','TEACHING','INDEPENDENT_EXIT','FINAL_REPORT','COMPLETE');
CREATE TYPE "ClassroomRunStatus" AS ENUM ('DRAFT','LIVE','PAUSED','COMPLETE','CANCELLED');
CREATE TYPE "ClassroomAssignmentKind" AS ENUM ('DIAGNOSTIC','TEACHING','INDEPENDENT_EXIT');
CREATE TYPE "ClassroomAssignmentStatus" AS ENUM ('WAITING','READY','IN_PROGRESS','COMPLETE','SKIPPED','FAILED');

CREATE TABLE "Teacher" (
  "id" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Classroom" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "grade" INTEGER NOT NULL,
  "subjectId" TEXT NOT NULL,
  "joinCode" TEXT NOT NULL,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomEnrollment" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "rollNumber" TEXT,
  "admissionNumber" TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "ClassroomEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomRun" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "phase" "ClassroomRunPhase" NOT NULL DEFAULT 'ENROLLMENT',
  "status" "ClassroomRunStatus" NOT NULL DEFAULT 'DRAFT',
  "config" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomAssignment" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "kind" "ClassroomAssignmentKind" NOT NULL,
  "status" "ClassroomAssignmentStatus" NOT NULL DEFAULT 'WAITING',
  "diagnosticSessionId" TEXT,
  "videoAssignmentId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB,
  "availableAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");
CREATE UNIQUE INDEX "Teacher_identityKey_key" ON "Teacher"("identityKey");
CREATE INDEX "Teacher_schoolId_idx" ON "Teacher"("schoolId");
CREATE UNIQUE INDEX "Classroom_joinCode_key" ON "Classroom"("joinCode");
CREATE INDEX "Classroom_teacherId_archivedAt_idx" ON "Classroom"("teacherId", "archivedAt");
CREATE INDEX "Classroom_schoolId_idx" ON "Classroom"("schoolId");
CREATE UNIQUE INDEX "ClassroomEnrollment_classroomId_studentId_key" ON "ClassroomEnrollment"("classroomId", "studentId");
CREATE INDEX "ClassroomEnrollment_classroomId_leftAt_idx" ON "ClassroomEnrollment"("classroomId", "leftAt");
CREATE INDEX "ClassroomEnrollment_studentId_idx" ON "ClassroomEnrollment"("studentId");
CREATE INDEX "ClassroomRun_classroomId_createdAt_idx" ON "ClassroomRun"("classroomId", "createdAt");
CREATE INDEX "ClassroomRun_status_phase_idx" ON "ClassroomRun"("status", "phase");
CREATE UNIQUE INDEX "ClassroomAssignment_runId_enrollmentId_kind_key" ON "ClassroomAssignment"("runId", "enrollmentId", "kind");
CREATE INDEX "ClassroomAssignment_enrollmentId_status_idx" ON "ClassroomAssignment"("enrollmentId", "status");
CREATE INDEX "ClassroomAssignment_runId_kind_status_idx" ON "ClassroomAssignment"("runId", "kind", "status");

ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomRun" ADD CONSTRAINT "ClassroomRun_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ClassroomRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassroomEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
