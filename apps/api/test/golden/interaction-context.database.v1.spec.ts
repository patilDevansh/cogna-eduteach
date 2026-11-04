import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInteractionFixture, isolatedDatabase, sampleContext } from "../../../../scripts/interaction-test-fixture";
import { LotusService } from "../../src/lotus/lotus.service";
import { loadLotusSession } from "../../src/lotus/lotus-persistence";
import { issueStudentToken } from "../../src/access/cogna-access";

describe("interaction context durable readback", { skip: !process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL }, () => {
  it("exercise commits context once despite downstream failure/retry; rejects changed evidence and wrong student", async () => {
    const db = isolatedDatabase(); const f = await createInteractionFixture(db);
    try {
      const request = { eventId: `${f.sessionId}_event`, eventType: "ANSWER_SUBMITTED" as const, studentId: f.studentId, sessionId: f.sessionId, questionId: f.questionId, questionVersion: 1, submittedAnswer: "5", timeToFirstResponseMs: 0, totalTimeMs: 3000, idleTimeMs: 0, attemptNumber: 1, hintCount: 0, highestHintLevel: 0, selfRatedConfidence: null, answerChangedBeforeSubmit: false, clientTimestamp: new Date().toISOString(), interactionContext: sampleContext("EXERCISE", f.questionId) };
      await Promise.all(Array.from({ length: 4 }, () => assert.rejects(() => f.practice.submitAnswer(f.headers, request), (e: any) => e.getStatus() === 503)));
      for (let i=0; i<2; i++) await assert.rejects(() => f.practice.submitAnswer(f.headers, request), (e: any) => e.getStatus() === 503);
      assert.equal(await db.attempt.count({ where: { eventId: request.eventId } }), 1);
      assert.equal(await db.rawEvent.count({ where: { eventId: request.eventId } }), 1);
      const restarted = isolatedDatabase();
      try {
        const raw = await restarted.rawEvent.findUniqueOrThrow({ where: { eventId: request.eventId } });
        assert.deepEqual((raw.payload as any).interactionContext, request.interactionContext);
        const attempt = await restarted.attempt.findUniqueOrThrow({ where: { eventId: request.eventId } });
        assert.equal(attempt.processingStatus, "FAILED_RETRYABLE"); assert.equal(attempt.selfRatedConfidence, null);
      } finally { await restarted.$disconnect(); }
      const cached = { processingStatus: "DECISION_MADE", grade: "CORRECT", isCorrect: true, attemptId: "fixture-cached" };
      await db.attempt.update({ where: { eventId: request.eventId }, data: { storedResponse: cached } });
      await db.rawEvent.update({ where: { eventId: request.eventId }, data: { payload: { ...request, storedResponse: cached } } });
      assert.deepEqual(await f.practice.submitAnswer(f.headers, request), cached, "server-enriched raw payload must still replay the original response");
      await assert.rejects(() => f.practice.submitAnswer(f.headers, { ...request, submittedAnswer: "6" }), (e: any) => e.getStatus() === 409);
      await assert.rejects(() => f.practice.submitAnswer({ "x-cogna-student-id": "demo_someone_else", "x-cogna-student-token": issueStudentToken("demo_someone_else") }, request));
      await assert.rejects(() => f.practice.submitAnswer(f.headers, { ...request, interactionContext: { ...request.interactionContext, questionId: "other" } }));
    } finally { await f.cleanup(); await db.$disconnect(); }
  });
  it("Lotus forwards/persists exact context in snapshot and ANSWER metadata, replays safely and reloads after service restart", async () => {
    const db = isolatedDatabase(); const f = await createInteractionFixture(db);
    try {
      const q = f.questions[0]!;
      const request = { studentId: f.studentId, answer: "I don't know", working: "", confidence: 60, responseTimeMs: 3000, didNotKnow: true, questionId: q.id, nextQuestionId: f.questions[1]!.id, submissionId: `${f.lotusId}_submission`, interactionContext: sampleContext("LOTUS", q.id) };
      await f.lotusController.answer(f.headers, f.lotusId, request);
      await f.lotusController.answer(f.headers, f.lotusId, request);
      const record = await db.lotusSessionRecord.findUniqueOrThrow({ where: { sessionId: f.lotusId } });
      const rows = await db.lotusEvidenceRecord.findMany({ where: { sessionRecordId: record.id, eventType: "ANSWER", submissionId: request.submissionId } });
      assert.equal(rows.length, 1);
      assert.deepEqual((rows[0]!.metadata as any).interactionContext, request.interactionContext);
      const restarted = isolatedDatabase();
      try {
        const restored = await loadLotusSession(restarted, f.lotusId);
        assert.deepEqual(restored?.audits[0]?.response?.interactionContext, request.interactionContext);
        assert.equal(restored?.audits[0]?.response?.interactionContext?.confidence.value, null);
        const service = new LotusService({ primaryModel: "no-provider", challengerModel: "no-provider" } as any, restarted);
        try { assert.equal((await service.get(f.lotusId)).currentQuestion?.id, f.questions[1]!.id); }
        finally { service.onModuleDestroy(); }
      } finally { await restarted.$disconnect(); }
      await assert.rejects(() => f.lotusController.answer(f.headers, f.lotusId, { ...request, responseTimeMs: 4000 }), (e: any) => e.getStatus() === 409);
      assert.throws(() => f.lotusController.answer({ "x-cogna-student-id": "demo_someone_else", "x-cogna-student-token": issueStudentToken("demo_someone_else") }, f.lotusId, request));
      await assert.rejects(() => f.lotusController.answer(f.headers, f.lotusId, { ...request, interactionContext: { ...request.interactionContext, questionId: "other" } }));
    } finally { await f.cleanup(); await db.$disconnect(); }
  });
});
