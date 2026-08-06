"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";

export default function ParentDashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, display, getAuth, signOut } = useParentAuth();
  const [students, setStudents] = useState<
    Array<{ id: string; name: string; grade: number }>
  >([]);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/parent/login");
      return;
    }

    getAuth()
      .then((auth) => api.listStudents(auth))
      .then(setStudents)
      .catch(() =>
        setError("We couldn't load your students. Please refresh the page."),
      );
  }, [isLoaded, isSignedIn, getAuth, router]);

  useEffect(() => {
    document.title = "Parent dashboard — Cogna";
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  async function showAccessCode(studentId: string) {
    setBusyId(studentId);
    setError("");
    try {
      const auth = await getAuth();
      const result = await api.regenerateAccessCode(auth, studentId);
      setCodes((prev) => ({ ...prev, [studentId]: result.accessCode }));
    } catch {
      setError("Couldn't create a new access code. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!isLoaded || !isSignedIn) return <p>Loading…</p>;

  return (
    <div className="card">
      <h1>Hello, {display?.name ?? "Parent"}</h1>
      <p className="lead">
        View progress reports below. Access codes are shown when you add a
        student — create a new one here if the old code was lost (it replaces
        the previous code).
      </p>

      {error && <p className="error">{error}</p>}

      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>Your students</h2>
      {students.length === 0 ? (
        <p className="lead">No students yet. Add one to get started.</p>
      ) : (
        <ul className="student-list">
          {students.map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong> — Grade {s.grade}
              {codes[s.id] && (
                <p className="lead" style={{ margin: "0.35rem 0 0" }}>
                  Access code: <span className="access-code">{codes[s.id]}</span>
                </p>
              )}
              <div className="actions" style={{ marginTop: "0.5rem" }}>
                <Link href={`/parent/students/${s.id}`} className="btn btn-primary">
                  View progress
                </Link>
                <Link href={`/parent/students/${s.id}/summary`} className="btn btn-secondary">
                  Session summary
                </Link>
                <Link href={`/parent/students/${s.id}/weekly`} className="btn btn-secondary">
                  Weekly update
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === s.id}
                  onClick={() => void showAccessCode(s.id)}
                >
                  {busyId === s.id
                    ? "Creating…"
                    : codes[s.id]
                      ? "Create another code"
                      : "Create new access code"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <Link href="/parent/students/new" className="btn btn-primary">
          Add student
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
