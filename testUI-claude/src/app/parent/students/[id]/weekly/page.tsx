"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { WeeklyUpdate, getWeeklyUpdate } from "@/lib/api";
import { TopBar } from "@/components/ui";

function weekLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
}

export default function WeeklyPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<WeeklyUpdate | null>(null);

  useEffect(() => {
    getWeeklyUpdate(params.id).then(setData);
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
            <p className="eyebrow">Weekly update · week of {weekLabel(data.weekOf)}</p>
            <h1 style={{ marginTop: "var(--s-3)" }}>How {data.studentName}’s week went</h1>
            <p className="aside" style={{ marginTop: "var(--s-2)" }}>
              {data.sessions} short sessions · about {data.minutes} minutes of practice in total
            </p>

            <h2>What they worked on</h2>
            {data.workedOn.map((w, i) => (
              <p key={i}>{w}</p>
            ))}

            <h2>Where things improved</h2>
            {data.improvements.map((w, i) => (
              <p key={i}>{w}</p>
            ))}

            <h2>A pattern we’re checking</h2>
            {data.patternsChecking.map((p, i) => (
              <div className="pattern-note" key={i}>
                <p style={{ margin: 0 }}>{p.text}</p>
                <p className="aside" style={{ marginTop: "var(--s-2)", marginBottom: 0 }}>
                  {p.certainty}
                </p>
              </div>
            ))}

            <h2>The plan for next week</h2>
            {data.revisionPlan.map((r, i) => (
              <p key={i}>{r}</p>
            ))}

            <h2>How you can help</h2>
            <div className="help-note">
              <p style={{ margin: 0 }}>{data.howToHelp}</p>
            </div>

            <hr />
            <p className="aside">{data.uncertaintyNote}</p>
          </article>
        )}
        <p style={{ marginTop: "var(--s-5)" }}>
          <Link href={`/parent/students/${params.id}/summary`}>← Last session’s note</Link>
        </p>
      </main>
    </div>
  );
}
