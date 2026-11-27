import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AnswerSubmittedEvent } from "@cogna/shared";
import { LearningLoopService } from "../../src/learning-loop/learning-loop.service";
import { isIndependentCorrect } from "../../src/engines/diagnostic-engine/diagnostic-formulas";
import {
  effectiveHintLevel,
  recordTutorHelp,
  TUTOR_HELP_EVENT,
  TUTOR_HELP_LEVEL,
  tutorHelped,
  tutorHelpEventId,
  type TutorHelpStore,
} from "../../src/learning-evidence/tutor-help";

/**
 * Help from the live voice tutor is evidence the server records, never something the page claims:
 * an answer the tutor helped with is saved and judged at hint level 2 or more, so it is never
 * counted as independent work (independent = correct with hint level 1 or less).
 */

const KEY = { studentId: "stu_help", sessionId: "sess_help", questionId: "Q_HELP", questionVersion: 3 };

function answerEvent(highestHintLevel: number): AnswerSubmittedEvent {
  return {
    eventId: "evt-answer-1",
    eventType: "ANSWER_SUBMITTED",
    studentId: KEY.studentId,
    sessionId: KEY.sessionId,
    questionId: KEY.questionId,
    questionVersion: KEY.questionVersion,
    submittedAnswer: "14",
    timeToFirstResponseMs: 1000,
    totalTimeMs: 9000,
    idleTimeMs: 0,
    attemptNumber: 1,
    hintCount: highestHintLevel ? 1 : 0,
    highestHintLevel,
    selfRatedConfidence: null,
    answerChangedBeforeSubmit: false,
    clientTimestamp: new Date().toISOString(),
  } as unknown as AnswerSubmittedEvent;
}

class Stop extends Error {}

/**
 * Runs the real processAnswer against an in-memory fake up to the point after the misconception check,
 * and reports what it stored and decided. The question is a retest of a misconception, answered correctly.
 */
async function submit(opts: { tutorHelped: boolean; reportedLevel: number }) {
  const seen: { stored?: Record<string, unknown>; storedRawEvent?: Record<string, unknown>; diagnosedLevel?: number; resolved: boolean; outcomeLevel?: number } = { resolved: false };
  const prisma = {
    attempt: {
      findUnique: async () => null,
      findMany: async () => [],
      upsert: async (args: { create: Record<string, unknown> }) => { seen.stored = args.create; return { id: "att_1", processingStatus: "GRADED", ...args.create }; },
      update: async () => ({ id: "att_1", processingStatus: "PROFILE_UPDATED" }),
    },
    learningSession: { findUniqueOrThrow: async () => ({ id: KEY.sessionId, studentId: KEY.studentId, status: "ACTIVE", sessionMode: "ADAPTIVE_PRACTICE" }) },
    question: { findUniqueOrThrow: async () => ({ id: KEY.questionId, version: KEY.questionVersion, acceptedAnswers: ["14"], conceptId: "C_LINEAR" }) },
    rawEvent: {
      findUnique: async (args: { where: { eventId: string } }) =>
        opts.tutorHelped && args.where.eventId === tutorHelpEventId(KEY) ? { eventType: TUTOR_HELP_EVENT, studentId: KEY.studentId } : null,
      upsert: async (args: { create: Record<string, unknown> }) => { seen.storedRawEvent = args.create; return { ...args.create, payload: args.create.payload }; },
    },
    misconceptionRemediationState: {
      findFirst: async () => ({ studentId: KEY.studentId, misconceptionId: "M_SIGN", conceptId: "C_LINEAR", state: "RETESTING" }),
      update: async () => { seen.resolved = true; return {}; },
    },
    misconceptionRemediationStateHistory: { create: async () => ({}) },
    explanationOutcome: {
      findFirst: async () => ({ id: "outcome_1" }),
      update: async (args: { data: { highestHintLevel: number } }) => { seen.outcomeLevel = args.data.highestHintLevel; return {}; },
    },
    diagnosticFactor: { findFirst: async () => { throw new Stop("stop after the misconception check"); } },
  };
  const grader = { grade: () => "CORRECT" };
  const diagnostic = { diagnose: async (input: { highestHintLevel: number }) => { seen.diagnosedLevel = input.highestHintLevel; } };
  const none = {} as never;
  const loop = new LearningLoopService(prisma as never, grader as never, diagnostic as never, none, none, none, none, none, none, none);
  await assert.rejects(loop.processAnswer(answerEvent(opts.reportedLevel)), Stop);
  return seen;
}

describe("tutor help — saved by the server, never independent", () => {
  it("an answer the tutor helped with is stored at level 2 or more and is not independent", async () => {
    const seen = await submit({ tutorHelped: true, reportedLevel: 0 });
    assert.equal(seen.stored?.highestHintLevel, TUTOR_HELP_LEVEL);
    assert.ok(Number(seen.stored?.highestHintLevel) >= 2);
    assert.equal(isIndependentCorrect("CORRECT", Number(seen.stored?.highestHintLevel)), false);
    assert.equal(seen.diagnosedLevel, TUTOR_HELP_LEVEL, "the diagnosis sees the helped level");
    assert.equal(seen.resolved, false, "a helped retest does not resolve the misconception");
    assert.equal((seen.storedRawEvent?.payload as { highestHintLevel?: number } | undefined)?.highestHintLevel, 0, "the raw event keeps what the client sent");
  });

  it("a higher level the student reached with hints is kept", async () => {
    const seen = await submit({ tutorHelped: true, reportedLevel: 3 });
    assert.equal(seen.stored?.highestHintLevel, 3);
  });

  it("with no tutor help, nothing changes", async () => {
    const seen = await submit({ tutorHelped: false, reportedLevel: 0 });
    assert.equal(seen.stored?.highestHintLevel, 0);
    assert.equal(isIndependentCorrect("CORRECT", Number(seen.stored?.highestHintLevel)), true);
    assert.equal(seen.diagnosedLevel, 0);
    assert.equal(seen.resolved, true, "an unaided correct retest still resolves the misconception");
    assert.equal(seen.outcomeLevel, 0);
  });

  it("raises the level only when the tutor helped", () => {
    assert.equal(effectiveHintLevel(0, true), 2);
    assert.equal(effectiveHintLevel(1, true), 2);
    assert.equal(effectiveHintLevel(3, true), 3);
    assert.equal(effectiveHintLevel(1, false), 1);
  });
});

describe("tutor help — the record itself", () => {
  function store() {
    const rows = new Map<string, { eventType: string; studentId: string; sessionId: string; payload: unknown }>();
    const db: TutorHelpStore = {
      rawEvent: {
        findUnique: async (args) => rows.get(args.where.eventId) ?? null,
        upsert: async (args) => {
          const existing = rows.get(args.where.eventId);
          if (existing) return existing;
          rows.set(args.where.eventId, args.create);
          return args.create;
        },
      },
    };
    return { rows, db };
  }

  it("is one idempotent event per student, session and question version", async () => {
    const { rows, db } = store();
    assert.equal(await tutorHelped(db, KEY), false);
    await recordTutorHelp(db, KEY);
    await recordTutorHelp(db, KEY);
    assert.equal(rows.size, 1);
    const row = rows.get(tutorHelpEventId(KEY))!;
    assert.equal(row.eventType, TUTOR_HELP_EVENT);
    assert.deepEqual(row.payload, { questionId: KEY.questionId, questionVersion: KEY.questionVersion });
    assert.equal(await tutorHelped(db, KEY), true);
    assert.equal(await tutorHelped(db, { ...KEY, questionVersion: 4 }), false, "another version of the question is not helped");
    assert.equal(await tutorHelped(db, { ...KEY, studentId: "someone_else" }), false);
  });

  it("refuses when another event already holds the id, so help is never left unrecorded", async () => {
    const { rows, db } = store();
    rows.set(tutorHelpEventId(KEY), { eventType: "ANSWER_SUBMITTED", studentId: KEY.studentId, sessionId: KEY.sessionId, payload: {} });
    await assert.rejects(recordTutorHelp(db, KEY), /could not be recorded/);
    assert.equal(await tutorHelped(db, KEY), false);
  });
});
