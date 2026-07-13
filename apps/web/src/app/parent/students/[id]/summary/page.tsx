"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, isNotFound, isUnavailable } from "@/lib/api";
import { getParent } from "@/lib/session";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; summary: string; createdAt: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

export default function ParentStudentSummaryPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = String(params.id ?? "");
  const [parent, setParent] = useState<ReturnType<typeof getParent>>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const p = getParent();
    if (!p) {
      router.replace("/parent/login");
      return;
    }
    setParent(p);

    api
      .getParentStudentSummary(p.parentId, studentId)
      .then((report) => {
        if (!report.renderedText?.trim()) {
          setState({
            kind: "empty",
            message:
              "No summary text yet — complete a practice session first, then refresh.",
          });
          return;
        }
        setState({
          kind: "ready",
          summary: report.renderedText,
          createdAt: new Date(report.createdAt).toLocaleString(),
        });
      })
      .catch((err) => {
        if (isNotFound(err)) {
          setState({
            kind: "empty",
            message:
              "No session summary yet. After your child finishes a practice session, a plain-language update will show here.",
          });
          return;
        }
        if (isUnavailable(err)) {
          setState({
            kind: "error",
            message:
              "We couldn't reach the learning service. Please try again in a moment.",
          });
          return;
        }
        setState({
          kind: "error",
          message:
            "We couldn't load this summary. Please try again after your child completes a session.",
        });
      });
  }, [router, studentId]);

  if (!parent) return <p>Loading…</p>;

  return (
    <div className="card">
      <h1>Learning summary</h1>
      <p className="lead">
        Plain-language update for your child&apos;s latest session — observations,
        not labels.
      </p>

      {state.kind === "loading" && <p className="lead">Loading summary…</p>}

      {state.kind === "error" && (
        <div className="empty-state" role="status">
          <p className="error">{state.message}</p>
        </div>
      )}

      {state.kind === "empty" && (
        <div className="empty-state" role="status">
          <p className="lead">{state.message}</p>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <p style={{ marginTop: "1rem", lineHeight: 1.6 }}>{state.summary}</p>
          <p className="lead" style={{ marginTop: "1rem" }}>
            Generated {state.createdAt}
          </p>
        </>
      )}

      <div className="actions" style={{ marginTop: "1.5rem" }}>
        <Link
          href={`/parent/students/${studentId}/weekly`}
          className="btn btn-secondary"
        >
          Weekly update
        </Link>
        <Link href="/parent/dashboard" className="btn btn-secondary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
