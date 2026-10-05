"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ClassroomRunReport } from "@/lib/api";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { useRefreshTick } from "@/lib/use-refresh-tick";
import { teacherData } from "@/lib/teacher-mode";
import { studentStatus } from "@/lib/teacher-status";
import { ClassTabs } from "../class-tabs";
import styles from "../teacher.module.css";
import r from "./reports.module.css";

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** The one sentence a teacher reads first. */
function summary(report: ClassroomRunReport): string {
  const t = report.classReport.totals;
  if (report.run.status === "LIVE") return `Still running: ${t.diagnosticDone} of ${t.enrolled} have finished the check.`;
  if (!t.diagnosticDone) return "The check ended before anyone finished it.";
  const fixed = t.exitDone ? `, and ${t.improved} of ${t.exitDone} got it right on their own afterwards` : "";
  const early = t.diagnosticDone < t.enrolled ? ` ${t.enrolled - t.diagnosticDone} didn’t finish.` : "";
  return `${t.diagnosticDone} of ${t.enrolled} finished the check. ${t.gapFound} needed a fix${fixed}.${early}`;
}

export default function TeacherReportsPage() {
  const { sample, classes, selectedId, selected, select, loaded, error: loadError } = useTeacherClasses();
  const [runId, setRunId] = useState("");
  const [report, setReport] = useState<ClassroomRunReport | null>(null);
  const [error, setError] = useState("");

  const runs = selected?.runs ?? [];
  useEffect(() => setRunId(runs[0]?.id ?? ""), [selectedId, runs[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tick = useRefreshTick();
  const shown = useRef("");
  useEffect(() => {
    // Clear only when switching report or sample mode; a live refresh keeps the page on screen.
    if (shown.current !== `${runId}|${sample}`) {
      setReport(null);
      setError("");
    }
    shown.current = `${runId}|${sample}`;
    if (!runId) return;
    let current = true; // a slower, outdated load must not overwrite a newer one
    teacherData(sample).getClassroomRunReport(runId)
      .then((r) => current && setReport(r))
      .catch((cause) => current && setError(cause instanceof Error ? cause.message : "This report could not be loaded."));
    return () => { current = false; };
  }, [runId, sample, tick]);

  const cr = report?.classReport;
  const t = cr?.totals;
  const funnel = t
    ? [
        ["Joined", t.enrolled],
        ["Finished the check", t.diagnosticDone],
        ["Needed a fix", t.gapFound],
        ["Did the lesson", t.lessonDone],
        ["Final question", t.exitDone],
        ["Fixed it", t.improved],
      ] as const
    : [];

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.dateLine}>Reports</div>
          <h1>{selected?.name ?? "Reports"}</h1>
          <p>How each quick check went, and who still needs help.</p>
        </div>
      </div>

      <ClassTabs classes={classes} selectedId={selectedId} onSelect={(id) => void select(id)} />

      {(error || loadError) && <section className={styles.emptyCard}><strong>That didn&apos;t work</strong><p>{error || loadError}</p></section>}

      {loaded && !classes.length ? (
        <section className={styles.emptyCard}><h2>No classes yet</h2><p>Create a class and run a quick check. Its report appears here.</p><Link className={styles.primary} href="/teacher/sessions">Create a class →</Link></section>
      ) : selected && !runs.length ? (
        <section className={styles.emptyCard}><h2>No checks in {selected.name} yet</h2><p>Each quick check you run gets its own report here.</p><Link className={styles.primary} href="/teacher/sessions">Start the quick check →</Link></section>
      ) : selected ? (
        <div className={r.layout}>
          <nav className={r.history} aria-label={`Checks in ${selected.name}`}>
            <h3>Checks</h3>
            {runs.map((run) => (
              <button type="button" key={run.id} aria-current={run.id === runId ? "true" : undefined} onClick={() => setRunId(run.id)}>
                <strong>{run.title}</strong>
                <span>{when(run.startedAt ?? run.createdAt)}</span>
                <i data-live={run.status === "LIVE"}>{run.status === "LIVE" ? "Running" : "Finished"}</i>
              </button>
            ))}
          </nav>

          <div className={r.report}>
            {!report || !cr || !t ? (
              <section className={styles.emptyCard}><p>Loading the report…</p></section>
            ) : (
              <>
                <section className={r.summary}>
                  <div className={r.summaryMeta}>
                    <span data-live={report.run.status === "LIVE"}>{report.run.status === "LIVE" ? "● Running" : "Finished"}</span>
                    {report.run.title} · {when(runs.find((x) => x.id === runId)?.startedAt ?? runs.find((x) => x.id === runId)?.createdAt)}
                  </div>
                  <h2>{summary(report)}</h2>
                  {cr.headline && t.diagnosticDone > 0 && <p>{cr.headline}</p>}
                  <ol className={r.funnel} aria-label="How far students got">
                    {funnel.map(([label, value]) => (
                      <li key={label}>
                        <strong>{value}</strong>
                        <span>{label}</span>
                        <i style={{ width: `${t.enrolled ? Math.max(4, (value / t.enrolled) * 100) : 4}%` }} />
                      </li>
                    ))}
                  </ol>
                </section>

                <div className={r.twoCol}>
                  <section className={r.card}>
                    <h3>Who needs help with what</h3>
                    {cr.gapGroups.length ? (
                      <ul className={r.groups}>
                        {cr.gapGroups.map((g) => (
                          <li key={g.skillId}>
                            <strong>{g.name}</strong>
                            <span>{g.students.join(", ")}</span>
                            <small>{g.exitDone ? `${g.exitCorrect} of ${g.exitDone} got the final question right afterwards` : "Lessons sent; final question not done yet"}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={r.muted}>{t.diagnosticDone ? "No one needed a fix in this check." : "Groups appear as students finish the check."}</p>
                    )}
                  </section>

                  <section className={r.card}>
                    <h3>Skills across the class</h3>
                    {cr.skills.length ? (
                      <>
                        <div className={r.skills}>
                          {cr.skills.slice(0, 8).map((k) => {
                            const total = Math.max(1, k.secure + k.gap + k.suspected);
                            return (
                              <div key={k.skillId} className={r.skill}>
                                <span>{k.name}</span>
                                <span className={r.bar} aria-label={`${k.secure} secure, ${k.suspected} not sure yet, ${k.gap} need a fix`}>
                                  <i data-kind="secure" style={{ width: `${(k.secure / total) * 100}%` }} />
                                  <i data-kind="unsure" style={{ width: `${(k.suspected / total) * 100}%` }} />
                                  <i data-kind="gap" style={{ width: `${(k.gap / total) * 100}%` }} />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <p className={r.legend}><i data-kind="secure" /> Secure <i data-kind="unsure" /> Not sure yet <i data-kind="gap" /> Needs a fix</p>
                      </>
                    ) : (
                      <p className={r.muted}>Skills appear as students finish the check.</p>
                    )}
                  </section>
                </div>

                <section className={r.card}>
                  <div className={r.cardHead}><h3>Each student</h3><Link className={styles.textLink} href="/teacher/students">Manage students →</Link></div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table} style={{ minWidth: 520 }}>
                      <thead><tr><th>Student</th><th>Result</th><th>Needs help with</th><th>Practice</th><th>Final question</th></tr></thead>
                      <tbody>
                        {cr.students.map((row) => {
                          const status = studentStatus(row);
                          return (
                            <tr key={row.studentId}>
                              <td><span className={styles.studentName}>{row.name}</span>{row.rollNumber ? <span className={styles.studentMeta}>Roll {row.rollNumber}</span> : null}</td>
                              <td><span className={`${styles.status} ${styles[status.tone] ?? ""}`}>{status.label}</span></td>
                              <td>{row.startingPoint?.name ?? "—"}</td>
                              <td>{row.lesson?.practice?.total ? `${row.lesson.practice.correct}/${row.lesson.practice.total} right` : "—"}</td>
                              <td>{row.exitCorrect === true ? "Right on their own" : row.exitCorrect === false ? "Not yet" : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
