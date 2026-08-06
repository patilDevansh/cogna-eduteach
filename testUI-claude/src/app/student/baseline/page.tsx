"use client";

import { useEffect, useState } from "react";
import PracticeSession from "@/components/PracticeSession";
import { Wordmark } from "@/components/ui";

export default function BaselinePage() {
  const [started, setStarted] = useState(false);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cogna_student");
      if (raw) setName(JSON.parse(raw).name ?? "");
    } catch {
      /* fine — greet without a name */
    }
  }, []);

  if (started) {
    return (
      <div className="grid-air">
        <PracticeSession
          mode="baseline"
          totalQuestions={5}
          onFinished={() => localStorage.setItem("cogna_baseline_done", "1")}
        />
      </div>
    );
  }

  return (
    <div
      className="grid-air"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <div className="shell" style={{ width: "100%" }}>
        <header className="topbar">
          <Wordmark />
        </header>
      </div>
      <main
        className="shell-narrow phase-in"
        style={{ margin: "auto", width: "100%", paddingBottom: "6rem" }}
      >
        <p className="eyebrow">First session</p>
        <h1 style={{ fontSize: "var(--text-2xl)", marginTop: "var(--s-3)" }}>
          {name ? `Hi ${name} — let’s see where you are.` : "Let’s see where you are."}
        </h1>
        <div className="stack-4" style={{ marginTop: "var(--s-5)", color: "var(--ink-soft)" }}>
          <p>
            You’ll try <strong style={{ color: "var(--ink)" }}>five questions</strong> about
            equations — some easy, some a bit harder. That’s completely normal.
          </p>
          <p>
            This isn’t a test and there’s no score. It just helps Cogna pick the right
            questions for you next time. Take your time, and skip anything you like.
          </p>
        </div>
        <button
          className="btn btn-primary btn-lg"
          style={{ marginTop: "var(--s-7)" }}
          onClick={() => setStarted(true)}
        >
          Start the five questions
        </button>
      </main>
    </div>
  );
}
