"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { saveStudent } from "@/lib/session";
import styles from "@/components/login.module.css";

export default function StudentLoginPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Student login — Cogna";
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const student = await api.studentLogin(accessCode);
      saveStudent({
        studentId: student.studentId,
        name: student.name,
        token: student.sessionToken,
      });
      router.push("/student/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid access code");
    } finally {
      setLoading(false);
    }
  }

  async function useDemoCode() {
    setLoading(true);
    try {
      const health = await api.health();
      const student = await api.studentLogin(health.devAccessCode);
      saveStudent({
        studentId: student.studentId,
        name: student.name,
        token: student.sessionToken,
      });
      router.push("/student/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.stage}>
      <div className={styles.chrome}>
        <Link href="/" className="wordmark">
          Cogna<span className="dot">.</span>
        </Link>
        <Link href="/parent/login" className="btn-quiet">
          I&apos;m a parent
        </Link>
      </div>

      <div className={`${styles.studentCard} phase-in`}>
        <div className={styles.pathArt}>
          <svg viewBox="0 0 200 60" aria-hidden="true">
            <path
              d="M 10 45 C 45 10, 75 55, 110 25 S 165 10, 190 25"
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="10" cy="45" r="6" fill="var(--accent)" />
            <circle cx="110" cy="25" r="5" fill="var(--accent-deep)" />
            <circle cx="190" cy="25" r="5" fill="var(--line-strong)" />
          </svg>
        </div>

        <div className={styles.loginHead}>
          <h1>Let&apos;s pick up where you left off</h1>
          <p>Enter your practice code to continue.</p>
        </div>

        <form onSubmit={handleLogin} className={styles.codeField}>
          <label htmlFor="code">Practice code</label>
          <input
            id="code"
            className={`input ${styles.codeInput}`}
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            required
            placeholder="AB12CD"
            autoComplete="off"
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "Signing in…" : "Start practicing"}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={useDemoCode}
          disabled={loading}
        >
          Use demo code
        </button>

        <p className={styles.helperLine}>
          Don&apos;t have a code? Ask the grown-up who set up your account.
        </p>

        <div className={styles.classJoin}>
          <p className={styles.classJoinEyebrow}>In class with your teacher?</p>
          <Link href="/student/classroom/live?join=1" className={styles.classJoinCard}>
            <span className={styles.classJoinIcon} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2.5" y="3.5" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 19h6M11 15.5V19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M7 8.5h8M7 11.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.classJoinCopy}>
              <strong>Join your class</strong>
              <span>Enter the code your teacher put on the board.</span>
            </span>
            <span className={styles.classJoinArrow} aria-hidden="true">
              →
            </span>
          </Link>
        </div>

        <Link href="/prototype/classroom/join" className={styles.mockLink}>
          Open mock classroom demo
        </Link>
      </div>
    </div>
  );
}
