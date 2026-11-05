import { validInteractionContext, type LotusSessionView, type LotusStudentResponse } from "@cogna/shared";

type RecoveryFields = {
  session: LotusSessionView;
  answer: string;
  workingLines: string[];
  startedAt: number;
  confidence: number | null;
  pending: LotusStudentResponse | null;
};

export function lotusRecoveryProblem(cached: RecoveryFields, studentId: string): string | null {
  if (cached.session.studentId !== studentId) return "The cached diagnostic belongs to a different student";
  if (typeof cached.answer !== "string" || cached.answer.length > 10000) return "The cached draft has an invalid answer";
  if (!Array.isArray(cached.workingLines) || cached.workingLines.length > 6 || cached.workingLines.some(line => typeof line !== "string" || line.length > 10000)) return "The cached working has an invalid shape";
  if (!Number.isFinite(cached.startedAt)) return "The cached question time is invalid";
  if (cached.confidence !== null && ![25, 60, 90].includes(cached.confidence)) return "The cached confidence is invalid";
  const pending = cached.pending;
  if (!pending) return null;
  if (!pending.submissionId || typeof pending.answer !== "string" || pending.answer.length > 10000 || typeof pending.working !== "string" || pending.working.length > 60000 || typeof pending.didNotKnow !== "boolean" || !Number.isFinite(pending.responseTimeMs) || pending.responseTimeMs < 0) return "The pending answer has an invalid shape";
  const alreadySaved = cached.session.audits.some(audit => audit.question.id === pending.questionId && audit.response?.submissionId === pending.submissionId);
  if (pending.questionId !== cached.session.currentQuestion?.id && !alreadySaved) return "The pending answer does not match the cached question";
  if (pending.interactionContext !== undefined && (!validInteractionContext(pending.interactionContext) || pending.interactionContext.source !== "LOTUS" || pending.interactionContext.questionId !== pending.questionId)) return "The pending answer has invalid interaction context";
  return null;
}
