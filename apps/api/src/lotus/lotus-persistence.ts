import type { PrismaClient } from "@cogna/database";
import type { LotusQuestionAudit, LotusSessionView } from "@cogna/shared";
import { pseudonymousLearnerId, retentionDeadline } from "./lotus-privacy";

export function lotusPersistenceEnabled(
  prisma: PrismaClient | null | undefined,
): prisma is PrismaClient {
  // Demo diagnostics are diagnostic sessions, not throwaway browser state.
  // A Prisma client means a durable database is available and must be used.
  // `LOTUS_STANDALONE_DEMO` may still control demo-only UI behavior, but it
  // must never make a Lotus session memory-only.
  return Boolean(prisma);
}

/**
 * Durable outbox entry for work that must survive a crash between "accept
 * this answer" and "kick off its background review or replenishment" — the
 * generic `Job` table already used by weekly reports and video rendering.
 * Enqueued in the same transaction as the session snapshot; a drain worker
 * (see LotusService.processPendingOutboxJobs) claims and runs it later if
 * the in-process kick-off never got the chance to.
 */
export interface LotusOutboxJobSpec {
  jobType: string;
  idempotencyKey: string;
  payload: object;
}

export async function persistLotusSession(
  prisma: PrismaClient,
  session: LotusSessionView,
  jobs: LotusOutboxJobSpec[] = [],
): Promise<void> {
  const endedAt = session.status === "COMPLETE" ? new Date() : null;
  type PersistenceDb = Pick<PrismaClient, "lotusSessionRecord" | "lotusEvidenceRecord" | "job">;
  const write = async (db: PersistenceDb): Promise<void> => {
    const record = await db.lotusSessionRecord.upsert({
      where: { sessionId: session.sessionId },
      create: {
        sessionId: session.sessionId,
        studentId: session.studentId,
        pseudonymId: pseudonymousLearnerId(session.studentId),
        retentionUntil: retentionDeadline(session.startedAt),
        status: session.status,
        phase: session.phase,
        startedAt: new Date(session.startedAt),
        endedAt,
        payload: session as object,
      },
      update: {
        studentId: session.studentId,
        pseudonymId: pseudonymousLearnerId(session.studentId),
        status: session.status,
        phase: session.phase,
        endedAt,
        payload: session as object,
      },
    });

    // A snapshot is intentionally appended on every durable save. The current
    // row is fast to load; this append-only event makes the decision trail,
    // active-session recovery, and later audit possible even after a plan has
    // changed again. It stays server-side because the snapshot includes answer
    // keys and internal model data.
    await db.lotusEvidenceRecord.create({
      data: {
        sessionRecordId: record.id,
        eventType: "SESSION_STATE",
        outcome: session.status,
        questionText: session.currentQuestion?.prompt,
        submittedText: null,
        verificationStatus: null,
        verbatimText: `Persisted Lotus ${session.topic ?? "BRACKETS"} session state.`,
        metadata: {
          topic: session.topic ?? "BRACKETS",
          auditCount: session.audits.length,
          currentQuestionId: session.currentQuestion?.id ?? null,
          analysisStates: session.audits.map((audit) => ({
            questionId: audit.question.id,
            status: audit.analysisStatus,
          })),
          snapshot: session,
        } as object,
      },
    });

    for (const job of jobs) {
      // upsert, not create: a retried persist (or a stale-tab replay) must
      // never re-enqueue work that is already durably queued, running, or
      // done. `update: {}` intentionally leaves an existing job's status
      // alone — enqueuing is idempotent, not a way to resurrect a finished
      // or failed job.
      await db.job.upsert({
        where: { jobType_idempotencyKey: { jobType: job.jobType, idempotencyKey: job.idempotencyKey } },
        create: { jobType: job.jobType, idempotencyKey: job.idempotencyKey, payload: job.payload, status: "PENDING" },
        update: {},
      });
    }
  };

  // Production Prisma writes the recoverable snapshot and its event in one
  // transaction. Tiny in-memory test doubles may not provide `$transaction`,
  // so they exercise the same write shape directly.
  if (typeof prisma.$transaction === "function") {
    await prisma.$transaction(async (tx) => write(tx as unknown as PersistenceDb));
    return;
  }
  await write(prisma);
}

export async function loadLotusSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<LotusSessionView | null> {
  const row = await prisma.lotusSessionRecord.findUnique({ where: { sessionId } });
  if (!row) return null;
  return row.payload as unknown as LotusSessionView;
}

/**
 * One durable ANSWER record per (question, submissionId). Called both when
 * an answer is first accepted (analysisStatus PENDING or NOT_REQUIRED) and
 * again once its review completes (COMPLETE) — the second call updates the
 * same row rather than creating a second one, because it upserts on the
 * unique (session, question, submission) key. A submissionId is what makes
 * the row identifiable across a retry or a second server instance; without
 * one (an older or programmatic caller), this still records the event, it
 * just cannot be deduplicated at the database level.
 */
export async function appendLotusEvidence(
  prisma: PrismaClient,
  session: LotusSessionView,
  audit: LotusQuestionAudit,
): Promise<void> {
  const record = await prisma.lotusSessionRecord.findUnique({
    where: { sessionId: session.sessionId },
    select: { id: true },
  });
  if (!record) return;
  const questionId = audit.question.id;
  const submissionId = audit.response?.submissionId ?? null;
  const data = {
    sessionRecordId: record.id,
    eventType: "ANSWER",
    outcome: audit.verification?.status ?? "UNRECORDED",
    questionText: audit.question.prompt,
    submittedText: audit.response?.answer ?? "",
    verificationStatus: audit.verification?.status,
    verbatimText: [
      audit.question.prompt,
      audit.response?.working ?? "",
      audit.response?.answer ?? "",
    ].join("\n"),
    metadata: {
      questionId,
      didNotKnow: audit.response?.didNotKnow ?? false,
      mathJudgment: audit.gpt?.mathJudgment ?? null,
    } as object,
    questionId,
    submissionId,
    // Derived from the stage timing this same audit already carries, rather
    // than a second clock reading — the two must never disagree.
    analysisStartedAt: audit.analysisStatus === "COMPLETE" && audit.timingMs
      ? new Date(Date.now() - audit.timingMs.total)
      : undefined,
    analysisCompletedAt: audit.analysisStatus === "COMPLETE" ? new Date() : null,
  };
  if (submissionId) {
    await prisma.lotusEvidenceRecord.upsert({
      where: { sessionRecordId_questionId_submissionId: { sessionRecordId: record.id, questionId, submissionId } },
      create: data,
      update: data,
    });
    return;
  }
  // No submissionId to deduplicate on: fall back to a plain append, same as before.
  await prisma.lotusEvidenceRecord.create({ data });
}
