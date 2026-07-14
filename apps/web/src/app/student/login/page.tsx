"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { saveStudent } from "@/lib/session";

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
      router.push("/student/baseline");
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
      router.push("/student/baseline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>Student login</h1>
      <p className="lead">Enter the access code from your parent.</p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleLogin}>
        <label htmlFor="code">Access code</label>
        <input
          id="code"
          type="text"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          required
          placeholder="e.g. demo1234"
          autoComplete="off"
        />

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Signing in…" : "Start practice"}
        </button>
      </form>

      <div className="actions" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={useDemoCode}
          disabled={loading}
        >
          Use demo code
        </button>
        <Link href="/" className="btn btn-secondary">
          Back
        </Link>
      </div>
    </div>
  );
}
