-- A parent claims a school-made student with a one-time code from school.
ALTER TABLE "Student" ADD COLUMN "parentLinkCodeHash" TEXT;
ALTER TABLE "Student" ADD COLUMN "parentLinkCodeExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Student_parentLinkCodeHash_key" ON "Student"("parentLinkCodeHash");

-- Updates from school shown on a parent's dashboard.
CREATE TABLE "ParentNotification" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParentNotification_parentId_dedupeKey_key" ON "ParentNotification"("parentId", "dedupeKey");
CREATE INDEX "ParentNotification_parentId_createdAt_idx" ON "ParentNotification"("parentId", "createdAt");
CREATE INDEX "ParentNotification_studentId_idx" ON "ParentNotification"("studentId");

ALTER TABLE "ParentNotification" ADD CONSTRAINT "ParentNotification_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentNotification" ADD CONSTRAINT "ParentNotification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
