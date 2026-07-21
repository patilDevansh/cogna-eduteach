"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { saveParent } from "@/lib/session";
import styles from "@/components/login.module.css";

import { ClerkParentSignIn, isClerkEnabled } from "@/components/clerk-parent-sign-in";

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5 2.5 3.8v3.9c0 3.4 2.3 6.4 5.5 7.3 3.2-.9 5.5-3.9 5.5-7.3V3.8L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chrome() {
  return (
    <div className={styles.chrome}>
      <Link href="/" className="wordmark">
        cogna<span className="dot">.</span>
      </Link>
      <Link href="/student/login" className="btn-quiet">
        I&apos;m a student
      </Link>
    </div>
  );
}

function TrustLine() {
  return (
    <div className={styles.trustLine}>
      <ShieldIcon />
      <p>
        Your child never sees this login. Everything shown here is checked
        before it reaches them.
      </p>
    </div>
  );
}

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Parent login — Cogna";
  }, []);

  if (isClerkEnabled()) {
    return (
      <div className={styles.stage}>
        <Chrome />
        <div className={`${styles.parentWrap} phase-in`}>
          <div className={styles.parentCard}>
            <div className={styles.parentHead}>
              <h1>Welcome back</h1>
              <p>Sign in to see how practice is going and what to try next.</p>
            </div>
            <ClerkParentSignIn />
            <TrustLine />
          </div>
        </div>
      </div>
    );
  }

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
      const parent = await api.parentDemoLogin();
      saveParent(parent);
      router.push("/parent/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.stage}>
      <Chrome />
      <div className={`${styles.parentWrap} phase-in`}>
        <div className={styles.parentCard}>
          <div className={styles.parentHead}>
            <h1>Welcome back</h1>
            <p>
              Create an account to add students and see their progress.
              {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                ? " Sign in with Clerk when configured."
                : " Demo signup is available for local pilot testing."}
            </p>
          </div>

          <form onSubmit={handleSignup} className="stack-4">
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Parent name"
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            {error && <p className="error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <div className={styles.dividerRow}>or</div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={useDevAccount}
            disabled={loading}
          >
            Use demo parent
          </button>

          <TrustLine />

          <p className={styles.switchLine}>
            Already signed in? <Link href="/parent/dashboard">Go to dashboard</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
