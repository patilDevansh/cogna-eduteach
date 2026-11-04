import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type { LessonEvidenceReceipt, LessonEvidenceRequest, LessonPracticeProgress, PracticeItem } from "@cogna/shared";

export interface LessonEvidenceLedger {
  schemaVersion: 1;
  receipts: Array<{ requestHash: string; receipt: LessonEvidenceReceipt }>;
}

/** Object key order is not a different answer or idempotency payload. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function evidenceHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export function lessonContentVersion(script: Record<string, unknown>): string {
  return evidenceHash({ lesson: script.lesson, exit: script.exit, transfer: script.transfer, practice: script.practice, micro: script.micro, animation: script.animation, animationKind: script.animationKind, format: script.format });
}
export function validateLessonEvidence(value: unknown): LessonEvidenceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("A learning event is required.");
  const v = value as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "eventId", "contentVersion", "kind", "itemId", "answer", "supportEventId", "clientOccurredAt"]);
  if (Object.keys(v).some((key) => !allowed.has(key))) throw new BadRequestException("Unknown learning event field.");
  if (v.schemaVersion !== 1 || typeof v.eventId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(v.eventId) || typeof v.contentVersion !== "string" || !/^[a-f0-9]{64}$/.test(v.contentVersion)) throw new BadRequestException("Invalid learning event identity or version.");
  if (typeof v.kind !== "string" || !["PRESENTED", "HINT_REQUESTED", "ANSWER_SUBMITTED"].includes(v.kind)) throw new BadRequestException("Unsupported learning event kind.");
  if (v.itemId !== undefined && (typeof v.itemId !== "string" || !v.itemId || v.itemId.length > 200)) throw new BadRequestException("Invalid practice item.");
  if (v.kind !== "PRESENTED" && !v.itemId) throw new BadRequestException("A practice item is required.");
  if (v.clientOccurredAt !== undefined && (typeof v.clientOccurredAt !== "string" || v.clientOccurredAt.length > 40 || !Number.isFinite(Date.parse(v.clientOccurredAt)))) throw new BadRequestException("Invalid client time.");
  if (v.supportEventId !== undefined && (v.kind !== "PRESENTED" || typeof v.supportEventId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(v.supportEventId))) throw new BadRequestException("Invalid support acknowledgement.");
  if (v.kind === "ANSWER_SUBMITTED") {
    const a = v.answer as Record<string, unknown> | undefined;
    // This bounded slice supports typed practice and explicit worked-answer requests only.
    if (!a || typeof a !== "object" || Array.isArray(a) || !((Object.keys(a).length === 1 && typeof a.text === "string" && a.text.trim().length > 0 && a.text.length <= 2000) || (Object.keys(a).length === 1 && a.stuck === true))) throw new BadRequestException("Type an answer or ask to see the working.");
  } else if (v.answer !== undefined) throw new BadRequestException("Only an answer event may contain an answer.");
  return v as unknown as LessonEvidenceRequest;
}

export function practiceProgress(script: Record<string, unknown>, items: PracticeItem[]): LessonPracticeProgress {
  const contentVersion = lessonContentVersion(script);
  const ledger = script.learningEvidence as LessonEvidenceLedger | undefined;
  const receipts = ledger?.receipts?.map((entry) => entry.receipt).filter((r) => r.contentVersion === contentVersion) ?? [];
  const result: LessonPracticeProgress = { schemaVersion: 1, contentVersion, resumeItemId: [...receipts].reverse().find((r) => r.itemId)?.itemId ?? null, items: {} };
  for (const item of items.filter((i) => i.format === "type-answer")) {
    const answers = receipts.filter((r) => r.itemId === item.id && r.kind === "ANSWER_SUBMITTED");
    const latest = answers.at(-1) ?? null;
    const hint = receipts.filter((r) => r.itemId === item.id && r.kind === "HINT_REQUESTED").at(-1)?.hint ?? null;
    result.items[item.id] = {
      attempts: latest?.result?.attempt ?? 0,
      resolved: Boolean(latest?.result && (latest.result.verdict === "CORRECT" || latest.result.reveal)),
      correct: answers.some((r) => r.result?.verdict === "CORRECT"),
      firstTry: answers.length === 1 && latest?.result?.attempt === 1 && latest?.result?.verdict === "CORRECT" && latest.assistance === "NONE_RECORDED",
      latest, hint,
    };
  }
  return result;
}
