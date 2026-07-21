"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ParentAuthInput } from "@/lib/parent-auth-headers";
import styles from "./dashboard.module.css";

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5 2.5 3.8v3.9c0 3.4 2.3 6.4 5.5 7.3 3.2-.9 5.5-3.9 5.5-7.3V3.8L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Plain-language safety copy plus the one control that actually matters:
 * pausing AI-assisted practice for this child, without pausing practice
 * itself (the approved bank keeps running either way). */
export function TrustPanel({
  auth,
  studentId,
}: {
  auth: string | ParentAuthInput | undefined;
  studentId: string;
}) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getSafetySettings(auth, studentId)
      .then((s) => {
        if (!cancelled) setPaused(s.aiAssistedPracticePaused);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load safety settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [auth, studentId]);

  async function toggle() {
    if (paused === null || busy) return;
    setBusy(true);
    setError("");
    const next = !paused;
    try {
      const result = await api.updateSafetySettings(auth, studentId, next);
      setPaused(result.aiAssistedPracticePaused);
    } catch {
      setError("Couldn't update the setting. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h3>How we keep this safe</h3>
      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <li style={{ fontSize: "var(--text-sm)", color: "var(--ink-soft)", lineHeight: 1.5 }}>
          Every question shown has been checked before it reaches your child.
        </li>
        <li style={{ fontSize: "var(--text-sm)", color: "var(--ink-soft)", lineHeight: 1.5 }}>
          We never guess at attention, mood, or diagnoses — only what they did with the maths.
        </li>
        <li style={{ fontSize: "var(--text-sm)", color: "var(--ink-soft)", lineHeight: 1.5 }}>
          Pausing AI-assisted practice below never pauses practice itself — the human-approved
          question set keeps running either way.
        </li>
      </ul>

      <div
        style={{
          display: "flex",
          gap: "var(--s-3)",
          alignItems: "flex-start",
          justifyContent: "space-between",
          background: "var(--accent-wash)",
          borderRadius: "var(--radius)",
          padding: "var(--s-4)",
          marginTop: "var(--s-4)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "flex-start", color: "var(--accent-deep)" }}>
          <ShieldIcon />
          <p style={{ fontSize: "var(--text-xs)", margin: 0, lineHeight: 1.5 }}>
            {paused ? "AI-assisted practice is paused for this child." : "AI-assisted practice is on, and always checked before serving."}
          </p>
        </div>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => void toggle()}
          disabled={paused === null || busy}
        >
          {paused === null ? "…" : busy ? "Saving…" : paused ? "Turn back on" : "Pause it"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
