import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";
import { PersonalizedVideosService } from "../../src/personalized-videos/personalized-videos.service";
import { VideoRendererAdapter } from "../../src/personalized-videos/video-renderer.adapter";
import { MAX_LAB_EVENTS, mistakeLabForBrief, mistakeLabInputs, readLabEvent } from "../../src/personalized-videos/mistake-lab";

const item = (expression: string, studentAnswer: string) => ({ expression, studentAnswer });

describe("mistake lab in the lesson step: which lesson gets it", () => {
  it("draws the first of the student's wrong answers that it can, and one more level of help after a failed lesson", () => {
    const brief = { studentItems: [item("(y - 5)^2", "y^2 + 25"), item("(x + 6)^2", "x^2 + 36"), item("(x + 3)^2", "x^2 + 3x + 9")] };
    assert.deepEqual(
      (({ mineV, mineN, mineMistake, help }) => ({ mineV, mineN, mineMistake, help }))(mistakeLabForBrief(brief)!),
      { mineV: "x", mineN: 6, mineMistake: "SQUARE_DISTRIBUTES", help: 2 },
    );
    assert.equal(mistakeLabForBrief(brief, { lessonFailedBefore: true })?.help, 1);
  });

  it("gives no lab when none of the answers is one it draws", () => {
    assert.equal(mistakeLabForBrief({ studentItems: [] }), null);
    assert.equal(mistakeLabForBrief({ studentItems: [item("x^2+5x+6", "(x+2)(x+4)"), item("(x + 6)^2", "x^2 + 12x + 36")] }), null);
  });
});

describe("mistake lab in the lesson step: what the lab reports", () => {
  it("keeps only known events and bounded fields", () => {
    const at = new Date("2026-11-28T10:00:00Z");
    assert.deepEqual(readLabEvent({ event: "wrong", step: 2, answer: " 6 ", mistake: "MIDDLE_NOT_DOUBLED", studentId: "someone-else" }, at),
      { event: "wrong", step: 2, answer: "6", mistake: "MIDDLE_NOT_DOUBLED", at: at.toISOString() });
    assert.deepEqual(readLabEvent({ event: "complete", step: 99, mistake: "not a code" }, at), { event: "complete", at: at.toISOString() });
    for (const bad of [null, {}, { event: "mastered" }, { event: ["right"] }, "right"]) assert.equal(readLabEvent(bad), null);
  });

  async function setup(withLab = true) {
    const db = createPersonalizedVideoMemoryDb();
    const lab = mistakeLabInputs("(x + 6)^2", "x^2 + 36")!;
    const script = { name: "Test student", lesson: { title: "(a + b)²", scenes: [] }, ...(withLab ? { lab } : {}) };
    await db.personalizedVideoAssignment.create({ data: { id: "lab-lesson", studentId: "learner-a", schoolId: "test-school", status: "READY", conceptId: "algebraic-expressions", lotusSessionId: null, script } });
    return { db, service: new PersonalizedVideosService(db as never, new VideoRendererAdapter({})), actor: { role: "student" as const, studentId: "learner-a" } };
  }

  it("shows the lab on the lesson, saves what it reports, and marks it done once complete", async () => {
    const { db, service, actor } = await setup();
    const before = await service.getAssignment("lab-lesson", actor);
    assert.deepEqual(before.lab, { chapter: "algebraic-expressions", lesson: 4, inputs: { mineV: "x", mineN: 6, mineSaid: "x² + 36", mineMistake: "SQUARE_DISTRIBUTES", help: 2 }, done: false });
    assert.deepEqual(await service.recordLabEvent("lab-lesson", { event: "wrong", step: 2, answer: "6", mistake: "MIDDLE_NOT_DOUBLED" }, actor), { saved: true, done: false });
    assert.deepEqual(await service.recordLabEvent("lab-lesson", { event: "complete", step: 3 }, actor), { saved: true, done: true });
    assert.equal((await service.getAssignment("lab-lesson", actor)).lab?.done, true);
    const row = await db.personalizedVideoAssignment.findUnique({ where: { id: "lab-lesson" } });
    assert.deepEqual((row!.script as { labEvents: Array<{ event: string }> }).labEvents.map((e) => e.event), ["wrong", "complete"]);
  });

  it("is engagement only: no exit attempt, no practice evidence, nothing marked watched or completed", async () => {
    const { service, actor } = await setup();
    await service.recordLabEvent("lab-lesson", { event: "right", step: 3, answer: "14" }, actor);
    const view = await service.getAssignment("lab-lesson", actor);
    assert.equal(view.exitAttempt, null);
    assert.equal(view.watched, false);
    assert.equal(view.completed, false);
  });

  it("refuses another student, a teacher, a lesson with no lab, an unknown event, and stops saving when full", async () => {
    const { db, service, actor } = await setup();
    await assert.rejects(service.recordLabEvent("lab-lesson", { event: "right" }, { role: "student", studentId: "learner-b" }), /not|own|Forbidden/i);
    await assert.rejects(service.recordLabEvent("lab-lesson", { event: "right" }, { role: "teacher", teacherId: "t1" } as never), /Only the assigned student/);
    await assert.rejects(service.recordLabEvent("lab-lesson", { event: "mastered" }, actor), /Unknown lab event/);
    const full = Array.from({ length: MAX_LAB_EVENTS }, () => ({ event: "wrong", at: "2026-11-28T10:00:00.000Z" }));
    const row = await db.personalizedVideoAssignment.findUnique({ where: { id: "lab-lesson" } });
    await db.personalizedVideoAssignment.update({ where: { id: "lab-lesson" }, data: { script: { ...(row!.script as object), labEvents: full } } });
    assert.deepEqual(await service.recordLabEvent("lab-lesson", { event: "complete" }, actor), { saved: false, done: true });
    const noLab = await setup(false);
    await assert.rejects(noLab.service.recordLabEvent("lab-lesson", { event: "right" }, noLab.actor), /no lab/);
    assert.equal((await noLab.service.getAssignment("lab-lesson", noLab.actor)).lab, null);
  });
});
