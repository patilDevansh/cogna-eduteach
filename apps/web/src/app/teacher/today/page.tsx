"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ClassTopicPlan, type ClassroomRunReport } from "@/lib/api";
import { getTeacherInvitation } from "@/lib/session";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { SAMPLE_ACTION_NOTE, teacherData } from "@/lib/teacher-mode";
import { LIVE_MS, useRefreshTick } from "@/lib/use-refresh-tick";
import { ClassTabs } from "../class-tabs";
import styles from "../teacher.module.css";

type Move = { when: string; what: string; detail: string };

const names = (list: string[]) => (list.length > 4 ? `${list.slice(0, 4).join(", ")} and ${list.length - 4} more` : list.join(", "));

/** Up to three next moves from the class's real groups: biggest fix first, then who to recheck, then who can move on. */
function nextMoves(report: ClassroomRunReport): { headline: string; moves: Move[] } {
  const cr = report.classReport;
  const unclear = cr.students.filter((s) => s.progress === "UNCLEAR").map((s) => s.name);
  const ready = cr.students.filter((s) => s.progress === "NO_GAP" || s.progress === "IMPROVED").map((s) => s.name);
  const groups = [...cr.gapGroups].sort((a, b) => b.students.length - a.students.length);
  const moves: Move[] = [
    ...groups.slice(0, 2).map((g, i) => ({
      when: i === 0 ? "First · small group" : "Then · small group",
      what: `Help ${g.students.length} with ${g.name.toLowerCase()}`,
      detail: names(g.students),
    })),
    ...(unclear.length ? [{ when: "Before you decide", what: `Check ${unclear.length} again`, detail: `${names(unclear)}: their answers don’t agree yet.` }] : []),
    ...(ready.length ? [{ when: "Meanwhile", what: `${ready.length} can move on`, detail: names(ready) }] : []),
  ].slice(0, 3);

  const done = cr.totals.diagnosticDone;
  const live = report.run.status === "LIVE";
  const headline = groups[0]
    ? `Start with ${groups[0].name.toLowerCase()}: ${groups[0].students.length} student${groups[0].students.length === 1 ? "" : "s"} need it.`
    : done && ready.length === done
      ? "Everyone who finished is ready to move on."
      : live
        ? `The quick check is running: ${done} of ${cr.totals.enrolled} done.`
        : "Not enough finished to suggest a move yet.";
  return { headline, moves };
}

const isToday = (iso: string | null) => Boolean(iso) && new Date(iso!).toDateString() === new Date().toDateString();

/**
 * The daily one-tap: "still on Factorisation?" Cogna asks instead of waiting to be told,
 * so the topic plan stays right without the teacher setting anything up.
 */
function TopicToday({ classroomId, className, sample, onCheckStarted }: { classroomId: string; className: string; sample: boolean; onCheckStarted: () => void }) {
  const [plan, setPlan] = useState<ClassTopicPlan | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setPlan(null);
    setNote("");
    let current = true;
    teacherData(sample).getClassTopics(classroomId).then((p) => current && setPlan(p)).catch(() => undefined);
    return () => { current = false; };
  }, [classroomId, sample]);

  if (!plan || !plan.topics.length) return null;
  const topic = plan.topics.find((t) => t.status === "TEACHING");
  const next = plan.topics.find((t) => t.topicId === plan.next);

  async function act(label: string, run: () => Promise<ClassTopicPlan>, done: string, startsCheck = false) {
    if (sample) return setNote(SAMPLE_ACTION_NOTE);
    setBusy(label);
    setNote("");
    try {
      setPlan(await run());
      setNote(done);
      if (startsCheck) onCheckStarted();
    } catch (cause) {
      setNote(cause instanceof ApiError ? cause.message : "That didn't work. Please try again.");
    } finally {
      setBusy("");
    }
  }

  if (!topic) {
    return (
      <section className={styles.topicToday}>
        <div>
          <div className={styles.dateLine}>Today in {className}</div>
          <h2>What are you teaching?</h2>
          {next && <p>Next in your plan: {next.name} (chapter {next.chapter}).</p>}
          {note && <p className={styles.topicNote}>{note}</p>}
        </div>
        <div className={styles.headerActions}>
          {next && <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => void act("start", () => api.setTopicStatus(classroomId, next.topicId, "start"), `Started ${next.name.toLowerCase()}.`)}>{busy === "start" ? "Starting…" : `Start ${next.name.toLowerCase()}`}</button>}
          <Link className={styles.secondary} href="/teacher/sessions">Pick a topic</Link>
        </div>
      </section>
    );
  }

  const recommendation = plan.current?.topicId === topic.topicId ? plan.current.readiness.recommendation : null;
  if (isToday(topic.confirmedAt)) {
    return (
      <section className={styles.topicToday}>
        <div>
          <div className={styles.dateLine}>{topic.name} in {className}</div>
          <p>{note || recommendation?.text || "Teaching as planned."}</p>
        </div>
        <div className={styles.headerActions}><Link className={styles.secondary} href="/teacher/sessions">Open the class →</Link></div>
      </section>
    );
  }

  const finished = () =>
    topic.available && recommendation?.action !== "WAIT"
      ? act("finished", () => api.startTopicCheck(classroomId, topic.topicId, "TOPIC_CHECK"), `Topic check sent to ${className}.`, true)
      : act("finished", () => api.setTopicStatus(classroomId, topic.topicId, "done"), `${topic.name} marked done.`);

  return (
    <section className={styles.topicToday}>
      <div>
        <div className={styles.dateLine}>Today in {className}</div>
        <h2>Still on {topic.name.toLowerCase()}?</h2>
        {note && <p className={styles.topicNote}>{note}</p>}
      </div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={() => void act("confirm", () => api.setTopicStatus(classroomId, topic.topicId, "confirm"), "Thanks. Noted for today.")}>{busy === "confirm" ? "Saving…" : "Yes, still on it"}</button>
        <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => void finished()}>
          {busy === "finished" ? "Sending…" : topic.available ? "Finished: send the topic check" : "Finished teaching it"}
        </button>
        <Link className={styles.secondary} href="/teacher/sessions">Something else</Link>
      </div>
    </section>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function TeacherTodayPage() {
  const { sample, classes, selectedId, selected, select, loaded, refresh } = useTeacherClasses();
  const [report, setReport] = useState<ClassroomRunReport | null>(null);
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => setTeacherName(getTeacherInvitation()?.teacherName?.split(/\s+/)[0] ?? ""), []);

  const runId = selected?.runs?.[0]?.id;
  // Live data: every 5s (and when the tab is shown again). The class list is re-read too,
  // so a check started from another tab or the Class page shows up without a reload.
  const tick = useRefreshTick(LIVE_MS);
  useEffect(() => {
    if (tick && selectedId) void refresh(selectedId);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRef("");
  useEffect(() => {
    // Clear only when switching class or sample mode; a live refresh keeps the page on screen.
    if (shown.current !== `${runId}|${sample}`) setReport(null);
    shown.current = `${runId}|${sample}`;
    let current = true; // a slower, outdated load must not overwrite a newer one
    if (runId) teacherData(sample).getClassroomRunReport(runId).then((r) => current && setReport(r)).catch(() => undefined);
    return () => { current = false; };
  }, [runId, sample, tick]);

  const plan = report ? nextMoves(report) : null;
  const t = report?.classReport.totals;

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1>{greeting()}{teacherName ? `, ${teacherName}` : ""}.</h1>
          <p>{selected ? `${selected.name}: here’s what to do next.` : "Pick a class to see what to do next."}</p>
        </div>
        <div className={styles.headerActions}>
          {selected && <Link className={styles.secondary} href="/teacher/sessions">Class code: {selected.joinCode}</Link>}
          <Link className={styles.primary} href="/teacher/sessions">Start class</Link>
        </div>
      </div>

      <ClassTabs classes={classes} selectedId={selectedId} onSelect={(id) => void select(id)} />

      {selected && <TopicToday classroomId={selected.id} className={selected.name} sample={sample} onCheckStarted={() => void refresh(selected.id)} />}

      {loaded && !classes.length ? (
        <section className={styles.emptyCard}><h2>Create your first class</h2><p>Name it, share the code, and start a quick check. Your next moves show up here.</p><Link className={styles.primary} href="/teacher/sessions">Create a class →</Link></section>
      ) : selected && !runId ? (
        <section className={styles.emptyCard}><h2>No quick check in {selected.name} yet</h2><p>Start one to see who needs help with what, by name.</p><Link className={styles.primary} href="/teacher/sessions">Start the quick check →</Link></section>
      ) : plan && t ? (
        <>
          <section className={styles.decisionCard}>
            <div className={styles.dateLine} style={{ color: "#8ad2b8" }}>Your next moves{report?.run.status === "LIVE" ? ", while the check is still running" : ""}</div>
            <h2>{plan.headline}</h2>
            {plan.moves.length > 0 && (
              <ol className={styles.moves}>
                {plan.moves.map((m) => <li key={m.what}><span>{m.when}</span><strong>{m.what}</strong><p>{m.detail}</p></li>)}
              </ol>
            )}
          </section>

          <ClassMap t={t} />

          {report && report.classReport.skills.length > 0 && (
            <details className={styles.why}>
              <summary>Why these moves?</summary>
              <article className={styles.panel}>
                <div className={styles.panelHeader}><div><h3>Skills across {selected?.name}</h3><p>{report.classReport.headline}</p></div><Link className={styles.textLink} href="/teacher/students">See each student →</Link></div>
                <div className={styles.skillRows}>
                  {report.classReport.skills.slice(0, 6).map((k) => {
                    const total = Math.max(1, k.secure + k.gap + k.suspected);
                    const secure = Math.round((k.secure / total) * 100);
                    const state = k.gap ? ["Needs a fix", "#c56636"] : k.suspected ? ["Not sure yet", "#7956a8"] : ["Secure", "#17734f"];
                    return <div className={styles.skillRow} key={k.skillId}><strong>{k.name}</strong><div className={styles.skillTrack}><span style={{ width: `${secure}%`, background: state[1] }} /></div><span className={styles.skillState} style={{ color: state[1] }}>{state[0]}</span></div>;
                  })}
                </div>
              </article>
            </details>
          )}
        </>
      ) : selected ? (
        <section className={styles.decisionCard} aria-busy="true" aria-label={`Loading ${selected.name}`}>
          <div className="skeleton" style={{ height: 14, width: 180, opacity: .25 }} />
          <div className="skeleton" style={{ height: 34, width: "70%", marginTop: 18, opacity: .25 }} />
          <div className="skeleton" style={{ height: 34, width: "45%", marginTop: 10, opacity: .25 }} />
        </section>
      ) : null}

      <section className={styles.pilotCallout} style={{ marginTop: "1rem" }}>
        <div><h2>See five sample students’ personal lessons.</h2><p>What Cogna found for each one, the lesson it made, and how they did on their own afterwards.</p></div>
        <Link className={styles.secondary} href="/teacher/pilot-story">See the samples →</Link>
      </section>
    </>
  );
}

/**
 * The whole class at a glance: one dot per student, grouped by where they are.
 * Counts come first and large; the dots show proportion without a chart.
 */
function ClassMap({ t }: { t: { enrolled: number; diagnosticDone: number; noGap: number; gapFound: number; unclear: number } }) {
  const notYet = Math.max(0, t.enrolled - t.noGap - t.gapFound - t.unclear);
  const groups = [
    { key: "ready", n: t.noGap, label: "Ready to move on", note: "Nothing to fix right now." },
    { key: "fix", n: t.gapFound, label: "Working on one fix", note: "Each has a lesson on their own fix." },
    { key: "unsure", n: t.unclear, label: "Check again", note: "Their answers don’t agree yet." },
    { key: "waiting", n: notYet, label: "Not finished", note: "Still to finish the check." },
  ].filter((g) => g.n > 0 || g.key !== "waiting");
  let index = 0;
  // Even rows of at most 15, like seats in a room, so a 30-student class reads as two rows rather than 29 + 1.
  const total = groups.reduce((n, g) => n + g.n, 0);
  const cols = Math.ceil(total / Math.max(1, Math.ceil(total / 15)));
  return (
    <section className={styles.classMap} aria-label="Class summary">
      <header>
        <h3>Your class at a glance</h3>
        <p>{t.diagnosticDone} of {t.enrolled} finished the check.</p>
      </header>
      <div className={styles.dots} style={{ ["--cols" as string]: cols }} role="img" aria-label={groups.map((g) => `${g.n} ${g.label.toLowerCase()}`).join(", ")}>
        {groups.flatMap((g) => Array.from({ length: g.n }, () => <i key={index} data-group={g.key} style={{ ["--d" as string]: index++ }} />))}
      </div>
      <dl className={styles.mapLegend}>
        {groups.map((g) => (
          <div key={g.key} data-group={g.key}>
            <dt>{g.label}</dt>
            <dd><strong>{g.n}</strong><span>{g.note}</span></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
