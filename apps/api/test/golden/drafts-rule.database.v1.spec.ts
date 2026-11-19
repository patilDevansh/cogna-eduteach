/**
 * DATA-015: the temporary rule for children's unsubmitted drafts, against the real local Postgres.
 * No person's view shows a draft; only a worker export (the family's request) carries them; drafts are
 * deleted after 30 days and with the child's data; submitted answers and other records are never touched.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, UserRole } from "@cogna/database";
import { DRAFT_EVENT, LearnerEventsService } from "../../src/learning-evidence/learner-events.service";
import { ScheduledJobsService } from "../../src/jobs/scheduled-jobs.service";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";

function localDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((p) => { try { return readFileSync(p, "utf8").includes("DATABASE_URL="); } catch { return false; } });
  const value = fromEnv || readFileSync(path!, "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="))!.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname)) throw new Error("This gate only runs against a local development database.");
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: localDatabaseUrl() });
const tag = `drafts_${Date.now()}`;
const day = 86_400_000;
const jobs = new ScheduledJobsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma as never);
let studentId = "";

const draft = (n: number, ageDays: number) => prisma.rawEvent.create({ data: {
  eventId: `${tag}-draft-${n}`, eventType: DRAFT_EVENT, studentId, sessionId: `${tag}-s`, createdAt: new Date(Date.now() - ageDays * day),
  payload: { request: { kind: "DRAFT_CHECKPOINT", questionId: "q1", draft: { candidate: `7(x+28)-${n}`, action: "ENTERED", elapsedMs: 1000 } } },
} });
const answer = (ageDays: number) => prisma.rawEvent.create({ data: {
  eventId: `${tag}-answer-${ageDays}`, eventType: "ANSWER_SUBMITTED", studentId, sessionId: `${tag}-s`, createdAt: new Date(Date.now() - ageDays * day), payload: { questionId: "q1" },
} });
const mine = (eventType: string) => prisma.rawEvent.count({ where: { studentId, eventType } });

before(async () => {
  const user = await prisma.user.create({ data: { clerkId: `${tag}_parent`, role: UserRole.PARENT, parent: { create: { name: "Parent" } } }, include: { parent: true } });
  studentId = (await prisma.student.create({ data: { primaryParentId: user.parent!.id, name: "Riya Draft", grade: 8, accessCodeHash: `${tag}-code` } })).id;
});
after(async () => {
  await prisma.rawEvent.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.$disconnect();
});

describe("children's unsubmitted drafts (DATA-015)", () => {
  it("the student's own history does not show draft text", async () => {
    await draft(1, 0);
    await answer(0);
    const history = await new LearnerEventsService(prisma as never).history(studentId);
    assert.equal(JSON.stringify(history).includes("7(x+28)"), false);
    assert.ok(history.events.some((e) => e.kind === "ANSWER_SUBMITTED"), "submitted answers still show");
  });

  it("a teacher export leaves drafts out; a worker export (the family's request) carries them", async () => {
    assert.equal(JSON.stringify(await lotus.exportStudentData(studentId)).includes("7(x+28)"), false);
    const family = await lotus.exportStudentData(studentId, true);
    assert.deepEqual(family.drafts?.map((d) => d.candidate), ["7(x+28)-1"]);
  });

  it("the nightly job deletes drafts older than 30 days and nothing else", async () => {
    await draft(2, 31);
    await answer(40);
    const { deleted } = await jobs.expireDrafts();
    assert.ok(deleted >= 1);
    assert.equal(await prisma.rawEvent.count({ where: { eventId: `${tag}-draft-2` } }), 0, "the old draft is gone");
    assert.equal(await prisma.rawEvent.count({ where: { eventId: `${tag}-draft-1` } }), 1, "a recent draft stays");
    assert.equal(await mine("ANSWER_SUBMITTED"), 2, "submitted answers are never touched, however old");
  });

  it("deleting a child's data deletes their drafts, not their answers", async () => {
    await lotus.deleteStudentData(studentId);
    assert.equal(await mine(DRAFT_EVENT), 0);
    assert.equal(await mine("ANSWER_SUBMITTED"), 2);
  });

  it("no teacher, parent or AI Studio code reads drafts: only the evidence service, deletion and export name them", () => {
    const src = resolve(__dirname, "../../src");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []);
    const naming = files(src).filter((f) => /DRAFT_EVENT|LEARNER_DRAFT_CHECKPOINT/.test(readFileSync(f, "utf8"))).map((f) => f.slice(src.length + 1)).sort();
    assert.deepEqual(naming, ["jobs/scheduled-jobs.service.ts", "learning-evidence/learner-events.service.ts", "lotus/lotus.service.ts"]);
    // Any other read of raw events must ask for named event types, never every event for a student.
    for (const f of files(src).filter((f) => !f.includes("learning-evidence"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/rawEvent\.(findMany|findFirst)\(\{[^]*?where:\s*\{([^}]*)\}/g)) {
        assert.match(m[2]!, /eventType|eventId|sessionId: runId/, `${f} reads raw events without naming a type`);
      }
    }
  });
});
