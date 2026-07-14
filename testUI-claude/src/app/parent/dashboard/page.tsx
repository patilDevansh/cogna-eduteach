"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentRecord, listStudents, regenerateAccessCode } from "@/lib/api";
import { TopBar } from "@/components/ui";

function humanizeLast(iso: string | null): string {
  if (!iso) return "Hasn’t practised yet";
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours < 1.5) return "Practised just now";
  if (hours < 24) return "Practised earlier today";
  if (hours < 48) return "Practised yesterday";
  return `Practised ${Math.round(hours / 24)} days ago`;
}

export default function ParentDashboard() {
  const [students, setStudents] = useState<StudentRecord[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listStudents().then(setStudents);
  }, []);

  async function regenerate(id: string) {
    setBusyId(id);
    const code = await regenerateAccessCode(id);
    setStudents((prev) =>
      prev ? prev.map((s) => (s.id === id ? { ...s, accessCode: code } : s)) : prev
    );
    setBusyId(null);
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar
          right={
            <>
              <Link href="/parent/students/new">Add a student</Link>
              <Link href="/">Sign out</Link>
            </>
          }
        />
      </div>

      <main className="shell-letter" style={{ paddingTop: "4vh", paddingBottom: "5rem" }}>
        <p className="eyebrow">Your students</p>
        <h1 style={{ fontSize: "var(--text-2xl)", marginTop: "var(--s-3)" }}>
          Practice, at a glance
        </h1>
        <p className="muted" style={{ marginTop: "var(--s-3)" }}>
          Each student signs in with their access code — no passwords to remember.
        </p>

        {!students ? (
          <p className="muted" style={{ marginTop: "var(--s-6)" }}>
            Loading…
          </p>
        ) : students.length === 0 ? (
          <div className="card" style={{ marginTop: "var(--s-6)" }}>
            <p>No students linked yet. Add your first student to get their access code.</p>
            <Link
              href="/parent/students/new"
              className="btn btn-primary"
              style={{ marginTop: "var(--s-4)" }}
            >
              Add a student
            </Link>
          </div>
        ) : (
          <ul className="rowlist" style={{ marginTop: "var(--s-6)" }}>
            {students.map((s) => (
              <li className="rowitem" key={s.id}>
                <div className="stack-2" style={{ minWidth: "12rem" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)" }}>
                    {s.name}
                  </p>
                  <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                    {s.grade} · {humanizeLast(s.lastPracticed)}
                  </p>
                  <p style={{ fontSize: "var(--text-sm)" }}>
                    <Link href={`/parent/students/${s.id}/summary`}>Last session</Link>
                    {" · "}
                    <Link href={`/parent/students/${s.id}/weekly`}>Weekly update</Link>
                  </p>
                </div>
                <div className="stack-2" style={{ textAlign: "right" }}>
                  <p className="faint" style={{ fontSize: "var(--text-xs)" }}>
                    Access code
                  </p>
                  <p>
                    <span className="code-chip" style={{ fontSize: "var(--text-md)" }}>
                      {s.accessCode}
                    </span>
                  </p>
                  <button
                    className="btn btn-quiet"
                    onClick={() => regenerate(s.id)}
                    disabled={busyId === s.id}
                  >
                    {busyId === s.id ? "Generating…" : "New code"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
