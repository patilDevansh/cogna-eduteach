/**
 * Anonymous, local-only research event log (section 12). No name, email,
 * school, phone, audio, or demographic data ever enters this schema — the
 * only identifier is a random session id, never tied to a real account.
 * Persistence is localStorage only; there is no server-side collection in
 * this prototype (see README — "do not add production backend infrastructure").
 */
import type { SessionEvent } from "./types";

const STORAGE_PREFIX = "cogna_quadratics_session_";

export function newAnonymousSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeEvent(fields: Omit<SessionEvent, "timestamp">): SessionEvent {
  return { ...fields, timestamp: new Date().toISOString() };
}

export function loadSession(sessionId: string): SessionEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + sessionId);
    return raw ? (JSON.parse(raw) as SessionEvent[]) : [];
  } catch {
    return [];
  }
}

export function appendEvent(sessionId: string, event: SessionEvent): SessionEvent[] {
  const events = loadSession(sessionId);
  const next = [...events, event];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(next));
    } catch {
      // Storage full or unavailable — the caller's in-memory copy still has the event.
    }
  }
  return next;
}

export function listSessionIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) ids.push(key.slice(STORAGE_PREFIX.length));
  }
  return ids.sort();
}

export function exportSessionJSON(sessionId: string): string {
  return JSON.stringify(loadSession(sessionId), null, 2);
}

export function clearSession(sessionId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_PREFIX + sessionId);
}
