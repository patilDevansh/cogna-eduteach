-- DATA-014: a lesson's independent answer is saved once, enforced by the database. Older rows keep
-- null in the new columns (unknown), and the unique slot ignores them; duplicates among them stay.
ALTER TABLE "PersonalizedVideoEvent" ADD COLUMN "exitSlot" TEXT;
ALTER TABLE "PersonalizedVideoEvent" ADD COLUMN "submissionId" TEXT;
ALTER TABLE "PersonalizedVideoEvent" ADD COLUMN "contentVersion" TEXT;
ALTER TABLE "PersonalizedVideoEvent" ADD COLUMN "helpStatus" TEXT;
CREATE UNIQUE INDEX "PersonalizedVideoEvent_exitSlot_key" ON "PersonalizedVideoEvent"("exitSlot");
