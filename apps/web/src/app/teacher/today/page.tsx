"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClassroomRunReport } from "@/lib/api";
import { getTeacherInvitation } from "@/lib/session";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { teacherData } from "@/lib/teacher-mode";
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

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function TeacherTodayPage() {
  const { sample, classes, selectedId, selected, select, loaded } = useTeacherClasses();
  const [report, setReport] = useState<ClassroomRunReport | null>(null);
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => setTeacherName(getTeacherInvitation()?.teacherName?.split(/\s+/)[0] ?? ""), []);

  const runId = selected?.runs?.[0]?.id;
  useEffect(() => {
    setReport(null);
    let current = true; // a slower, outdated load must not overwrite a newer one
    if (runId) teacherData(sample).getClassroomRunReport(runId).then((r) => current && setReport(r)).catch(() => undefined);
    return () => { current = false; };
  }, [runId, sample]);

  const plan = report ? nextMoves(report) : null;
  const t = report?.classReport.totals;

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.dateLine}>Today</div>
          <h1>{greeting()}{teacherName ? `, ${teacherName}` : ""}.</h1>
          <p>{selected ? `${selected.name}: here’s what to do next.` : "Pick a class to see what to do next."}</p>
        </div>
        <div className={styles.headerActions}>
          {selected && <Link className={styles.secondary} href="/teacher/sessions">Class code: {selected.joinCode}</Link>}
          <Link className={styles.primary} href="/teacher/sessions">Start class</Link>
        </div>
      </div>

      <ClassTabs classes={classes} selectedId={selectedId} onSelect={(id) => void select(id)} />

      {loaded && !classes.length ? (
        <section className={styles.emptyCard}><h2>Create your first class</h2><p>Name it, share the code, and start a quick check. Your next moves show up here.</p><Link className={styles.primary} href="/teacher/sessions">Create a class →</Link></section>
      ) : selected && !runId ? (
        <section className={styles.emptyCard}><h2>No quick check in {selected.name} yet</h2><p>Start one to see who needs help with what, by name.</p><Link className={styles.primary} href="/teacher/sessions">Start the quick check →</Link></section>
      ) : plan && t ? (
        <>
          <section className={styles.decisionCard}>
            <div className={styles.dateLine} style={{ color: "#8ad2b8" }}>Your next moves · {report?.run.title}{report?.run.status === "LIVE" ? " · still running" : ""}</div>
            <h2>{plan.headline}</h2>
            {plan.moves.length > 0 && (
              <ol className={styles.moves}>
                {plan.moves.map((m) => <li key={m.what}><span>{m.when}</span><strong>{m.what}</strong><p>{m.detail}</p></li>)}
              </ol>
            )}
          </section>

          <section className={styles.metricGrid} aria-label="Class summary">
            <article className={styles.metric}><div className={styles.metricTop}><span>FINISHED THE CHECK</span><span>✓</span></div><strong>{t.diagnosticDone}<small> / {t.enrolled}</small></strong><p>Students who finished the quick check.</p><div className={styles.meter}><span style={{ width: `${t.enrolled ? (t.diagnosticDone / t.enrolled) * 100 : 0}%` }} /></div></article>
            <article className={styles.metric}><div className={styles.metricTop}><span>READY TO MOVE ON</span><span>→</span></div><strong>{t.noGap}</strong><p>Nothing to fix right now.</p><div className={styles.meter}><span style={{ width: `${t.enrolled ? (t.noGap / t.enrolled) * 100 : 0}%` }} /></div></article>
            <article className={styles.metric}><div className={styles.metricTop}><span>NEED ONE FIX</span><span>△</span></div><strong>{t.gapFound}</strong><p>Each got a lesson on their own fix.</p><div className={styles.meter}><span style={{ width: `${t.enrolled ? (t.gapFound / t.enrolled) * 100 : 0}%`, background: "#d58b17" }} /></div></article>
            <article className={styles.metric}><div className={styles.metricTop}><span>CHECK AGAIN</span><span>?</span></div><strong>{t.unclear}</strong><p>Not sure yet: their answers don’t agree.</p><div className={styles.meter}><span style={{ width: `${t.enrolled ? (t.unclear / t.enrolled) * 100 : 0}%`, background: "#7956a8" }} /></div></article>
          </section>

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
        <section className={styles.emptyCard}><p>Loading {selected.name}…</p></section>
      ) : null}

      <section className={styles.pilotCallout} style={{ marginTop: "1rem" }}>
        <div><div className={styles.dateLine}>Sample · personal lessons</div><h2>See five sample students’ personal lessons.</h2><p>What Cogna found for each one, the lesson it made, and how they did on their own afterwards.</p></div>
        <Link className={styles.secondary} href="/teacher/pilot-story">See the samples →</Link>
      </section>
    </>
  );
}
