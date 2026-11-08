/**
 * DATA-014: a lesson's independent final check is saved exactly once, against the real local Postgres.
 * Two simultaneous submissions make one record; a retry after a lost reply gets the original result back;
 * a different second answer is refused; old rows stay readable; duplicates already stored are surfaced.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException } from "@nestjs/common";
import { PersonalizedVideoAssignmentStatus, PersonalizedVideoEvidenceKind, PrismaClient, UserRole } from "@cogna/database";
import { PersonalizedVideosService } from "../../src/personalized-videos/personalized-videos.service";
import { VideoRendererAdapter } from "../../src/personalized-videos/video-renderer.adapter";

function localDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((p) => { try { return readFileSync(p, "utf8").includes("DATABASE_URL="); } catch { return false; } });
  const value = fromEnv || readFileSync(path!, "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="))!.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname)) throw new Error("This gate only runs against a local development database.");
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: localDatabaseUrl() });
const videos = new PersonalizedVideosService(prisma as never, new VideoRendererAdapter({}));
const tag = `exitonce_${Date.now()}`;
let studentId = "";
const student = () => ({ role: "student", studentId } as never);

async function lesson(): Promise<string> {
  const row = await prisma.personalizedVideoAssignment.create({
    data: {
      studentId, status: PersonalizedVideoAssignmentStatus.READY, diagnosticState: "supported-gap", conceptId: "FAC_MONIC_TRINOMIAL",
      learningObjective: "Factorise x² + bx + c", evidenceSnapshot: {}, scriptSource: "APPROVED_TEMPLATE",
      script: {
        name: "Riya", learnerDecision: "", teacherDecision: "", uncertainty: "Moderate", statusLabel: "Targeted bridge",
        lesson: { title: "Read the signs first", duration: "About 1 min", objective: "Factorise", generationReason: "", verification: "", scenes: [] },
        exit: { prompt: "Factorise x^2 - 9x + 8.", expected: "(x - 1)(x - 8)", evidencePurpose: "" },
        exitCheck: { task: "factorise", expression: "x^2 - 9x + 8" },
      },
    },
  });
  return row.id;
}

const exits = (assignmentId: string) => prisma.personalizedVideoEvent.findMany({ where: { assignmentId, kind: PersonalizedVideoEvidenceKind.INDEPENDENT_EXIT } });

before(async () => {
  const user = await prisma.user.create({ data: { clerkId: `${tag}_parent`, role: UserRole.PARENT, parent: { create: { name: "Parent" } } }, include: { parent: true } });
  studentId = (await prisma.student.create({ data: { primaryParentId: user.parent!.id, name: "Riya Exit", grade: 8, accessCodeHash: `${tag}-code` } })).id;
});
after(async () => {
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.$disconnect();
});

describe("a lesson's final check is saved exactly once", () => {
  it("two simultaneous submissions make one record and one outcome, enforced by the database", async () => {
    const id = await lesson();
    const send = () => videos.recordExit(id, { answer: "(x - 1)(x - 8)", working: "pair -1 and -8", submissionId: `${tag}-a` }, student());
    const results = await Promise.allSettled([send(), send(), send()]);
    assert.ok(results.every((r) => r.status === "fulfilled"), "the same submission sent three times is one answer, not two errors");
    const rows = await exits(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.exitCorrect, true);
  });

  it("a retry after a lost reply gets the original result back, not an error", async () => {
    const id = await lesson();
    const first = await videos.recordExit(id, { answer: "(x + 1)(x + 8)", working: "pair 1 and 8", submissionId: `${tag}-b` }, student());
    const retry = await videos.recordExit(id, { answer: "(x + 1)(x + 8)", working: "pair 1 and 8", submissionId: `${tag}-b` }, student());
    assert.deepEqual(retry.exitAttempt, first.exitAttempt);
    assert.equal((await exits(id)).length, 1);
  });

  it("a different second answer is refused: one attempt is one attempt", async () => {
    const id = await lesson();
    await videos.recordExit(id, { answer: "(x - 1)(x - 8)", working: "w", submissionId: `${tag}-c1` }, student());
    await assert.rejects(videos.recordExit(id, { answer: "(x - 2)(x - 4)", working: "w", submissionId: `${tag}-c2` }, student()), ConflictException);
    // The same id with a changed answer is a different submission too, not a replay.
    await assert.rejects(videos.recordExit(id, { answer: "(x - 2)(x - 4)", working: "w", submissionId: `${tag}-c1` }, student()), ConflictException);
  });

  it("records the submission id, question, content version, server time and that no help was offered", async () => {
    const id = await lesson();
    await videos.recordExit(id, { answer: "(x - 1)(x - 8)", working: "w", submissionId: `${tag}-d` }, student());
    const row = (await exits(id))[0]!;
    assert.equal(row.submissionId, `${tag}-d`);
    assert.equal(row.exitPrompt, "Factorise x^2 - 9x + 8.");
    assert.match(row.contentVersion ?? "", /^[0-9a-f]{16,}$/);
    assert.equal(row.helpStatus, "NONE_OFFERED");
    assert.ok(row.createdAt instanceof Date);
  });

  it("an older client without a submission id still saves once; old rows stay readable with unknown fields unknown", async () => {
    const id = await lesson();
    await videos.recordExit(id, { answer: "(x - 1)(x - 8)", working: "w" }, student());
    await assert.rejects(videos.recordExit(id, { answer: "(x - 1)(x - 8)", working: "w" }, student()), ConflictException);
    const legacy = await lesson();
    await prisma.personalizedVideoEvent.create({ data: { assignmentId: legacy, studentId, kind: PersonalizedVideoEvidenceKind.INDEPENDENT_EXIT, exitPrompt: "old", exitAnswer: "(x - 1)(x - 8)", exitCorrect: true } });
    const view = await videos.getAssignment(legacy, student());
    assert.equal(view.exitAttempt?.correct, true);
    const row = (await exits(legacy))[0]!;
    assert.equal(row.submissionId, null);
    assert.equal(row.helpStatus, null);
  });

  it("duplicates already stored are surfaced, not deleted", async () => {
    const id = await lesson();
    for (const answer of ["(x - 1)(x - 8)", "(x + 1)(x + 8)"]) {
      await prisma.personalizedVideoEvent.create({ data: { assignmentId: id, studentId, kind: PersonalizedVideoEvidenceKind.INDEPENDENT_EXIT, exitAnswer: answer, exitCorrect: answer.startsWith("(x -") } });
    }
    const found = await videos.duplicateExits();
    const mine = found.find((d) => d.assignmentId === id);
    assert.ok(mine && mine.count === 2, JSON.stringify(found));
    assert.equal((await exits(id)).length, 2, "nothing was deleted");
  });
});
