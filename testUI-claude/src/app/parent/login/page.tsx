"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { parentLogin } from "@/lib/api";
import { TopBar } from "@/components/ui";

/**
 * Parent login. When Clerk is configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
 * the real app mounts Clerk's <SignIn/> here; locally we sign in a demo
 * parent through the same api client so every downstream screen works.
 */
export default function ParentLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    await parentLogin(email || "demo@cogna.app");
    router.push("/parent/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar />
      </div>
      <main className="shell-narrow" style={{ paddingTop: "8vh", paddingBottom: "4rem" }}>
        <div className="card phase-in stack-4">
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)" }}>Sign in</h1>
            <p className="muted" style={{ marginTop: "var(--s-2)" }}>
              Manage your children’s practice and read their session notes.
            </p>
          </div>
          <form onSubmit={submit} className="stack-4">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Signing in…" : "Continue"}
            </button>
          </form>
          <p className="faint" style={{ fontSize: "var(--text-xs)" }}>
            Local demo: any email signs you in as the demo parent.
          </p>
        </div>
      </main>
    </div>
  );
}
