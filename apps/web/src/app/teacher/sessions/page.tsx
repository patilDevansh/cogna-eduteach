"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../teacher.module.css";

const sessions = [
  ["01", "Initial diagnostic", "Essential anchor questions first, followed by the most valuable uncertainty check.", "20 min"],
  ["02", "Personalized learning", "A verified explanation, worked example, guided practice and independent attempt selected from the learner evidence.", "20 min"],
  ["03", "Independent exit check", "Fresh familiar and changed-form questions with no hints or calculators.", "8–12 min"],
];

export default function TeacherSessionsPage() {
  const [launched,setLaunched]=useState(false);
  function launch(){localStorage.setItem("cogna_gurukul_session_status",JSON.stringify({status:"live",startedAt:new Date().toISOString(),classCode:"GURU-8A"}));setLaunched(true)}
  return <><div className={styles.pageHeader}><div><div className={styles.dateLine}>Supervised classroom session</div><h1>Signed bracket expansion</h1><p>Recently taught: expanding algebraic brackets · Next: equations involving brackets</p></div>{!launched?<button className={styles.primary} onClick={launch}>Launch for Grade 8 · Section A</button>:<Link className={styles.primary} href="/student/classroom">Open student join →</Link>}</div>
  {launched&&<section className={styles.liveEvidence}><div className={styles.liveEvidenceHead}><div><div className={styles.dateLine}>● Session live</div><h2>Students can now join with GURU-8A</h2><p>30 devices expected · teacher supervision · calculators off · rough paper allowed</p></div><Link className={styles.secondary} href="/teacher/today">Monitor evidence →</Link></div></section>}
  <section className={styles.sessionCards}>{sessions.map(([icon,title,copy,time])=><article className={styles.sessionCard} key={title}><div className={styles.sessionIcon}>{icon}</div><h3>{title}</h3><p>{copy}</p><span className={`${styles.status} ${styles.ready}`}>{time}</span></article>)}</section>
  <section className={styles.emptyCard} style={{marginTop:"1rem"}}><h2>What Cogna will preserve</h2><p>Final answers, line-by-line working, skips, incomplete attempts, time, selected confidence reports, assistance and why-probes. Independent exit evidence remains separate from assisted learning evidence.</p></section></>;
}
