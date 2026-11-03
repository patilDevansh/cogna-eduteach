import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";
import { PersonalizedVideosService } from "../../src/personalized-videos/personalized-videos.service";
import { VideoRendererAdapter } from "../../src/personalized-videos/video-renderer.adapter";
import { evidenceHash, lessonContentVersion, validateLessonEvidence } from "../../src/personalized-videos/lesson-evidence";
import type { LessonEvidenceRequest } from "@cogna/shared";

const item = { id: "typed-1", format: "type-answer", prompt: "Factorise", expression: "x^2+5x+6", task: "factorise", answer: "(x+2)(x+3)", hint: "Find two numbers with product 6 and sum 5.", workedSteps: ["2 × 3 = 6", "2 + 3 = 5", "(x+2)(x+3)"] };
export function evidenceScript() { return { name: "Test student", lesson: { title: "Factorisation", scenes: [] }, practice: { source: "CODE_GENERATED", skillId: "FAC_MONIC", items: [item] } }; }
async function setup() {
  const db = createPersonalizedVideoMemoryDb();
  await db.personalizedVideoAssignment.create({ data: { id: "evidence-lesson", studentId: "learner-a", schoolId: "test-school", status: "READY", conceptId: "factorisation", lotusSessionId: null, script: evidenceScript() } });
  const service = new PersonalizedVideosService(db as never, new VideoRendererAdapter({}));
  const actor = { role: "student" as const, studentId: "learner-a" };
  const version = (await service.practiceSet("evidence-lesson", actor)).learning!.contentVersion;
  const event = (suffix: string, extra: Partial<LessonEvidenceRequest> = {}): LessonEvidenceRequest => ({ schemaVersion: 1, eventId: `receipt-event-${suffix}`, contentVersion: version, kind: "ANSWER_SUBMITTED", itemId: "typed-1", answer: { text: "(x+2)(x+3)" }, ...extra });
  return { db, service, actor, version, event };
}

describe("versioned typed-practice evidence", () => {
  it("validates runtime shape, bounds and action-specific fields", () => {
    const base = { schemaVersion: 1, eventId: "event-123456789012", contentVersion: "a".repeat(64), kind: "ANSWER_SUBMITTED", itemId: "typed-1", answer: { text: "x" } };
    assert.equal(validateLessonEvidence(base).schemaVersion, 1);
    for (const change of [{ schemaVersion: 2 }, { kind: "OTHER" }, { kind: ["ANSWER_SUBMITTED"] }, { studentId: "injected" }, { answer: { text: "" } }, { answer: { option: 1 } }, { itemId: undefined }, { clientOccurredAt: "bad" }, { kind: "PRESENTED" }, { eventId: "x" }]) assert.throws(() => validateLessonEvidence({ ...base, ...change }));
  });
  it("hashes immutable content but excludes saved progress; object key order is stable", () => {
    const script = evidenceScript(); const version = lessonContentVersion(script);
    assert.equal(lessonContentVersion({ ...script, practiceAttempts: { x: 1 }, learningEvidence: { receipts: [] } }), version);
    assert.notEqual(lessonContentVersion({ ...script, practice: { ...script.practice, items: [{ ...item, hint: "different" }] } }), version);
    assert.equal(evidenceHash({ a: 1, b: 2 }), evidenceHash({ b: 2, a: 1 }));
  });
  it("links actual presentation and one saved answer; replays without duplicate tries after restart", async () => {
    const { db, service, actor, event } = await setup();
    await service.recordPracticeEvidence("evidence-lesson", event("lesson-presented", { kind: "PRESENTED", itemId: undefined, answer: undefined }), actor);
    const display = await service.recordPracticeEvidence("evidence-lesson", event("item-presented", { kind: "PRESENTED", answer: undefined }), actor);
    const request = event("first-answer");
    const receipt = await service.recordPracticeEvidence("evidence-lesson", request, actor);
    assert.equal(receipt.purpose, "PRACTICE"); assert.equal(receipt.assistance, "NONE_RECORDED");
    assert.equal(receipt.exposureEventId, display.eventId); assert.ok(receipt.lessonExposureEventId);
    const restarted = new PersonalizedVideosService(db as never, new VideoRendererAdapter({}));
    assert.deepEqual(await restarted.recordPracticeEvidence("evidence-lesson", request, actor), receipt);
    const progress = (await restarted.practiceSet("evidence-lesson", actor)).learning!;
    assert.equal(progress.items["typed-1"]!.attempts, 1); assert.equal(progress.items["typed-1"]!.firstTry, true);
    assert.equal((db._store.assignments.get("evidence-lesson")!.script as any).learningEvidence.receipts.length, 3);
  });
  it("rejects changed payload replay, stale content, other learner and teacher mutation", async () => {
    const { service, actor, event } = await setup(); const request = event("first-answer");
    await service.recordPracticeEvidence("evidence-lesson", request, actor);
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", { ...request, answer: { text: "x" } }, actor), /different work/);
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", event("stale-answer", { contentVersion: "b".repeat(64) }), actor), /changed/);
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", request, { role: "student", studentId: "learner-b" }));
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", request, { role: "teacher", teacherEmail: "test@example.com", schoolId: "test-school" }));
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", request, { role: "worker" }));
  });
  it("keeps issued hints and wrong-answer feedback distinct from no recorded help", async () => {
    const { service, actor, event } = await setup();
    const hint = await service.recordPracticeEvidence("evidence-lesson", event("hint-request", { kind: "HINT_REQUESTED", answer: undefined }), actor);
    assert.match(hint.hint!, /product/);
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", event("bad-support", { kind: "PRESENTED", answer: undefined, supportEventId: "missing-support-1234" }), actor), /does not match/);
    const answer = await service.recordPracticeEvidence("evidence-lesson", event("helped-answer"), actor);
    assert.equal(answer.assistance, "ISSUED");
    assert.equal((await service.practiceSet("evidence-lesson", actor)).learning!.items["typed-1"]!.firstTry, false);
    const fresh = await setup();
    await fresh.service.recordPracticeEvidence("evidence-lesson", fresh.event("wrong-answer", { answer: { text: "x+6" } }), fresh.actor);
    const afterFeedback = await fresh.service.recordPracticeEvidence("evidence-lesson", fresh.event("later-answer"), fresh.actor);
    assert.equal(afterFeedback.assistance, "ISSUED");
  });
  it("keeps legacy help and absent exposure unknown; doesn't backfill historical viewing", async () => {
    const { db, service, actor, event } = await setup();
    const row = db._store.assignments.get("evidence-lesson")!;
    row.script = { ...(row.script as object), practiceAttempts: { "typed-1": { tries: 2, correct: false } } };
    const receipt = await service.recordPracticeEvidence("evidence-lesson", event("legacy-answer"), actor);
    assert.equal(receipt.assistance, "UNKNOWN"); assert.equal(receipt.exposureEventId, null);
    assert.equal(receipt.lessonExposureEventId, null); assert.equal(receipt.skillMapVersion, null);
    assert.equal((await service.practiceSet("evidence-lesson", actor)).learning!.items["typed-1"]!.firstTry, false);
  });
  it("serialises duplicates and rolls back failed saves", async () => {
    const { db, service, actor, event } = await setup(); const request = event("parallel-answer");
    const [a, b] = await Promise.all([service.recordPracticeEvidence("evidence-lesson", request, actor), service.recordPracticeEvidence("evidence-lesson", request, actor)]);
    assert.deepEqual(a, b);
    const fresh = await setup(); const update = fresh.db.personalizedVideoAssignment.update;
    fresh.db.personalizedVideoAssignment.update = async (args) => { await update(args); throw new Error("storage failure"); };
    await assert.rejects(() => fresh.service.recordPracticeEvidence("evidence-lesson", fresh.event("failed-answer"), fresh.actor), /storage failure/);
    assert.equal((await fresh.service.practiceSet("evidence-lesson", fresh.actor)).learning!.items["typed-1"]!.attempts, 0);
  });
  it("does not accept evidence while lesson authoring is still pending", async () => {
    const { db, service, actor, event } = await setup();
    const row = db._store.assignments.get("evidence-lesson")!;
    row.script = { ...(row.script as object), authoring: { status: "pending" } };
    await assert.rejects(() => service.recordPracticeEvidence("evidence-lesson", event("pending-author"), actor), /still being prepared/);
  });
});
