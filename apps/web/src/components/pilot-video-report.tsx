"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PersonalizedVideoTeacherReport } from "@cogna/shared";
import { api } from "@/lib/api";
import { PILOT_STUDENT_KEYS, PILOT_STUDENT_STORIES } from "@/lib/pilot-video-demo";
import styles from "@/app/teacher/teacher.module.css";

export function PilotVideoReport() {
  const search = useSearchParams();
  const demo = search.get("demo") === "1";
  const [report, setReport] = useState<PersonalizedVideoTeacherReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPersonalizedVideoTeacherReport(demo)
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The report could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const students = report?.students ?? [];
  const verified = report?.totals.exitVerified ?? 0;
  const completed = report?.totals.exitAttempted ?? 0;

  return (
    <>
      <section className={styles.pilotHero}>
        <div>
          <div className={styles.dateLine} style={{ color: "#9bdac3" }}>
            {demo ? "Demo fixtures · explicit demo=1" : "Persisted production records"}
          </div>
          <h1>From diagnostic evidence to a personal lesson—and back to proof.</h1>
          <p>
            Teacher views stay concise first. Exact question-and-step evidence is available on demand.
            A watched video is not learning evidence, and one exit item is not mastery.
          </p>
        </div>
        <div className={styles.pilotHeroStat}>
          <strong>{report ? `${report.totals.readyOrFallback}/${report.totals.assignments || 5}` : "—"}</strong>
          <span>lessons ready or fallback</span>
        </div>
      </section>

      {error && <p className={styles.pilotCallout}>{error}</p>}

      <section className={styles.metricGrid} aria-label="Five student pilot summary">
        <article className={styles.metric}>
          <div className={styles.metricTop}><span>LESSONS</span><span>▶</span></div>
          <strong>{report?.totals.assignments ?? (demo ? 5 : 0)}</strong>
          <p>Persisted assignments, not generated prose.</p>
        </article>
        <article className={styles.metric}>
          <div className={styles.metricTop}><span>READY / FALLBACK</span><span>△</span></div>
          <strong>{report?.totals.readyOrFallback ?? 0}</strong>
          <p>Approved HTML fallback is served if the renderer is unavailable.</p>
        </article>
        <article className={styles.metric}>
          <div className={styles.metricTop}><span>INDEPENDENT EXITS</span><span>✓</span></div>
          <strong>{completed}</strong>
          <p>Exit checks are stored separately from watch time.</p>
        </article>
        <article className={styles.metric}>
          <div className={styles.metricTop}><span>ABSTAINED</span><span>?</span></div>
          <strong>{report?.totals.abstained ?? (demo ? 1 : 0)}</strong>
          <p>Insufficient evidence does not receive a fabricated weakness label.</p>
        </article>
      </section>

      <section className={styles.pipelinePanel}>
        <div className={styles.panelHeader}>
          <div>
            <h3>Personalized-video generation trail</h3>
            <p>The student never receives unchecked generated mathematics.</p>
          </div>
          <span className={`${styles.status} ${styles.ready}`}>Evidence-first</span>
        </div>
        <div className={styles.pipelineSteps}>
          {[
            ["1", "Read evidence", "Question and working-step evidence only"],
            ["2", "Choose objective", "Smallest supported learning target"],
            ["3", "Author script", "Approved template family, then language and math gates"],
            ["4", "Verify mathematics", "Every transformation checked before delivery"],
            ["5", "Publish + check", "Only APPROVED media is assigned; exit is independent"],
          ].map(([number, title, copy]) => (
            <div key={number} className={styles.pipelineStep}>
              <b>{number}</b>
              <div><strong>{title}</strong><span>{copy}</span></div>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.reportSectionHead}>
        <div>
          <div className={styles.dateLine}>Immediate teacher view</div>
          <h2>Five students, five useful next moves</h2>
        </div>
        <div className={styles.reportLiveCount}>
          {completed ? `${verified}/${completed} live exit checks verified` : "No independent exits recorded yet"}
        </div>
      </div>

      <section className={styles.videoStudentGrid}>
        {(students.length ? students : demo ? PILOT_STUDENT_KEYS.map((item) => ({
          studentKey: item,
          studentId: `demo_${item}`,
          name: PILOT_STUDENT_STORIES[item].name,
          roll: PILOT_STUDENT_STORIES[item].roll,
          diagnosticState: PILOT_STUDENT_STORIES[item].diagnosticState,
          statusLabel: PILOT_STUDENT_STORIES[item].statusLabel,
          learnerDecision: PILOT_STUDENT_STORIES[item].learnerDecision,
          teacherDecision: PILOT_STUDENT_STORIES[item].teacherDecision,
          uncertainty: PILOT_STUDENT_STORIES[item].uncertainty,
          observedEvidence: PILOT_STUDENT_STORIES[item].observedEvidence,
          assignmentStatus: item === "kabir" ? "ABSTAINED" : "FALLBACK",
          delivery: item === "kabir" ? "ABSTAINED" : "HTML_FALLBACK",
          videoTitle: PILOT_STUDENT_STORIES[item].video.title,
          watched: false,
          completed: false,
          exitAttempt: null,
          limitations: [],
        })) : []).map((student) => {
          const key = student.studentKey ?? "aarav";
          return (
            <article className={styles.videoStudentCard} key={student.studentId}>
              <div className={styles.videoStudentTop}>
                <div>
                  <span>Roll {student.roll}</span>
                  <h3>{student.name}</h3>
                </div>
                <span className={`${styles.status} ${student.diagnosticState === "insufficient-evidence" ? styles.check : student.diagnosticState === "arithmetic-slip" ? styles.ready : styles.bridge}`}>
                  {student.statusLabel}
                </span>
              </div>
              <div className={styles.claimBlock}>
                <span>COGNA’S DECISION</span>
                <strong>{student.learnerDecision}</strong>
                <small>{student.uncertainty} uncertainty · {student.assignmentStatus}</small>
              </div>
              <div className={styles.videoReadyRow}>
                <div className={styles.playGlyph}>▶</div>
                <div>
                  <span>{student.delivery === "VIDEO" ? "REVIEWED VIDEO" : student.delivery === "ABSTAINED" ? "NO REMEDIATION" : "HTML FALLBACK"}</span>
                  <strong>{student.videoTitle}</strong>
                  <small>{student.delivery}</small>
                </div>
              </div>
              <div className={styles.deliveryState}>
                {student.exitAttempt ? (
                  <>
                    <b>{student.exitAttempt.correct ? "Exit evidence verified" : "Exit needs review"}</b>
                    <span>
                      {student.exitAttempt.correct
                        ? "Fresh response matches the verified answer. This is not broad mastery."
                        : "Fresh response did not match; no mastery claim made."}
                    </span>
                  </>
                ) : student.watched ? (
                  <>
                    <b>{student.completed ? "Lesson completed" : "Video viewed"}</b>
                    <span>Watching is not independent evidence. Awaiting unassisted exit.</span>
                  </>
                ) : (
                  <>
                    <b>{student.assignmentStatus === "ABSTAINED" ? "Abstained" : "Ready to assign"}</b>
                    <span>
                      {student.assignmentStatus === "ABSTAINED"
                        ? "Insufficient evidence — no gap remediation assigned."
                        : "Independent exit not yet recorded."}
                    </span>
                  </>
                )}
              </div>
              <details className={styles.evidenceDisclosure}>
                <summary>See the evidence behind this decision</summary>
                <ul>{student.observedEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
                <p><b>Teacher move:</b> {student.teacherDecision}</p>
              </details>
              <Link className={styles.primary} href={`/student/personalized-video?student=${key}`}>
                {student.exitAttempt ? "Replay student trail" : "Open student lesson"} →
              </Link>
            </article>
          );
        })}
      </section>
    </>
  );
}
