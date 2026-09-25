"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type ClassroomStudentAssignment } from "@/lib/api";
import { getStudent } from "@/lib/session";
import { Wordmark } from "@/components/ui";
import styles from "../student-demo.module.css";

function assignmentHref(item: ClassroomStudentAssignment) { const suffix = `assignment=${encodeURIComponent(item.id)}&run=${encodeURIComponent(item.run.id)}`; if (item.kind === "DIAGNOSTIC") return `/student/lotus?${suffix}`; if (item.kind === "TEACHING") return `/student/personalized-video?${suffix}`; return `/student/classroom/exit?${suffix}`; }

export default function ProductionClassroomPage() {
  const [code, setCode] = useState(""); const [rollNumber, setRollNumber] = useState(""); const [assignments, setAssignments] = useState<ClassroomStudentAssignment[]>([]); const [joined, setJoined] = useState<string | null>(null); const [error, setError] = useState("");
  const student = typeof window === "undefined" ? null : getStudent();
  async function refresh() { if (!getStudent()?.token) return; try { setAssignments(await api.getStudentClassroomAssignments()); setError(""); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not load assignments."); } }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, []);
  async function join(event: React.FormEvent) { event.preventDefault(); setError(""); try { const result = await api.joinClassroom({ joinCode: code, rollNumber }); setJoined(result.classroom.name); await refresh(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not join the class."); } }
  return <main className={styles.stage}><header className={styles.top}><Wordmark href="/"/><span>Production classroom</span></header><div className={styles.wrap}><div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Live Cogna classroom</div><h1>{student ? `Welcome, ${student.name}.` : "Sign in to join your class."}</h1><p>Teacher assignments appear automatically on this screen.</p></section>
    {!student?.token ? <section className={styles.card}><p>A signed student account is required for a production classroom.</p><Link className={styles.button} href="/student/login">Student sign in →</Link></section> : <><form className={styles.card} onSubmit={join}><div className={styles.field}><label>Class code</label><input className={styles.input} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g,""))} required /></div><div className={styles.field}><label>Roll number</label><input className={styles.input} value={rollNumber} onChange={e => setRollNumber(e.target.value)} /></div>{error && <div className={styles.error}>{error}</div>}<button className={styles.button}>Join class →</button>{joined && <div className={styles.hint}><strong>Joined:</strong> {joined}</div>}</form><section className={styles.card}><div className={styles.eyebrow}>Assigned by your teacher</div><h2>{assignments.length ? `${assignments.length} ready now` : "Waiting for the teacher"}</h2><div className={styles.rules}>{assignments.map(item => <div className={styles.rule} key={item.id}><b>→</b><span><strong>{item.kind.replaceAll("_"," ")}</strong><br/>{item.run.title} · {item.run.classroom.name}<br/><Link href={assignmentHref(item)}>Start now</Link></span></div>)}</div>{!assignments.length && <p>This page checks for new work automatically.</p>}</section></>}
    <p><Link href="/student/classroom?demo=1">Use demo classroom instead</Link></p></div></div></main>;
}
