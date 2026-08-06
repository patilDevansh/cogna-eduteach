"use client";

import Link from "next/link";
import { TopBar } from "@/components/ui";

/**
 * Revision queue — short, friendly, and free of engine jargon.
 * Reasons use approved child-safe phrasings only.
 */
const REVISION_ITEMS: { concept: string; reason: string; length: string }[] = [
  {
    concept: "Plus and minus signs",
    reason: "This pattern needs another check",
    length: "3 quick questions",
  },
  {
    concept: "Opening brackets",
    reason: "Let’s practice this a little more",
    length: "2 questions",
  },
  {
    concept: "Two-step equations",
    reason: "You’re close — one more round to make it stick",
    length: "3 questions",
  },
];

export default function RevisionPage() {
  return (
    <div className="grid-air" style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar right={<Link href="/student/practice">Practice</Link>} />
      </div>
      <main className="shell-narrow phase-in" style={{ paddingTop: "5vh", paddingBottom: "5rem" }}>
        <p className="eyebrow">Your revision plan</p>
        <h1 style={{ fontSize: "var(--text-2xl)", marginTop: "var(--s-3)" }}>
          A few things worth another look
        </h1>
        <p className="muted" style={{ marginTop: "var(--s-3)" }}>
          Short and sweet — the whole plan takes about ten minutes.
        </p>

        <ul className="rowlist" style={{ marginTop: "var(--s-6)" }}>
          {REVISION_ITEMS.map((item) => (
            <li className="rowitem" key={item.concept}>
              <div>
                <p style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>
                  {item.concept}
                </p>
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  {item.reason} · {item.length}
                </p>
              </div>
              <Link href="/student/practice" className="btn btn-ghost">
                Start
              </Link>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: "var(--s-7)" }}>
          <Link href="/student/practice" className="btn btn-primary btn-lg">
            Start a short practice
          </Link>
        </div>
      </main>
    </div>
  );
}
