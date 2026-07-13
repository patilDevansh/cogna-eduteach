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

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  if (!isLoaded || !isSignedIn) return <p>Loading…</p>;

  return (
    <div className="card">
      <h1>Hello, {display?.name ?? "Parent"}</h1>
      <p className="lead">Manage your students and their practice access codes.</p>

      {error && <p className="error">{error}</p>}

      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>Your students</h2>
      {students.length === 0 ? (
        <p className="lead">No students yet. Add one to get started.</p>
      ) : (
        <ul className="student-list">
          {students.map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong> — Grade {s.grade}
              <div className="actions" style={{ marginTop: "0.5rem" }}>
                <Link href={`/parent/students/${s.id}/summary`} className="btn btn-secondary">
                  Session summary
                </Link>
                <Link href={`/parent/students/${s.id}/weekly`} className="btn btn-secondary">
                  Weekly update
                </Link>
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
