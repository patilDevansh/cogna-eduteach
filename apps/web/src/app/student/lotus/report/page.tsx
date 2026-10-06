"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LotusSessionView, LotusSkillState, PersonalizedVideoAssignmentView } from "@cogna/shared";
import { Wordmark } from "@/components/ui";
import { api } from "@/lib/api";
import { useDevState } from "@/lib/dev-mode";
import { getStoredLotusSessions, saveStoredLotusSession } from "@/lib/lotus-demo-store";
import { getStudent } from "@/lib/session";
import styles from "./report.module.css";
import { LotusBloom } from "@/components/games/LotusGames";

const SESSION_POLL_MS = 1500;
const LESSON_POLL_MS = 3000;

/** Student-facing text: drop internal mistake codes, say "Question 17" instead of "Q17". */
function plain(text: string): string {
  return text
    .replace(/\s*\([A-Z][A-Z0-9_]{2,}(?:,\s*[A-Z][A-Z0-9_]{2,})*\)/g, "")
    .replace(/\bQ(\d+):/g, "Question $1:")
    .replace(/([.!?])"\.$/, '$1"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

const STATE_GROUPS: Array<{ state: LotusSkillState[]; label: string; tone: string }> = [
  { state: ["CONFIRMED"], label: "Work on this", tone: "work" },
  { state: ["SUSPECTED"], label: "Not sure yet", tone: "unsure" },
  { state: ["SECURE"], label: "Secure", tone: "secure" },
  { state: ["NOT_TESTED_DEPENDENCY", "UNTESTED"], label: "Not tested yet", tone: "untested" },
];

function lessonStorageKey(sessionId: string) {
  return `cogna_lesson_for_${sessionId}`;
}

function readLessonId(sessionId: string): string | null {
  try {
    return localStorage.getItem(lessonStorageKey(sessionId));
  } catch {
    return null;
  }
}

function ReportPage() {
  const search = useSearchParams();
  const sessionId = search.get("session") ?? "";
  const classroomAssignmentId = search.get("assignment");
  const { devMode } = useDevState();
  const [session, setSession] = useState<LotusSessionView | null>(null);
  const [error, setError] = useState("");
  const [lesson, setLesson] = useState<PersonalizedVideoAssignmentView | null>(null);
  const [lessonError, setLessonError] = useState("");
  /** Pilot: the teaching assignment the server opened when this diagnostic was recorded for the class. */
  const [teachingAssignmentId, setTeachingAssignmentId] = useState<string | null>(null);
  const lessonStarted = useRef(false);
  // Read after mount: the signed-in student lives in browser storage, so reading it during render would differ from the server HTML.
  const [student, setStudent] = useState<ReturnType<typeof getStudent>>(null);
  useEffect(() => setStudent(getStudent()), []);
  const firstName = (student?.name ?? "").split(" ")[0] ?? "";

  // 1. Poll the diagnostic until the report is written.
  useEffect(() => {
    if (!sessionId) {
      setError("No diagnostic was named in the link.");
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      try {
        const next = await api.getLotusSession(sessionId);
        if (cancelled) return;
        setSession(next);
        if (next.status === "COMPLETE") {
          const prev = getStoredLotusSessions().find((item) => item.session.sessionId === next.sessionId);
          saveStoredLotusSession({
            ...prev,
            session: next,
            studentName: prev?.studentName ?? student?.name ?? "",
            enrollment: prev?.enrollment ?? null,
            savedAt: new Date().toISOString(),
          });
          return;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "The report could not be loaded.");
        return;
      }
      timer = window.setTimeout(tick, SESSION_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const complete = session?.status === "COMPLETE" && Boolean(session.finalReport);

  // 2. As soon as the report exists, start building the lesson in the background (once per diagnostic).
  useEffect(() => {
    if (!complete || !session || lessonStarted.current) return;
    lessonStarted.current = true;
    const existing = readLessonId(session.sessionId);
    const start = existing
      ? api.getPersonalizedVideoById(existing)
      : api.createPersonalizedVideoAssignment({ studentId: session.studentId, lotusSessionId: session.sessionId }).then((created) => {
          try {
            localStorage.setItem(lessonStorageKey(session.sessionId), created.id);
          } catch {
            /* the lesson still exists server-side */
          }
          if (classroomAssignmentId) {
            void api
              .completeClassroomAssignment(classroomAssignmentId, {
                diagnosticSessionId: session.sessionId,
                videoAssignmentId: created.id,
                result: {
                  outcome: session.finalReport?.outcome,
                  startingPoint: session.finalReport?.startingPoint,
                  observedStrengths: session.finalReport?.observedStrengths,
                  uncertainties: session.finalReport?.uncertainAreas,
                  audits: session.audits.length,
                },
              })
              .then((done) => {
                if (done.next?.kind === "TEACHING") setTeachingAssignmentId(done.next.id);
              })
              .catch(() => undefined);
          }
          return created;
        });
    start.then(setLesson).catch((err) => setLessonError(err instanceof Error ? err.message : "Your lesson could not be started."));
  }, [complete, session, classroomAssignmentId]);

  // 3. Keep the lesson button honest while it renders.
  useEffect(() => {
    if (!lesson || lesson.delivery !== "PREPARING") return;
    const timer = window.setInterval(() => {
      api.getPersonalizedVideoById(lesson.id).then(setLesson).catch(() => undefined);
    }, LESSON_POLL_MS);
    return () => window.clearInterval(timer);
  }, [lesson]);

  const stats = useMemo(() => {
    if (!session) return null;
    const answered = session.audits.length;
    const correct = session.audits.filter((a) => a.verification?.status === "VERIFIED_CORRECT").length;
    const secure = session.finalReport?.skills?.filter((s) => s.state === "SECURE").length ?? session.finalReport?.observedStrengths.length ?? 0;
    const last = session.audits.at(-1)?.createdAt;
    const minutes = last ? Math.max(1, Math.round((new Date(last).getTime() - new Date(session.startedAt).getTime()) / 60000)) : null;
    return { answered, correct, secure, minutes };
  }, [session]);

  const lessonHref = lesson
    ? `/student/personalized-video?${new URLSearchParams({
        studentId: lesson.studentId,
        video: lesson.id,
        session: sessionId,
        ...(teachingAssignmentId ? { assignment: teachingAssignmentId } : {}),
      }).toString()}`
    : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Wordmark href="/student/home" />
        <div className={styles.crumbs}>
          <span>Diagnostic</span>
          <span aria-hidden="true">→</span>
          <strong>Your report</strong>
          <span aria-hidden="true">→</span>
          <span>Lesson</span>
        </div>
        {student?.name && <span className={styles.who}>{student.name}</span>}
      </header>

      {error ? (
        <section className={styles.centerCard}>
          <h1>We couldn&apos;t open this report</h1>
          <p>{error}</p>
          <Link className={styles.primary} href={classroomAssignmentId ? "/student/classroom/live" : "/student/home"}>{classroomAssignmentId ? "Back to class" : "Back to home"}</Link>
        </section>
      ) : !complete ? (
        <Preparing session={session} />
      ) : (
        <Report
          session={session!}
          firstName={firstName}
          stats={stats!}
          devMode={devMode}
          lesson={lesson}
          lessonError={lessonError}
          lessonHref={lessonHref}
          studentId={student?.studentId ?? session.studentId}
          homeHref={classroomAssignmentId ? "/student/classroom/live" : "/student/home"}
        />
      )}
    </main>
  );
}

function Preparing({ session }: { session: LotusSessionView | null }) {
  const saved = Boolean(session);
  const notFinished = session && session.status === "ACTIVE" && !session.reportPending;
  if (notFinished) {
    return (
      <section className={styles.centerCard}>
        <h1>This diagnostic isn&apos;t finished yet</h1>
        <p>Answer the remaining questions and your report will appear here.</p>
        <Link className={styles.primary} href="/student/lotus?topic=factorisation">Back to the diagnostic</Link>
      </section>
    );
  }
  const steps = [
    { label: "Your answers are saved", done: saved },
    { label: "Two AI reviewers are checking your last answers", done: false, active: saved },
    { label: "Writing your report", done: false },
  ];
  return (
    <section className={styles.preparing} aria-live="polite">
      <div className={styles.orb} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className={styles.eyebrow}>Diagnostic complete</p>
      <h1>Putting your report together</h1>
      <p className={styles.lede}>This usually takes under a minute. You don&apos;t need to do anything.</p>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.label} data-state={step.done ? "done" : step.active ? "active" : "waiting"}>
            <span className={styles.stepMark}>{step.done ? "✓" : ""}</span>
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Pilot students with a built lesson recipe (see DEMO_ANIMATIONS in the API). */
const PILOT_LESSON_STUDENTS = ["demo_aarav", "demo_meena"];

/**
 * Dev only. A test that can't be rebuilt into a lesson (the fake model's questions, say) still leads
 * somewhere for the pilot students: their prepared lesson, built from the pilot evidence.
 */
function PilotLessonButton({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    setBusy(true);
    setError("");
    try {
      const lesson = await api.demoAnimatedLesson(studentId);
      router.push(`/student/personalized-video?${new URLSearchParams({ studentId, video: lesson.id }).toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the lesson.");
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className={styles.learn} onClick={open} disabled={busy}>
        {busy ? "Opening your lesson…" : "Go to your lesson"}
        <span aria-hidden="true">→</span>
      </button>
      <p className={styles.lessonNote}>Dev · a prepared lesson from the pilot evidence, since this test could not be rebuilt into one.</p>
      {error && <p className={styles.lessonNote}>{error}</p>}
    </>
  );
}

function Report({
  session,
  firstName,
  stats,
  devMode,
  lesson,
  lessonError,
  lessonHref,
  studentId,
  homeHref,
}: {
  session: LotusSessionView;
  firstName: string;
  stats: { answered: number; correct: number; secure: number; minutes: number | null };
  devMode: boolean;
  lesson: PersonalizedVideoAssignmentView | null;
  lessonError: string;
  lessonHref: string | null;
  studentId: string;
  homeHref: string;
}) {
  const report = session.finalReport!;
  const skills = report.skills ?? [];
  const confirmed = skills.filter((s) => s.state === "CONFIRMED");
  const start =
    confirmed.find((s) => report.startingPoint.toLowerCase().includes(s.name.toLowerCase())) ?? confirmed[0] ?? null;
  const name = firstName ? `, ${firstName}` : "";

  const heading =
    report.outcome === "SOLID_GAP"
      ? { title: `We found where to start${name}.`, lede: "One idea is worth sharpening before anything else, and your lesson is built for exactly that." }
      : report.outcome === "ADVANCEMENT"
        ? { title: `You're ready for the next step${name}.`, lede: "Everything we tested looks secure. Your next practice can move on to harder factorisation." }
        : { title: `Thanks${name}. We need a little more to go on.`, lede: "Your answers didn't point clearly to one thing to work on, so we won't guess. A short check will help." };

  const lessonState = lessonError
    ? "error"
    : !lesson
      ? "starting"
      : lesson.delivery === "ABSTAINED"
        ? "none"
        : lesson.delivery === "PREPARING" || lesson.delivery === "UNDER_REVIEW"
          ? "preparing"
          : "ready";

  return (
    <div className={styles.report}>
      <section className={styles.hero}>
        {session.topic === "FACTORISATION" && session.audits.length > 0 && (
          <div className={styles.bloom}><LotusBloom answered={session.audits.length} /></div>
        )}
        <p className={styles.eyebrow}>Your diagnostic report</p>
        <h1>{heading.title}</h1>
        <p className={styles.lede}>{heading.lede}</p>
        <div className={styles.stats}>
          <div><strong>{stats.correct}<small>/{stats.answered}</small></strong><span>answered correctly</span></div>
          <div><strong>{stats.secure}</strong><span>skills secure</span></div>
          <div><strong>{confirmed.length}</strong><span>{confirmed.length === 1 ? "idea to work on" : "ideas to work on"}</span></div>
          {stats.minutes && <div><strong>{stats.minutes}<small> min</small></strong><span>time taken</span></div>}
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.startCard}>
          <p className={styles.startEyebrow}>{report.outcome === "SOLID_GAP" ? "Start here" : "Next step"}</p>
          <h2>{start ? start.name : plain(report.recommendedNextStep)}</h2>
          {start ? (
            <>
              <p className={styles.startWhy}>What we saw in your answers:</p>
              <ul className={styles.evidence}>
                {start.evidence.filter((line) => !/: right\b/.test(line)).slice(0, 3).map((line) => (
                  <li key={line}>{plain(line)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.startWhy}>{plain(report.startingPoint)}</p>
          )}

          <div className={styles.lessonBox}>
            {lessonState === "none" ? (
              <>
                <p className={styles.lessonNote}>
                  {report.outcome === "SOLID_GAP"
                    ? "We don't have a video lesson for this one yet. Your teacher can see exactly what to work on and will pick your next step."
                    : "No lesson is needed for this result."}
                </p>
                {devMode && lesson?.abstainReason && <p className={styles.lessonNote}>Dev · {lesson.abstainReason}</p>}
                {devMode && report.outcome === "SOLID_GAP" && PILOT_LESSON_STUDENTS.includes(studentId) && (
                  <PilotLessonButton studentId={studentId} />
                )}
                <Link className={styles.secondaryOnDark} href={homeHref}>{homeHref === "/student/home" ? "Back to home" : "Back to class"}</Link>
              </>
            ) : lessonState === "error" ? (
              <p className={styles.lessonNote}>We couldn&apos;t start your lesson: {lessonError}</p>
            ) : (
              <>
                <Link
                  className={`${styles.learn} ${lessonState !== "ready" ? styles.learnBusy : ""}`}
                  href={lessonHref ?? "#"}
                  aria-disabled={!lessonHref}
                  onClick={(event) => {
                    if (!lessonHref) event.preventDefault();
                  }}
                >
                  {lessonState === "ready" ? "Learn lesson" : lessonState === "starting" ? "Starting your lesson…" : "Learn lesson"}
                  <span aria-hidden="true">→</span>
                </Link>
                <p className={styles.lessonNote}>
                  {lessonState === "ready"
                    ? "A short narrated lesson made from your own answers."
                    : "Your lesson is being made from your own answers, which takes about two minutes. You can open it now and it will appear when it's ready."}
                </p>
              </>
            )}
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.card}>
            <h3>What you did well</h3>
            {report.observedStrengths.length ? (
              <ul className={styles.ticks}>
                {report.observedStrengths.slice(0, 6).map((line) => <li key={line}>{plain(line)}</li>)}
              </ul>
            ) : (
              <p className={styles.muted}>Nothing was secure enough to count yet, and that's fine. This is where we begin.</p>
            )}
          </section>
          {report.uncertainAreas.length > 0 && (
            <section className={styles.card}>
              <h3>Still checking</h3>
              <p className={styles.muted}>One slip each: not a problem yet, just something we'll look at again.</p>
              <ul className={styles.dots}>
                {report.uncertainAreas.slice(0, 4).map((line) => <li key={line}>{plain(line).split(":")[0]}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {skills.length > 0 && (
        <section className={styles.map}>
          <div className={styles.mapHead}>
            <h3>Your skill map</h3>
            <p className={styles.muted}>Every skill this diagnostic looked at.</p>
          </div>
          <div className={styles.groups}>
            {STATE_GROUPS.map((group) => {
              const items = skills.filter((s) => group.state.includes(s.state));
              if (!items.length) return null;
              return (
                <div key={group.label} className={styles.group}>
                  <span className={styles.groupLabel} data-tone={group.tone}>{group.label} · {items.length}</span>
                  <div className={styles.chips}>
                    {items.map((s) => <span key={s.skillId} className={styles.chip} data-tone={group.tone}>{s.name}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className={styles.footnote}>This report is a starting point, not a grade. It only describes the answers you gave today.</p>

      {devMode && (
        <details className={styles.dev}>
          <summary>Dev · evidence audit</summary>
          <dl>
            <dt>Outcome</dt><dd>{report.outcome}</dd>
            <dt>Starting point (raw)</dt><dd>{report.startingPoint}</dd>
            <dt>Evidence summary</dt><dd>{report.evidenceSummary.join(" · ") || "—"}</dd>
            <dt>Limitations</dt><dd>{report.limitations.join(" · ")}</dd>
            <dt>Lesson</dt><dd>{lesson ? `${lesson.id} · ${lesson.status} · ${lesson.delivery}${lesson.abstainReason ? ` · ${lesson.abstainReason}` : ""}` : "not created yet"}</dd>
            <dt>Session</dt><dd>{session.sessionId} · {session.audits.length} audits</dd>
          </dl>
        </details>
      )}
    </div>
  );
}

export default function LotusReportRoute() {
  return (
    <Suspense fallback={null}>
      <ReportPage />
    </Suspense>
  );
}
