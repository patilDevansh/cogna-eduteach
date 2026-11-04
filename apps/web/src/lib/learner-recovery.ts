/** Tab-local recovery, not a server save or learning evidence. No answer history is retained. */
export const RECOVERY_TTL = 86400000;
export function recoveryKey(source: string, learner: string, scope: string) {
  return `cogna_recovery_v1:${[source, learner, scope].map(encodeURIComponent).join(":")}`;
}
export function readRecovery<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (record.schemaVersion !== 1 || !Number.isFinite(record.savedAt) || Date.now() - record.savedAt > RECOVERY_TTL || record.savedAt > Date.now() || raw.length > 150000) throw new Error("Expired recovery");
    return record.state as T;
  } catch { sessionStorage.removeItem(key); return null; }
}
export function writeRecovery(key: string, state: unknown) {
  const value = JSON.stringify({ schemaVersion: 1, savedAt: Date.now(), state });
  if (value.length > 150000) throw new Error("Recovery too large");
  sessionStorage.setItem(key, value);
}
