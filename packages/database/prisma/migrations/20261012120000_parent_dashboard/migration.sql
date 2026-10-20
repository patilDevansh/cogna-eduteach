-- When each student should have finished a class check; parents see it on their dashboard.
ALTER TABLE "ClassroomRun" ADD COLUMN "dueAt" TIMESTAMP(3);

-- A student can ask Cogna to email their parent the link code when joining a class.
ALTER TABLE "Student" ADD COLUMN "parentInviteEmail" TEXT;
ALTER TABLE "Student" ADD COLUMN "parentInviteSentAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "parentInviteCount" INTEGER NOT NULL DEFAULT 0;
