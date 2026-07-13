"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  isNotFound,
  isUnavailable,
  type RevisionPlan,
  type RevisionQueueItem,
} from "@/lib/api";
import { getStudent } from "@/lib/session";
import { conceptLabel, revisionTypeLabel, childSafeReasoning } from "@/lib/concept-labels";

function isDueSoon(dueAt?: string): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return false;
  return due <= Date.now() + 24 * 60 * 60 * 1000;
}

function formatDue(dueAt?: string): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function StudentRevisionPage() {
  const router = useRouter();
  const [student, setStudent] = useState<ReturnType<typeof getStudent>>(null);
  const [items, setItems] = useState<RevisionQueueItem[]>([]);
  const [plan, setPlan] = useState<RevisionPlan | null>(null);
  const [planNote, setPlanNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = getStudent();
    if (!s) {
      router.replace("/student/login");
      return;
    }
    setStudent(s);

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setPlanNote("");

      try {
        const queue = await api.getRevisionQueue(s!.studentId);
        if (!cancelled) setItems(Array.isArray(queue) ? queue : []);
      } catch (err) {
        if (cancelled) return;
        if (isUnavailable(err)) {
          setError(
            "We couldn't reach practice right now. Ask a grown-up to check the connection, then try again.",
          );
        } else {
          setError("We couldn't load your revision list. Please try again in a moment.");
        }
      }

      try {
        const nextPlan = await api.getRevisionPlan(s!.studentId);
        if (!cancelled) setPlan(nextPlan);
      } catch (err) {
        if (cancelled) return;
        if (isNotFound(err)) {
          setPlanNote("");
          setPlan(null);
        } else if (!isUnavailable(err)) {
          setPlanNote("Your daily plan isn't ready yet — the queue below still works.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!student) return <p>Loading…</p>;

  const retentionHint =
    plan?.weekly?.retentionConceptIds?.length
      ? plan.weekly.retentionConceptIds.map(conceptLabel)
      : [];

  const sorted = [...items].sort((a, b) => {
    const dueA = isDueSoon(a.dueAt) ? 0 : 1;
    const dueB = isDueSoon(b.dueAt) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });

  return (
    <div className="card">
      <h1>Your practice plan</h1>
      <p className="lead">
        Short refresh sets to keep skills strong. These are practice picks — not
        grades or labels.
      </p>

      {loading && <p className="lead">Loading your plan…</p>}

      {error && (
        <div className="empty-state" role="status">
          <p className="error">{error}</p>
        </div>
      )}

      {!loading && !error && plan && plan.daily?.items?.length > 0 && (
        <section className="plan-section" aria-label="Today's plan">
          <h2 className="section-title">Today&apos;s focus</h2>
          <p className="lead" style={{ marginBottom: "0.75rem" }}>
            Up to {plan.daily.cappedAt} short items — take it at your pace.
          </p>
          <ul className="student-list">
            {plan.daily.items.map((item) => (
              <li key={item.revisionItemId}>
                <strong>{conceptLabel(item.conceptId)}</strong>
                <br />
                {item.questionCount} question{item.questionCount === 1 ? "" : "s"} ·{" "}
                {revisionTypeLabel(item.type)}
                {formatDue(item.dueAt) && (
                  <>
                    {" "}
                    · due {formatDue(item.dueAt)}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && !error && retentionHint.length > 0 && (
        <p className="lead" style={{ marginTop: "0.5rem" }}>
          This week&apos;s refresh topics: {retentionHint.join(", ")}.
        </p>
      )}

      {planNote && <p className="lead">{planNote}</p>}

      {!loading && !error && (
        <>
          <h2 className="section-title" style={{ marginTop: "1.25rem" }}>
            Revision queue
          </h2>

          {sorted.length === 0 ? (
            <div className="empty-state" role="status">
              <p className="lead">Nothing due right now — nice work keeping up!</p>
              <p>When something needs a refresh, it will show up here.</p>
            </div>
          ) : (
            <ul className="student-list">
              {sorted.map((item) => {
                const due = formatDue(item.dueAt);
                const dueSoon = isDueSoon(item.dueAt);
                return (
                  <li key={item.id}>
                    <div className="revision-item-head">
                      <strong>{conceptLabel(item.conceptId)}</strong>
                      {dueSoon && <span className="badge-due">Due soon</span>}
                    </div>
                    {item.questionCount} question{item.questionCount === 1 ? "" : "s"} ·{" "}
                    {revisionTypeLabel(item.type)}
                    {due && <> · due {due}</>}
                    <br />
                    <span className="lead">{childSafeReasoning(item.reasoning)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="actions" style={{ marginTop: "1.5rem" }}>
        <Link href="/student/practice?mode=ADAPTIVE_PRACTICE" className="btn btn-primary">
          Start practice
        </Link>
        <Link href="/student/baseline" className="btn btn-secondary">
          Back
        </Link>
      </div>
    </div>
  );
}
