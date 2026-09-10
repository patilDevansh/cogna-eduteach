"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveTeacherInvitation } from "@/lib/session";
import styles from "../teacher.module.css";

export default function TeacherSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("GURUKUL-2026");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  return (
    <div className={styles.authPage}>
      <section className={styles.authStory}>
        <Link href="/" className={styles.lightWordmark}>Cogna<span>.</span></Link>
        <div className={styles.storyCopy}>
          <h1>Act in 30 seconds.</h1>
          <p>See what landed, where students struggled, and the smallest useful next move.</p>
          <div className={styles.storySteps}>
            <div className={styles.storyStep}><b>1</b><div><strong>Set the learning context</strong><span>Tell Cogna what was taught and what comes next.</span></div></div>
            <div className={styles.storyStep}><b>2</b><div><strong>Run a supervised session</strong><span>Students show their own working; Cogna collects step-level evidence.</span></div></div>
            <div className={styles.storyStep}><b>3</b><div><strong>Act in 30 seconds</strong><span>See what landed, where students struggled, and the smallest useful next move.</span></div></div>
          </div>
        </div>
        <p className={styles.trustNote}>Cogna describes student evidence—not teacher quality. Every conclusion can be opened to inspect the work behind it.</p>
      </section>
      <section className={styles.authFormWrap}>
        <form className={styles.authCard} onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setChecking(true);
          try {
            const invitation = await api.claimTeacherInvitation(email, inviteCode);
            saveTeacherInvitation(invitation);
            router.push("/teacher/setup");
          } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : "We could not verify this invitation. Please ask your school administrator.");
          } finally {
            setChecking(false);
          }
        }}>
          <p className="eyebrow">Teacher pilot access</p>
          <h2>Create your workspace</h2>
          <p>Use your school-issued invitation to set up the first class.</p>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>Full name<input className={styles.formInput} defaultValue="Ananya Rao" required /></label>
            <label className={styles.formLabel}>School<input className={styles.formInput} defaultValue="Gurukul" required /></label>
            <label className={`${styles.formLabel} ${styles.full}`}>School email<input className={styles.formInput} type="email" placeholder="name@gurukul.edu" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className={styles.formLabel}>Subject<select className={styles.formInput} defaultValue="Mathematics"><option>Mathematics</option><option>Science</option></select></label>
            <label className={styles.formLabel}>Grades taught<select className={styles.formInput} defaultValue="Grade 8"><option>Grade 8</option><option>Grade 7</option><option>Grade 9</option></select></label>
            <label className={`${styles.formLabel} ${styles.full}`}>School-issued invite code<input className={styles.formInput} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required /></label>
            {error && <div className={`${styles.formError} ${styles.full}`} role="alert">{error}</div>}
            <button className={styles.submitButton} type="submit" disabled={checking}>{checking ? "Verifying school invitation…" : "Verify invitation and continue →"}</button>
          </div>
          <div className={styles.authFinePrint}>Already have a workspace? <Link href="/teacher/login">Sign in as a teacher</Link></div>
        </form>
      </section>
    </div>
  );
}
