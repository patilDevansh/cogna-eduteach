import type { PrismaClient } from "@cogna/database";
import type { LotusQuestionAudit, LotusSessionView } from "@cogna/shared";

export function lotusPersistenceEnabled(
  prisma: PrismaClient | null | undefined,
): prisma is PrismaClient {
  return Boolean(prisma) && process.env.LOTUS_STANDALONE_DEMO !== "true";
}

export async function persistLotusSession(
  prisma: PrismaClient,
  session: LotusSessionView,
): Promise<void> {
  const endedAt = session.status === "COMPLETE" ? new Date() : null;
  await prisma.lotusSessionRecord.upsert({
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
        mathJudgment: audit.gpt.mathJudgment,
      } as object,
    },
  });
}
