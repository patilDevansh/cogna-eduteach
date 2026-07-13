"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getParent } from "@/lib/session";

export default function NewStudentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(8);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getParent()) router.replace("/parent/login");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parent = getParent();
    if (!parent) return;

    setLoading(true);
    setError("");
    try {
      const result = await api.createStudent(parent.parentId, name, grade);
      setAccessCode(result.accessCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create student");
    } finally {
      setLoading(false);
    }
  }

  if (accessCode) {
    return (
      <div className="card">
        <h1>Student created</h1>
        <p className="lead">
          Share this access code with <strong>{name}</strong>. They will use it
          to log in and practice.
        </p>
        <div className="access-code">{accessCode}</div>
        <p className="success">Save this code — it won&apos;t be shown again.</p>
        <div className="actions">
          <Link href="/parent/dashboard" className="btn btn-primary">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Add a student</h1>
      <p className="lead">Create a profile and receive an access code for practice.</p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <label htmlFor="name">Student first name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Student name"
        />

        <label htmlFor="grade">Grade</label>
        <input
          id="grade"
          type="number"
          min={6}
          max={12}
          value={grade}
          onChange={(e) => setGrade(Number(e.target.value))}
        />

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create student"}
        </button>
      </form>

      <div className="actions" style={{ marginTop: "1rem" }}>
        <Link href="/parent/dashboard" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </div>
  );
}
