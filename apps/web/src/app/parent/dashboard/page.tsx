"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getParent, clearParent } from "@/lib/session";

export default function ParentDashboardPage() {
  const router = useRouter();
  const [parent, setParent] = useState<ReturnType<typeof getParent>>(null);
  const [students, setStudents] = useState<Array<{ id: string; name: string; grade: number }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = getParent();
    if (!p) {
      router.replace("/parent/login");
      return;
    }
    setParent(p);
    api
      .listStudents(p.parentId)
      .then(setStudents)
      .catch(() => setError("We couldn't load your students. Please refresh the page."));
  }, [router]);

  function signOut() {
    clearParent();
    router.push("/");
  }

  if (!parent) return <p>Loading…</p>;

  return (
    <div className="card">
      <h1>Hello, {parent.name}</h1>
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
        <button type="button" className="btn btn-secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
