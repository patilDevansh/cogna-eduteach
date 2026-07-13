"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { saveParent } from "@/lib/session";

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const parent = await api.parentSignup(email, name);
      saveParent(parent);
      router.push("/parent/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function useDevAccount() {
    setLoading(true);
    try {
      const parent = await api.parentSignup("parent@demo.cogna.local", "Demo Parent");
      saveParent(parent);
      router.push("/parent/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>Parent account</h1>
      <p className="lead">
        Create an account to add students and view their progress. Clerk auth
        will replace this dev signup when keys are configured.
      </p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSignup}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Parent name"
        />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <div className="actions" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={useDevAccount}
          disabled={loading}
        >
          Use demo parent
        </button>
        <Link href="/parent/dashboard" className="btn btn-secondary">
          Already signed in
        </Link>
      </div>
    </div>
  );
}
