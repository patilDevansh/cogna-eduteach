"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PersonalizedVideoAssignmentView, PilotStudentKey } from "@cogna/shared";
import { Wordmark } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { PILOT_STUDENT_STORIES } from "@/lib/pilot-video-demo";
import { ensureDemoStudentSession, getStudent } from "@/lib/session";
import { renderEquationSteps } from "./equation-highlight";
import { InteractiveLessonPlayer } from "./InteractiveEquationStep";
import styles from "./personalized-video.module.css";
import L from "./lesson.module.css";
import { PracticeArena } from "./PracticeArena";
import { prettyAlgebra, TileGame, type TileGameState } from "@/components/games/TileGame";
import { MicroLessonCard } from "@/components/games/MicroLessonCard";
import type { MicroLessonView } from "@cogna/shared";
import { useDevState } from "@/lib/dev-mode";

type Stage = "lesson" | "practice" | "exit" | "result";

/** Older lessons stored engine mistake codes in their reason text; students shouldn't see "(SIGN_PAIR_ERROR)". */
const withoutMistakeCodes = (text: string) => text.replace(/\s*\([A-Z][A-Z0-9_]{2,}(?:,\s*[A-Z][A-Z0-9_]{2,})*\)/g, "");
const POLL_MS = 2500;
function PersonalizedVideoPage() {
  const search = useSearchParams();
  const key = (search.get("student") as PilotStudentKey | null) ?? "aarav";
  const videoId = search.get("video");
  const classroomAssignmentId = search.get("assignment");
  const reportSessionId = search.get("session");
  const { devMode } = useDevState();
  const isProductionClassroom = Boolean(classroomAssignmentId);
  const signedStudentId = isProductionClassroom ? getStudent()?.studentId : undefined;
  const studentId = search.get("studentId") ?? signedStudentId ?? (isProductionClassroom ? "" : `demo_${key}`);
  const [assignment, setAssignment] = useState<PersonalizedVideoAssignmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(true);
  // A classroom exit link opens straight at the independent check.
  const [stage, setStage] = useState<Stage>(search.get("stage") === "exit" ? "exit" : "lesson");
  /** Pilot: the exit assignment the server opened when this student finished teaching. */
  const [exitAssignmentId, setExitAssignmentId] = useState<string | null>(search.get("stage") === "exit" ? classroomAssignmentId : null);
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState("");
  /** The 20-second lesson on the student's own mistake (null when none fits). */
  const [micro, setMicro] = useState<MicroLessonView | null>(null);
  /** A tile exit's picks; the server rebuilds the answer from them. */
  const [exitTiles, setExitTiles] = useState<TileGameState | null>(null);
  const [sealing, setSealing] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(async () => {
    if (isProductionClassroom && !signedStudentId) {
      throw new Error("Sign in as a student before opening this classroom lesson.");
    }
    const story = PILOT_STUDENT_STORIES[key];
    const signedIn = getStudent();
    if (!isProductionClassroom && signedIn?.studentId !== studentId) {
      await ensureDemoStudentSession(studentId, story?.name ?? signedIn?.name ?? key);
    }
    const next = videoId
      ? await api.getPersonalizedVideoById(videoId)
      : await api.getPersonalizedVideoAssignment(studentId, key);
    setAssignment(next);
    return next;
  }, [isProductionClassroom, key, signedStudentId, studentId, videoId]);

  useEffect(() => {
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) {
        const message =
          err instanceof ApiError && err.status === 404
            ? "No lesson is assigned yet. Complete a Lotus diagnostic first."
            : err instanceof Error
              ? err.message
              : "The lesson could not be loaded.";
        setError(message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (classroomAssignmentId) void api.startClassroomAssignment(classroomAssignmentId).catch(() => undefined);
  }, [classroomAssignmentId]);

  useEffect(() => {
    if (!assignment || assignment.status !== "PREPARING") return;
    const id = window.setInterval(() => {
      load().catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [assignment, load]);

  const lesson = assignment?.lesson;
  const scenes = lesson?.scenes ?? [];
  const scene = scenes[sceneIndex];
  const progress = scenes.length ? ((sceneIndex + 1) / scenes.length) * 100 : 0;

  const speak = (text: string) => {
    if (!voice || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const markWatched = async () => {
    if (!assignment || watchedRef.current) return;
    watchedRef.current = true;
    try {
      // Server-side bookkeeping only. The response carries a freshly-signed
      // media URL for the same asset; applying it via setAssignment swaps
      // the <video> element's src mid-playback, which the browser treats as
      // a new resource and resets currentTime to 0 — killing playback ~1s
      // in, every time. Watched status doesn't need to reach this screen's
      // state, so the response is intentionally discarded.
      await api.recordPersonalizedVideoWatched(assignment.id, 0);
    } catch {
      watchedRef.current = false;
    }
  };

  const finishLesson = async () => {
    setPlaying(false);
    if (timer.current) clearTimeout(timer.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (assignment) {
      try {
        setAssignment(await api.recordPersonalizedVideoCompleted(assignment.id, 0));
      } catch {
        /* keep the independent exit available */
      }
    }
    // Independent practice comes first when the lesson has a practice set; otherwise straight to the check.
    if (assignment) {
      try {
        const practice = await api.getPracticeSet(assignment.id);
        if (practice.items.length) {
          setStage("practice");
          return;
        }
      } catch {
        /* no practice for this lesson */
      }
    }
    await finishTeaching();
  };

  /**
   * Classroom: teaching is done once the lesson and practice are. The server
   * records it (reading practice from its own record) and opens this
   * student's independent exit, which the page moves straight on to.
   */
  async function finishTeaching() {
    if (isProductionClassroom && classroomAssignmentId && assignment && !exitAssignmentId) {
      try {
        const done = await api.completeClassroomAssignment(classroomAssignmentId, { videoAssignmentId: assignment.id, result: {} });
        if (done.next?.kind === "INDEPENDENT_EXIT") setExitAssignmentId(done.next.id);
      } catch {
        /* the exit is still offered; the teacher sees teaching as in progress */
      }
    }
    setStage("exit");
  }


  const goToScene = (index: number, shouldPlay = playing) => {
    if (timer.current) clearTimeout(timer.current);
    setSceneIndex(index);
    const next = scenes[index];
    if (shouldPlay && next) {
      speak(next.narration);
      timer.current = setTimeout(() => {
        if (index === scenes.length - 1) void finishLesson();
        else goToScene(index + 1, true);
      }, next.durationSeconds * 1000);
    }
  };

  const togglePlay = () => {
    if (assignment?.delivery === "SLIDES") return;
    void markWatched();
    if (assignment?.delivery === "VIDEO") {
      const node = videoRef.current;
      if (!node) return;
      if (playing) {
        node.pause();
        setPlaying(false);
        return;
      }
      void node.play();
      setPlaying(true);
      return;
    }
    if (playing) {
      setPlaying(false);
      if (timer.current) clearTimeout(timer.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      return;
    }
    if (!scene) return;
    setPlaying(true);
    speak(scene.narration);
    timer.current = setTimeout(() => {
      if (sceneIndex === scenes.length - 1) void finishLesson();
      else goToScene(sceneIndex + 1, true);
    }, scene.durationSeconds * 1000);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (stage !== "lesson" || assignment?.delivery === "SLIDES") return;
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        togglePlay();
      }
      if (event.key === "ArrowRight" && sceneIndex < scenes.length - 1) goToScene(sceneIndex + 1, false);
      if (event.key === "ArrowLeft" && sceneIndex > 0) goToScene(sceneIndex - 1, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pipeline = useMemo(() => {
    const delivery = assignment?.delivery;
    const math = assignment?.status === "ABSTAINED" ? "not applicable" : "complete";
    return [
      ["Evidence read", assignment ? "complete" : "pending"],
      ["Objective selected", assignment?.status === "ABSTAINED" ? "abstained" : assignment ? "complete" : "pending"],
      ["Script generated", assignment?.lesson ? "complete" : "pending"],
      ["Math verified", math],
      [
        "Lesson ready",
        delivery === "VIDEO" || delivery === "HTML_FALLBACK" || delivery === "SLIDES"
          ? "complete"
          : (delivery ?? "pending"),
      ],
    ] as const;
  }, [assignment]);

  /** Which exit question is on screen: 0, then 1 (the transfer question) when there is one. */
  const exitStep = assignment?.exitAttempt && assignment.exit?.transfer ? 1 : 0;

  async function submitExit() {
    if (!assignment) return;
    const step = exitStep;
    const tileExit = step === 1 ? assignment.exit?.transfer?.interaction : assignment.exit?.interaction;
    try {
      const result = tileExit && exitTiles?.answer
        ? await api.submitPersonalizedVideoExit(assignment.id, exitTiles.answer, "", { format: tileExit.format, picks: exitTiles.picks, changes: exitTiles.changes }, step)
        : await api.submitPersonalizedVideoExit(assignment.id, answer, working, undefined, step);
      setAssignment(result);
      setExitTiles(null);
      setAnswer("");
      setWorking("");
      setSealing(false);
      const finished = !result.exit?.transfer || Boolean(result.exitTransferAttempt);
      if (!finished) return; // the next lantern: the transfer question
      const allCorrect = (result.exitAttempt?.correct ?? false) && (!result.exit?.transfer || (result.exitTransferAttempt?.correct ?? false));
      setCorrect(allCorrect);
      setStage("result");
      const exitId = exitAssignmentId ?? (isProductionClassroom ? null : classroomAssignmentId);
      if (exitId) {
        await api.completeClassroomAssignment(exitId, {
          videoAssignmentId: result.id,
          result: {
            lessonStatus: result.status,
            delivery: result.delivery,
            watched: true,
            independentExitCorrect: allCorrect,
          },
        });
      }
    } catch (err: unknown) {
      if (assignment.status === "ABSTAINED") {
        const expected = assignment.exit?.expected ?? "";
        setCorrect(
          Boolean(expected) &&
            answer.replaceAll("−", "-").replace(/\s+/g, "").toLowerCase() ===
              expected.replaceAll("−", "-").replace(/\s+/g, "").toLowerCase(),
        );
        setStage("result");
        return;
      }
      setSealing(false);
      setError(err instanceof Error ? err.message : "The independent check could not be stored.");
    }
  }

  useEffect(() => {
    if (!assignment?.id || micro) return;
    let cancelled = false;
    api.getMicroLesson(assignment.id)
      .then((r) => { if (!cancelled) setMicro(r.lesson); })
      .catch(() => { /* the longer lesson still plays */ });
    return () => { cancelled = true; };
  }, [assignment?.id]);

  // Each independent question is one attempt: once every one is sealed, only the result shows.
  useEffect(() => {
    const done = assignment?.exitAttempt && (!assignment.exit?.transfer || assignment.exitTransferAttempt);
    if (stage === "exit" && done) {
      setCorrect((assignment.exitAttempt?.correct ?? false) && (!assignment.exit?.transfer || (assignment.exitTransferAttempt?.correct ?? false)));
      setStage("result");
    }
  }, [assignment, stage]);

  const seed = key in PILOT_STUDENT_STORIES ? PILOT_STUDENT_STORIES[key] : PILOT_STUDENT_STORIES.aarav;
  const name = assignment?.name ?? seed.name;
  // Classroom students never borrow a pilot story's roll number.
  const roll = assignment?.roll ?? (isProductionClassroom ? undefined : seed.roll);
  const waiting =
    !assignment ||
    assignment.delivery === "PREPARING" ||
    assignment.delivery === "UNDER_REVIEW" ||
    assignment.delivery === "UNAVAILABLE";

  const journey = stage === "lesson" ? 0 : stage === "practice" ? 1 : stage === "result" ? 3 : 2;
  const firstName = name.split(" ")[0];
  const reportHref = reportSessionId ? `/student/lotus/report?session=${encodeURIComponent(reportSessionId)}` : null;
  const lessonReady = Boolean(assignment) && !waiting && assignment?.delivery !== "ABSTAINED";
  const watchedCta = (
    <div className={L.cta}>
      <button className={L.primary} onClick={() => void finishLesson()}>
        I&apos;ve watched it: try one myself <span aria-hidden="true">→</span>
      </button>
      <span className={L.ctaNote}>You can come back and replay it any time.</span>
    </div>
  );

  return (
    <main className={L.page}>
      <header className={L.header}>
        <Wordmark href="/student/home" />
        {reportHref && (
          <Link className={L.back} href={reportHref}>
            <span aria-hidden="true">←</span> Your report
          </Link>
        )}
        <span className={L.who}>{name}{roll ? ` · Roll ${roll}` : ""}</span>
      </header>

      <div className={L.wrap}>
        <ol className={L.journey} aria-label="Lesson progress">
          {["Watch the lesson", "Practise", "On your own", "Done"].map((label, index) => (
            <li key={label} data-state={index < journey ? "done" : index === journey ? "current" : "next"}>
              <span className={L.journeyDot}>{index < journey ? "✓" : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {stage === "lesson" && (
          <>
            <section className={L.intro}>
              <p className={L.eyebrow}>Your lesson · made from your diagnostic</p>
              <h1>{assignment?.lesson?.title ?? (assignment ? "Your lesson" : seed.video.title)}</h1>
              {assignment?.learningObjective && <p className={L.objective}>{assignment.learningObjective}</p>}
              {lessonReady && (
                <div className={L.meta}>
                  {lesson?.duration && <span>{lesson.duration}</span>}
                  <span className={L.metaGood}>✓ Every step checked</span>
                  <span>Narrated · captions</span>
                </div>
              )}
            </section>

            {micro && (
              <section className={L.microSlot} aria-label="Your 20-second lesson">
                <p className={L.eyebrow}>First, 20 seconds on your own answer</p>
                <MicroLessonCard lesson={micro} onCheck={(option) => api.checkMicroLesson(assignment!.id, option)} />
              </section>
            )}

            {error && (
              <section className={L.panel}>
                <h2>{error.includes("No lesson is assigned") ? "No lesson yet" : "We couldn't load your lesson"}</h2>
                <p>{error}</p>
                {reportHref && <Link className={L.primary} href={reportHref}>Back to your report</Link>}
              </section>
            )}

            {!error && waiting && (
              <section className={L.making} aria-live="polite">
                <div className={L.makingArt} aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </div>
                <div>
                  <h2>
                    {assignment?.delivery === "UNDER_REVIEW"
                      ? "Your lesson is waiting for a quick review"
                      : assignment?.delivery === "UNAVAILABLE"
                        ? "The lesson maker is busy. Trying again"
                        : `Making your lesson${firstName ? `, ${firstName}` : ""}`}
                  </h2>
                  <p>This usually takes about two minutes. This page updates by itself when it&apos;s ready.</p>
                  <ol className={L.makingSteps}>
                    <li data-state="done">Read your answers</li>
                    <li data-state={assignment?.lesson ? "done" : "active"}>Write the lesson from your own question</li>
                    <li data-state={assignment?.lesson ? "active" : "next"}>Record the voice and animate each step</li>
                  </ol>
                </div>
              </section>
            )}

            {!error && assignment?.delivery === "ABSTAINED" && (
              <section className={L.panel}>
                <h2>No lesson needed right now</h2>
                <p>
                  {assignment.abstainReason} That isn&apos;t a weakness label. It just means your answers didn&apos;t point clearly to one thing to
                  teach, so a fresh question will tell us more.
                </p>
                <button className={L.primary} onClick={() => setStage("exit")}>Try a fresh question →</button>
              </section>
            )}

            {!error && lessonReady && assignment && (
              <div>
                <div className={L.player}>
                  {assignment.delivery === "SLIDES" ? (
                    <InteractiveLessonPlayer
                      assignment={assignment}
                      onStart={() => void markWatched()}
                      onFinish={() => void finishLesson()}
                      belowSlide={null}
                    />
                  ) : assignment.delivery === "VIDEO" && assignment.asset?.storageRef ? (
                    <video
                      ref={videoRef}
                      className={L.video}
                      // "#t=0.1" makes the browser paint the first frame as a poster instead of a black box.
                      src={`${assignment.asset.storageRef}#t=0.1`}
                      preload="metadata"
                      controls
                      playsInline
                      onLoadedMetadata={(event) => {
                        // Captions are already drawn into the frames; keep the track available (CC) but hidden by default.
                        for (const track of Array.from(event.currentTarget.textTracks)) track.mode = "hidden";
                      }}
                      onPlay={() => {
                        setPlaying(true);
                        void markWatched();
                      }}
                      onPause={() => setPlaying(false)}
                      onEnded={() => void finishLesson()}
                    >
                      {/* Captions are drawn into the video; this track is the accessible copy, off unless the viewer turns CC on. */}
                      {assignment.asset.transcriptRef ? (
                        <track kind="captions" src={assignment.asset.transcriptRef} srcLang="en" label="Captions" />
                      ) : null}
                    </video>
                  ) : scene ? (
                    <div className={L.slideShell}>
                      <div className={`${styles.videoStage} ${styles[scene.accent]}`}>
                        <div className={styles.sceneNumber}>0{sceneIndex + 1}</div>
                        <div className={styles.sceneCopy} key={`${assignment.id}-${sceneIndex}`}>
                          <span>{scene.eyebrow}</span>
                          <h2>{scene.headline}</h2>
                          <div className={styles.equation}>{renderEquationSteps(scene.equation)}</div>
                          <p>{scene.narration}</p>
                        </div>
                      </div>
                      <div className={styles.progress}><span style={{ width: `${progress}%` }} /></div>
                      <div className={styles.controls}>
                        <button className={styles.smallButton} disabled={sceneIndex === 0} onClick={() => goToScene(sceneIndex - 1, false)}>← Previous</button>
                        <button className={styles.playButton} onClick={togglePlay}>{playing ? "Pause" : "▶ Play lesson"}</button>
                        {sceneIndex < scenes.length - 1 ? (
                          <button className={styles.smallButton} onClick={() => goToScene(sceneIndex + 1, false)}>Next →</button>
                        ) : (
                          <button className={styles.smallButton} onClick={() => void finishLesson()}>Start check →</button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className={styles.srOnly}>Keyboard: space to play or pause, left and right arrows to move between scenes.</p>

                {watchedCta}

                <div className={L.below}>
                  <section className={L.card}>
                    <h3>Why this lesson</h3>
                    <p>{withoutMistakeCodes(assignment.lesson?.generationReason ?? seed.video.generationReason)}</p>
                  </section>
                  {scenes.length > 0 && (
                    <details className={L.card}>
                      <summary>
                        <h3>Read the transcript</h3>
                        <span aria-hidden="true" className={L.chev}>⌄</span>
                      </summary>
                      <div className={L.transcript}>
                        {scenes.map((item, index) => (
                          <div key={index}>
                            <strong>{item.headline}</strong>
                            <p>{item.narration}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}

            {devMode && assignment && (
              <details className={L.dev}>
                <summary>Dev · how this lesson was made</summary>
                <ul>
                  {pipeline.map(([label, state]) => (
                    <li key={label}><b>{state === "complete" ? "✓" : state === "abstained" ? "—" : "…"}</b> {label}</li>
                  ))}
                </ul>
                <p>Delivery: {assignment.delivery} · status {assignment.status}{assignment.fallbackReason ? ` · ${assignment.fallbackReason}` : ""}</p>
                <p>{assignment.status === "ABSTAINED" ? "No remediation assigned." : `✓ ${assignment.lesson?.verification ?? seed.video.verification}`}</p>
              </details>
            )}
          </>
        )}

        {assignment && stage === "practice" && (
          <PracticeArena
            assignmentId={assignment.id}
            firstName={firstName}
            devMode={devMode}
            onDone={() => void finishTeaching()}
          />
        )}

        {assignment && stage === "exit" && (
          <section className={L.task}>
            <p className={L.eyebrow}>{assignment.status === "ABSTAINED" ? "A fresh question" : "Your turn · no hints this time"}</p>
            {assignment.exit?.transfer && <LanternGate total={2} sealed={exitStep + (sealing ? 1 : 0)} />}
            <div className={L.question}>{displayMath((exitStep === 1 ? assignment.exit?.transfer?.prompt : assignment.exit?.prompt) ?? seed.exit.prompt)}</div>
            <p className={L.taskNote}>Use the routine from the lesson. One attempt, no hints. Your teacher sees this answer on its own, separate from the lesson.</p>
            {(exitStep === 1 ? assignment.exit?.transfer?.interaction : assignment.exit?.interaction) ? (
              <TileGame
                key={`exit-${exitStep}`}
                interaction={(exitStep === 1 ? assignment.exit!.transfer!.interaction : assignment.exit!.interaction)!}
                sealed={sealing}
                disabled={sealing}
                onChange={setExitTiles}
              />
            ) : (
              <>
                <label className={L.field}>
                  <span>Your answer</span>
                  <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="e.g. (x − 3)(x − 4)" />
                </label>
                <label className={L.field}>
                  <span>Your working</span>
                  <textarea value={working} onChange={(event) => setWorking(event.target.value)} placeholder="Write at least one step" rows={4} />
                </label>
              </>
            )}
            <div className={L.taskActions}>
              {devMode && !isProductionClassroom && !assignment.exit?.interaction && !assignment.exit?.transfer && (
                <button
                  className={L.ghost}
                  onClick={() => {
                    setAnswer(assignment.exit?.expected ?? seed.exit.expected);
                    setWorking("I used the routine from the lesson and checked each transformation.");
                  }}
                >
                  Dev · fill demo response
                </button>
              )}
              {(exitStep === 1 ? assignment.exit?.transfer?.interaction : assignment.exit?.interaction) ? (
                <button
                  className={L.primary}
                  disabled={!exitTiles?.answer || sealing}
                  onClick={() => {
                    // The scene plays its finishing move, then the one attempt is sent.
                    setSealing(true);
                    window.setTimeout(() => void submitExit(), 900);
                  }}
                >
                  Seal my answer <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button className={L.primary} disabled={!answer.trim() || !working.trim()} onClick={() => void submitExit()}>
                  Check my answer <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </section>
        )}

        {assignment && stage === "result" && (
          <section className={`${L.task} ${L.result}`}>
            {assignment.exit?.transfer ? (
              <LanternGate total={2} sealed={2} results={[assignment.exitAttempt?.correct ?? false, assignment.exitTransferAttempt?.correct ?? false]} />
            ) : (
              <div className={`${L.resultIcon} ${correct ? L.resultGood : L.resultAgain}`}>{correct ? "✓" : "↻"}</div>
            )}
            <h2>{exitHeadline(assignment, correct, firstName)}</h2>
            <p className={L.taskNote}>
              {correct
                ? "You solved a fresh question on your own. That's saved for your teacher: one right answer, not a claim you've mastered it forever."
                : "Your teacher sees this attempt. Replay the lesson and look closely at the step where it changed."}
            </p>
            <div className={L.recap}>
              <div><span>Question</span><strong>{displayMath(assignment.exit?.prompt ?? "")}</strong></div>
              <div><span>Your answer</span><strong>{prettyAlgebra(assignment.exitAttempt?.answer ?? answer)}</strong></div>
              {assignment.exitTransferAttempt && (
                <>
                  <div><span>Second question</span><strong>{displayMath(assignment.exitTransferAttempt.prompt)}</strong></div>
                  <div><span>Your answer</span><strong>{prettyAlgebra(assignment.exitTransferAttempt.answer ?? "")}</strong></div>
                </>
              )}
            </div>
            <div className={L.taskActions}>
              <button
                className={L.ghost}
                onClick={() => {
                  setStage("lesson");
                  setSceneIndex(0);
                  setPlaying(false);
                }}
              >
                Replay lesson
              </button>
              {isProductionClassroom ? (
                <Link className={L.primary} href="/student/classroom/live">Back to class →</Link>
              ) : reportHref ? (
                <Link className={L.primary} href={reportHref}>Back to your report →</Link>
              ) : (
                <Link className={L.primary} href="/student/home">Done →</Link>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/** Exit prompts from the AI author use ASCII maths (x^2, " - "); show them the way the lesson does. */
function displayMath(text: string): string {
  return text.replace(/\^([2-4])/g, (_, d: string) => ({ "2": "²", "3": "³", "4": "⁴" })[d]!).replace(/ - /g, " − ");
}

export default function PersonalizedVideoRoute() {
  return (
    <Suspense fallback={null}>
      <PersonalizedVideoPage />
    </Suspense>
  );
}

/** The lantern gate: one lantern per independent question; they light only once every one is sealed. */
function LanternGate({ total, sealed, results }: { total: number; sealed: number; results?: boolean[] }) {
  return (
    <div className={L.lanternGate} aria-label={results ? `${results.filter(Boolean).length} of ${total} right` : `${Math.min(sealed, total)} of ${total} sealed`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={L.lantern} data-state={results ? (results[i] ? "lit" : "dim") : i < sealed ? "sealed" : "open"}><i /></span>
      ))}
      <span className={L.lanternLabel}>{results ? "Results" : `${Math.min(sealed, total)} of ${total} sealed`}</span>
    </div>
  );
}

function exitHeadline(assignment: PersonalizedVideoAssignmentView, correct: boolean | null, firstName: string): string {
  const name = firstName ? `, ${firstName}` : "";
  if (!assignment.exit?.transfer) return correct ? `Nicely done${name}.` : "Not quite, and that's useful to know.";
  const right = [assignment.exitAttempt?.correct, assignment.exitTransferAttempt?.correct].filter(Boolean).length;
  if (right === 2) return `Both lanterns shine. You fixed it${name}!`;
  if (right === 1) return `One lantern shines. You're nearly there${name}.`;
  return `Not yet${name}. Your next lesson will show it a different way.`;
}
