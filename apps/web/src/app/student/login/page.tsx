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
      saveStudent(student);
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
      saveStudent(student);
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
      </div>
    </div>
  );
}
