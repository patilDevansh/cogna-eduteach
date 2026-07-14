"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { verifyAccessCode } from "@/lib/api";
import { TopBar } from "@/components/ui";

export default function StudentLogin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyAccessCode(code);
    setBusy(false);
    if (!result.ok) {
      setError("That code didn’t match. Check it with your parent and try again.");
      return;
    }
    sessionStorage.setItem(
      "cogna_student",
      JSON.stringify({ name: result.studentName ?? "there" })
    );
    const doneBaseline = localStorage.getItem("cogna_baseline_done") === "1";
    router.push(doneBaseline ? "/student/practice" : "/student/baseline");
  }

  return (
    <div className="grid-air" style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar />
      </div>
      <main className="shell-narrow" style={{ paddingTop: "8vh", paddingBottom: "4rem" }}>
        <div className="card phase-in stack-4">
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)" }}>Type your code</h1>
            <p className="muted" style={{ marginTop: "var(--s-2)" }}>
              It’s the six-character code your parent shared with you.
            </p>
          </div>
          <form onSubmit={submit} className="stack-4">
            <div className="field">
              <label htmlFor="code">Access code</label>
              <input
                id="code"
                className="input input-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="MATH42"
                maxLength={8}
                autoComplete="off"
                autoFocus
                inputMode="text"
                aria-describedby={error ? "code-error" : undefined}
              />
            </div>
            {error && (
              <p id="code-error" role="alert" style={{ color: "var(--caution)" }}>
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Checking…" : "Start"}
            </button>
          </form>
          <p className="faint" style={{ fontSize: "var(--text-xs)" }}>
            Trying Cogna out? The demo code is <span className="code-chip">MATH42</span>
          </p>
        </div>
      </main>
    </div>
  );
}
