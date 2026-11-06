/**
 * Writing time for one Lotus question, in milliseconds.
 * It counts from when the item was shown to the student (the item-mount clock), minus any wait
 * for the confidence prompt, so time spent preparing the question is never charged to the student.
 * Falls back to the page's own start time only when no item clock exists.
 */
export function lotusResponseTimeMs(input: { itemElapsedMs: number | null | undefined; confidenceWaitMs: number; fallbackMs: number }): number {
  const base = typeof input.itemElapsedMs === "number" ? input.itemElapsedMs - Math.max(0, input.confidenceWaitMs) : input.fallbackMs;
  return Math.max(0, Math.round(base));
}
