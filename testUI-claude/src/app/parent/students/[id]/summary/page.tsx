"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ParentSessionSummary, getSessionSummaryForParent } from "@/lib/api";
import { TopBar } from "@/components/ui";

function humanDate(iso: string) {
  const d = new Date(iso);
  const hours = (Date.now() - d.getTime()) / 3600000;
  if (hours < 24) return "earlier today";
  if (hours < 48) return "yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export default function SessionSummaryPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ParentSessionSummary | null>(null);

  useEffect(() => {
    getSessionSummaryForParent(params.id).then(setData);
  }, [params.id]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar right={<Link href="/parent/dashboard">Back to dashboard</Link>} />
      </div>
      <main className="shell-letter" style={{ paddingTop: "3vh", paddingBottom: "5rem" }}>
        {!data ? (
          <p className="muted">Loading…</p>
        ) : (
          <article className="letter phase-in">
            <p className="eyebrow">Session note · {humanDate(data.date)}</p>
            <h1 style={{ marginTop: "var(--s-3)" }}>
              {data.studentName} practised for {data.minutes} minutes
            </h1>
            <p className="aside" style={{ marginTop: "var(--s-2)" }}>
              {data.questionsTried} questions · Linear Equations
            </p>

            <h2>What happened</h2>
            {data.observations.map((o, i) => (
              <p key={i}>{o}</p>
            ))}

            {data.inference && (
              <>
                <h2>What it might mean</h2>
                <div className="pattern-note">
                  <p style={{ margin: 0 }}>{data.inference.text}</p>
                </div>
              </>
            )}

            <h2>What to do next</h2>
            <div className="help-note">
              <p style={{ margin: 0 }}>{data.nextPractice}</p>
            </div>

            <hr />
            <p className="aside">
              A note on certainty: session notes describe a single sitting. We only treat
              something as a pattern after we’ve seen it across several sessions — until
              then, it stays in “what it might mean”.
            </p>
          </article>
        )}
        <p style={{ marginTop: "var(--s-5)" }}>
          <Link href={`/parent/students/${params.id}/weekly`}>Read this week’s full update →</Link>
        </p>
      </main>
    </div>
  );
}
