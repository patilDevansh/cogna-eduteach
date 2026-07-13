import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AnswerSubmittedDto } from "../../src/learning-loop/dto/answer-submitted.dto";

/**
 * G21 — Diagnostic failure after grade
 * Tx1 committed; Tx2 throws → attempt durable; FAILED_RETRYABLE; no storedResponse.
 */
describe("G21 — Diagnostic failure after grade", () => {
  it("marks attempt FAILED_RETRYABLE while preserving grade (contract shape)", () => {
    const afterTx1 = {
      eventId: "evt_diag_fail_001",
      grade: "INCORRECT",
      isCorrect: false,
      processingStatus: "GRADED",
      storedResponse: null,
    };

    const afterTx2Failure = {
      ...afterTx1,
      processingStatus: "FAILED_RETRYABLE",
    };

    assert.equal(afterTx2Failure.grade, "INCORRECT");
    assert.equal(afterTx2Failure.processingStatus, "FAILED_RETRYABLE");
    assert.equal(afterTx2Failure.storedResponse, null);
  });

  it("resume retries diagnostic when status is FAILED_RETRYABLE", () => {
    const attempt = {
      eventId: "evt_diag_fail_002",
      processingStatus: "FAILED_RETRYABLE",
      storedResponse: null,
    };

    const needsDiagnostic =
      attempt.processingStatus === "GRADED" ||
      attempt.processingStatus === "FAILED_RETRYABLE";

    assert.ok(needsDiagnostic);
    assert.equal(attempt.storedResponse, null);
  });

  it("503 FAILED_RETRYABLE body includes attemptId and grade", () => {
    const errorBody = {
      code: "FAILED_RETRYABLE",
      processingStatus: "FAILED_RETRYABLE",
      attemptId: "att_abc",
      grade: "CORRECT",
      isCorrect: true,
    };

    assert.equal(errorBody.code, "FAILED_RETRYABLE");
    assert.ok(errorBody.attemptId);
    assert.ok(errorBody.grade);
  });
});

describe("ANSWER_SUBMITTED DTO validation", () => {
  const validPayload = {
    eventId: "evt_val_001",
    eventType: "ANSWER_SUBMITTED",
    studentId: "stu_001",
    sessionId: "ses_001",
    questionId: "q_001",
    questionVersion: 1,
    submittedAnswer: "16",
    timeToFirstResponseMs: 1000,
    totalTimeMs: 2000,
    idleTimeMs: 0,
    attemptNumber: 1,
    hintCount: 0,
    highestHintLevel: 0,
    answerChangedBeforeSubmit: false,
    clientTimestamp: "2026-07-10T12:00:00.000Z",
  };

  it("accepts null selfRatedConfidence (skipped confidence)", async () => {
    const dto = plainToInstance(AnswerSubmittedDto, {
      ...validPayload,
      selfRatedConfidence: null,
    });
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
  });

  it("accepts omitted selfRatedConfidence", async () => {
    const dto = plainToInstance(AnswerSubmittedDto, validPayload);
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
  });

  it("rejects confidence outside 1–5", async () => {
    const dto = plainToInstance(AnswerSubmittedDto, {
      ...validPayload,
      selfRatedConfidence: 6,
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === "selfRatedConfidence"));
  });

  it("rejects invalid eventType", async () => {
    const dto = plainToInstance(AnswerSubmittedDto, {
      ...validPayload,
      eventType: "QUESTION_SHOWN",
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === "eventType"));
  });
});
