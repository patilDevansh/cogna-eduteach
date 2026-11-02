-- Lotus themes: a student's chosen look, and a teacher's optional lock for the whole class.
ALTER TABLE "Student" ADD COLUMN "lotusTheme" TEXT;
ALTER TABLE "Classroom" ADD COLUMN "lockedTheme" TEXT;
