"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type HomeSummary } from "@/lib/api";
import { getStudent, clearStudent } from "@/lib/session";
import { conceptLabelStudent } from "@/lib/concept-labels";
import styles from "@/components/dashboard.module.css";

/** Which stage of the Linear Equations journey a concept belongs to, for the map. */
const STAGES = ["Foundations", "One-step", "Two-step", "Word problems", "Mastery"] as const;
function stageIndexFor(conceptId: string | undefined): number {
  if (!conceptId) return 0;
  if (conceptId.startsWith("P")) return 0;
  if (conceptId.startsWith("C1") || conceptId.startsWith("C2") || conceptId.startsWith("C3") || conceptId.startsWith("C4")) return 1;
  if (conceptId.startsWith("C5")) return 2;
  if (conceptId.startsWith("C6")) return 3;
  return 0;
}

const JOURNEY_POINTS = [
  { x: 15, y: 50 },
  { x: 100, y: 65 },
  { x: 150, y: 30 },
  { x: 225, y: 14 },
  { x: 305, y: 30 },
];

function formatRecapWhen(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 20) return "Earlier today";
  if (hours < 44) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "long" });
}

export default function StudentHomePage() {
  const router = useRouter();
  const [studentName, setStudentName] = useState("");
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Home — Cogna";
  }, []);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.replace("/student/login");
      return;
    }
    setStudentName(student.name);
    api
      .getHomeSummary(student.studentId)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your home screen."))
      .finally(() => setLoading(false));
  }, [router]);

  function signOut() {
    clearStudent();
    router.push("/");
  }

  const chrome = (
    <div className={styles.dashHead} style={{ maxWidth: 420, width: "100%", margin: "0 auto var(--s-5)" }}>
      <Link href="/" className="wordmark">
        cogna<span className="dot">.</span>
      </Link>
      <span className="faint" style={{ fontSize: "var(--text-sm)" }}>Good to see you, {studentName || "there"}</span>
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--s-5)" }}>
        {chrome}
        <p className="muted">Getting things ready…</p>
      </div>
    );
  }

  const hasHistory = Boolean(summary?.nextAction || summary?.recap);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--s-5)" }}>
      {chrome}
      <div className={`${styles.phone} phase-in`}>
        {error && <p className="error">{error}</p>}

        {!hasHistory ? (
          <div className={styles.heroCard}>
            <span className={styles.kicker}>Phase B1 — try this</span>
            <h2>Step check: equations with fractions</h2>
            <p className={styles.meta}>
              Write working one line at a time. Starts with a simple fraction equation, then clearing
              denominators — not the old linear baseline.
            </p>
            <Link
              href="/student/diagnostic-v2?track=FRACTION_LINEAR&debug=1"
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
            >
              Start fractions check
            </Link>
            <Link
              href="/student/baseline"
              className="btn btn-ghost"
              style={{ alignSelf: "flex-start", marginTop: "0.5rem" }}
            >
              Or start the old baseline
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.heroCard}>
              <span className={styles.kicker}>Up next</span>
              <h2>{summary?.nextAction ? conceptLabelStudent(summary.nextAction.conceptId) : "Practice"}</h2>
              <span className={styles.meta}>
                About 10 minutes · {summary?.nextAction?.reason === "revision" ? "a quick refresh" : "picks up where you left off"}
              </span>
              <Link href="/student/practice?mode=ADAPTIVE_PRACTICE" className="btn btn-primary" style={{ alignSelf: "flex-start", background: "var(--accent)", color: "#fff" }}>
                Continue practicing
              </Link>
            </div>

            <div className={styles.momentum}>
              <span className={styles.label}>{summary?.momentum.sessionsCount ?? 0} session{(summary?.momentum.sessionsCount ?? 0) === 1 ? "" : "s"} this week</span>
              <div className="progress-dots" aria-hidden="true">
                {summary?.momentum.days.map((on, i) => (
                  <span key={i} className={on ? "done" : ""} />
                ))}
              </div>
            </div>

            <div className={styles.journey}>
              <span className={styles.kicker}>Linear equations</span>
              <svg viewBox="0 0 320 70" aria-hidden="true">
                <path
                  d={`M ${JOURNEY_POINTS.map((p) => `${p.x} ${p.y}`).join(" C ")}`}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="1 10"
                />
                {(() => {
                  const stage = stageIndexFor(summary?.nextAction?.conceptId);
                  return JOURNEY_POINTS.slice(0, stage + 1).map((p, i, arr) =>
                    i === arr.length - 1 ? null : (
                      <line
                        key={`seg-${i}`}
                        x1={p.x}
                        y1={p.y}
                        x2={arr[i + 1]!.x}
                        y2={arr[i + 1]!.y}
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    ),
                  );
                })()}
                {JOURNEY_POINTS.map((p, i) => {
                  const stage = stageIndexFor(summary?.nextAction?.conceptId);
                  const isCurrent = i === stage;
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={isCurrent ? 8 : 5}
                      fill={isCurrent ? "var(--surface)" : i < stage ? "var(--accent)" : "var(--line-strong)"}
                      stroke={isCurrent ? "var(--accent)" : "none"}
                      strokeWidth={isCurrent ? 3 : 0}
                    />
                  );
                })}
              </svg>
              <div className={styles.journeyLabels}>
                {STAGES.map((label, i) => (
                  <span key={label} className={i === stageIndexFor(summary?.nextAction?.conceptId) ? "now" : ""}>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {summary?.recap && (
              <div className={styles.recap}>
                <span className={styles.kicker}>{formatRecapWhen(summary.recap.endedAt)}</span>
                <p>
                  {summary.recap.minutes > 0 ? `${summary.recap.minutes} minutes` : "A short session"}
                  {summary.recap.conceptId ? ` on ${conceptLabelStudent(summary.recap.conceptId).toLowerCase()}` : ""}.
                </p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center" }}>
              <div className={styles.breathChip}>
                <span className={styles.breathDot} />
                Take a breath before you start
              </div>
            </div>
          </>
        )}

        <div className="topbar-links" style={{ justifyContent: "center", borderTop: "1px solid var(--line)", paddingTop: "var(--s-3)" }}>
          <Link href="/student/diagnostic-v2?track=FRACTION_LINEAR&debug=1">
            Step check (fractions)
          </Link>
          <Link href="/student/revision">Plan</Link>
          <button type="button" className="btn-quiet" onClick={signOut} style={{ padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
