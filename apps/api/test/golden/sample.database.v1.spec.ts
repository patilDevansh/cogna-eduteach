/**
 * The public sample test against the real local Postgres (same local-only gate as the other
 * database specs): a parent starts it, the analysis stays locked until payment, the free summary
 * is counts only, and a (test) payment unlocks the report and the personal lesson.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@cogna/database";
import { SampleService } from "../../src/sample/sample.service";
import { unpaidSample, SampleLockInterceptor } from "../../src/sample/sample-lock";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { lastValueFrom, of } from "rxjs";
import { PersonalizedVideosController } from "../../src/personalized-videos/personalized-videos.controller";

function configuredLocalDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return localOnly(process.env.DATABASE_URL.trim());
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((candidate) => {
    try {
      return readFileSync(candidate, "utf8").includes("DATABASE_URL=");
    } catch {
      return false;
    }
  });
  if (!path) throw new Error("No local database configuration was found for the sample-test gate.");
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  const value = line?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("DATABASE_URL is blank in the local configuration.");
  return localOnly(value);
}

function localOnly(value: string): string {
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") throw new Error("The sample-test gate only runs against a local development database.");
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: configuredLocalDatabaseUrl() });
const tag = `sample_${Date.now()}`;
const sent: Array<{ to: string; subject: string; text: string }> = [];
const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma as never);
const sample = new SampleService(prisma as never, lotus, { send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return "NOT_CONFIGURED"; }, configured: () => false } as never);
const studentIds: string[] = [];

after(async () => {
  lotus.onModuleDestroy();
  await prisma.lotusSessionRecord.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.$disconnect();
});

async function started(name = "Asha", email = `${tag}@family.test`) {
  const result = await sample.start({ parentEmail: email, childName: name, consent: true }, `${tag}-${name}`);
  studentIds.push(result.student.studentId);
  return result;
}

/** The child's finished test, as their own Lotus session would store it. */
async function finished(studentId: string) {
  const sessionId = `${tag}_${studentId}`;
  const audit = { question: { id: "q" }, verification: { status: "VERIFIED_CORRECT" }, questionSelection: { reason: "" }, conclusion: { conclusion: "secret diagnosis", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], uncertainty: [], selectionReason: "", report: undefined } };
  await prisma.lotusSessionRecord.create({
    data: {
      sessionId, studentId, status: "COMPLETE", phase: "REPORT", startedAt: new Date(), endedAt: new Date(),
      payload: { sessionId, studentId, status: "COMPLETE", topic: "FACTORISATION", grade: 8, board: "CBSE", startedAt: new Date().toISOString(), openingAudit: audit, audits: [audit, { ...audit, verification: { status: "VERIFIED_INCORRECT" } }], finalReport: { outcome: "SOLID_GAP", skills: [{ skillId: "A", name: "Common factor", state: "SECURE", evidence: [] }, { skillId: "B", name: "Difference of squares", state: "CONFIRMED", evidence: [] }] } },
    },
  });
  return sessionId;
}

describe("the public sample test", () => {
  it("needs the parent's email and consent before anything is stored", async () => {
    await assert.rejects(sample.start({ parentEmail: "not-an-email", childName: "Asha", consent: true }, "x"), /parent's email/);
    await assert.rejects(sample.start({ parentEmail: `${tag}@family.test`, childName: "Asha", consent: false }, "x"), /agree/);
    assert.equal(await prisma.sampleAttempt.count({ where: { parentEmail: `${tag}@family.test` } }), 0);
  });

  it("locks the analysis until payment, then unlocks the report, the lesson and both emails", async () => {
    const { token, student } = await started();
    assert.ok(student.sessionToken);
    assert.equal((await sample.status(token)).state, "NOT_STARTED");
    assert.equal(await unpaidSample(prisma as never, student.studentId), true);

    const sessionId = await finished(student.studentId);
    const view = await lotus.get(sessionId);
    const lockedOut = (await lastValueFrom(new SampleLockInterceptor(prisma as never).intercept({} as never, { handle: () => of(view) }))) as typeof view;
    assert.equal(lockedOut.finalReport, null, "the Lotus routes hand an unpaid sample no report");
    assert.ok(!JSON.stringify(lockedOut).includes("secret diagnosis"));

    const free = await sample.status(token);
    assert.equal(free.state, "COMPLETE");
    assert.deepEqual(free.summary, { readable: true, answered: 2, correct: 1, skillsChecked: 2, secure: 1, needWork: 1 });
    assert.equal("report" in free, false);
    assert.equal(sent.filter((m) => m.subject === "Asha's maths check is ready").length, 1, "the parent hears the result is ready");
    await sample.status(token);
    assert.equal(sent.filter((m) => m.subject === "Asha's maths check is ready").length, 1, "once");
    assert.match(sent.at(-1)!.text, new RegExp(`/try/result\\?t=${token}`));

    const lessons = new PersonalizedVideosController({ createAssignment: async () => ({ id: "lesson" }) } as never, prisma as never);
    const asChild = { "x-cogna-student-id": student.studentId, "x-cogna-student-token": student.sessionToken! };
    await assert.rejects(lessons.create(asChild, { studentId: student.studentId } as never), /Unlock the full report/, "no personal lesson before payment");

    const order = await sample.order(token);
    assert.equal(order.mode, "TEST", "no Razorpay keys locally");
    const paid = await sample.testPay(token);
    assert.equal(paid.paid, true);
    assert.equal((paid as { report?: { outcome: string } }).report?.outcome, "SOLID_GAP");
    assert.equal(await unpaidSample(prisma as never, student.studentId), false);
    assert.equal(sent.filter((m) => m.subject === "Asha's full report is unlocked").length, 1);
    const unlocked = (await lastValueFrom(new SampleLockInterceptor(prisma as never).intercept({} as never, { handle: () => of(view) }))) as typeof view;
    assert.ok(unlocked.finalReport, "after payment the Lotus routes return the full report");
    await assert.rejects(sample.order(token), /already unlocked/);
    assert.deepEqual(await lessons.create(asChild, { studentId: student.studentId } as never), { id: "lesson" }, "the lesson opens once paid");
  });

  it("refuses payment before the test is finished, and unknown links", async () => {
    const { token } = await started("Ben", `${tag}-b@family.test`);
    await assert.rejects(sample.order(token), /Finish the test first/);
    await assert.rejects(sample.testPay(token), /Finish the test first/);
    await assert.rejects(sample.status("not-a-token"), /isn't valid/);
  });

  it("offers no payment when there weren't enough answers to say anything", async () => {
    const { token, student } = await started("Cara", `${tag}-c@family.test`);
    const sessionId = `${tag}_${student.studentId}`;
    const audit = { question: { id: "q" }, verification: { status: "NO_ANSWER" }, questionSelection: { reason: "" }, conclusion: { conclusion: "", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], uncertainty: [], selectionReason: "" } };
    await prisma.lotusSessionRecord.create({ data: { sessionId, studentId: student.studentId, status: "COMPLETE", phase: "REPORT", startedAt: new Date(), endedAt: new Date(), payload: { sessionId, studentId: student.studentId, status: "COMPLETE", topic: "FACTORISATION", grade: 8, board: "CBSE", startedAt: new Date().toISOString(), openingAudit: audit, audits: [audit], finalReport: { outcome: "INSUFFICIENT_OR_CONFLICTING", skills: [{ skillId: "A", name: "x", state: "UNTESTED", evidence: [] }] } } } });
    assert.equal((await sample.status(token)).summary?.readable, false);
    await assert.rejects(sample.order(token), /weren't enough answers/);
  });

  it("limits how many tests one email and one network can start", async () => {
    const email = `${tag}-limit@family.test`;
    for (let i = 0; i < 3; i++) studentIds.push((await sample.start({ parentEmail: email, childName: `Kid ${i}`, consent: true }, `${tag}-mail-${i}`)).student.studentId);
    await assert.rejects(sample.start({ parentEmail: email, childName: "Kid 4", consent: true }, `${tag}-mail-4`), /three sample tests today/);
    for (let i = 0; i < 5; i++) studentIds.push((await sample.start({ parentEmail: `${tag}-net${i}@family.test`, childName: "Net", consent: true }, `${tag}-net`)).student.studentId);
    await assert.rejects(sample.start({ parentEmail: `${tag}-net9@family.test`, childName: "Net", consent: true }, `${tag}-net`), /this network/);
  });
});
