"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type ClassroomAssignmentKind, type ClassroomRunReport, type PilotClassReport, type ProductionClassroom } from "@/lib/api";
import shared from "../teacher.module.css";
import styles from "./pilot.module.css";

/**
 * Pilot console. The teacher's one action is releasing the Lotus diagnostic;
 * after that every student moves through diagnostic → lesson and practice →
 * independent exit on their own (apps/api/src/classrooms/pilot-flow.ts), and
 * this page shows the class as it happens.
 */

const PILOT_TOPIC = "factorisation";
const REFRESH_MS = 3000;

type Row = PilotClassReport["students"][number];

const STAGES: Array<{ key: Row["stage"]; label: string }> = [
  { key: "DIAGNOSTIC", label: "Diagnostic" },
  { key: "LESSON", label: "Lesson" },
  { key: "EXIT", label: "Exit" },
];
const ORDER: Row["stage"][] = ["JOINED", "DIAGNOSTIC", "LESSON", "EXIT", "DONE"];

function stepState(row: Row, step: Row["stage"]): "done" | "now" | "next" | "skipped" {
  const at = ORDER.indexOf(row.stage);
  const me = ORDER.indexOf(step);
  if (row.stage === "DONE" && row.stageStatus === "SKIPPED" && step !== "DIAGNOSTIC") return "skipped";
  if (at > me) return "done";
  if (at === me) return row.stageStatus === "COMPLETE" ? "done" : "now";
  return "next";
}

const PROGRESS_LABEL: Record<Row["progress"], string> = {
  IMPROVED: "Improved",
  NOT_YET: "Not yet",
  NO_GAP: "Secure",
  UNCLEAR: "Unclear",
  PENDING: "—",
};

export default function PilotConsolePage() {
  const [classes, setClasses] = useState<ProductionClassroom[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [runId, setRunId] = useState("");
  const [report, setReport] = useState<ClassroomRunReport | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const activeClass = useMemo(() => classes.find((c) => c.id === classroomId), [classes, classroomId]);

  useEffect(() => {
    api
      .listClassrooms()
      .then((items) => {
        setClasses(items);
        const requested = new URLSearchParams(window.location.search).get("classroom");
        const selected = requested && items.some((c) => c.id === requested) ? requested : items[0]?.id ?? "";
        setClassroomId(selected);
        const latest = items.find((c) => c.id === selected)?.runs?.[0];
        if (latest) setRunId(latest.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your classes."));
  }, []);

  useEffect(() => {
    if (!runId) return;
    const refresh = () => api.getClassroomRunReport(runId).then(setReport).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [runId]);

  async function release() {
    if (!classroomId) return;
    setBusy("release");
    setError("");
    try {
      const run = await api.createClassroomRun(classroomId, {
        title: "Factorisation · Lotus diagnostic",
        topicId: PILOT_TOPIC,
        config: { diagnostic: "LOTUS", teaching: ["AI_VERIFIED_LESSON", "ANIMATED_PRACTICE"], exit: "PERSONALIZED_INDEPENDENT", autoAdvance: true },
      });
      setRunId(run.id);
      setReport(await api.launchClassroomPhase(run.id, "DIAGNOSTIC"));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not release the diagnostic.");
    } finally {
      setBusy("");
    }
  }

  async function launch(phase: ClassroomAssignmentKind) {
    if (!runId) return;
    setBusy(phase);
    setError("");
    try {
      setReport(await api.launchClassroomPhase(runId, phase));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not send this step.");
    } finally {
      setBusy("");
    }
  }

  const cr = report?.classReport;
  const t = cr?.totals;

  return (
    <>
      <div className={shared.pageHeader}>
        <div>
          <div className={shared.dateLine}>Pilot · {activeClass ? `Grade ${activeClass.grade}` : "Lotus"}</div>
          <h1>{activeClass?.name ?? "Your class"}</h1>
          <p>Release the diagnostic. Each student is then taught and checked on their own, and the results build up here.</p>
        </div>
        <Link className={shared.secondary} href="/teacher/classes">Manage classes</Link>
      </div>

      {error && (
        <section className={shared.emptyCard}>
          <strong>That didn&apos;t work</strong>
          <p>{error}</p>
        </section>
      )}

      {!runId ? (
        <section className={styles.releaseCard}>
          <div>
            <p className={styles.eyebrow}>Step 1 · students join</p>
            <h2>Students open Cogna and enter this code</h2>
            <div className={styles.joinCode} data-testid="join-code">{activeClass?.joinCode ?? "—"}</div>
            <p className={styles.muted}>
              {activeClass?._count?.enrollments ?? 0} joined so far.{" "}
              {classes.length > 1 && (
                <select className={styles.select} value={classroomId} onChange={(e) => setClassroomId(e.target.value)} aria-label="Class">
                  {classes.map((c) => (
                    <option value={c.id} key={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </p>
          </div>
          <div className={styles.releaseSide}>
            <p className={styles.eyebrow}>Step 2 · release</p>
            <h2>Lotus diagnostic: factorisation</h2>
            <ul className={styles.ruleList}>
              <li>Up to 15 minutes. It ends early once Lotus confirms a starting point.</li>
              <li>Each student then gets a 20-second lesson on their own mistake, a longer lesson, practice games and two independent questions.</li>
              <li>Nothing else to press: results appear here as students finish.</li>
            </ul>
            <button className={styles.releaseButton} onClick={() => void release()} disabled={!classroomId || Boolean(busy)}>
              {busy === "release" ? "Releasing…" : "Release Lotus diagnostic →"}
            </button>
            {!classes.length && <p className={styles.muted}>Create a class first.</p>}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.liveBar}>
            <div>
              <span className={styles.livePill} data-live={report?.run.status === "LIVE"}>{report?.run.status === "COMPLETE" ? "Complete" : "● Live"}</span>
              <strong>{report?.run.title ?? "Factorisation · Lotus diagnostic"}</strong>
            </div>
            <div className={styles.liveCode}>
              Join code <b data-testid="join-code">{report?.run.classroom.joinCode ?? activeClass?.joinCode}</b>
            </div>
          </section>

          {t && (
            <section className={styles.totals} aria-label="Class totals">
              <Total label="Joined" value={t.enrolled} />
              <Total label="Diagnostic done" value={t.diagnosticDone} of={t.enrolled} />
              <Total label="Gap found" value={t.gapFound} of={t.diagnosticDone} />
              <Total label="Lesson done" value={t.lessonDone} of={t.gapFound} />
              <Total label="Exit done" value={t.exitDone} of={t.gapFound} />
              <Total label="Improved" value={t.improved} of={t.exitDone} accent />
            </section>
          )}

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3>Students</h3>
                <span className={styles.muted}>Updates every few seconds</span>
              </div>
              <div className={styles.roster} role="table" aria-label="Student progress">
                <div className={styles.rosterHead} role="row">
                  <span>Student</span>
                  <span>Progress</span>
                  <span>Starting point</span>
                  <span>Practice</span>
                  <span>Result</span>
                </div>
                {cr?.students.map((row) => (
                  <div className={styles.rosterRow} role="row" key={row.studentId} data-testid="roster-row">
                    <span className={styles.name}>
                      <i className={styles.avatar}>{row.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</i>
                      {row.name}
                    </span>
                    <span className={styles.steps}>
                      {STAGES.map((s) => (
                        <i key={s.key} className={styles.step} data-state={stepState(row, s.key)} title={s.label}>
                          {s.label}
                        </i>
                      ))}
                    </span>
                    <span className={styles.start}>
                      {row.startingPoint?.name ?? (row.outcome === "ADVANCEMENT" ? "No gap: secure" : row.outcome ? "Unclear" : row.stage === "DIAGNOSTIC" ? "Testing…" : "—")}
                      {row.answered ? <small>{row.answered} questions{row.minutes ? ` · ${row.minutes} min` : ""}{row.endedNote ? " · ended early" : ""}</small> : null}
                    </span>
                    <span className={styles.practice}>
                      {row.lesson?.practice?.total ? `${row.lesson.practice.correct}/${row.lesson.practice.total}` : "—"}
                      {row.lesson?.authoredBy === "AI" && <small>AI lesson</small>}
                    </span>
                    <span>
                      <b className={styles.progress} data-progress={row.progress}>{PROGRESS_LABEL[row.progress]}</b>
                      {row.exitScore && <small className={styles.exitScore}>Alone, after the lesson: {row.exitScore.right} of {row.exitScore.total} right</small>}
                    </span>
                  </div>
                ))}
                {!cr?.students.length && <p className={styles.muted}>No students yet. Share the join code.</p>}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3>Class results</h3>
              </div>
              <p className={styles.headline}>{cr?.headline ?? "Results appear as each diagnostic finishes."}</p>
              {cr?.gapGroups.map((g) => (
                <article className={styles.group} key={g.skillId} data-testid="gap-group">
                  <p className={styles.eyebrow}>Need a bridge in</p>
                  <h4>{g.name}</h4>
                  <p>{g.students.join(", ")}</p>
                  <small>
                    {g.students.length} student{g.students.length === 1 ? "" : "s"} · lessons sent automatically
                    {g.exitDone ? ` · ${g.exitCorrect} of ${g.exitDone} right on their own afterwards` : ""}
                  </small>
                </article>
              ))}
              {!!cr?.skills.length && (
                <div className={styles.skills}>
                  <p className={styles.eyebrow}>Skills across the class</p>
                  {cr.skills.slice(0, 8).map((k) => {
                    const total = Math.max(1, k.secure + k.gap + k.suspected);
                    return (
                      <div className={styles.skill} key={k.skillId}>
                        <span>{k.name}</span>
                        <span className={styles.bar} aria-label={`${k.secure} secure, ${k.suspected} unsure, ${k.gap} gap`}>
                          <i style={{ width: `${(k.secure / total) * 100}%` }} data-kind="secure" />
                          <i style={{ width: `${(k.suspected / total) * 100}%` }} data-kind="suspected" />
                          <i style={{ width: `${(k.gap / total) * 100}%` }} data-kind="gap" />
                        </span>
                      </div>
                    );
                  })}
                  <p className={styles.legend}>
                    <i data-kind="secure" /> secure <i data-kind="suspected" /> unsure <i data-kind="gap" /> gap
                  </p>
                </div>
              )}
            </section>
          </div>

          <section className={styles.footerActions}>
            <button className={shared.secondary} onClick={() => void launch("DIAGNOSTIC")} disabled={Boolean(busy)}>
              {busy === "DIAGNOSTIC" ? "Sending…" : "Send the diagnostic to anyone who joined late"}
            </button>
            {report && !report.autoAdvance && (
              <>
                <button className={shared.secondary} onClick={() => void launch("TEACHING")} disabled={Boolean(busy)}>Send teaching</button>
                <button className={shared.secondary} onClick={() => void launch("INDEPENDENT_EXIT")} disabled={Boolean(busy)}>Send exit check</button>
              </>
            )}
            <button className={shared.secondary} onClick={() => { setRunId(""); setReport(null); }}>Start a new release</button>
          </section>
        </>
      )}
    </>
  );
}

function Total({ label, value, of, accent }: { label: string; value: number; of?: number; accent?: boolean }) {
  return (
    <div className={styles.total} data-accent={accent}>
      <strong>
        {value}
        {of !== undefined && <small>/{of}</small>}
      </strong>
      <span>{label}</span>
    </div>
  );
}
