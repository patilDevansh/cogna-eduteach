-- Short texts to a parent's verified phone when something happens in class, with an opt-out.
ALTER TABLE "Parent" ADD COLUMN "textUpdates" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ParentNotification" ADD COLUMN "textedAt" TIMESTAMP(3);

-- A parent can say a child they added at home isn't the same as a child from school.
ALTER TABLE "Student" ADD COLUMN "duplicateDismissedAt" TIMESTAMP(3);
