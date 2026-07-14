"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  api,
  isNotFound,
  isUnavailable,
  type ParentWeeklySummary,
  type WeeklyStructuredSummary,
} from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";
import { conceptLabel, formatReportDate, humanizeParentCopy } from "@/lib/concept-labels";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: ParentWeeklySummary }
  | { kind: "empty"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

function defaultPeriod(): { periodStart: string; periodEnd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

function asStructured(
  value: ParentWeeklySummary["structuredSummary"],
): WeeklyStructuredSummary | null {
  if (!value || typeof value !== "object") return null;
  return value;
}

/** Plain-language view when API returns structuredSummary without renderedText. */
function StructuredWeeklyView({ summary }: { summary: WeeklyStructuredSummary }) {
  const sessions = summary.sessionsCompleted ?? 0;
  const questions = summary.questionsAttempted;
  const concepts = (summary.conceptsPracticed ?? []).map(conceptLabel);
  const weak = Boolean(summary.weakEvidence);
  const patternNotes = (summary.activePatterns ?? [])
    .map((p) => p.uncertainty)
    .filter((u): u is string => Boolean(u?.trim()));

  return (
    <div style={{ marginTop: "0.5rem", lineHeight: 1.6 }}>
      <p>
        This week your child completed {sessions} practice session
        {sessions === 1 ? "" : "s"}
        {typeof questions === "number"
          ? ` and worked through ${questions} question${questions === 1 ? "" : "s"}`
          : ""}
        .
      </p>
      {concepts.length > 0 && (
        <p style={{ marginTop: "0.75rem" }}>
          Topics practiced: {concepts.join(", ")}.
        </p>
      )}
      {weak && (
        <p style={{ marginTop: "0.75rem" }}>
          We are still gathering evidence from this week&apos;s practice — a fuller
          update will appear after a few more sessions.
        </p>
      )}
      {!weak && patternNotes.length > 0 && (
        <ul style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}>
          {patternNotes.slice(0, 3).map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
      {summary.parentActions?.[0] && (
        <p style={{ marginTop: "0.75rem" }}>
          How you can help: {summary.parentActions[0]}
        </p>
      )}
    </div>
  );
}

export default function ParentWeeklySummaryPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = String(params.id ?? "");
  const { isLoaded, isSignedIn, getAuth } = useParentAuth();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [requesting, setRequesting] = useState(false);
  const [requestNote, setRequestNote] = useState("");

  useEffect(() => {
    document.title = "Weekly update — Cogna";
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/parent/login");
      return;
    }

    getAuth()
      .then((auth) => api.getParentWeeklySummary(auth, studentId))
      .then((data) => {
        if (data.renderedText || data.structuredSummary) {
          setState({ kind: "ready", data });
        } else {
          setState({
            kind: "empty",
            message:
              "No weekly summary yet. After a few practice sessions this week, a plain-language update will appear here.",
          });
        }
      })
      .catch((err) => {
        if (isNotFound(err)) {
          setState({
            kind: "empty",
            message:
              "Weekly summaries are not available yet for this student. Check back after more practice this week — or open the latest session summary.",
          });
          return;
        }
        if (isUnavailable(err)) {
          setState({
            kind: "unavailable",
            message:
              "We couldn't reach the learning service. Please try again in a moment.",
          });
          return;
        }
        setState({
          kind: "error",
          message:
            "We couldn't load the weekly summary. Please try again after your child completes a few sessions.",
        });
      });
  }, [isLoaded, isSignedIn, getAuth, router, studentId]);

  async function requestWeekly() {
    if (!isSignedIn || requesting) return;
    setRequesting(true);
    setRequestNote("");
    try {
      const period = defaultPeriod();
      const result = await api.requestWeeklyReport(studentId, period);
      setRequestNote(
        result.status === "PENDING"
          ? "Weekly report is being prepared. Refresh in a minute."
          : "Weekly report ready — refreshing…",
      );
      const auth = await getAuth();
      const refreshed = await api.getParentWeeklySummary(auth, studentId);
      if (refreshed.renderedText || refreshed.structuredSummary) {
        setState({ kind: "ready", data: refreshed });
      }
    } catch (err) {
      if (isNotFound(err)) {
        setRequestNote(
          "Weekly report generation is not available yet. Session summaries still work from the dashboard.",
        );
      } else {
        setRequestNote(
          "Could not request a weekly report right now. Please try again later.",
        );
      }
    } finally {
      setRequesting(false);
    }
  }

  if (!isLoaded || !isSignedIn) return <p>Loading…</p>;

  const structured = state.kind === "ready" ? asStructured(state.data.structuredSummary) : null;

  return (
    <div className="card">
      <h1>Weekly learning update</h1>
      <p className="lead">
        A calm, plain-language look at this week&apos;s practice — what went
        well and what to revisit. Not a grade or a label.
      </p>

      {state.kind === "loading" && <p className="lead">Loading weekly update…</p>}

      {(state.kind === "error" || state.kind === "unavailable") && (
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
          {state.data.periodStart && state.data.periodEnd && (
            <p className="lead" style={{ marginBottom: "0.75rem" }}>
              Period: {formatReportDate(state.data.periodStart)} →{" "}
              {formatReportDate(state.data.periodEnd)}
            </p>
          )}
          {state.data.renderedText ? (
            <p style={{ marginTop: "0.5rem", lineHeight: 1.6 }}>
              {humanizeParentCopy(state.data.renderedText)}
            </p>
          ) : structured ? (
            <StructuredWeeklyView summary={structured} />
          ) : (
            <p className="lead">
              A structured weekly summary is available, but plain text is still
              being prepared.
            </p>
          )}
          {state.data.createdAt && (
            <p className="lead" style={{ marginTop: "1rem" }}>
              Updated {new Date(state.data.createdAt).toLocaleString()}
            </p>
          )}
        </>
      )}

      {requestNote && <p className="lead" style={{ marginTop: "1rem" }}>{requestNote}</p>}

      <div className="actions" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void requestWeekly()}
          disabled={requesting}
        >
          {requesting ? "Requesting…" : "Request weekly update"}
        </button>
        <Link
          href={`/parent/students/${studentId}/summary`}
          className="btn btn-secondary"
        >
          Latest session summary
        </Link>
        <Link href="/parent/dashboard" className="btn btn-secondary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
