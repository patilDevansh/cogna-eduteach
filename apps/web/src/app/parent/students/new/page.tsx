"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";
import styles from "@/components/login.module.css";

export default function NewStudentPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getAuth } = useParentAuth();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(8);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Add student — Cogna";
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/parent/login");
  }, [isLoaded, isSignedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSignedIn) return;

    setLoading(true);
    setError("");
    try {
      const auth = await getAuth();
      const result = await api.createStudent(auth, name, grade);
      setAccessCode(result.accessCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create student");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded || !isSignedIn) return <p>Loading…</p>;

  if (accessCode) {
    return (
      <div className={styles.stage}>
        <div className={`${styles.parentWrap} phase-in`}>
          <div className={styles.parentCard}>
            <div className={styles.parentHead}>
              <h1>{name} is ready</h1>
              <p>Share this sign-in code with {name}. They type it on the student sign-in page.</p>
            </div>
            <div className="stack-4">
              <p style={{ font: "700 2rem var(--font-mono, monospace)", letterSpacing: "0.12em", textAlign: "center" }}>{accessCode}</p>
              <p className="muted">Save it now: it won&apos;t be shown again. You can make a new one from your dashboard.</p>
              <Link href="/parent/dashboard" className="btn btn-primary btn-lg">Back to your children</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <div className={`${styles.parentWrap} phase-in`}>
        <div className={styles.parentCard}>
          <div className={styles.parentHead}>
            <h1>Add a child</h1>
            <p>They get their own sign-in code for practice and class.</p>
          </div>
          <form onSubmit={handleSubmit} className="stack-4">
            <div className="field">
              <label htmlFor="name">First name</label>
              <input id="name" className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Aarav" />
            </div>
            <div className="field">
              <label htmlFor="grade">Grade</label>
              <input id="grade" className="input" type="number" min={6} max={12} value={grade} onChange={(e) => setGrade(Number(e.target.value))} />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? "Creating…" : "Create sign-in code"}
            </button>
            <Link href="/parent/dashboard" className="btn btn-secondary">Cancel</Link>
          </form>
        </div>
      </div>
    </div>
  );
}
