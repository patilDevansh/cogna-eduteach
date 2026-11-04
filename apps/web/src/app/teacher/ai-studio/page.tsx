"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LotusSessionView } from "@cogna/shared";
import { api, type LotusStudioSessionSummary } from "@/lib/api";
import { getTeacherInvitation } from "@/lib/session";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { useRefreshTick, LIVE_MS } from "@/lib/use-refresh-tick";
import { ClassTabs } from "../class-tabs";
import teacherStyles from "../teacher.module.css";
import styles from "./studio.module.css";

export default function TeacherAiStudioPage() {
  const router = useRouter();
  const { sample, classes, selectedId, selected, select, loaded, error: classError } = useTeacherClasses();
  const [sessions, setSessions] = useState<LotusStudioSessionSummary[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<LotusSessionView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const tick = useRefreshTick(LIVE_MS);

  useEffect(() => {
    const teacher = getTeacherInvitation();
    if (!teacher?.token) router.replace("/teacher/login");
    setDemoAvailable(process.env.NODE_ENV !== "production" && teacher?.schoolId === "gurukul-pilot" && teacher.teacherEmail.toLowerCase() === "ananya@gurukul.edu");
  }, [router]);

  useEffect(() => {
    if (loaded && !classes.length && demoAvailable) setDemoMode(true);
  }, [loaded, classes.length, demoAvailable]);

  useEffect(() => {
    setSessions([]);
    setSession(null);
    setSessionId("");
  }, [selectedId, sample, demoMode]);

  useEffect(() => {
    if ((!selectedId && !demoMode) || sample || !getTeacherInvitation()?.token) return;
    let current = true;
    setLoading(true);
    (demoMode ? api.listLotusDemoStudioSessions() : api.listLotusStudioSessions(selectedId)).then(items => {
      if (!current) return;
      setSessions(items);
      setError("");
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : "Could not load class diagnostics.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedId, sample, demoMode, tick]);

  useEffect(() => {
    if (!sessionId || !sessions.some(item => item.sessionId === sessionId)) return;
    let current = true;
    api.getLotusObserverSession(sessionId).then(view => {
      if (!current) return;
      setSession(view);
      setError("");
    }).catch(cause => {
      if (!current) return;
      setSession(null);
      setError(cause instanceof Error ? cause.message : "Could not open this diagnostic.");
    });
    return () => { current = false; };
  }, [sessionId, sessions, tick]);

  const active = sessions.find(item => item.sessionId === sessionId);
  const audits = session?.audits ?? [];

  return <>
    <div className={teacherStyles.pageHeader}>
      <div><div className={teacherStyles.dateLine}>Teacher observer</div><h1>AI Studio</h1><p>See the saved maths checks, tentative ideas and decisions behind a diagnostic.</p></div>
      <div className={teacherStyles.headerActions}>{demoAvailable && <button type="button" className={teacherStyles.secondary} onClick={() => setDemoMode(value => !value)}>{demoMode ? "View my classes" : "View demo diagnostics"}</button>}<Link className={teacherStyles.secondary} href="/teacher/today">Back to Today</Link></div>
    </div>
    {!demoMode && <ClassTabs classes={classes} selectedId={selectedId} onSelect={id => void select(id)} />}
    {sample ? <section className={teacherStyles.emptyCard}><h2>Live class records only</h2><p>Turn off Sample data in the sidebar to inspect your class diagnostics.</p></section>
      : !loaded ? <section className={teacherStyles.emptyCard}>Loading your classes…</section>
      : classError ? <section className={teacherStyles.emptyCard} role="alert">{classError}</section>
      : !selected && !demoMode ? <section className={teacherStyles.emptyCard}><h2>No class selected</h2><p>Create a class to see its diagnostic evidence here.</p></section>
      : <div className={styles.grid}>
        <section className={styles.list} aria-label="Class diagnostics">
          <div className={styles.listHead}><div><h2>{demoMode ? "Demo diagnostics" : selected?.name}</h2><p>{demoMode ? "Local demonstration records" : "Assigned Lotus diagnostics"}</p></div><span>{sessions.length}</span></div>
          {loading && !sessions.length && <p className={styles.empty}>Loading diagnostic sessions…</p>}
          {!loading && !sessions.length && <p className={styles.empty}>{demoMode ? "No demo diagnostic has been started yet. Open the student demo and begin a Lotus check." : "No students have started a class diagnostic yet. Their sessions appear here after they begin."}</p>}
          {sessions.map(item => <button key={item.sessionId} type="button" className={styles.sessionButton} data-active={sessionId === item.sessionId} onClick={() => { setSession(null); setSessionId(item.sessionId); }}>
            <strong>{item.studentName}{item.rollNumber ? ` · ${item.rollNumber}` : ""}</strong>
            <span>{item.topic?.replaceAll("_", " ").toLowerCase() ?? "Diagnostic"} · {item.answered} answered</span>
            <small>{item.status === "COMPLETE" ? "Finished" : "In progress"} · {new Date(item.startedAt).toLocaleString()}</small>
          </button>)}
        </section>
        <section className={styles.detail} aria-label="AI Studio diagnostic record">
          {error && <p className={styles.error} role="alert">{error}</p>}
          {!sessionId ? <div className={styles.placeholder}><h2>Select a student’s diagnostic</h2><p>The record shows what Cogna checked, what remains uncertain and which next step it chose.</p></div>
            : !session ? <p className={styles.empty}>Opening the saved diagnostic record…</p>
            : <>
              <div className={styles.detailHead}><div><div className={teacherStyles.dateLine}>{active?.status === "COMPLETE" ? "Finished diagnostic" : "Live diagnostic"}</div><h2>{active?.studentName ?? "Student diagnostic"}</h2><p>{session.topic?.replaceAll("_", " ") ?? "Lotus"} · {audits.length} answers saved</p></div><span className={styles.badge}>Teacher view</span></div>
              {session.currentQuestion && session.status === "ACTIVE" && <section className={styles.card}><h3>Current question</h3><p>{session.currentQuestion.prompt}</p><small>The student's answer is not recorded until they submit it.</small></section>}
              {session.finalReport && <section className={styles.card}><h3>Diagnostic conclusion</h3><p>{session.finalReport.startingPoint}</p><small>{session.finalReport.recommendedNextStep}</small>{session.finalReport.uncertainAreas.length > 0 && <p className={styles.uncertain}>Still uncertain: {session.finalReport.uncertainAreas.join(" · ")}</p>}</section>}
              <h3 className={styles.sectionTitle}>Saved answer trail</h3>
              {!audits.length && <p className={styles.empty}>No answer has been submitted yet.</p>}
              {audits.map((audit, index) => <article key={`${audit.question.id}:${index}`} className={styles.card}>
                <div className={styles.auditHead}><strong>Question {index + 1}</strong><span>{audit.analysisStatus === "PENDING" ? "Review pending" : audit.analysisSource?.replaceAll("_", " ").toLowerCase()}</span></div>
                <p className={styles.prompt}>{audit.question.prompt}</p>
                <dl className={styles.facts}><div><dt>Submitted answer</dt><dd>{audit.response?.answer ?? "No answer saved"}</dd></div><div><dt>Maths check</dt><dd>{audit.verification?.status?.replaceAll("_", " ").toLowerCase() ?? "Not checked"}</dd></div><div><dt>Evidence</dt><dd>{audit.conclusion.evidenceState.toLowerCase()}</dd></div></dl>
                {audit.gpt?.observations?.length ? <p><strong>Observed:</strong> {audit.gpt.observations.join(" · ")}</p> : null}
                {audit.conclusion.uncertainty.length > 0 && <p className={styles.uncertain}><strong>Still uncertain:</strong> {audit.conclusion.uncertainty.join(" · ")}</p>}
                {audit.analysisStatus !== "PENDING" && <p><strong>Cogna’s read:</strong> {audit.conclusion.conclusion}</p>}
                {audit.adaptiveDecision && <p className={styles.decision}><strong>Next step:</strong> {audit.adaptiveDecision.action.replaceAll("_", " ").toLowerCase()} · {audit.adaptiveDecision.implementationDetail}</p>}
              </article>)}
              <p className={styles.footnote}>These are diagnostic observations and provisional interpretations. They do not measure general memory, attention span or delayed retention.</p>
            </>}
        </section>
      </div>}
  </>;
}
