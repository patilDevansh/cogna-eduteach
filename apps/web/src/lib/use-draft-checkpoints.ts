"use client";
import { useEffect, useRef } from "react";
import { queuePresentation } from "./presentation-outbox";

/** Records settled mathematical candidates, not every keystroke. Never grades a draft. */
export function useDraftCheckpoints(source: "EXERCISE" | "LOTUS", studentId: string, sessionId: string, questionId: string | undefined, questionVersion: number | null, enabled: boolean, startedAt: number) {
  const key = JSON.stringify([source, studentId, sessionId, questionId, questionVersion]);
  const ref = useRef<{ key: string; value: string; lastSent: string | null; lastRequest: any | null; lastAcked: boolean; timer: ReturnType<typeof setTimeout> | null }>({ key, value: "", lastSent: null, lastRequest: null, lastAcked: false, timer: null });
  if (ref.current.key !== key) {
    if (ref.current.timer) clearTimeout(ref.current.timer);
    ref.current = { key, value: "", lastSent: null, lastRequest: null, lastAcked: false, timer: null };
  }
  const flush = () => {
    const state = ref.current;
    const send = (request: any) => queuePresentation(studentId, request).then(acknowledged => {
      if (acknowledged && ref.current.key === key && ref.current.lastRequest === request) ref.current.lastAcked = true;
      return acknowledged;
    });
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (!enabled || !studentId || !sessionId || !questionId || state.value.length > 200) return Promise.resolve(false);
    if (state.lastSent === null && !state.value) return Promise.resolve(true);
    // Await an already queued checkpoint too: a timer may still be writing it.
    if (state.lastSent === state.value && state.lastAcked) return Promise.resolve(true);
    if (state.lastSent === state.value) return state.lastRequest ? send(state.lastRequest) : Promise.resolve(true);
    const action = !state.value ? "CLEARED" : state.lastSent === null || state.lastSent === "" ? "ENTERED" : "REVISED";
    state.lastSent = state.value;
    state.lastRequest = { schemaVersion: 1, eventId: crypto.randomUUID(), source, sessionId, questionId, questionVersion, kind: "DRAFT_CHECKPOINT", draft: { candidate: state.value, action, elapsedMs: Math.min(86400000, Math.max(0, Math.round(Date.now() - startedAt))) } };
    state.lastAcked = false;
    return send(state.lastRequest);
  };
  const record = (value: string) => {
    if (!enabled || value === ref.current.value) return;
    ref.current.value = value;
    if (ref.current.timer) clearTimeout(ref.current.timer);
    if (!value && ref.current.lastSent !== null) void flush();
    else ref.current.timer = setTimeout(() => { void flush(); }, 1200);
  };
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => { document.removeEventListener("visibilitychange", onHidden); if (ref.current.timer) clearTimeout(ref.current.timer); };
  }, [key, enabled]);
  const flushBeforeSubmit = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 2000); });
    try { return await Promise.race([flush(), timedOut]); }
    finally { if (timeout) clearTimeout(timeout); }
  };
  return { record, flush, flushBeforeSubmit };
}
