"use client";
import { useEffect, useRef } from "react";
import type { StudentInteractionContext } from "@cogna/shared";
import { queuePresentation } from "./presentation-outbox";
import { getStudent } from "./session";
import { InteractionObservation, InteractionObservationSlot, snapshotWithoutLiveObservation } from "./interaction-observation";

/** Starts after the question DOM commits, not when it is generated or prefetched. */
export function useInteractionObservation(source: StudentInteractionContext["source"], questionId: string | undefined, questionVersion: number | null, format: string, enabled: boolean, sessionId = "") {
  const ref = useRef(new InteractionObservationSlot());
  const presentedRequests = useRef(new Map<string, unknown>());
  const key = JSON.stringify([source, sessionId, questionId, questionVersion, format]);
  useEffect(() => {
    if (!questionId || !enabled) { ref.current.deactivate(); return; }
    const observation = ref.current.activate(key, partial => new InteractionObservation({ source, questionId, questionVersion, format, observationId: crypto.randomUUID() }, () => performance.now(), () => new Date().toISOString(), document.visibilityState === "hidden", !navigator.onLine, performance.getEntriesByType("navigation").some(entry => (entry as PerformanceNavigationTiming).type === "reload"), partial));
    const studentId = getStudent()?.studentId;
    const snapshot = observation.snapshot({ status: "NOT_ASKED", value: null, scale: source === "EXERCISE" ? "ONE_TO_FIVE" : "ZERO_TO_HUNDRED" });
    let request = presentedRequests.current.get(snapshot.observationId);
    if (!request) { request = { schemaVersion: 1, eventId: snapshot.observationId, source, sessionId, questionId, questionVersion, kind: "PRESENTED", context: snapshot }; presentedRequests.current.set(snapshot.observationId, request); }
    const flush = () => {
      if (document.visibilityState === "hidden") return;
      if (!(request as any).context.presentedAt) {
        const visibleSnapshot = observation.snapshot({ status: "NOT_ASKED", value: null, scale: source === "EXERCISE" ? "ONE_TO_FIVE" : "ZERO_TO_HUNDRED" });
        request = { ...(request as object), context: visibleSnapshot };
        presentedRequests.current.set(visibleSnapshot.observationId, request);
      }
      if (studentId && sessionId) void queuePresentation(studentId, request);
    };
    flush();
    window.addEventListener("online", flush);
    const visibility = () => { observation.visibility(document.visibilityState === "hidden"); flush(); };
    const connection = () => observation.connection(!navigator.onLine);
    visibility(); connection();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    return () => { window.removeEventListener("online", flush); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); };
  }, [key, enabled, questionId, questionVersion, source, format]);
  // When the question first rendered, whether or not it was answerable yet. If the live observation is missing at submit
  // (it is switched off while the page is busy or between questions), the submission still carries a timing record,
  // honestly marked partial, instead of silently dropping it.
  const firstSeen = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => { if (questionId && firstSeen.current?.key !== key) firstSeen.current = { key, at: performance.now() }; }, [key, questionId]);
  const current = () => ref.current.get(key);
  return {
    input: (value: string, discrete = false) => current()?.input(value, discrete),
    workingInput: () => current()?.workingInput(),
    snapshot: (confidence: StudentInteractionContext["confidence"]) => {
      const live = current();
      if (live) return live.snapshot(confidence);
      if (!questionId) return undefined;
      return snapshotWithoutLiveObservation({ source, questionId, questionVersion, format }, firstSeen.current?.key === key ? firstSeen.current.at : null, confidence);
    },
  };
}
