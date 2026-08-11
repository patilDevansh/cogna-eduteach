"use client";

/**
 * Internal research view — the full session timeline, with observed
 * behaviour and inferred hypothesis kept in visibly separate columns, plus
 * a JSON export. Not linked from the student journey; reads only from this
 * browser's localStorage (no server, no account tie-in).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { listSessionIds, loadSession, exportSessionJSON } from "@/lib/quadratics/session-log";
import type { SessionEvent } from "@/lib/quadratics/types";
import styles from "@/components/quadratics/quadratics.module.css";

function downloadJSON(sessionId: string) {
  const json = exportSessionJSON(sessionId);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cogna-quadratics-session-${sessionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function QuadraticsResearchPage() {
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [events, setEvents] = useState<SessionEvent[]>([]);

  useEffect(() => {
    const ids = listSessionIds();
    setSessionIds(ids);
    if (ids.length > 0) setSelected(ids[ids.length - 1]);
  }, []);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    setEvents(loadSession(selected));
  }, [selected]);

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <span className={styles.wordmark}>
            cogna<span className={styles.dot}>.</span>
          </span>
          <span className={styles.faint}>Research view — internal only, not part of the student journey</span>
        </div>

        <div className={styles.card}>
          <p className={styles.eyebrow}>Sessions on this device</p>
          {sessionIds.length === 0 ? (
            <p className={styles.lead}>
              No sessions recorded yet in this browser. Run a session at{" "}
              <Link href="/prototype/quadratics/dev" style={{ color: "var(--qz-accent-deep)" }}>
                the dev scenario selector
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <div className={styles.field} style={{ maxWidth: "24rem" }}>
                <label htmlFor="session-select">Session</label>
                <select
                  id="session-select"
                  className={styles.input}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {sessionIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.actions} style={{ marginTop: "1rem" }}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => downloadJSON(selected)}>
                  Export session as JSON
                </button>
              </div>
            </>
          )}
        </div>

        {events.length > 0 && (
          <div className={styles.card} style={{ marginTop: "1.5rem", overflowX: "auto" }}>
            <p className={styles.eyebrow}>Timeline — {events.length} event(s)</p>
            <p className={styles.faint} style={{ marginBottom: "1rem" }}>
              Left group is directly observed. Right group is this prototype&apos;s inference from that observation —
              never treat the two as the same kind of fact.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", minWidth: "70rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--qz-line-strong)" }}>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Presented</th>
                  <th style={thStyle}>Raw input (observed)</th>
                  <th style={thStyle}>Validity (observed)</th>
                  <th style={thStyle}>Response ms (observed)</th>
                  <th style={{ ...thStyle, background: "var(--qz-accent-wash)" }}>Hypothesis (inferred)</th>
                  <th style={{ ...thStyle, background: "var(--qz-accent-wash)" }}>Evidence state (inferred)</th>
                  <th style={thStyle}>Intervention shown</th>
                  <th style={thStyle}>Supported / independent</th>
                  <th style={thStyle}>Transfer outcome</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--qz-line)" }}>
                    <td style={tdStyle}>{e.questionStage}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--qz-font-math)" }}>{e.presentedExpression}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--qz-font-math)", maxWidth: "16rem" }}>
                      {e.rawStudentInput || <span className={styles.faint}>(none)</span>}
                    </td>
                    <td style={tdStyle}>{e.stepValidity}</td>
                    <td style={tdStyle}>{e.responseTimeMs}</td>
                    <td style={{ ...tdStyle, background: "var(--qz-accent-wash)" }}>{e.internalHypothesis ?? "—"}</td>
                    <td style={{ ...tdStyle, background: "var(--qz-accent-wash)" }}>{e.evidenceState ?? "—"}</td>
                    <td style={tdStyle}>{e.interventionShown ? "yes" : "no"}</td>
                    <td style={tdStyle}>{e.supportedOrIndependent ?? "—"}</td>
                    <td style={tdStyle}>{e.transferOutcome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "0.5rem 0.6rem", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "0.5rem 0.6rem", verticalAlign: "top" };
