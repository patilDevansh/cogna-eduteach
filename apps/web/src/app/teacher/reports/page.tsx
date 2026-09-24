"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ClassroomRunReport } from "@/lib/api";
import { MOCK_TEACHER_REPORT_DATA } from "@/lib/teacher-report/mock-data";
import { ThirtySecondOverview } from "@/components/teacher-report/ThirtySecondOverview";
import styles from "../teacher.module.css";
import chart from "@/components/teacher-report/teacher-report.module.css";

const OUTCOME_COLORS: Record<string, string> = {
  SOLID_GAP: "#0d7a5f",
  ADVANCEMENT: "#5366d6",
  INSUFFICIENT_OR_CONFLICTING: "#8b63bd",
};
const FALLBACK_COLORS = ["#0d7a5f", "#5366d6", "#df6b58", "#8b63bd", "#dc991c"];
const PHASE_COLORS = ["#0d7a5f", "#5366d6", "#dc991c"];

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function Donut({ title, segments, centerValue, centerLabel }: {
  title: string;
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let cursor = 0;
  const stops = segments
    .map((s) => {
      const start = total ? (cursor / total) * 100 : 0;
      cursor += s.value;
      const end = total ? (cursor / total) * 100 : 0;
      return `${s.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <article className={chart.insightCard}>
      <div className={chart.cardQuestionHeader}>
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      <div className={chart.chartLayout}>
        <div
          className={chart.donutChart}
          style={{ background: total ? `conic-gradient(${stops})` : "var(--line)" }}
          role="img"
          aria-label={segments.map((s) => `${s.value} ${s.label}`).join(", ") || "No evidence yet"}
        >
          <div className={chart.donutCenter}>
            <strong>{centerValue}</strong>
            <span>{centerLabel}</span>
          </div>
        </div>
        <div className={chart.chartLegend}>
          {segments.map((s) => (
            <div key={s.label} className={chart.legendDefinition}>
              <span className={chart.legendDot} style={{ background: s.color }} />
              <span>
                <strong>{s.label}</strong>
              </span>
              <b>{s.value}</b>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function TeacherReportsPage() {
  const [reports, setReports] = useState<ClassroomRunReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get("demo") === "1");
    api
      .listClassrooms()
      .then(async (classes) => {
        const values = await Promise.all(
          classes.flatMap((item) => (item.runs ?? []).map((run) => api.getClassroomRunReport(run.id))),
        );
        setReports(values);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Reports could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  if (demo) {
    return (
      <>
        <ThirtySecondOverview
          data={MOCK_TEACHER_REPORT_DATA}
          onOpenActionBlueprint={() => undefined}
          onOpenEvidenceAudit={() => undefined}
          onSelectReadinessTab={() => undefined}
        />
        <p style={{ marginTop: "1rem" }}>
          <Link href="/teacher/reports">Return to production reports</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.dateLine}>Evidence-backed production reports</div>
          <h1>Class reports</h1>
          <p>Diagnostic, teaching, and independent evidence remain visibly separate.</p>
        </div>
        <Link className={styles.secondary} href="/teacher/reports?demo=1">
          View mock report
        </Link>
      </div>

      {loading && (
        <section className={styles.emptyCard}>
          <h2>Loading classroom evidence…</h2>
        </section>
      )}
      {error && (
        <section className={styles.emptyCard}>
          <h2>Reports unavailable</h2>
          <p>{error}</p>
        </section>
      )}

      {reports.map((report) => {
        const diagnostic = report.progress.find((x) => x.kind === "DIAGNOSTIC");
        const teaching = report.progress.find((x) => x.kind === "TEACHING");
        const exit = report.progress.find((x) => x.kind === "INDEPENDENT_EXIT");
        const topStrength = Object.entries(report.summary.observedStrengths).sort((a, b) => b[1] - a[1])[0];
        const topUncertainty = Object.entries(report.summary.uncertaintyAreas).sort((a, b) => b[1] - a[1])[0];

        const outcomeEntries = Object.entries(report.summary.diagnosticOutcomes);
        const outcomeSegments: DonutSegment[] = outcomeEntries.map(([key, value], i) => ({
          label: key.replaceAll("_", " "),
          value,
          color: OUTCOME_COLORS[key] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        }));
        const outcomeTotal = outcomeEntries.reduce((sum, [, v]) => sum + v, 0);

        const phaseSegments: DonutSegment[] = [
          { label: "Diagnostic", value: diagnostic?.complete ?? 0, color: PHASE_COLORS[0] },
          { label: "Teaching", value: teaching?.complete ?? 0, color: PHASE_COLORS[1] },
          { label: "Independent exit", value: exit?.complete ?? 0, color: PHASE_COLORS[2] },
        ];
        const phaseTotal = (diagnostic?.total ?? 0) + (teaching?.total ?? 0) + (exit?.total ?? 0);
        const phaseComplete = phaseSegments.reduce((sum, s) => sum + s.value, 0);

        return (
          <section className={styles.decisionCard} key={report.run.id}>
            <div className={styles.decisionTop}>
              <div>
                <div className={styles.dateLine}>
                  {report.run.classroom.name} · {report.run.phase.replaceAll("_", " ")}
                </div>
                <h2>{report.run.title}</h2>
                <p>Generated from submitted classroom assignments, not mock roster data.</p>
              </div>
              <span className={styles.signal}>{report.run.status}</span>
            </div>

            <div className={styles.liveStats}>
              <div>
                <span>Diagnostic complete</span>
                <strong>
                  {diagnostic?.complete ?? 0}/{diagnostic?.total ?? 0}
                </strong>
              </div>
              <div>
                <span>Teaching complete</span>
                <strong>
                  {teaching?.complete ?? 0}/{teaching?.total ?? 0}
                </strong>
              </div>
              <div>
                <span>Exit verified</span>
                <strong>
                  {report.summary.independentExit.verified}/{exit?.total ?? 0}
                </strong>
              </div>
              <div>
                <span>Exit needs review</span>
                <strong>{report.summary.independentExit.needsReview}</strong>
              </div>
            </div>

            <div className={chart.insightGrid} style={{ marginTop: "1.1rem" }}>
              <Donut
                title="Diagnostic outcomes"
                segments={outcomeSegments}
                centerValue={String(outcomeTotal)}
                centerLabel="learners"
              />
              <Donut
                title="Learning-cycle progress"
                segments={phaseSegments}
                centerValue={phaseTotal ? `${Math.round((phaseComplete / phaseTotal) * 100)}%` : "0%"}
                centerLabel="complete"
              />
            </div>

            <div className={styles.nextSteps} style={{ marginTop: "1.1rem" }}>
              {topStrength && (
                <div className={styles.nextStep}>
                  <span>Most observed strength · {topStrength[1]} learners</span>
                  <strong>{topStrength[0]}</strong>
                </div>
              )}
              {topUncertainty && (
                <div className={styles.nextStep}>
                  <span>Most common uncertainty · {topUncertainty[1]} learners</span>
                  <strong>{topUncertainty[0]}</strong>
                </div>
              )}
            </div>

            <div className={styles.decisionAction}>
              <strong>
                {report.students.length} persisted evidence records · {report.summary.enrolled} learners
              </strong>
              <Link className={styles.decisionLink} href={`/teacher/sessions?classroom=${report.run.classroom.id}`}>
                Open live session →
              </Link>
            </div>
          </section>
        );
      })}

      {!loading && !reports.length && !error && (
        <section className={styles.emptyCard}>
          <h2>No production report yet</h2>
          <p>Create a classroom session, launch the diagnostic, and completed evidence will appear here.</p>
          <Link className={styles.primary} href="/teacher/sessions">
            Start a session →
          </Link>
        </section>
      )}
    </>
  );
}
