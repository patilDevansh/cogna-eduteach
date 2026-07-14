"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { StudentRecord, addStudent } from "@/lib/api";
import { TopBar } from "@/components/ui";

export default function NewStudent() {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("Grade 8 · CBSE");
  const [created, setCreated] = useState<StudentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    const record = await addStudent(name.trim(), grade);
    setCreated(record);
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar right={<Link href="/parent/dashboard">Back to dashboard</Link>} />
      </div>
      <main className="shell-narrow" style={{ paddingTop: "6vh", paddingBottom: "4rem" }}>
        {created ? (
          <div className="card phase-in stack-4 center">
            <p className="eyebrow">Student added</p>
            <h1 style={{ fontSize: "var(--text-2xl)" }}>{created.name} is ready to practise</h1>
            <p className="muted">Share this access code with them — it’s how they sign in:</p>
            <p>
              <span className="code-chip" style={{ fontSize: "var(--text-xl)", padding: "0.5rem 1rem" }}>
                {created.accessCode}
              </span>
            </p>
            <p className="faint" style={{ fontSize: "var(--text-sm)" }}>
              You can generate a new code any time from the dashboard.
            </p>
            <div style={{ display: "flex", gap: "var(--s-3)", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/parent/dashboard" className="btn btn-primary">
                Done
              </Link>
              <button className="btn btn-ghost" onClick={() => { setCreated(null); setName(""); }}>
                Add another
              </button>
            </div>
          </div>
        ) : (
          <div className="card phase-in stack-4">
            <div>
              <h1 style={{ fontSize: "var(--text-2xl)" }}>Add a student</h1>
              <p className="muted" style={{ marginTop: "var(--s-2)" }}>
                We’ll create an access code they can use to sign in on any device.
              </p>
            </div>
            <form onSubmit={submit} className="stack-4">
              <div className="field">
                <label htmlFor="name">Student’s first name</label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="grade">Class</label>
                <select id="grade" className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
                  <option>Grade 8 · CBSE</option>
                </select>
                <p className="faint" style={{ fontSize: "var(--text-xs)" }}>
                  The pilot covers Grade 8 Linear Equations. More units are coming.
                </p>
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create access code"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
