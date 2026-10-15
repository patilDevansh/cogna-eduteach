"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, classroomAssignmentHref, liveUpdates, type ClassroomStudentAssignment, type ParentInviteResult } from "@/lib/api";
import { useEventStream } from "@/lib/event-stream";
import { clearStudent, getStudent, isFixtureStudentSession, type StudentSessionRecord } from "@/lib/session";
import { Wordmark } from "@/components/ui";
import { classNotice, stepFor } from "@/lib/class-steps";
import styles from "../student-demo.module.css";

/** What the student is told after asking Cogna to email their parent. Null: say nothing. */
function inviteLine(result: ParentInviteResult | undefined): string | null {
  switch (result?.status) {
    case "SENT": return `We emailed your parent at ${result.invitedTo}. They can follow your progress once they link you.`;
    case "NOT_CONFIGURED": return "Email isn't set up on Cogna yet, so nothing was sent. Ask your teacher to add your parent's mobile number.";
    case "FAILED": return "We couldn't send the email just now. Try again later.";
    case "TOO_SOON": return "We just sent your parent an email. Wait a couple of minutes before sending another.";
    case "DAILY_LIMIT": return "That's the most emails we can send today. Try again tomorrow.";
    default: return null;
  }
}

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
  // Kept apart from `error`: the assignment refresh clears that one, and a join error must stay visible.
  const [joinError, setJoinError] = useState("");
  const [student, setStudent] = useState<StudentSessionRecord | null>(null);
  // Asked only while no family has linked this student: then Cogna emails the parent an invite to sign in.
  const [parentEmail, setParentEmail] = useState("");
  const [parentStatus, setParentStatus] = useState<{ linked: boolean; invitedTo: string | null } | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  useEffect(() => {
    const existing = getStudent();
    if (isFixtureStudentSession(existing)) {
      clearStudent();
      setStudent(null);
      return;
    }
    setStudent(existing);
    if (existing?.token) api.getParentInviteStatus().then(setParentStatus).catch(() => undefined);
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

  // The teacher launching a check shows up at once over live updates; the slow re-read only catches misses.
  const live = useEventStream(student?.token && !isFixtureStudentSession(student) ? liveUpdates.studentUrl() : null, liveUpdates.studentHeaders, (event) => {
    if (event.type === "work" || event.type === "nudge" || event.type === "ready") void refresh();
  });
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), live ? 60_000 : 5000);
    return () => window.clearInterval(timer);
  }, [live]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setJoinError("");
    try {
      const result = await api.joinClassroom({ joinCode: code.trim(), rollNumber: rollNumber.trim() || undefined, parentEmail: parentEmail.trim() || undefined });
      setJoined(result.classroom.name);
      setAlsoIn(result.alsoIn?.map((c) => c.name) ?? []);
      setInviteNote(inviteLine(result.parentInvite));
      if (result.parentInvite?.status === "SENT") {
        setParentStatus({ linked: false, invitedTo: result.parentInvite.invitedTo ?? null });
        setParentEmail("");
      }
      await refresh();
    } catch (cause) {
      setJoinError(cause instanceof ApiError ? cause.message : "Could not join the class.");
    }
  }

  const signedIn = Boolean(student?.token) && !isFixtureStudentSession(student);
  const notice = assignments[0] ? classNotice(assignments[0], Date.now()) : null;

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
                {parentStatus && !parentStatus.linked && (
                  <div className={styles.field}>
                    <label htmlFor="parent-email">Parent&apos;s email <span style={{ fontWeight: 400 }}>(optional)</span></label>
                    <input
                      id="parent-email"
                      className={styles.input}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      placeholder={parentStatus.invitedTo ? `Already sent to ${parentStatus.invitedTo}` : "parent@example.com"}
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                    />
                    <small style={{ color: "var(--ink-soft)" }}>We&apos;ll email them a link so they can see your class work and progress.</small>
                  </div>
                )}
                {(joinError || error) && <div className={styles.error}>{joinError || error}</div>}
                <button className={styles.button}>Join class →</button>
                {joined && (
                  <div className={styles.hint}>
                    <strong>Joined:</strong> {joined}
                  </div>
                )}
                {inviteNote && <div className={styles.hint} role="status" data-testid="parent-invite-note">{inviteNote}</div>}
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
                    {notice && <p role="status" data-testid="class-notice" style={{ fontWeight: 700, color: "var(--caution)" }}>{notice.text}</p>}
                    {notice?.paused ? null : (
                      <Link className={styles.button} style={{ display: "flex", textDecoration: "none" }} href={classroomAssignmentHref(assignments[0])}>
                        {assignments[0].status === "IN_PROGRESS" ? "Carry on" : stepFor(assignments[0]).cta} →
                      </Link>
                    )}
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
