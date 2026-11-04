/** Answer-bound client observations. These are context, not cognitive measurements. */
export interface StudentInteractionContext {
  schemaVersion: 1;
  observationId: string;
  source: "EXERCISE" | "LOTUS";
  questionId: string;
  questionVersion: number | null;
  format: string;
  presentedAt: string | null;
  timing: {
    basis: "CLIENT_ITEM_MOUNT";
    elapsedMs: number;
    firstInputMs: number | null;
    hiddenMs: number;
    visibilityChanges: number;
    complete: boolean;
  };
  /** Answer edit bursts separated by >=1 second; discrete selection changes count separately. */
  revisionsAfterFirstInput: number;
  confidence: {
    status: "REPORTED_BEFORE_ANSWER" | "NOT_ASKED" | "SKIPPED";
    value: number | null;
    scale: "ONE_TO_FIVE" | "ZERO_TO_HUNDRED";
  };
  technical: { offlineMs: number; offlineTransitions: number; pageReloaded: boolean };
}

/** Strict, bounded wire validation shared by both service boundaries, including internal callers. */
export function validInteractionContext(value: unknown): value is StudentInteractionContext {
  const obj = (v: unknown, keys: string[]): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k)));
  const int = (v: unknown, max = 86400000): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
  if (!obj(value, ["schemaVersion", "observationId", "source", "questionId", "questionVersion", "format", "presentedAt", "timing", "revisionsAfterFirstInput", "confidence", "technical"])) return false;
  if (value.schemaVersion !== 1 || !["EXERCISE", "LOTUS"].includes(value.source as string) || typeof value.observationId !== "string" || !/^[\w-]{16,100}$/.test(value.observationId) || typeof value.questionId !== "string" || !value.questionId.length || value.questionId.length > 200 || typeof value.format !== "string" || !value.format.length || value.format.length > 64) return false;
  if (value.questionVersion !== null && (!int(value.questionVersion, 1000000) || value.questionVersion === 0)) return false;
  if (value.presentedAt !== null && (typeof value.presentedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value.presentedAt) || !Number.isFinite(Date.parse(value.presentedAt)) || value.presentedAt.length > 40)) return false;
  const t = value.timing, c = value.confidence, tech = value.technical;
  if (!obj(t, ["basis", "elapsedMs", "firstInputMs", "hiddenMs", "visibilityChanges", "complete"]) || t.basis !== "CLIENT_ITEM_MOUNT" || !int(t.elapsedMs) || !int(t.hiddenMs) || t.hiddenMs > t.elapsedMs || !int(t.visibilityChanges, 100000) || typeof t.complete !== "boolean" || (t.firstInputMs !== null && (!int(t.firstInputMs) || t.firstInputMs > t.elapsedMs))) return false;
  if (!int(value.revisionsAfterFirstInput, 100000) || !obj(c, ["status", "value", "scale"]) || !["REPORTED_BEFORE_ANSWER", "NOT_ASKED", "SKIPPED"].includes(c.status as string) || !["ONE_TO_FIVE", "ZERO_TO_HUNDRED"].includes(c.scale as string)) return false;
  if (c.status === "REPORTED_BEFORE_ANSWER" ? (!int(c.value, c.scale === "ONE_TO_FIVE" ? 5 : 100) || (c.scale === "ONE_TO_FIVE" && c.value === 0)) : c.value !== null) return false;
  return obj(tech, ["offlineMs", "offlineTransitions", "pageReloaded"]) && int(tech.offlineMs) && tech.offlineMs <= t.elapsedMs && int(tech.offlineTransitions, 100000) && typeof tech.pageReloaded === "boolean";
}
