"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ClassRosterStudent, type ClassroomRunReport } from "@/lib/api";
import { studentStatus } from "@/lib/teacher-status";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { LIVE_MS, useRefreshTick } from "@/lib/use-refresh-tick";
import { SAMPLE_ACTION_NOTE, teacherData } from "@/lib/teacher-mode";
import { ClassTabs } from "../class-tabs";
import styles from "../teacher.module.css";

export default function TeacherStudentsPage() {
  const { sample, classes, selectedId, selected, select, loaded, error: loadError } = useTeacherClasses();
  const [roster, setRoster] = useState<ClassRosterStudent[]>([]);
  const [report, setReport] = useState<ClassroomRunReport | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const runId = selected?.runs?.[0]?.id;
  const tick = useRefreshTick(LIVE_MS);
  const shown = useRef("");
  useEffect(() => {
    // Clear only when switching class or sample mode; a live refresh keeps the page on screen.
    if (shown.current !== `${selectedId}|${runId}|${sample}`) {
      setRoster([]);
      setReport(null);
    }
    shown.current = `${selectedId}|${runId}|${sample}`;
    if (!selectedId) return;
    const data = teacherData(sample);
    let current = true; // a slower, outdated load must not overwrite a newer one
    data.getClassRoster(selectedId).then((r) => current && setRoster(r)).catch((cause) => current && setError(cause instanceof Error ? cause.message : "Could not load students."));
    if (runId) data.getClassroomRunReport(runId).then((r) => current && setReport(r)).catch(() => undefined);
    return () => { current = false; };
  }, [selectedId, runId, sample, tick]);

  async function remove(student: ClassRosterStudent) {
    setConfirming(null);
    setError("");
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    try {
      await api.removeStudentFromClass(selectedId, student.studentId);
      setRoster((prev) => prev.filter((row) => row.studentId !== student.studentId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove the student.");
    }
  }

  const rows = new Map((report?.classReport.students ?? []).map((row) => [row.studentId, row]));
  const checkTitle = report ? `${report.run.title}${report.run.status === "LIVE" ? " · still running" : ""}` : "No quick check yet";

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.dateLine}>Students{selected ? ` · ${roster.length} in this class` : ""}</div>
          <h1>{selected?.name ?? "Your students"}</h1>
          <p>{selected ? `Where each student is, from the latest quick check (${checkTitle}).` : "Students appear here once they join one of your classes."}</p>
        </div>
        <Link className={styles.secondary} href="/teacher/sessions">Go to class</Link>
      </div>

      <ClassTabs classes={classes} selectedId={selectedId} onSelect={(id) => void select(id)} />

      {(error || loadError) && <section className={styles.emptyCard}><strong>{error === SAMPLE_ACTION_NOTE ? "Sample data" : "That didn\u2019t work"}</strong><p>{error || loadError}</p></section>}

      {loaded && !classes.length ? (
        <section className={styles.emptyCard}><h2>No classes yet</h2><p>Create a class and share its code. Students show up here as they join.</p><Link className={styles.primary} href="/teacher/sessions">Create a class →</Link></section>
      ) : selected && !roster.length ? (
        <section className={styles.emptyCard}><h2>No students in {selected.name} yet</h2><p>Share the join code <b>{selected.joinCode}</b>. Names appear here as students join.</p></section>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 820 }}>
            <thead><tr><th>Student</th><th>Status</th><th>Needs help with</th><th>Practice</th><th>Final question</th><th /></tr></thead>
            <tbody>
              {roster.map((student) => {
                const row = rows.get(student.studentId);
                const status = studentStatus(row);
                return (
                  <tr key={student.studentId}>
                    <td>
                      <span className={styles.studentName}>{student.name}</span>
                      <span className={styles.studentMeta}>{student.rollNumber ? `Roll ${student.rollNumber}` : "No roll number"}</span>
                      {student.alsoIn.length > 0 && <span className={styles.alsoIn}>Also in {student.alsoIn.map((c) => c.name).join(", ")}</span>}
                    </td>
                    <td><span className={`${styles.status} ${styles[status.tone] ?? ""}`}>{status.label}</span></td>
                    <td>{row?.startingPoint?.name ?? (row?.progress === "NO_GAP" ? "Nothing right now" : "—")}</td>
                    <td>{row?.lesson?.practice?.total ? `${row.lesson.practice.correct}/${row.lesson.practice.total} right` : "—"}</td>
                    <td>{row?.exitCorrect === true ? "Right on their own" : row?.exitCorrect === false ? "Not yet" : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {confirming === student.studentId ? (
                        <>
                          <button type="button" className={styles.removeConfirm} onClick={() => void remove(student)}>Remove from {selected?.name}</button>{" "}
                          <button type="button" className={styles.textButton} onClick={() => setConfirming(null)}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" className={styles.textButton} onClick={() => setConfirming(student.studentId)} aria-label={`Remove ${student.name} from ${selected?.name}`}>Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
