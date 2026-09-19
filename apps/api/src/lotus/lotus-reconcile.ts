/**
 * Event-order replay and snapshot reconciliation
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §10 Phase 0). `loadLotusSession`
 * trusts the stored JSON snapshot on its own; this cross-checks that
 * snapshot against the append-only event log it should agree with, so a
 * silently dropped event write or a corrupted row is visible instead of
 * invisibly served as fact. It never rewrites the snapshot — this is an
 * audit read, not a repair.
 */
import type { PrismaClient } from "@cogna/database";
import type { LotusSessionView } from "@cogna/shared";
import { loadLotusSession } from "./lotus-persistence";

export interface LotusReconcileResult {
  ok: boolean;
  discrepancies: string[];
  snapshot: LotusSessionView | null;
}

export async function reconcileLotusSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<LotusReconcileResult> {
  const snapshot = await loadLotusSession(prisma, sessionId);
  if (!snapshot) {
    return { ok: false, discrepancies: ["No session record exists for this id."], snapshot: null };
  }

  const record = await prisma.lotusSessionRecord.findUnique({ where: { sessionId }, select: { id: true } });
  if (!record) {
    return { ok: false, discrepancies: ["The session record vanished between reads."], snapshot };
  }

  const discrepancies: string[] = [];

  const latestState = await prisma.lotusEvidenceRecord.findFirst({
    where: { sessionRecordId: record.id, eventType: "SESSION_STATE" },
    orderBy: { createdAt: "desc" },
  });
  if (!latestState) {
    discrepancies.push("No SESSION_STATE event exists for this session — the snapshot is unverifiable against the event log.");
  } else {
    const metadata = latestState.metadata as { auditCount?: number; currentQuestionId?: string | null } | null;
    if (typeof metadata?.auditCount === "number" && metadata.auditCount !== snapshot.audits.length) {
      discrepancies.push(
        `Latest SESSION_STATE event recorded ${metadata.auditCount} audit(s), but the stored snapshot has ${snapshot.audits.length}.`,
      );
    }
    if (metadata && "currentQuestionId" in metadata) {
      const eventQuestionId = metadata.currentQuestionId ?? null;
      const snapshotQuestionId = snapshot.currentQuestion?.id ?? null;
      if (eventQuestionId !== snapshotQuestionId) {
        discrepancies.push("The latest SESSION_STATE event's current question does not match the stored snapshot's.");
      }
    }
  }

  const answerEvents = await prisma.lotusEvidenceRecord.findMany({
    where: { sessionRecordId: record.id, eventType: "ANSWER" },
    select: { questionId: true },
  });
  const answeredQuestionIds = new Set(
    answerEvents.map((event) => event.questionId).filter((id): id is string => Boolean(id)),
  );
  for (const audit of snapshot.audits) {
    if (audit.analysisStatus === "COMPLETE" && !answeredQuestionIds.has(audit.question.id)) {
      discrepancies.push(
        `Question ${audit.question.id} shows COMPLETE analysis in the snapshot but has no durable ANSWER event.`,
      );
    }
  }

  return { ok: discrepancies.length === 0, discrepancies, snapshot };
}
