"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, isNotFound } from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";
import { humanizeParentCopy } from "@/lib/concept-labels";
import { GrowthChart } from "@/components/GrowthChart";
import { ConceptMeters } from "@/components/ConceptMeters";
import { PracticeCalendar } from "@/components/PracticeCalendar";
import { PatternHistory } from "@/components/PatternHistory";
import { TrustPanel } from "@/components/TrustPanel";
import type {
  ConceptMasteryBand,
  MasteryTrendPoint,
  PatternHistoryItem,
  PracticeCalendarDay,
} from "@cogna/shared";
import type { ParentAuthInput } from "@/lib/parent-auth-headers";
import styles from "@/components/dashboard.module.css";

type Student = { id: string; name: string; grade: number };

export default function ParentStudentOverviewPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = String(params.id ?? "");
  const { isLoaded, isSignedIn, getAuth } = useParentAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [bands, setBands] = useState<ConceptMasteryBand[]>([]);
  const [trend, setTrend] = useState<MasteryTrendPoint[]>([]);
  const [calendar, setCalendar] = useState<PracticeCalendarDay[]>([]);
  const [patterns, setPatterns] = useState<PatternHistoryItem[]>([]);
  const [weeklyNote, setWeeklyNote] = useState<string | null>(null);
  const [auth, setAuth] = useState<ParentAuthInput | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Progress — Cogna";
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/parent/login");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const resolvedAuth = await getAuth();
        if (!cancelled) setAuth(resolvedAuth);
        const [studentList, bandList, calendarDays, patternList] = await Promise.all([
          api.listStudents(resolvedAuth),
          api.getConceptBands(resolvedAuth, studentId),
          api.getPracticeCalendar(resolvedAuth, studentId, 5),
          api.getPatternHistory(resolvedAuth, studentId, 8),
        ]);
        if (cancelled) return;
        setStudents(studentList);
        setBands(bandList);
        setCalendar(calendarDays);
        setPatterns(patternList);

        const focusConcept = [...bandList].sort((a, b) =>
          b.lastPracticedAt.localeCompare(a.lastPracticedAt),
        )[0]?.conceptId;
        if (focusConcept) {
          const trendPoints = await api.getMasteryTrend(resolvedAuth, studentId, {
            conceptId: focusConcept,
            weeks: 6,
          });
          if (!cancelled) setTrend(trendPoints);
        }

        try {
          const weekly = await api.getParentWeeklySummary(resolvedAuth, studentId);
          if (!cancelled) setWeeklyNote(weekly.renderedText ?? null);
        } catch (err) {
          if (!cancelled && !isNotFound(err)) throw err;
        }
      } catch {
        if (!cancelled) setError("We couldn't load this student's progress. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getAuth, router, studentId]);

  if (!isLoaded || !isSignedIn) return <p>Loading…</p>;

  const current = students.find((s) => s.id === studentId);
  const minutesThisWeek = calendar.reduce((sum, d) => sum + d.minutes, 0);
  const sessionsThisWeek = calendar.reduce((sum, d) => sum + d.sessionCount, 0);

  return (
    <div className={`${styles.dash} phase-in`}>
      <div className={styles.dashHead}>
        <div className={styles.who}>
          <div className={styles.avatar}>{(current?.name ?? "?").charAt(0).toUpperCase()}</div>
          <div>
            <h1>{current ? `${current.name}'s progress` : "Progress"}</h1>
            <div className="faint" style={{ fontSize: "var(--text-sm)", marginTop: "0.15rem" }}>
              {current ? `Grade ${current.grade} · Linear Equations` : ""}
            </div>
          </div>
        </div>
        {students.length > 1 && (
          <div className={styles.childSwitch}>
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === studentId ? styles.on : ""}
                onClick={() => router.push(`/parent/students/${s.id}`)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading progress…</p>}

      {!loading && !error && (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <span className={styles.num}>{minutesThisWeek}</span>
              <span className={styles.lbl}>Minutes practiced this week</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.num}>{sessionsThisWeek}</span>
              <span className={styles.lbl}>Sessions completed</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.num}>{bands.length}</span>
              <span className={styles.lbl}>Concepts touched</span>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.col}>
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>Where it&apos;s heading</h3>
                  <span className="faint" style={{ fontSize: "var(--text-xs)" }}>Newest-practiced concept, last 6 weeks</span>
                </div>
                <GrowthChart points={trend} />
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>Where each concept stands</h3>
                  <span className="faint" style={{ fontSize: "var(--text-xs)" }}>Not a grade — a snapshot</span>
                </div>
                <ConceptMeters bands={bands} />
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>Practice consistency</h3>
                  <span className="faint" style={{ fontSize: "var(--text-xs)" }}>Last 5 weeks</span>
                </div>
                <PracticeCalendar days={calendar} weeks={5} />
              </div>
            </div>

            <div className={styles.col}>
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>This week&apos;s note</h3>
                </div>
                {weeklyNote ? (
                  <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--ink)" }}>
                    {humanizeParentCopy(weeklyNote)}
                  </p>
                ) : (
                  <p className="faint">No weekly note yet — check back after a few sessions.</p>
                )}
                <div style={{ marginTop: "var(--s-3)" }}>
                  <Link href={`/parent/students/${studentId}/weekly`} className="btn-quiet" style={{ padding: 0 }}>
                    View full weekly update →
                  </Link>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>Pattern history</h3>
                  <span className="faint" style={{ fontSize: "var(--text-xs)" }}>Across weeks, not one session</span>
                </div>
                <PatternHistory items={patterns} />
              </div>

              <TrustPanel auth={auth ?? undefined} studentId={studentId} />
            </div>
          </div>

          <p className="faint" style={{ fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
            A note on certainty: trends need a few weeks to mean something. One quiet session
            doesn&apos;t undo six good ones, and one strong session doesn&apos;t make a pattern
            &ldquo;resolved&rdquo; on its own.
          </p>

          <div className="actions">
            <Link href="/parent/dashboard" className="btn-quiet">
              Back to dashboard
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
