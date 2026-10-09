"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_MS, useRefreshTick } from "@/lib/use-refresh-tick";
import { api, ApiError, liveUpdates, type ClassActivityEvent, type ClassRosterStudent, type ClassroomAssignmentKind, type ClassroomRunReport, type IssuedStudentCode, type PilotClassReport } from "@/lib/api";
import { activityLine, applyActivity } from "@/lib/class-live";
import { useEventStream } from "@/lib/event-stream";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { SAMPLE_ACTION_NOTE, teacherData } from "@/lib/teacher-mode";
import { ClassTabs } from "../class-tabs";
import { AddStudents, CodesSheet } from "./add-students";
import { TopicPanel } from "./topic-panel";
import shared from "../teacher.module.css";
import styles from "./pilot.module.css";

/**
 * The teacher's one class page: name the class (first time only), show the
 * join code, and work through the topic plan (TopicPanel: diagnostic, topic
 * check, catch-up, move on). Every check runs check → lesson and practice →
 * final question for each student on their own
 * (apps/api/src/classrooms/pilot-flow.ts), and this page shows it live.
 */

/** Without live updates (sample mode, or the stream is down) the page re-reads this often. */
const REFRESH_MS = 3000;
/** With live updates, a slow re-read only catches anything the stream missed. */
const LIVE_REFRESH_MS = 30_000;

type Row = PilotClassReport["students"][number];

const STAGES: Array<{ key: Row["stage"]; label: string }> = [
  { key: "DIAGNOSTIC", label: "Check" },
  { key: "LESSON", label: "Lesson" },
  { key: "EXIT", label: "Final" },
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
  IMPROVED: "Fixed it",
  NOT_YET: "Not yet",
  NO_GAP: "Ready",
  UNCLEAR: "Check again",
  PENDING: "—",
};

export default function PilotConsolePage() {
  const { sample, classes, setClasses, selectedId: classroomId, selected: activeClass, select, refresh: refreshClasses, loaded, error: loadError } = useTeacherClasses();
  const [runId, setRunId] = useState("");
  const [report, setReport] = useState<ClassroomRunReport | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("Grade 8 · Section A");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState<string | null>(null);

  const [roster, setRoster] = useState<ClassRosterStudent[]>([]);
  const [issued, setIssued] = useState<IssuedStudentCode[] | null>(null);

  // Follow the selected class's latest check. The list is re-read on every switch and
  // after starting a check, so a check that is already running is never hidden.
  const latestRunId = activeClass?.runs?.[0]?.id ?? "";
  // The class list (and so its latest check) is re-read too, so a check started elsewhere appears.
  const listTick = useRefreshTick(LIVE_MS * 2);
  useEffect(() => {
    if (listTick && classroomId) void refreshClasses(classroomId);
  }, [listTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setReport(null);
    setRunId(latestRunId);
  }, [classroomId, latestRunId]);

  // Polls overlap with class switches: only a roster for the class (and mode) on screen is applied.
  const rosterFor = useRef("");
  const loadRoster = useCallback(() => {
    if (!classroomId) return;
    const key = `${sample}:${classroomId}`;
    rosterFor.current = key;
    teacherData(sample).getClassRoster(classroomId).then((r) => rosterFor.current === key && setRoster(r)).catch(() => undefined);
  }, [classroomId, sample]);

  // Only the latest report request may land: a slower, outdated load must not overwrite a newer one.
  const reportSeq = useRef(0);
  const refreshReport = useCallback(() => {
    if (!runId) return;
    const seq = ++reportSeq.current;
    teacherData(sample).getClassroomRunReport(runId).then((r) => seq === reportSeq.current && setReport(r)).catch(() => undefined);
  }, [runId, sample]);

  // Live updates: a changed step reloads the report (a burst of them, once), a new answer patches its row.
  const reportTimer = useRef<number | undefined>(undefined);
  const soonRefreshReport = useCallback(() => {
    window.clearTimeout(reportTimer.current);
    reportTimer.current = window.setTimeout(refreshReport, 250);
  }, [refreshReport]);
  useEffect(() => () => window.clearTimeout(reportTimer.current), []);
  const [topicTick, setTopicTick] = useState(0);
  const live = useEventStream(classroomId && !sample ? liveUpdates.classUrl(classroomId) : null, liveUpdates.teacherHeaders, (event) => {
    if (event.type === "ready") {
      // (Re)connected: catch up on anything missed while the stream was down.
      loadRoster();
      soonRefreshReport();
    } else if (event.type === "roster") {
      loadRoster();
    } else if (event.type === "progress") {
      if (event.runId && event.runId !== runId && classroomId) void refreshClasses(classroomId);
      else soonRefreshReport();
      setTopicTick((n) => n + 1);
    } else if (event.type === "activity") {
      const update = event as unknown as ClassActivityEvent;
      setReport((prev) => {
        if (!prev) return prev;
        const next = applyActivity(prev, update);
        if (!next) soonRefreshReport();
        return next ?? prev;
      });
    }
  });
  const refreshMs = live ? LIVE_REFRESH_MS : REFRESH_MS;

  useEffect(() => {
    setRoster([]);
    loadRoster();
  }, [loadRoster]);
  useEffect(() => {
    const timer = window.setInterval(loadRoster, refreshMs);
    return () => window.clearInterval(timer);
  }, [loadRoster, refreshMs]);

  useEffect(() => {
    if (!runId) return;
    refreshReport();
    const timer = window.setInterval(refreshReport, refreshMs);
    return () => { reportSeq.current += 1; window.clearInterval(timer); };
  }, [refreshReport, refreshMs]);

  // "Active 2 min ago" keeps counting between reloads.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  async function createClass(event: React.FormEvent) {
    event.preventDefault();
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    setBusy("create");
    setError("");
    try {
      const created = await api.createClassroom({ name: newName.trim(), grade: Number(newName.match(/\d+/)?.[0]) || 8, subjectId: "mathematics", isDemo: false });
      await refreshClasses(created.id);
      setCreating(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not create the class.");
    } finally {
      setBusy("");
    }
  }

  function selectClass(id: string) {
    setCreating(false);
    setRenaming(null);
    setConfirmEnd(false);
    void select(id);
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    if (!activeClass || renaming === null || !renaming.trim()) return;
    setBusy("rename");
    setError("");
    try {
      const updated = await api.renameClassroom(activeClass.id, renaming.trim());
      setClasses((prev) => prev.map((c) => (c.id === updated.id ? { ...c, name: updated.name } : c)));
      setRenaming(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not rename the class.");
    } finally {
      setBusy("");
    }
  }

  async function endCheck() {
    setConfirmEnd(false);
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    if (!runId) return;
    setBusy("end");
    setError("");
    try {
      setReport(await api.endClassroomRun(runId));
      setConfirmEnd(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not end the check.");
    } finally {
      setBusy("");
    }
  }

  /** Pause, time limit and restart all answer with the fresh report. */
  async function runControl(key: string, action: () => Promise<ClassroomRunReport>, failure: string) {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    setBusy(key);
    setError("");
    try {
      setReport(await action());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : failure);
    } finally {
      setBusy("");
    }
  }

  const [nudgeNote, setNudgeNote] = useState("");
  async function nudge() {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    if (!runId) return;
    setBusy("nudge");
    setError("");
    try {
      const { nudged, alreadyReminded } = await api.nudgeClassroomRun(runId);
      setNudgeNote(nudged ? `Reminded ${nudged} student${nudged === 1 ? "" : "s"}.` : alreadyReminded ? "Everyone waiting was reminded in the last minute." : "Everyone has started.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not send reminders.");
    } finally {
      setBusy("");
    }
  }

  async function issueParentCode(student: ClassRosterStudent) {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    setBusy(`parent:${student.studentId}`);
    setError("");
    try {
      setIssued([await api.issueParentCode(classroomId, student.studentId)]);
      loadRoster();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not issue a parent code.");
    } finally {
      setBusy("");
    }
  }

  async function removeStudent(student: ClassRosterStudent) {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    setBusy(`remove:${student.studentId}`);
    setError("");
    try {
      await api.removeStudentFromClass(classroomId, student.studentId);
      setRoster((prev) => prev.filter((row) => row.studentId !== student.studentId));
      setClasses((prev) => prev.map((c) => (c.id === classroomId && c._count ? { ...c, _count: { enrollments: Math.max(0, c._count.enrollments - 1) } } : c)));
      if (runId) setReport(await teacherData(sample).getClassroomRunReport(runId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove the student.");
    } finally {
      setBusy("");
    }
  }

  async function resetCode(student: ClassRosterStudent) {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    setBusy(`code:${student.studentId}`);
    setError("");
    try {
      setIssued([await api.resetStudentAccessCode(classroomId, student.studentId)]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not issue a new code.");
    } finally {
      setBusy("");
    }
  }

  async function launch(phase: ClassroomAssignmentKind) {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
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

  const ended = report?.run.status === "COMPLETE" || report?.run.status === "CANCELLED";
  const cr = report?.classReport;
  const t = cr?.totals;

  return (
    <>
      <div className={shared.pageHeader}>
        <div>
          <div className={shared.dateLine}>Class{activeClass && !creating ? ` · Grade ${activeClass.grade}` : ""}</div>
          {activeClass && renaming !== null ? (
            <form className={styles.renameForm} onSubmit={saveName}>
              <input className={shared.formInput} value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="Class name" maxLength={100} autoFocus onFocus={(e) => e.currentTarget.select()} required />
              <button className={shared.primary} disabled={busy === "rename" || renaming.trim().length < 2}>{busy === "rename" ? "Saving…" : "Save"}</button>
              <button type="button" className={shared.secondary} onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : (
            <div className={styles.titleRow}>
              <h1>{creating ? "New class" : activeClass?.name ?? "Start your class"}</h1>
              {activeClass && !creating && <button type="button" className={styles.renameButton} onClick={() => setRenaming(activeClass.name)}>Rename</button>}
            </div>
          )}
          <p>Students join with the code. Pick the topic you&apos;re teaching and Cogna checks, teaches and rechecks each student on their own. Results show up here.</p>
        </div>
      </div>

      {classes.length > 0 && (
        <ClassTabs classes={classes} selectedId={classroomId} creating={creating} onSelect={selectClass} onNew={() => { setCreating(true); setRenaming(null); setNewName(""); }} />
      )}

      {(error || loadError) && (
        <section className={shared.emptyCard}>
          <strong>{error === SAMPLE_ACTION_NOTE ? "Sample data" : "That didn\u2019t work"}</strong>
          <p>{error || loadError}</p>
        </section>
      )}

      {activeClass && !creating && (
        <TopicPanel classroomId={activeClass.id} sample={sample} live={live} changeTick={topicTick} onCheckStarted={() => void refreshClasses(activeClass.id)} />
      )}

      {creating || !runId ? (
        <section className={styles.releaseCard}>
          {(loaded && !classes.length) || creating ? (
          <form onSubmit={createClass}>
            <p className={styles.eyebrow}>Step 1 · name your class</p>
            <h2>What do you call this class?</h2>
            <label className={shared.formLabel}>Class name<input className={shared.formInput} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Grade 8 · Section B" autoFocus={creating} required /></label>
            <button className={styles.releaseButton} disabled={Boolean(busy) || !newName.trim()}>{busy === "create" ? "Creating…" : "Create class and get a code →"}</button>
          </form>
          ) : (
          <div>
            <p className={styles.eyebrow}>Step 1 · students join</p>
            <h2>Students open Cogna and enter this code</h2>
            <div className={styles.joinCode} data-testid="join-code">{activeClass?.joinCode ?? "—"}</div>
            <p className={styles.muted}>{roster.length} joined so far. Names appear below as students join.</p>
          </div>
          )}
          <div className={styles.releaseSide}>
            <p className={styles.eyebrow}>Step 2 · pick your topic</p>
            <h2>Then send its diagnostic</h2>
            <ul className={styles.ruleList}>
              <li>Up to 15 minutes. It ends early once Cogna knows where each student should start.</li>
              <li>Each student then gets a short lesson made from their own answers, practice games, and final questions to try on their own.</li>
              <li>After you teach the topic, the topic check shows who has understood, and a catch-up goes to anyone still stuck.</li>
            </ul>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.liveBar}>
            <div>
              <span className={styles.livePill} data-live={report?.run.status === "LIVE"}>{ended ? "Finished" : "● Live"}</span>
              <strong>{report?.run.title ?? "Quick check"}</strong>
            </div>
            <div className={styles.liveCode}>
              Join code <b data-testid="join-code">{report?.run.classroom.joinCode ?? activeClass?.joinCode}</b>
            </div>
            {report && !ended && (
              confirmEnd ? (
                <div className={styles.endConfirm} role="group" aria-label="End the check">
                  <span>End for everyone? Finished work is kept.</span>
                  <button type="button" className={styles.endButton} onClick={() => void endCheck()} disabled={busy === "end"}>{busy === "end" ? "Ending…" : "Yes, end it"}</button>
                  <button type="button" className={styles.keepButton} onClick={() => setConfirmEnd(false)}>Keep going</button>
                </div>
              ) : (
                <button type="button" className={styles.keepButton} onClick={() => setConfirmEnd(true)}>End check</button>
              )
            )}
          </section>

          {report && !ended && runId && (
            <CheckControls
              controls={report.controls}
              notStarted={(cr?.students ?? []).filter((row) => row.stage === "DIAGNOSTIC" && row.stageStatus === "READY").length}
              now={now}
              busy={busy}
              note={nudgeNote}
              onPause={(paused) => void runControl("pause", () => api.pauseClassroomRun(runId, paused), "Could not pause the check.")}
              onTimeLimit={(minutes) => void runControl("limit", () => api.setClassroomRunTimeLimit(runId, minutes), "Could not set the time limit.")}
              onNudge={() => void nudge()}
            />
          )}

          {t && (
            <section className={styles.totals} aria-label="Class totals">
              <Total label="Joined" value={t.enrolled} />
              <Total label="Check done" value={t.diagnosticDone} of={t.enrolled} />
              <Total label="Need a fix" value={t.gapFound} of={t.diagnosticDone} />
              <Total label="Lesson done" value={t.lessonDone} of={t.gapFound} />
              <Total label="Final question done" value={t.exitDone} of={t.gapFound} />
              <Total label="Fixed it" value={t.improved} of={t.exitDone} accent />
            </section>
          )}

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3>Students</h3>
                <span className={styles.muted} data-testid="live-status">{live ? "Live" : "Updates every few seconds"}</span>
              </div>
              <div className={styles.roster} role="table" aria-label="Student progress">
                <div className={styles.rosterHead} role="row">
                  <span>Student</span>
                  <span>Progress</span>
                  <span>Where to start</span>
                  <span>Practice</span>
                  <span>Result</span>
                </div>
                {cr?.students.map((row) => {
                  const activity = activityLine(row, now);
                  return (
                  <div className={styles.rosterRow} role="row" key={row.studentId} data-testid="roster-row" data-quiet={activity?.quiet || undefined}>
                    <span className={styles.name}>
                      <i className={styles.avatar}>{row.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</i>
                      <span className={styles.nameText}>
                        {row.name}
                        {activity && <small className={styles.activity} data-quiet={activity.quiet || undefined} data-testid="roster-activity">{activity.text}</small>}
                      </span>
                    </span>
                    <span className={styles.steps}>
                      {STAGES.map((s) => (
                        <i key={s.key} className={styles.step} data-state={stepState(row, s.key)} title={s.label}>
                          {s.label}
                        </i>
                      ))}
                    </span>
                    <span className={styles.start}>
                      {row.startingPoint?.name ?? (row.outcome === "ADVANCEMENT" ? "Nothing to fix" : row.outcome ? "Not sure yet" : row.stage === "DIAGNOSTIC" ? (row.stageStatus === "IN_PROGRESS" ? "Checking…" : "Not started") : "—")}
                      {row.answered ? <small>{row.answered} questions{row.minutes ? ` · ${row.minutes} min` : ""}{row.endedNote ? " · ended early" : ""}</small> : null}
                    </span>
                    <span className={styles.practice}>
                      {row.lesson?.practice?.total ? `${row.lesson.practice.correct}/${row.lesson.practice.total}` : "—"}
                      {row.lesson?.authoredBy === "AI" && <small>AI lesson</small>}
                    </span>
                    <span>
                      <b className={styles.progress} data-progress={row.progress}>{PROGRESS_LABEL[row.progress]}</b>
                      {row.exitScore && <small className={styles.exitScore}>Alone, after the lesson: {row.exitScore.right} of {row.exitScore.total} right</small>}
                      {!ended && row.stage !== "JOINED" && (
                        confirmRestart === row.studentId ? (
                          <span className={styles.rosterConfirm} role="group" aria-label={`Restart ${row.name}'s check`}>
                            Start {row.name.split(" ")[0]}&apos;s check again? What they did is set aside.
                            <button type="button" className={styles.removeYes} disabled={busy === `restart:${row.studentId}`} onClick={() => { setConfirmRestart(null); void runControl(`restart:${row.studentId}`, () => api.restartStudentCheck(runId, row.studentId), "Could not restart the check."); }}>Restart</button>
                            <button type="button" className={styles.removeNo} onClick={() => setConfirmRestart(null)}>Cancel</button>
                          </span>
                        ) : (
                          <button type="button" className={styles.rowAction} onClick={() => setConfirmRestart(row.studentId)} aria-label={`Restart ${row.name}'s check`}>Restart</button>
                        )
                      )}
                    </span>
                  </div>
                  );
                })}
                {!cr?.students.length && <p className={styles.muted}>No students yet. Share the join code.</p>}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3>Class results</h3>
              </div>
              <p className={styles.headline}>{cr?.headline ?? "Results appear as each student finishes the quick check."}</p>
              {cr?.gapGroups.map((g) => (
                <article className={styles.group} key={g.skillId} data-testid="gap-group">
                  <p className={styles.eyebrow}>Needs help with</p>
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
            {!ended && (
            <button className={shared.secondary} onClick={() => void launch("DIAGNOSTIC")} disabled={Boolean(busy)}>
              {busy === "DIAGNOSTIC" ? "Sending…" : "Send the quick check to anyone who joined late"}
            </button>
            )}
            {report && !ended && !report.autoAdvance && (
              <>
                <button className={shared.secondary} onClick={() => void launch("TEACHING")} disabled={Boolean(busy)}>Send teaching</button>
                <button className={shared.secondary} onClick={() => void launch("INDEPENDENT_EXIT")} disabled={Boolean(busy)}>Send final question</button>
              </>
            )}
            {ended && <button className={shared.primary} onClick={() => { setRunId(""); setReport(null); }}>Start a new check</button>}
          </section>
        </>
      )}
      {activeClass && !creating && issued && (
        <CodesSheet codes={issued} className={activeClass.name} onDone={() => setIssued(null)} />
      )}
      {activeClass && !creating && (
        <RosterPanel
          roster={roster}
          className={activeClass.name}
          busy={busy}
          onRemove={(student) => void removeStudent(student)}
          onResetCode={(student) => void resetCode(student)}
          onParentCode={(student) => void issueParentCode(student)}
          addStudents={sample ? <p className={styles.muted}>Adding students from a class list is turned off for sample data.</p> : <AddStudents classroomId={activeClass.id} onAdded={(codes) => { setIssued(codes); loadRoster(); }} />}
        />
      )}
    </>
  );
}

function RosterPanel({ roster, className, busy, onRemove, onResetCode, onParentCode, addStudents }: { roster: ClassRosterStudent[]; className: string; busy: string; onRemove: (student: ClassRosterStudent) => void; onResetCode: (student: ClassRosterStudent) => void; onParentCode: (student: ClassRosterStudent) => void; addStudents: React.ReactNode }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmingCode, setConfirmingCode] = useState<string | null>(null);
  const [confirmingParent, setConfirmingParent] = useState<string | null>(null);
  const flagged = roster.filter((s) => s.alsoIn.length).length;
  return (
    <section className={styles.rosterPanel} aria-label={`Students in ${className}`}>
      <div className={styles.panelHead}>
        <h3>Students in {className} <span className={styles.muted}>· {roster.length}</span></h3>
        {flagged > 0 && <span className={styles.flagNote}>{flagged} also in another of your classes</span>}
      </div>
      <div className={styles.rosterAdd}>{addStudents}</div>
      {!roster.length ? (
        <p className={styles.muted}>No one yet. Add your class list above, or students appear here as soon as they enter the join code.</p>
      ) : (
        <ul className={styles.rosterList}>
          {roster.map((s) => (
            <li key={s.studentId} data-flagged={s.alsoIn.length > 0}>
              <span className={styles.rosterName}>
                {s.name}
                {s.rollNumber ? <small>Roll {s.rollNumber}</small> : null}
                {s.alsoIn.length > 0 && <small className={styles.flag}>Also in {s.alsoIn.map((c) => c.name).join(", ")}</small>}
                {s.schoolIssuedCode && <small data-testid="parent-status">{s.parentLinked ? "Parent linked" : s.parentCodeActive ? "Parent code sent home" : "No parent linked"}</small>}
              </span>
              {confirmingParent === s.studentId ? (
                <span className={styles.rosterConfirm}>
                  New parent code? Any earlier one stops working.
                  <button type="button" className={styles.removeYes} onClick={() => { setConfirmingParent(null); onParentCode(s); }} disabled={busy === `parent:${s.studentId}`}>New parent code</button>
                  <button type="button" className={styles.removeNo} onClick={() => setConfirmingParent(null)}>Cancel</button>
                </span>
              ) : confirmingCode === s.studentId ? (
                <span className={styles.rosterConfirm}>
                  New code? The old one stops working.
                  <button type="button" className={styles.removeYes} onClick={() => { setConfirmingCode(null); onResetCode(s); }} disabled={busy === `code:${s.studentId}`}>New code</button>
                  <button type="button" className={styles.removeNo} onClick={() => setConfirmingCode(null)}>Cancel</button>
                </span>
              ) : confirming === s.studentId ? (
                <span className={styles.rosterConfirm}>
                  Remove from this class?
                  <button type="button" className={styles.removeYes} onClick={() => { setConfirming(null); onRemove(s); }} disabled={busy === `remove:${s.studentId}`}>Remove</button>
                  <button type="button" className={styles.removeNo} onClick={() => setConfirming(null)}>Cancel</button>
                </span>
              ) : (
                <span className={styles.rosterActions}>
                  {s.schoolIssuedCode && <button type="button" className={styles.removeNo} onClick={() => setConfirmingCode(s.studentId)} aria-label={`New sign-in code for ${s.name}`}>New code</button>}
                  {s.schoolIssuedCode && !s.parentLinked && <button type="button" className={styles.removeNo} onClick={() => setConfirmingParent(s.studentId)} aria-label={`New parent code for ${s.name}`}>Parent code</button>}
                  <button type="button" className={styles.removeNo} onClick={() => setConfirming(s.studentId)} aria-label={`Remove ${s.name} from ${className}`}>Remove</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TIME_LIMITS = [10, 15, 20, 30, 45];

/** The teacher's controls on a running check: pause, a time limit, and a reminder for anyone who hasn't started. */
function CheckControls({ controls, notStarted, now, busy, note, onPause, onTimeLimit, onNudge }: {
  controls?: ClassroomRunReport["controls"];
  notStarted: number;
  now: number;
  busy: string;
  note: string;
  onPause: (paused: boolean) => void;
  onTimeLimit: (minutes: number | null) => void;
  onNudge: () => void;
}) {
  const paused = Boolean(controls?.pausedAt);
  const endsAt = controls?.endsAt ? new Date(controls.endsAt) : null;
  const left = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now) / 60_000)) : null;
  return (
    <section className={styles.controls} aria-label="Check controls" data-paused={paused || undefined}>
      <button type="button" className={paused ? styles.resumeButton : styles.pauseButton} disabled={busy === "pause"} onClick={() => onPause(!paused)}>
        {paused ? "Resume" : "Pause"}
      </button>
      <span className={styles.controlText} data-testid="pause-status">
        {paused ? "Paused: students can't start or answer until you resume." : "Running"}
      </span>
      <label className={styles.controlText}>
        Time limit{" "}
        <select value="" disabled={busy === "limit"} onChange={(e) => onTimeLimit(e.target.value === "none" ? null : Number(e.target.value))} aria-label="Set a time limit">
          <option value="" disabled>{endsAt ? `Ends ${endsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${left} min left` : "None"}</option>
          {TIME_LIMITS.map((m) => <option key={m} value={m}>{m} minutes from now</option>)}
          {endsAt && <option value="none">Remove the limit</option>}
        </select>
      </label>
      <button type="button" className={styles.rowAction} disabled={busy === "nudge" || paused || notStarted === 0} onClick={onNudge}>
        Remind {notStarted} who {notStarted === 1 ? "hasn't" : "haven't"} started
      </button>
      {note && <span className={styles.controlText} role="status">{note}</span>}
    </section>
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
