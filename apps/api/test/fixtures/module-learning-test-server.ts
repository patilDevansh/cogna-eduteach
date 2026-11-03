/** Opt-in, provider-free browser fixture for the teaching-first reference slice. */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@cogna/database";
import { ModuleLearningModule } from "../../src/module-learning/module-learning.module";
import { issueStudentToken, issueTeacherToken } from "../../src/access/cogna-access";

async function main() {
  const url = process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL;
  if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/cogna_s1") throw new Error("Disposable 127.0.0.1:55439/cogna_s1 database required.");
  process.env.DATABASE_URL = url;
  process.env.MODULE_LEARNING_ENABLED = "true";
  process.env.COGNA_SESSION_SECRET = "module-learning-local-synthetic-only-secret";
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = `module_browser_${randomUUID()}`;
  const studentId = `${prefix}_student`;
  const schoolId = `${prefix}_school`;
  const teacherEmail = `${prefix}@example.test`;
  await db.student.create({ data: { id: studentId, primaryParentId: `${prefix}_parent`, name: "Synthetic module learner", accessCodeHash: "fixture" } });
  const user = await db.user.create({ data: { role: "TEACHER", email: teacherEmail } });
  const teacher = await db.teacher.create({ data: { identityKey: `${schoolId}:${teacherEmail}`, userId: user.id, schoolId, name: "Synthetic teacher" } });
  const classroom = await db.classroom.create({ data: { teacherId: teacher.id, schoolId, name: "Synthetic Grade 8", grade: 8, subjectId: "math", joinCode: `ML${randomUUID().replaceAll("-", "").slice(0, 10)}` } });
  await db.classroomEnrollment.create({ data: { classroomId: classroom.id, studentId } });
  const app = await NestFactory.create(ModuleLearningModule);
  app.enableCors({ origin: "http://127.0.0.1:4332" });
  await app.listen(4333, "127.0.0.1");
  const fixture = { studentId, studentToken: issueStudentToken(studentId), teacherToken: issueTeacherToken(teacherEmail, schoolId), classroomId: classroom.id };
  await writeFile("/tmp/cogna-module-browser-fixture.json", JSON.stringify(fixture));
  console.log("Synthetic module API ready at 127.0.0.1:4333");
  const stop = async () => {
    await app.close();
    await db.rawEvent.deleteMany({ where: { studentId, eventType: { startsWith: "MODULE_" } } });
    await db.classroomEnrollment.deleteMany({ where: { studentId } });
    await db.classroom.delete({ where: { id: classroom.id } });
    await db.teacher.delete({ where: { id: teacher.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.student.delete({ where: { id: studentId } });
    await db.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
main().catch(error => { console.error(error); process.exitCode = 1; });
