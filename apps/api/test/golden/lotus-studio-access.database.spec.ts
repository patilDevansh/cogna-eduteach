import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { it } from "node:test";
import { PrismaClient } from "@cogna/database";
import { LotusStudioService } from "../../src/lotus/lotus-studio.service";

const url = process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL;
const allowed = !!url && new URL(url).hostname === "127.0.0.1" && new URL(url).port === "55439" && new URL(url).pathname === "/cogna_s1";

it("shows only an owned class diagnostic and revokes access after a teacher change", { skip: !allowed }, async () => {
  const db = new PrismaClient({ datasourceUrl: url! });
  const prefix = `studio_${randomUUID()}`;
  const schoolId = `${prefix}_school`;
  const studentId = `${prefix}_student`;
  const email = `${prefix}@example.test`;
  const otherEmail = `${prefix}_other@example.test`;
  const sessionId = `${prefix}_session`;
  const standaloneSessionId = `${prefix}_standalone`;
  const owned = { role: "teacher" as const, teacherEmail: email, schoolId };
  const other = { role: "teacher" as const, teacherEmail: otherEmail, schoolId };
  try {
    await db.student.create({ data: { id: studentId, primaryParentId: `${prefix}_parent`, name: "Synthetic learner", accessCodeHash: "studio-fixture" } });
    const user = await db.user.create({ data: { role: "TEACHER", email } });
    const teacher = await db.teacher.create({ data: { identityKey: `${schoolId}:${email}`, userId: user.id, schoolId, name: "Class teacher" } });
    const otherUser = await db.user.create({ data: { role: "TEACHER", email: otherEmail } });
    const otherTeacher = await db.teacher.create({ data: { identityKey: `${schoolId}:${otherEmail}`, userId: otherUser.id, schoolId, name: "Other teacher" } });
    const classroom = await db.classroom.create({ data: { teacherId: teacher.id, schoolId, name: "Synthetic Grade 8", grade: 8, subjectId: "math", joinCode: `ST${randomUUID().replaceAll("-", "").slice(0, 10)}` } });
    const enrollment = await db.classroomEnrollment.create({ data: { classroomId: classroom.id, studentId } });
    const run = await db.classroomRun.create({ data: { classroomId: classroom.id, title: "Synthetic diagnostic", topicId: "factorisation" } });
    const assignment = await db.classroomAssignment.create({ data: { runId: run.id, enrollmentId: enrollment.id, kind: "DIAGNOSTIC" } });
    await db.lotusSessionRecord.createMany({ data: [
      { sessionId, studentId, status: "ACTIVE", phase: "CHECK", startedAt: new Date(), payload: { sessionId, studentId, classroomAssignmentId: assignment.id, topic: "FACTORISATION", audits: [] } },
      { sessionId: standaloneSessionId, studentId, status: "ACTIVE", phase: "CHECK", startedAt: new Date(), payload: { sessionId: standaloneSessionId, studentId, topic: "FACTORISATION", audits: [] } },
    ] });
    const studio = new LotusStudioService(db as any);
    const listed = await studio.listClassSessions(owned, classroom.id);
    assert.deepEqual(listed.map(item => item.sessionId), [sessionId]);
    assert.equal(listed[0]?.studentName, "Synthetic learner");
    await studio.assertCanObserve(owned, { studentId, classroomAssignmentId: assignment.id });
    await assert.rejects(() => studio.assertCanObserve(other, { studentId, classroomAssignmentId: assignment.id }));
    await assert.rejects(() => studio.listClassSessions(other, classroom.id));
    await assert.rejects(() => studio.assertCanObserve(owned, { studentId }));
    await assert.rejects(() => studio.assertCanObserve({ role: "student", studentId }, { studentId, classroomAssignmentId: assignment.id }));
    await db.classroom.update({ where: { id: classroom.id }, data: { teacherId: otherTeacher.id } });
    await assert.rejects(() => studio.assertCanObserve(owned, { studentId, classroomAssignmentId: assignment.id }));
    await assert.rejects(() => studio.listClassSessions(owned, classroom.id));
    await studio.assertCanObserve(other, { studentId, classroomAssignmentId: assignment.id });
    if (process.env.NODE_ENV !== "production") {
      const demoStudentId = `demo_${randomUUID().replaceAll("-", "")}`;
      const demoSessionId = `${prefix}_demo_session`;
      try {
        await db.lotusSessionRecord.create({ data: { sessionId: demoSessionId, studentId: demoStudentId, status: "ACTIVE", phase: "CHECK", startedAt: new Date(), payload: { sessionId: demoSessionId, studentId: demoStudentId, topic: "FACTORISATION", audits: [] } } });
        const demoTeacher = { role: "teacher" as const, teacherEmail: "ananya@gurukul.edu", schoolId: "gurukul-pilot" };
        assert.ok((await studio.listDevDemoSessions(demoTeacher)).some(item => item.sessionId === demoSessionId));
        await studio.assertCanObserve(demoTeacher, { studentId: demoStudentId });
        await assert.rejects(() => studio.assertCanObserve(demoTeacher, { studentId: demoStudentId }, false));
        await assert.rejects(() => studio.listDevDemoSessions(other));
      } finally {
        await db.lotusSessionRecord.deleteMany({ where: { sessionId: demoSessionId } });
      }
    }
  } finally {
    await db.lotusSessionRecord.deleteMany({ where: { sessionId: { in: [sessionId, standaloneSessionId] } } });
    await db.classroom.deleteMany({ where: { schoolId } });
    await db.teacher.deleteMany({ where: { schoolId } });
    await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await db.student.deleteMany({ where: { id: studentId } });
    await db.$disconnect();
  }
});
