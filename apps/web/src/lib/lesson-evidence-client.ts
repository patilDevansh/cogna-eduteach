import type { LessonEvidenceRequest } from "@cogna/shared";

export interface PracticeDraft { text: string; baseEventId: string | null; storedAt: number }
/** Drafts are local recovery only, never checked-answer evidence. */
export function readPracticeDraft(storage: Pick<Storage, "getItem" | "removeItem">, key: string, baseEventId: string | null): PracticeDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as PracticeDraft;
    const age = Date.now() - draft.storedAt;
    if (typeof draft.text !== "string" || draft.text.length > 2000 || draft.baseEventId !== baseEventId || !Number.isFinite(age) || age < 0 || age > 86400000) throw new Error("Stale draft");
    return draft;
  } catch { storage.removeItem(key); return null; }
}

export function practicePendingKey(studentId: string, assignmentId: string, itemId: string, contentVersion: string): string {
  return `cogna_practice_pending:${[studentId, assignmentId, itemId, contentVersion].map(encodeURIComponent).join(":")}`;
}
export function readPendingPractice(storage: Pick<Storage, "getItem" | "removeItem">, key: string): LessonEvidenceRequest | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { event: LessonEvidenceRequest; storedAt: number };
    if (!saved.event || saved.event.schemaVersion !== 1 || typeof saved.event.eventId !== "string" || !Number.isFinite(saved.storedAt) || Date.now() - saved.storedAt > 24 * 60 * 60 * 1000) {
      storage.removeItem(key); return null;
    }
    return saved.event;
  } catch { return null; }
}
