"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, classroomAssignmentHref, type ClassroomStudentAssignment } from "@/lib/api";
import { clearStudent, getStudent, isFixtureStudentSession, type StudentSessionRecord } from "@/lib/session";
import { Wordmark } from "@/components/ui";
import { stepFor } from "@/lib/class-steps";
import styles from "../student-demo.module.css";

function classroomGreeting(student: StudentSessionRecord | null, joinedClass: string | null): string {
  if (joinedClass) return "You're in.";
  if (student && !isFixtureStudentSession(student) && student.name.trim()) {
    return `Welcome, ${student.name.trim()}.`;
  }
  return "Join your class.";
}

export default function ProductionClassroomPage() {
  const [code, setCode] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [assignments, setAssignments] = useState<ClassroomStudentAssignment[]>([]);
  const [joined, setJoined] = useState<string | null>(null);
  const [alsoIn, setAlsoIn] = useState<string[]>([]);
  const [error, setError] = useState("");
  // Kept apart from `error`: the 5-second assignment refresh clears that one, and a join error must stay visible.
  const [joinError, setJoinError] = useState("");
  const [student, setStudent] = useState<StudentSessionRecord | null>(null);

  useEffect(() => {
    const existing = getStudent();
    if (isFixtureStudentSession(existing)) {
      clearStudent();
      setStudent(null);
      return;
    }
    setStudent(existing);
  }, []);

  async function refresh() {
    const current = getStudent();
    if (!current?.token || isFixtureStudentSession(current)) return;
    try {
      setAssignments(await api.getStudentClassroomAssignments());
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load assignments.");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setJoinError("");
    try {
      const result = await api.joinClassroom({ joinCode: code.trim(), rollNumber: rollNumber.trim() || undefined });
      setJoined(result.classroom.name);
      setAlsoIn(result.alsoIn?.map((c) => c.name) ?? []);
      await refresh();
    } catch (cause) {
      setJoinError(cause instanceof ApiError ? cause.message : "Could not join the class.");
    }
  }

  const signedIn = Boolean(student?.token) && !isFixtureStudentSession(student);

  return (
    <main className={styles.stage}>
      <header className={styles.top}>
        <Wordmark href="/" />
        <span>Your class</span>
      </header>
      <div className={styles.wrap}>
        <div className={styles.narrow}>
          <section className={styles.hero}>
            <div className={styles.eyebrow}>Join your class</div>
            <h1>{classroomGreeting(signedIn ? student : null, joined)}</h1>
            <p>
              {joined
                ? `Joined ${joined}. What your teacher sends will appear here.`
                : "Type the code your teacher shows the class."}
            </p>
          </section>
          {!signedIn ? (
            <section className={styles.card}>
              <p>Enter your practice code first. A class code only finds the classroom — it does not name you.</p>
              <Link className={styles.button} href="/student/login">
                Student sign in →
              </Link>
            </section>
          ) : (
            <>
              <form className={styles.card} onSubmit={join}>
                <div className={styles.field}>
                  <label>Class code</label>
                  <input
                    className={styles.input}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label>Roll number</label>
                  <input className={styles.input} value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
                </div>
                {(joinError || error) && <div className={styles.error}>{joinError || error}</div>}
                <button className={styles.button}>Join class →</button>
                {joined && (
                  <div className={styles.hint}>
                    <strong>Joined:</strong> {joined}
                  </div>
                )}
                {joined && alsoIn.length > 0 && (
                  <div className={styles.error} role="status">
                    You&apos;re also in {alsoIn.join(" and ")}. If you&apos;re only meant to be in one class, tell your teacher.
                  </div>
                )}
              </form>
              <section className={styles.card}>
                <div className={styles.eyebrow}>Your next step</div>
                {assignments[0] ? (
                  <>
                    <h2>{stepFor(assignments[0]).title}</h2>
                    <p>{stepFor(assignments[0]).note}</p>
                    <p className={styles.progress}>{assignments[0].run.classroom.name}</p>
                    <Link className={styles.button} style={{ display: "flex", textDecoration: "none" }} href={classroomAssignmentHref(assignments[0])}>
                      {assignments[0].status === "IN_PROGRESS" ? "Carry on" : stepFor(assignments[0]).cta} →
                    </Link>
                  </>
                ) : (
                  <>
                    <h2>{joined ? "Waiting for your teacher" : "Nothing to do yet"}</h2>
                    <p>This page checks for new work automatically.</p>
                  </>
                )}
              </section>
            </>
          )}
          {process.env.NODE_ENV !== "production" && (
            <p>
              <Link href="/student/classroom?demo=1">Dev · use the demo classroom</Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
