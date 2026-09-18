import type { PrismaClient } from "@cogna/database";
import type { LotusQuestionAudit, LotusSessionView } from "@cogna/shared";

export function lotusPersistenceEnabled(
  prisma: PrismaClient | null | undefined,
): prisma is PrismaClient {
  // Demo diagnostics are diagnostic sessions, not throwaway browser state.
  // A Prisma client means a durable database is available and must be used.
  // `LOTUS_STANDALONE_DEMO` may still control demo-only UI behavior, but it
  // must never make a Lotus session memory-only.
  return Boolean(prisma);
}

export async function persistLotusSession(
  prisma: PrismaClient,
  session: LotusSessionView,
): Promise<void> {
  const endedAt = session.status === "COMPLETE" ? new Date() : null;
  type PersistenceDb = Pick<PrismaClient, "lotusSessionRecord" | "lotusEvidenceRecord">;
  const write = async (db: PersistenceDb): Promise<void> => {
    const record = await db.lotusSessionRecord.upsert({
      where: { sessionId: session.sessionId },
      create: {
        sessionId: session.sessionId,
        studentId: session.studentId,
        status: session.status,
        phase: session.phase,
        startedAt: new Date(session.startedAt),
        endedAt,
        payload: session as object,
      },
      update: {
        studentId: session.studentId,
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
  await prisma.lotusEvidenceRecord.create({
    data: {
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
        questionId: audit.question.id,
        didNotKnow: audit.response?.didNotKnow ?? false,
        mathJudgment: audit.gpt?.mathJudgment ?? null,
      } as object,
    },
  });
}
