"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, classroomAssignmentHref, liveUpdates, type ClassroomStudentAssignment, type HomeSummary, type ParentChildOverview, type TopicGrowthEntry } from "@/lib/api";
import { useEventStream } from "@/lib/event-stream";
import { classNotice, stepFor } from "@/lib/class-steps";
import { getStudent, clearStudent } from "@/lib/session";
import { conceptLabelStudent } from "@/lib/concept-labels";
import styles from "@/components/dashboard.module.css";

/** Which stage of the Linear Equations journey a concept belongs to, for the map. */
const STAGES = ["Foundations", "One-step", "Two-step", "Word problems", "Mastery"] as const;
function stageIndexFor(conceptId: string | undefined): number {
  if (!conceptId) return 0;
  if (conceptId.startsWith("P")) return 0;
  if (conceptId.startsWith("C1") || conceptId.startsWith("C2") || conceptId.startsWith("C3") || conceptId.startsWith("C4")) return 1;
  if (conceptId.startsWith("C5")) return 2;
  if (conceptId.startsWith("C6")) return 3;
  return 0;
}

const JOURNEY_POINTS = [
  { x: 15, y: 50 },
  { x: 100, y: 65 },
  { x: 150, y: 30 },
  { x: 225, y: 14 },
  { x: 305, y: 30 },
];

const DEMO_STUDENT_ID = "dev_student_001";

type ClassStatus = ParentChildOverview["classes"][number];

/** Where a student stands in a class when there's nothing to start right now. */
function classDoneLine(c: ClassStatus): string {
  const check = c.check;
  if (!check) return "No work from your teacher yet. It will appear here.";
  if (check.progress === "IMPROVED") return "All done. You got the last question right on your own.";
  if (check.progress === "NOT_YET") return "All done. Your teacher will help with the tricky part.";
  if (check.progress === "NO_GAP" || check.progress === "UNCLEAR") return "Quick check done. Nothing else to do right now.";
  if (check.stage === "DONE") return "This check is closed.";
  return "Your next step is being prepared. It will appear here.";
}

function formatRecapWhen(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 20) return "Earlier today";
  if (hours < 44) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "long" });
}

export default function StudentHomePage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassStatus[] | null>(null);
  const [work, setWork] = useState<ClassroomStudentAssignment[]>([]);
  const [progress, setProgress] = useState<TopicGrowthEntry[]>([]);

  useEffect(() => {
    document.title = "Home — Cogna";
  }, []);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.replace("/student/login");
      return;
    }
    setStudentId(student.studentId);
    setStudentName(student.name);
    api
      .getHomeSummary(student.studentId)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your home screen."))
      .finally(() => setLoading(false));
  }, [router]);

  // Class work: reloaded the moment the teacher sends something (live updates), whenever the
  // student comes back to this tab, and every 10 seconds if live updates aren't connected.
  const [signedIn, setSignedIn] = useState(false);
  const loadWork = useCallback(() => {
    Promise.all([api.getStudentClasses(), api.getStudentClassroomAssignments()])
      .then(([list, open]) => {
        setClasses(list);
        setWork(open);
      })
      .catch(() => setClasses((prev) => prev ?? []));
  }, []);
  const live = useEventStream(signedIn ? liveUpdates.studentUrl() : null, liveUpdates.studentHeaders, (event) => {
    if (event.type === "work" || event.type === "nudge" || event.type === "ready") loadWork();
  });
  useEffect(() => {
    if (!getStudent()?.token) {
      setClasses([]);
      return;
    }
    setSignedIn(true);
    loadWork();
    api.getStudentProgress().then(setProgress).catch(() => undefined);
  }, [loadWork]);
  useEffect(() => {
    if (!signedIn) return;
    const load = loadWork;
    const timer = window.setInterval(load, live ? 60_000 : 10_000);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [signedIn, live, loadWork]);

  function signOut() {
    clearStudent();
    router.push("/");
  }

  const isDemoStudent =
    studentId === DEMO_STUDENT_ID || studentName.trim().toLowerCase() === "demo student";

  const chrome = (
    <div className={styles.dashHead} style={{ maxWidth: 420, width: "100%", margin: "0 auto var(--s-5)" }}>
      <Link href="/" className="wordmark">
        Cogna<span className="dot">.</span>
      </Link>
      <span className="faint" style={{ fontSize: "var(--text-sm)" }}>Good to see you, {studentName || "there"}</span>
    </div>
  );

  if (loading || classes === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--s-5)" }}>
        {chrome}
        <p className="muted">Getting things ready…</p>
      </div>
    );
  }

  const hasHistory = Boolean(summary?.nextAction || summary?.recap);

  // In a class, home is the class to-do list only, so everything the student does counts for their teacher.
  if (classes.length) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--s-5)" }}>
        {chrome}
        <div className={`${styles.phone} phase-in`}>
          {work.map((item) => {
            const notice = classNotice(item, Date.now());
            return (
              <div className={styles.heroCard} key={item.id}>
                <span className={styles.kicker}>{item.run.classroom.name} · {item.run.title}</span>
                <h2>{stepFor(item).title}</h2>
                <p className={styles.meta}>{stepFor(item).note}</p>
                {notice && <p className={styles.meta} role="status" data-testid="class-notice" style={{ fontWeight: 700, color: "var(--caution)" }}>{notice.text}</p>}
                {notice?.paused ? null : (
                  <Link href={classroomAssignmentHref(item)} className="btn btn-primary" style={{ alignSelf: "flex-start", background: "var(--accent)", color: "#fff" }}>
                    {item.status === "IN_PROGRESS" ? "Carry on" : stepFor(item).cta} →
                  </Link>
                )}
              </div>
            );
          })}
          {classes
            .filter((c) => !work.some((w) => w.run.classroom.id === c.classroomId))
            .map((c) => (
              <div className={styles.heroCard} key={c.classroomId}>
                <span className={styles.kicker}>{c.name}{c.check ? ` · ${c.check.title}` : ""}</span>
                <p className={styles.meta} style={{ fontSize: "var(--text-md)", color: "var(--ink)" }}>{classDoneLine(c)}</p>
              </div>
            ))}
          {progress.length > 0 && (
            <div className={styles.heroCard} style={{ background: "var(--surface)" }}>
              <span className={styles.kicker}>Your progress</span>
              {progress.map((t) => (
                <div key={t.topicId} style={{ display: "grid", gap: 4 }}>
                  <strong>{t.name}</strong>
                  {t.growth.checks > 1 ? (
                    <>
                      <span className={styles.meta}>
                        Skills you&apos;re sure of: {t.growth.firstSecure} → <b style={{ color: "var(--success)" }}>{t.growth.latestSecure}</b>
                      </span>
                      {t.growth.fixed.length > 0 && <span className={styles.meta}>You fixed: {t.growth.fixed.join(", ")}</span>}
                    </>
                  ) : (
                    <span className={styles.meta}>First check done: {t.growth.latestSecure} skills you&apos;re sure of. Your next check will show how much you&apos;ve grown.</span>
                  )}
                  {t.growth.stillWorking.length > 0 && <span className={styles.meta}>Still working on: {t.growth.stillWorking.join(", ")}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="topbar-links" style={{ justifyContent: "center", borderTop: "1px solid var(--line)", paddingTop: "var(--s-3)" }}>
            <Link href="/student/classroom/live">Join another class</Link>
            <button type="button" className="btn-quiet" onClick={signOut} style={{ padding: 0 }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--s-5)" }}>
      {chrome}
      <div className={`${styles.phone} phase-in`}>
        {error && <p className="error">{error}</p>}

        <div className={styles.heroCard}>
          <span className={styles.kicker}>Your class</span>
          <h2>Join your teacher&apos;s class</h2>
          <p className={styles.meta}>
            Type the code your teacher shows the class. Their checks and your lessons then appear here.
          </p>
          <Link
            href="/student/classroom/live"
            className="btn btn-primary"
            style={{ alignSelf: "flex-start", background: "var(--accent)", color: "#fff" }}
          >
            Join a class →
          </Link>
        </div>

        {!hasHistory ? (
          <div className={styles.heroCard}>
            <span className={styles.kicker}>Today&apos;s Mission · Cogna Lotus</span>
            <h2>Find your factorisation gaps</h2>
            <p className={styles.meta}>
              Take an adaptive factorisation diagnostic that checks your working and finds the skills to practise next.
            </p>
            <Link href="/student/lotus?topic=factorisation" className="btn btn-primary" style={{ alignSelf: "flex-start", background: "var(--accent)", color: "#fff" }}>
              Start factorisation diagnostic →
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.heroCard}>
              <span className={styles.kicker}>Up next</span>
              <h2>{summary?.nextAction ? conceptLabelStudent(summary.nextAction.conceptId) : "Equations with brackets"}</h2>
              <span className={styles.meta}>
                About 10 minutes · {summary?.nextAction?.reason === "revision" ? "a quick refresh" : "picks up where you left off"}
              </span>
              <Link href="/student/mission" className="btn btn-primary" style={{ alignSelf: "flex-start", background: "var(--accent)", color: "#fff" }}>
                Start 10-Minute Mission →
              </Link>
            </div>

            <div className={styles.momentum}>
              <span className={styles.label}>{summary?.momentum.sessionsCount ?? 0} session{(summary?.momentum.sessionsCount ?? 0) === 1 ? "" : "s"} this week</span>
              <div className="progress-dots" aria-hidden="true">
                {summary?.momentum.days.map((on, i) => (
                  <span key={i} className={on ? "done" : ""} />
                ))}
              </div>
            </div>

            <div className={styles.journey}>
              <span className={styles.kicker}>Linear equations</span>
              <svg viewBox="0 0 320 70" aria-hidden="true">
                <path
                  d={`M ${JOURNEY_POINTS.map((p) => `${p.x} ${p.y}`).join(" C ")}`}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="1 10"
                />
                {(() => {
                  const stage = stageIndexFor(summary?.nextAction?.conceptId);
                  return JOURNEY_POINTS.slice(0, stage + 1).map((p, i, arr) =>
                    i === arr.length - 1 ? null : (
                      <line
                        key={`seg-${i}`}
                        x1={p.x}
                        y1={p.y}
                        x2={arr[i + 1]!.x}
                        y2={arr[i + 1]!.y}
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    ),
                  );
                })()}
                {JOURNEY_POINTS.map((p, i) => {
                  const stage = stageIndexFor(summary?.nextAction?.conceptId);
                  const isCurrent = i === stage;
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={isCurrent ? 8 : 5}
                      fill={isCurrent ? "var(--surface)" : i < stage ? "var(--accent)" : "var(--line-strong)"}
                      stroke={isCurrent ? "var(--accent)" : "none"}
                      strokeWidth={isCurrent ? 3 : 0}
                    />
                  );
                })}
              </svg>
              <div className={styles.journeyLabels}>
                {STAGES.map((label, i) => (
                  <span key={label} className={i === stageIndexFor(summary?.nextAction?.conceptId) ? "now" : ""}>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {summary?.recap && (
              <div className={styles.recap}>
                <span className={styles.kicker}>{formatRecapWhen(summary.recap.endedAt)}</span>
                <p>
                  {summary.recap.minutes > 0 ? `${summary.recap.minutes} minutes` : "A short session"}
                  {summary.recap.conceptId ? ` on ${conceptLabelStudent(summary.recap.conceptId).toLowerCase()}` : ""}.
                </p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center" }}>
              <div className={styles.breathChip}>
                <span className={styles.breathDot} />
                Take a breath before you start
              </div>
            </div>
          </>
        )}

        {isDemoStudent && (
          <>
            <div className={styles.demoDiagCard}>
              <span className={styles.kicker}>Demo only</span>
              <h3>Do a diagnostic test</h3>
              <p className={styles.meta}>
                Separate from practice — try the full five-topic algebra check (or a single track).
                Opens with the debug panel on.
              </p>
              <Link
                href="/student/diagnostic-v2?track=COMBINED_ALGEBRA&debug=1"
                className="btn btn-ghost"
                style={{ alignSelf: "flex-start" }}
              >
                Do diagnostic test
              </Link>
            </div>
          </>
        )}

        <div className="topbar-links" style={{ justifyContent: "center", borderTop: "1px solid var(--line)", paddingTop: "var(--s-3)" }}>
          <Link href="/student/revision">Plan</Link>
          <button type="button" className="btn-quiet" onClick={signOut} style={{ padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
