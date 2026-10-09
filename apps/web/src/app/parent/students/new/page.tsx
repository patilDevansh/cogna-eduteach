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
  // A child the school already added: the parent links them with the code from the school slip.
  const [fromSchool, setFromSchool] = useState(false);
  const [schoolCode, setSchoolCode] = useState("");
  const [linked, setLinked] = useState<string | null>(null);

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

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!isSignedIn) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.claimStudentWithCode(await getAuth(), schoolCode);
      setLinked(result.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded || !isSignedIn) return <p>Loading…</p>;

  if (linked) {
    return (
      <div className={styles.stage}>
        <div className={`${styles.parentWrap} phase-in`}>
          <div className={styles.parentCard}>
            <div className={styles.parentHead}>
              <h1>{linked} is linked</h1>
              <p>You&apos;ll see how {linked.split(" ")[0]} does in class, and updates from school appear on your dashboard. They keep signing in with the code from their slip.</p>
            </div>
            <Link href="/parent/dashboard" className="btn btn-primary btn-lg">Back to your children</Link>
          </div>
        </div>
      </div>
    );
  }

  if (fromSchool) {
    return (
      <div className={styles.stage}>
        <div className={`${styles.parentWrap} phase-in`}>
          <div className={styles.parentCard}>
            <div className={styles.parentHead}>
              <h1>Link a child from school</h1>
              <p>Type the parent code from the slip your child brought home. It looks like ABCDE-23456 and works once.</p>
            </div>
            <form onSubmit={handleClaim} className="stack-4">
              <div className="field">
                <label htmlFor="school-code">Parent code</label>
                <input id="school-code" className="input" type="text" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} required autoComplete="off" spellCheck={false} placeholder="ABCDE-23456" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }} />
              </div>
              <p className="muted">Linking your child means you agree to the practice they do with their class on Cogna.</p>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? "Linking…" : "Link my child"}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setFromSchool(false); setError(""); }}>My child isn&apos;t with a school on Cogna</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
            <button type="button" className="btn btn-secondary" onClick={() => { setFromSchool(true); setError(""); }}>I have a parent code from school</button>
            <Link href="/parent/dashboard" className="btn btn-secondary">Cancel</Link>
          </form>
        </div>
      </div>
    </div>
  );
}
