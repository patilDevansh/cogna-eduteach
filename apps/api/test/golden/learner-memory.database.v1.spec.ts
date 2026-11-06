/**
 * The learner memory against the real local Postgres (local-only, like the other database specs): a
 * finished test is remembered and a re-saved one replaces its rows, the backfill fills it from saved
 * tests, only a student's own teachers may read, export or delete it, and it goes when the student does.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { PrismaClient, UserRole } from "@cogna/database";
import type { LotusSessionView } from "@cogna/shared";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { backfillLearnerMemory, loadLearnerModel, testEvidence, writeEvidence } from "../../src/learner/learner-memory";

function localDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((p) => { try { return readFileSync(p, "utf8").includes("DATABASE_URL="); } catch { return false; } });
  const value = fromEnv || readFileSync(path!, "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="))!.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname)) throw new Error("This gate only runs against a local development database.");
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: localDatabaseUrl() });
const tag = `memory_${Date.now()}`;
const own = { role: "teacher", teacherEmail: `${tag}@school.test`, schoolId: tag } as never;
const other = { role: "teacher", teacherEmail: `${tag}-other@school.test`, schoolId: tag } as never;
const classrooms = new ClassroomsService(prisma as never);
const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma as never);
let studentId = "";

function finishedTest(sessionId: string, wrongAnswer: string): LotusSessionView {
  const audit = (skillId: string, right: boolean, answer: string) => ({
    question: { id: `${sessionId}-${skillId}-${answer}`, prompt: "Factorise x^2 - 11x + 24", answerKey: { canonicalAnswer: "(x - 3)(x - 8)", diagnostics: { skillId, taggedSkills: [], stepSkills: [skillId], expression: "x^2 - 11x + 24", itemKind: "FACTORISE", predictedMistakes: [] } } },
    response: { answer, working: "", confidence: 60, responseTimeMs: 30_000, didNotKnow: false },
    verification: { status: right ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT" },
    skillEvidence: [right ? { skillId, kind: "SECURE", source: "INSTANT" } : { skillId, kind: "MISTAKE", mistake: "SIGN_PAIR_ERROR", source: "INSTANT" }],
    createdAt: new Date().toISOString(),
  });
  return { sessionId, studentId, topic: "FACTORISATION", status: "COMPLETE", startedAt: new Date().toISOString(), finalReport: { outcome: "SOLID_GAP" },
    audits: [audit("FAC_MONIC_TRINOMIAL", false, wrongAnswer), audit("FAC_MONIC_TRINOMIAL", false, "(x + 4)(x + 6)"), audit("FAC_DIFF_SQUARES", true, "(x - 3)(x + 3)")] } as unknown as LotusSessionView;
}

before(async () => {
  for (const [email, key] of [[`${tag}@school.test`, "own"], [`${tag}-other@school.test`, "other"]] as const) {
    await prisma.user.create({ data: { clerkId: `${tag}_${key}`, role: UserRole.TEACHER, teacher: { create: { identityKey: `${tag}:${email}`, schoolId: tag, name: key } } } });
  }
  const classroom = await classrooms.create(own, { name: "8A", grade: 8, subjectId: "math" });
  const imported = await classrooms.importStudents(own, classroom.id, [{ name: "Riya Memory" }], true) as { students: Array<{ studentId: string }> };
  studentId = imported.students[0]!.studentId;
});

after(async () => {
  lotus.onModuleDestroy();
  await prisma.student.deleteMany({ where: { id: studentId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("learner memory in the database", () => {
  it("remembers a finished test, and a re-saved test replaces its own rows", async () => {
    await writeEvidence(prisma, testEvidence(finishedTest(`${tag}-t1`, "(x + 3)(x + 8)")));
    await writeEvidence(prisma, testEvidence(finishedTest(`${tag}-t1`, "(x + 2)(x + 12)")));
    const rows = await prisma.learnerSkillEvidence.findMany({ where: { studentId } });
    assert.deepEqual(rows.map((r) => r.skillId).sort(), ["*", "FAC_DIFF_SQUARES", "FAC_MONIC_TRINOMIAL"]);
    const trinomial = (await loadLearnerModel(prisma, studentId)).skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL")!;
    assert.equal(trinomial.status, "GAP");
    assert.equal(trinomial.mistakes[0]!.example.answer, "(x + 4)(x + 6)");
    assert.ok(trinomial.mistakes.every((m) => m.example.answer !== "(x + 3)(x + 8)"), "the replaced save's answers are gone");
  });

  it("a second test makes the mistake a pattern", async () => {
    await writeEvidence(prisma, testEvidence(finishedTest(`${tag}-t2`, "(x + 1)(x + 24)")));
    assert.deepEqual((await loadLearnerModel(prisma, studentId)).skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL")!.recurring, ["SIGN_PAIR_ERROR"]);
  });

  it("the backfill fills it from saved tests, and running it again changes nothing", async () => {
    await prisma.lotusSessionRecord.create({ data: { sessionId: `${tag}-t3`, studentId, status: "COMPLETE", phase: "CONFIRM", startedAt: new Date(), payload: finishedTest(`${tag}-t3`, "(x + 6)(x + 4)") as object } });
    await backfillLearnerMemory(prisma);
    const once = await prisma.learnerSkillEvidence.count({ where: { studentId } });
    await backfillLearnerMemory(prisma);
    assert.equal(await prisma.learnerSkillEvidence.count({ where: { studentId } }), once);
    assert.equal((await loadLearnerModel(prisma, studentId)).skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL")!.gapTests, 3);
  });

  it("only the student, their own teachers, or a worker may read it, export it or delete it", async () => {
    await lotus.learnerMemory(own, studentId);
    await lotus.learnerMemory({ role: "student", studentId } as never, studentId);
    await lotus.assertTeachesStudent({ role: "worker" } as never, studentId);
    await assert.rejects(lotus.learnerMemory(other, studentId), ForbiddenException);
    await assert.rejects(lotus.assertTeachesStudent(other, studentId), ForbiddenException, "another teacher can't export or delete");
    await assert.rejects(lotus.learnerMemory({ role: "student", studentId: "someone-else" } as never, studentId), ForbiddenException);
    await assert.rejects(lotus.assertTeachesStudent({ role: "student", studentId } as never, studentId), ForbiddenException, "a student can't delete their class record");
  });

  it("deleting the student's test data takes what was remembered from those tests", async () => {
    await lotus.deleteStudentData(studentId);
    assert.equal(await prisma.learnerSkillEvidence.count({ where: { studentId, source: "TEST" } }), 0);
  });
});
