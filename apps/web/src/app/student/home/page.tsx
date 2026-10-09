"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, classroomAssignmentHref, type ClassroomStudentAssignment, type HomeSummary, type ParentChildOverview, type TopicGrowthEntry } from "@/lib/api";
import { stepFor } from "@/lib/class-steps";
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

  // Class work: checked every 10 seconds and whenever the student comes back to this tab.
  useEffect(() => {
    if (!getStudent()?.token) {
      setClasses([]);
      return;
    }
    const load = () => {
      Promise.all([api.getStudentClasses(), api.getStudentClassroomAssignments()])
        .then(([list, open]) => {
          setClasses(list);
          setWork(open);
        })
        .catch(() => setClasses((prev) => prev ?? []));
    };
    load();
    api.getStudentProgress().then(setProgress).catch(() => undefined);
    const timer = window.setInterval(load, 10_000);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  function signOut() {
    clearStudent();
    router.push("/");
  }

  const isDemoStudent =
    studentId === DEMO_STUDENT_ID || studentName.trim().toLowerCase() === "demo student";

  const firstName = studentName.trim().split(/\s+/)[0] || "there";
  const nav = (
    <nav className="dash-nav">
      <Link href="/" className="wordmark">Cogna<span className="dot">.</span></Link>
      <button type="button" className="btn btn-quiet" onClick={signOut}>Sign out</button>
    </nav>
  );

  if (loading || classes === null) {
    return (
      <div className="dash">
        <main id="main" className={`dash-wrap ${styles.student}`} aria-busy="true">
          {nav}
          <div className="skeleton" style={{ height: 56, width: "45%" }} />
          <div className="skeleton" style={{ height: 18, width: "35%", marginTop: 16 }} />
          <div className="skeleton" style={{ height: 220, marginTop: 48, borderRadius: 28 }} />
        </main>
      </div>
    );
  }

  const hasHistory = Boolean(summary?.nextAction || summary?.recap);

  // In a class, home is the class to-do list only, so everything the student does counts for their teacher.
  if (classes.length) {
    const [first, ...rest] = work;
    const idle = classes.filter((c) => !work.some((w) => w.run.classroom.id === c.classroomId));
    return (
      <div className="dash">
        <main id="main" className={`dash-wrap ${styles.student}`}>
          {nav}
          <header className={`${styles.hello} rise`}>
            <h1 className="dash-title">Hi, {firstName}.</h1>
            <p className="dash-sub">
              {work.length
                ? `You have ${work.length === 1 ? "one thing" : `${work.length} things`} to do for your class.`
                : "You’re all caught up. New work from your teacher shows up here."}
            </p>
          </header>

          {first && (
            <section className={`${styles.nowCard} rise`} style={{ ["--i" as string]: 1 }}>
              <span className={styles.nowClass}>{first.run.classroom.name}</span>
              <h2>{stepFor(first).title}</h2>
              <p>{stepFor(first).note}</p>
              <Link href={classroomAssignmentHref(first)} className={`btn btn-lg ${styles.nowButton}`}>
                {first.status === "IN_PROGRESS" ? "Carry on" : stepFor(first).cta} →
              </Link>
            </section>
          )}

          {(rest.length > 0 || idle.length > 0) && (
            <div className={styles.queue}>
              {rest.map((item, k) => (
                <article className="dash-card rise" key={item.id} style={{ ["--i" as string]: k + 2 }}>
                  <span className={styles.cardClass}>{item.run.classroom.name}</span>
                  <h3>{stepFor(item).title}</h3>
                  <p className={styles.cardNote}>{stepFor(item).note}</p>
                  <Link href={classroomAssignmentHref(item)} className="btn btn-primary btn-pill">
                    {item.status === "IN_PROGRESS" ? "Carry on" : stepFor(item).cta} →
                  </Link>
                </article>
              ))}
              {idle.map((c, k) => (
                <article className="dash-card rise" key={c.classroomId} style={{ ["--i" as string]: rest.length + k + 2 }}>
                  <span className={styles.cardClass}>{c.name}</span>
                  <p className={styles.cardDone}>{classDoneLine(c)}</p>
                </article>
              ))}
            </div>
          )}

          {progress.length > 0 && (
            <section className={styles.progress}>
              <h2 className="dash-section-title">Your progress</h2>
              <div className={styles.queue}>
                {progress.map((t) => {
                  const total = t.growth.latestSecure + t.growth.stillWorking.length;
                  return (
                    <article className="dash-card" key={t.topicId}>
                      <div className={styles.skillsHead}>
                        <h3>{t.name}</h3>
                        <span><strong>{t.growth.latestSecure}</strong> of {total} skills</span>
                      </div>
                      {total > 0 && (
                        <div className={styles.bar} role="img" aria-label={`${t.growth.latestSecure} of ${total} skills you’re sure of`}>
                          {Array.from({ length: total }, (_, k) => (
                            <i key={k} className={k < t.growth.latestSecure ? (k >= t.growth.firstSecure && t.growth.checks > 1 ? styles.gained : styles.on) : ""} />
                          ))}
                        </div>
                      )}
                      {t.growth.checks > 1 ? (
                        t.growth.fixed.length > 0 && <p className={styles.fixed}>You fixed {t.growth.fixed.join(", ")}.</p>
                      ) : (
                        <p className={styles.cardNote}>Your next check will show how much you’ve grown.</p>
                      )}
                      {t.growth.stillWorking.length > 0 && <p className={styles.cardNote}>Still working on {t.growth.stillWorking.join(", ")}.</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <footer className={styles.footer}>
            <Link href="/student/classroom/live" className="btn-link">Join another class</Link>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="dash">
      <main id="main" className={`dash-wrap ${styles.student}`}>
      {nav}
      <header className={`${styles.hello} rise`}>
        <h1 className="dash-title">Hi, {firstName}.</h1>
        <p className="dash-sub">Join your teacher’s class, or practise on your own.</p>
      </header>
      <div className={`${styles.solo} phase-in`}>
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

        <footer className={styles.footer}>
          <Link href="/student/revision" className="btn-link">Plan</Link>
        </footer>
      </div>
      </main>
    </div>
  );
}
