"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDemoResults, type DemoStudentResult } from "@/lib/gurukul-demo";
import { getStoredLotusSessions, type StoredLotusSession } from "@/lib/lotus-demo-store";
import styles from "@/app/teacher/teacher.module.css";

function outcomeLabel(outcome: DemoStudentResult["outcome"]) {
  if (outcome === "independent-transfer") return "Independent transfer demonstrated";
  if (outcome === "independent-familiar") return "Familiar form demonstrated; transfer not yet secure";
  if (outcome === "needs-reinforcement") return "Needs targeted reinforcement";
  if (outcome === "insufficient-evidence") return "Insufficient exit evidence";
  return "Personalized lesson in progress";
}

export function TeacherDemoLive() {
  const [results, setResults] = useState<DemoStudentResult[]>([]);
  const [lotusSessions, setLotusSessions] = useState<StoredLotusSession[]>([]);
  useEffect(() => {
    const refresh = () => { setResults(getDemoResults()); setLotusSessions(getStoredLotusSessions()); };
    refresh(); window.addEventListener("storage", refresh); window.addEventListener("cogna-demo-results", refresh); window.addEventListener("cogna-lotus-sessions",refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("cogna-demo-results", refresh); window.removeEventListener("cogna-lotus-sessions",refresh); };
  }, []);
  const lotus = lotusSessions[0];
  if (lotus) {
    const report = lotus.session.finalReport;
    const complete = lotus.session.status === "COMPLETE";
    const exitCorrect = lotus.exit?.filter(item=>item.correct).length ?? 0;
    return <section className={styles.liveEvidence}>
      <div className={styles.liveEvidenceHead}><div><div className={styles.dateLine}>● Real Cogna Lotus evidence</div><h2>{lotus.studentName}’s Lotus session is connected</h2><p>{report?.startingPoint ?? `Lotus is actively selecting question ${lotus.session.audits.length + 1}.`}</p></div><Link className={styles.secondary} href={`/teacher/lotus-evidence?session=${lotus.session.sessionId}`}>Inspect Lotus audit →</Link></div>
      <div className={styles.liveStats}><div><span>Diagnostic</span><strong>{complete?"Complete":"In progress"}</strong></div><div><span>Answers audited</span><strong>{lotus.session.audits.length}</strong></div><div><span>Lotus outcome</span><strong>{report?.outcome.replaceAll("_"," ") ?? "Still investigating"}</strong></div><div><span>Independent exit</span><strong>{lotus.exit?`${exitCorrect}/2 verified`:"Not completed yet"}</strong></div></div>
    </section>;
  }
  if (!results.length) return <section className={styles.emptyCard}><div className={styles.dateLine}>Connected demo session</div><h2>No live student evidence yet</h2><p>Launch the Gurukul demo, then complete a student journey. The submitted work will appear here immediately.</p><Link className={styles.primary} href="/teacher/sessions">Launch demo session →</Link></section>;
  const completed = results.filter(r=>r.outcome!=="in-progress");
  const transferred = completed.filter(r=>r.outcome==="independent-transfer").length;
  const latest = results[0];
  return <section className={styles.liveEvidence}>
    <div className={styles.liveEvidenceHead}><div><div className={styles.dateLine}>● Live student evidence received</div><h2>{latest.studentName}’s session is now connected</h2><p>{latest.conclusion.headline}</p></div><Link className={styles.secondary} href={`/teacher/evidence?student=${latest.studentKey}`}>Inspect exact evidence →</Link></div>
    <div className={styles.liveStats}><div><span>Students received</span><strong>{results.length}</strong></div><div><span>Completed exit</span><strong>{completed.length}</strong></div><div><span>Independent transfer</span><strong>{transferred}</strong></div><div><span>Latest outcome</span><strong>{outcomeLabel(latest.outcome)}</strong></div></div>
  </section>;
}
