import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@cogna/database";
import { PersonalizedVideosService } from "../../src/personalized-videos/personalized-videos.service";
import { VideoRendererAdapter } from "../../src/personalized-videos/video-renderer.adapter";
import type { LessonEvidenceRequest } from "@cogna/shared";

const url = process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "55439" || parsed.pathname !== "/cogna_s1") throw new Error("Use only the disposable cogna_s1 database on localhost:55439.");
}
const prisma = url ? new PrismaClient({ datasourceUrl: url }) : null;
const ids: string[] = [];
function service(db = prisma!) { return new PersonalizedVideosService(db, new VideoRendererAdapter({})); }
async function setup() {
  const id = `s1_${randomUUID()}`; ids.push(id);
  await prisma!.personalizedVideoAssignment.create({ data: { id, studentId: "s1-only-learner", status: "READY", diagnosticState: "SUFFICIENT", conceptId: "factorisation", learningObjective: "Factorise a monic trinomial", evidenceSnapshot: {}, script: { lesson: { title: "Factorise", scenes: [] }, practice: { source: "CODE_GENERATED", skillId: "FAC_MONIC", items: [1, 2].map((n) => ({ id: `typed-${n}`, format: "type-answer", prompt: "Factorise", expression: "x^2+5x+6", task: "factorise", answer: "(x+2)(x+3)", hint: "Use product and sum.", workedSteps: ["(x+2)(x+3)"] })) } } } });
  const actor = { role: "student" as const, studentId: "s1-only-learner" };
  const contentVersion = (await service().practiceSet(id, actor)).learning!.contentVersion;
  const event = (extra: Partial<LessonEvidenceRequest> = {}): LessonEvidenceRequest => ({ schemaVersion: 1, eventId: randomUUID(), contentVersion, kind: "ANSWER_SUBMITTED", itemId: "typed-1", answer: { text: "(x+2)(x+3)" }, ...extra });
  return { id, actor, event };
}
after(async () => { if (prisma) { await prisma.personalizedVideoAssignment.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect(); } });
describe("typed-practice receipts on disposable PostgreSQL", { skip: !url }, () => {
  it("concurrent duplicate HTTP-style deliveries commit one immutable receipt and one attempt", async () => {
    const { id, actor, event } = await setup(); const request = event();
    const receipts = await Promise.all(Array.from({ length: 8 }, () => service().recordPracticeEvidence(id, request, actor)));
    assert.ok(receipts.every((r) => r.eventId === receipts[0]!.eventId));
    const row = await prisma!.personalizedVideoAssignment.findUniqueOrThrow({ where: { id } });
    assert.equal((row.script as any).learningEvidence.receipts.length, 1);
    assert.equal((row.script as any).practiceAttempts["typed-1"].tries, 1);
    const restarted = new PrismaClient({ datasourceUrl: url });
    try { assert.equal((await service(restarted).practiceSet(id, actor)).learning!.items["typed-1"]!.latest!.eventId, request.eventId); }
    finally { await restarted.$disconnect(); }
  });
  it("distinct concurrent items preserve both answers and aggregates", async () => {
    const { id, actor, event } = await setup();
    await Promise.all([service().recordPracticeEvidence(id, event(), actor), service().recordPracticeEvidence(id, event({ itemId: "typed-2" }), actor)]);
    const progress = (await service().practiceSet(id, actor)).learning!;
    assert.equal(progress.items["typed-1"]!.attempts, 1); assert.equal(progress.items["typed-2"]!.attempts, 1);
    assert.equal(progress.items["typed-1"]!.correct, true); assert.equal(progress.items["typed-2"]!.correct, true);
  });
  it("rolls back a write when the transaction fails before acknowledgement", async () => {
    const { id, actor, event } = await setup();
    const failing = { personalizedVideoAssignment: prisma!.personalizedVideoAssignment, $transaction: async (work: (tx: unknown) => Promise<unknown>) => prisma!.$transaction(async (tx) => { await work(tx); throw new Error("injected before commit"); }) } as unknown as PrismaClient;
    await assert.rejects(() => service(failing).recordPracticeEvidence(id, event(), actor), /injected before commit/);
    assert.equal((await service().practiceSet(id, actor)).learning!.items["typed-1"]!.attempts, 0);
  });
  it("rejects another student and stale versions; committed replay survives a content edit", async () => {
    const { id, actor, event } = await setup(); const request = event();
    const receipt = await service().recordPracticeEvidence(id, request, actor);
    await assert.rejects(() => service().recordPracticeEvidence(id, request, { role: "student", studentId: "someone-else" }));
    const row = await prisma!.personalizedVideoAssignment.findUniqueOrThrow({ where: { id } }); const script = row.script as any; script.lesson.title = "Changed";
    await prisma!.personalizedVideoAssignment.update({ where: { id }, data: { script } });
    await assert.rejects(() => service().recordPracticeEvidence(id, event({ itemId: "typed-2" }), actor), /changed/);
    assert.deepEqual(await service().recordPracticeEvidence(id, request, actor), receipt);
  });
});
