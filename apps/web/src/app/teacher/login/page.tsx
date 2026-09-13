"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveMockClassroom } from "@/lib/mock-classroom";
import { saveTeacherInvitation } from "@/lib/session";
import styles from "../teacher.module.css";

export default function TeacherLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("ananya@gurukul.edu");
  const [inviteCode, setInviteCode] = useState("GURUKUL-2026");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  return (
    <div className={styles.authPage}>
      <section className={styles.authStory}>
        <Link href="/" className={styles.lightWordmark}>Cogna<span>.</span></Link>
        <div className={styles.storyCopy}>
          <p className="eyebrow" style={{ color: "#8ad2b8" }}>Teacher workspace</p>
          <h1>Return to what your class needs next.</h1>
          <p>Your latest class evidence, readiness decision, and next teaching move are waiting in one concise view.</p>
        </div>
        <p className={styles.trustNote}>Cogna reports what students demonstrated. It does not score or rank teachers.</p>
      </section>

      <section className={styles.authFormWrap}>
        <form
          className={styles.authCard}
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setChecking(true);
            try {
              const invitation = await api.claimTeacherInvitation(email, inviteCode);
              saveTeacherInvitation(invitation);
              saveMockClassroom({
                teacherName: invitation.teacherName,
                schoolName: invitation.schoolName,
                grade: "Grade 8",
                className: "Grade 8 · Section A",
                subject: "Mathematics",
                shareCode: "GURU-8A",
              });
              router.push("/teacher/today");
            } catch (cause) {
              setError(
                cause instanceof ApiError
                  ? cause.message
                  : "We could not verify this invitation. Please ask your school administrator.",
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          <p className="eyebrow">Welcome back</p>
          <h2>Teacher sign in</h2>
          <p>Use the same school-issued invitation that opened this workspace.</p>
          <div className={styles.formGrid}>
            <label className={`${styles.formLabel} ${styles.full}`}>
              School email
              <input
                className={styles.formInput}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className={`${styles.formLabel} ${styles.full}`}>
              School-issued invite code
              <input
                className={styles.formInput}
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                required
              />
            </label>
            {error && <div className={`${styles.formError} ${styles.full}`} role="alert">{error}</div>}
            <button className={styles.submitButton} type="submit" disabled={checking}>
              {checking ? "Verifying invitation…" : "Sign in to teacher workspace →"}
            </button>
          </div>
          <div className={styles.authFinePrint}>New to Cogna? <Link href="/teacher/signup">Create a teacher workspace</Link></div>
        </form>
      </section>
    </div>
  );
}
