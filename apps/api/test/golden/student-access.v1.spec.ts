import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { issueStudentToken, issueTeacherToken } from "../../src/access/cogna-access";
import { StudentAccessService } from "../../src/access/student-access.service";

process.env.COGNA_SESSION_SECRET = process.env.COGNA_SESSION_SECRET ?? "test-session-secret";
process.env.COGNA_JOB_WORKER_TOKEN = "test-worker-token";

const asStudent = (id: string) => ({ "x-cogna-student-id": id, "x-cogna-student-token": issueStudentToken(id) });
const asTeacher = (schoolId: string) => ({ "x-cogna-teacher-token": issueTeacherToken("t@school.test", schoolId) });
const asWorker = { authorization: "Bearer test-worker-token" };

const prisma = {
  learningSession: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "sess-a" ? { studentId: "demo_aarav" } : null) },
  diagnosticV2Session: { findUnique: async () => ({ studentId: "demo_aarav" }) },
  student: { count: async ({ where }: { where: { id: string } }) => (where.id === "demo_aarav" ? 1 : 0) },
};
const clerk = { resolveParentId: async () => "parent-1" };
const access = new StudentAccessService(prisma as never, clerk as never);

describe("per-student access", () => {
  it("nobody signed in gets nothing", async () => {
    await assert.rejects(() => access.read({}, "demo_aarav"), UnauthorizedException);
    assert.throws(() => access.write({}, "demo_aarav"), UnauthorizedException);
  });

  it("a student reads and writes only their own records", async () => {
    await access.read(asStudent("demo_aarav"), "demo_aarav");
    access.write(asStudent("demo_aarav"), "demo_aarav");
    await assert.rejects(() => access.read(asStudent("demo_meena"), "demo_aarav"), ForbiddenException);
    assert.throws(() => access.write(asStudent("demo_meena"), "demo_aarav"), ForbiddenException);
  });

  it("a teacher reads students in their school but cannot act as them", async () => {
    await access.read(asTeacher("gurukul-pilot"), "demo_aarav");
    await assert.rejects(() => access.read(asTeacher("other-school"), "demo_aarav"), ForbiddenException);
    assert.throws(() => access.write(asTeacher("gurukul-pilot"), "demo_aarav"), ForbiddenException);
  });

  it("a forged student token is rejected, not treated as anonymous", async () => {
    await assert.rejects(() => access.read({ "x-cogna-student-id": "demo_aarav", "x-cogna-student-token": "v1.forged.mac" }, "demo_aarav"), UnauthorizedException);
  });

  it("the worker can do anything", async () => {
    await access.read(asWorker, "demo_aarav");
    access.write(asWorker, "demo_aarav");
  });

  it("parents only where allowed, and only for their linked student", async () => {
    await assert.rejects(() => access.read({ "x-parent-id": "parent-1" }, "demo_aarav"), UnauthorizedException);
    await access.read({ "x-parent-id": "parent-1" }, "demo_aarav", { allowParent: true });
    await assert.rejects(() => access.read({ "x-parent-id": "parent-1" }, "demo_meena", { allowParent: true }), ForbiddenException);
  });

  it("practice events must use the student's own session", async () => {
    assert.equal(await access.writeLearningSession(asStudent("demo_aarav"), "sess-a", "demo_aarav"), "demo_aarav");
    await assert.rejects(() => access.writeLearningSession(asStudent("demo_meena"), "sess-a", "demo_meena"), ForbiddenException);
    await assert.rejects(() => access.writeLearningSession(asStudent("demo_aarav"), "missing"), NotFoundException);
  });
});
