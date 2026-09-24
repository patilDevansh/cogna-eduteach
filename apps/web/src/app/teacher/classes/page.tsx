"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type ProductionClassroom } from "@/lib/api";
import styles from "../teacher.module.css";

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<ProductionClassroom[]>([]);
  const [name, setName] = useState("Grade 8 · Section A");
  const [grade, setGrade] = useState(8);
  const [subjectId, setSubjectId] = useState("mathematics");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() { try { setClasses(await api.listClassrooms()); setError(""); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not load classrooms."); } }
  useEffect(() => { void refresh(); }, []);
  async function create(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await api.createClassroom({ name, grade, subjectId, isDemo: false }); await refresh(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not create the class."); } finally { setBusy(false); } }
  return <>
    <div className={styles.pageHeader}><div><div className={styles.dateLine}>Production classrooms</div><h1>Your classes</h1><p>Real enrollments and assignments shared across student devices.</p></div><Link className={styles.secondary} href="/prototype/classroom/setup">Open demo mode</Link></div>
    {error && <section className={styles.emptyCard}><strong>Classroom service unavailable</strong><p>{error}</p></section>}
    <div className={styles.sectionGrid}><section className={styles.panel}><div className={styles.panelHeader}><div><h3>Create a production class</h3><p>Cogna generates a unique student join code.</p></div></div><form className={styles.formGrid} onSubmit={create}><label className={`${styles.formLabel} ${styles.full}`}>Class name<input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} required /></label><label className={styles.formLabel}>Grade<input className={styles.formInput} type="number" min="1" max="12" value={grade} onChange={e => setGrade(Number(e.target.value))} required /></label><label className={styles.formLabel}>Subject<input className={styles.formInput} value={subjectId} onChange={e => setSubjectId(e.target.value)} required /></label><button className={styles.submitButton} disabled={busy}>{busy ? "Creating…" : "Create class →"}</button></form></section>
      <section className={styles.panel}><div className={styles.panelHeader}><div><h3>Active classrooms</h3><p>{classes.length} production {classes.length === 1 ? "class" : "classes"}</p></div></div><div className={styles.nextSteps}>{classes.map(item => <div className={styles.nextStep} key={item.id}><span>Grade {item.grade} · {item.subjectId}</span><strong>{item.name}</strong><p>Join code: <b>{item.joinCode}</b> · {item._count?.enrollments ?? 0} enrolled</p><Link className={styles.textLink} href={`/teacher/sessions?classroom=${item.id}`}>Open classroom →</Link></div>)}{!classes.length && <p>No production class yet.</p>}</div></section></div>
    <section className={styles.emptyCard} style={{marginTop:"1rem"}}><h2>Student enrollment</h2><p>Students sign in, open the production join page, and enter the code shown above.</p><Link className={styles.primary} href="/student/classroom/live">Open production student join →</Link></section>
  </>;
}
