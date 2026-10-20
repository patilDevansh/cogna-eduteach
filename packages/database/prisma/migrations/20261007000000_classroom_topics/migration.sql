-- A class's topic plan (syllabus order, teaching status).
CREATE TABLE "ClassroomTopic" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "startedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomTopic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassroomTopic_classroomId_topicId_key" ON "ClassroomTopic"("classroomId", "topicId");
CREATE INDEX "ClassroomTopic_classroomId_position_idx" ON "ClassroomTopic"("classroomId", "position");

ALTER TABLE "ClassroomTopic" ADD CONSTRAINT "ClassroomTopic_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
