"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PersonalizedVideoAssignmentView, PilotStudentKey } from "@cogna/shared";
import { Wordmark } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { PILOT_STUDENT_STORIES } from "@/lib/pilot-video-demo";
import { ensureDemoStudentSession } from "@/lib/session";
import styles from "./personalized-video.module.css";

type Stage = "lesson" | "exit" | "result";
const POLL_MS = 2500;

function PersonalizedVideoPage() {
  const search = useSearchParams();
  const key = (search.get("student") as PilotStudentKey | null) ?? "aarav";
  const studentId = search.get("studentId") ?? `demo_${key}`;
  const [assignment, setAssignment] = useState<PersonalizedVideoAssignmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(true);
  const [stage, setStage] = useState<Stage>("lesson");
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(async () => {
    const story = PILOT_STUDENT_STORIES[key];
    await ensureDemoStudentSession(studentId, story?.name ?? key);
    const next = await api.getPersonalizedVideoAssignment(studentId, key);
    setAssignment(next);
    return next;
  }, [key, studentId]);

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
      setAssignment(await api.recordPersonalizedVideoWatched(assignment.id, 0));
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
    setStage("exit");
  };

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
      if (stage !== "lesson") return;
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
      ["Lesson ready", delivery === "VIDEO" || delivery === "HTML_FALLBACK" ? "complete" : delivery ?? "pending"],
    ] as const;
  }, [assignment]);

  async function submitExit() {
    if (!assignment) return;
    try {
      const result = await api.submitPersonalizedVideoExit(assignment.id, answer, working);
      setAssignment(result);
      setCorrect(result.exitAttempt?.correct ?? false);
      setStage("result");
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
      setError(err instanceof Error ? err.message : "The independent check could not be stored.");
    }
  }

  const seed = key in PILOT_STUDENT_STORIES ? PILOT_STUDENT_STORIES[key] : PILOT_STUDENT_STORIES.aarav;
  const name = assignment?.name ?? seed.name;
  const roll = assignment?.roll ?? seed.roll;
  const waiting =
    !assignment ||
    assignment.delivery === "PREPARING" ||
    assignment.delivery === "UNDER_REVIEW" ||
    assignment.delivery === "UNAVAILABLE";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Wordmark href="/" />
        <div>
          <span>Grade 8 · Section A</span>
          <strong>{name} · Roll {roll}</strong>
        </div>
      </header>
      <div className={styles.shell}>
        <aside className={styles.context}>
          <div className={styles.eyebrow}>Built from your diagnostic</div>
          <h1>{assignment?.lesson?.title ?? seed.video.title}</h1>
          <p>{assignment?.lesson?.generationReason ?? seed.video.generationReason}</p>
          <div className={styles.contextBlock}>
            <span>LEARNING OBJECTIVE</span>
            <strong>{assignment?.learningObjective ?? seed.video.objective}</strong>
          </div>
          <div className={styles.pipeline}>
            {pipeline.map(([label, state]) => (
              <div key={label}>
                <b>{state === "complete" ? "✓" : state === "abstained" ? "—" : "…"}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className={styles.verified}>
            {assignment?.status === "ABSTAINED"
              ? "No remediation assigned. Evidence remains insufficient."
              : `✓ ${assignment?.lesson?.verification ?? seed.video.verification}`}
          </div>
        </aside>

        <section className={styles.experience}>
          {error && (
            <div className={styles.statusPanel}>
              <div className={styles.eyebrow}>Temporarily unavailable</div>
              <h2>
                {error.includes("No lesson is assigned")
                  ? "No lesson assigned yet"
                  : "The lesson could not be loaded from the server."}
              </h2>
              <p>{error}</p>
            </div>
          )}

          {!error && waiting && (
            <div className={styles.statusPanel}>
              <div className={styles.eyebrow}>
                {assignment?.delivery === "UNDER_REVIEW"
                  ? "Under review"
                  : assignment?.delivery === "UNAVAILABLE"
                    ? "Temporarily unavailable"
                    : "Preparing"}
              </div>
              <h2>
                {assignment?.delivery === "UNDER_REVIEW"
                  ? "This lesson is waiting for review."
                  : assignment?.delivery === "UNAVAILABLE"
                    ? "The media renderer is temporarily unavailable."
                    : "Preparing your lesson"}
              </h2>
              <p>
                {assignment?.delivery === "UNDER_REVIEW"
                  ? "A PENDING_REVIEW asset is never shown as a finished video. You will receive the approved HTML lesson or reviewed media when it is ready."
                  : assignment?.fallbackReason ??
                    "Cogna is rendering the approved lesson. This screen refreshes when the video is ready, or falls back to the approved HTML lesson if rendering is unavailable."}
              </p>
            </div>
          )}

          {!error && assignment?.delivery === "ABSTAINED" && stage === "lesson" && (
            <div className={styles.statusPanel}>
              <div className={styles.eyebrow}>Insufficient evidence · no gap assigned</div>
              <h2>Cogna has not prescribed a targeted lesson.</h2>
              <p>
                {assignment.abstainReason} This is not a weakness label, a diagnosis, or a claim about
                intelligence. A watched explanation would not count as learning evidence.
              </p>
              <button className={styles.submit} onClick={() => setStage("exit")}>
                Open a fresh evidence item →
              </button>
            </div>
          )}

          {!error && assignment && !waiting && assignment.delivery !== "ABSTAINED" && stage === "lesson" && (
            <>
              <div className={styles.videoTop}>
                <span>
                  {assignment.delivery === "VIDEO" ? "REVIEWED VIDEO" : "APPROVED HTML LESSON"}
                  {assignment.lesson?.duration ? ` · ${assignment.lesson.duration}` : ""}
                </span>
                <button onClick={() => setVoice((value) => !value)}>{voice ? "Voice on" : "Voice off"}</button>
              </div>
              {assignment.delivery === "VIDEO" && assignment.asset?.storageRef ? (
                <>
                  <video
                    ref={videoRef}
                    className={styles.videoPlayer}
                    src={assignment.asset.storageRef}
                    controls
                    onPlay={() => {
                      setPlaying(true);
                      void markWatched();
                    }}
                    onPause={() => setPlaying(false)}
                    onEnded={() => void finishLesson()}
                  >
                    {assignment.asset.transcriptRef ? (
                      <track
                        kind="captions"
                        src={assignment.asset.transcriptRef}
                        srcLang="en"
                        label="Captions"
                        default
                      />
                    ) : null}
                  </video>
                  <div className={styles.captions} aria-live="polite">
                    {scenes.map((item) => item.narration).join(" ")}
                  </div>
                </>
              ) : scene ? (
                <>
                  <div className={`${styles.videoStage} ${styles[scene.accent]}`}>
                    <div className={styles.sceneNumber}>0{sceneIndex + 1}</div>
                    <div className={styles.sceneCopy} key={`${assignment.id}-${sceneIndex}`}>
                      <span>{scene.eyebrow}</span>
                      <h2>{scene.headline}</h2>
                      <div className={styles.equation}>{scene.equation}</div>
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
                </>
              ) : null}
              <p className={styles.srOnly}>Keyboard: space to play or pause, left and right arrows to move between scenes.</p>
              <button className={styles.skipLink} onClick={() => void finishLesson()}>
                Skip playback and open the independent check
              </button>
            </>
          )}

          {assignment && stage === "exit" && (
            <div className={styles.exitCard}>
              <div className={styles.eyebrow}>
                {assignment.status === "ABSTAINED"
                  ? "Fresh evidence item · not a mastery claim"
                  : "Independent exit evidence · No hints"}
              </div>
              <h2>{assignment.exit?.prompt ?? seed.exit.prompt}</h2>
              <p>{assignment.exit?.evidencePurpose ?? seed.exit.evidencePurpose}</p>
              <label>
                Final answer
                <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer" />
              </label>
              <label>
                Show your working
                <textarea value={working} onChange={(event) => setWorking(event.target.value)} placeholder="Enter at least one useful step" />
              </label>
              <div className={styles.exitActions}>
                <button
                  className={styles.demoFill}
                  onClick={() => {
                    setAnswer(assignment.exit?.expected ?? seed.exit.expected);
                    setWorking("I used the routine from the lesson and checked each transformation.");
                  }}
                >
                  Fill demo response
                </button>
                <button className={styles.submit} disabled={!answer.trim() || !working.trim()} onClick={() => void submitExit()}>
                  Submit independently →
                </button>
              </div>
            </div>
          )}

          {assignment && stage === "result" && (
            <div className={styles.resultCard}>
              <div className={`${styles.resultIcon} ${correct ? styles.resultCorrect : styles.resultReview}`}>
                {correct ? "✓" : "△"}
              </div>
              <div className={styles.eyebrow}>Evidence stored for the teacher report</div>
              <h2>{correct ? "This fresh response was verified." : "This response needs another look."}</h2>
              <p>
                {correct
                  ? "Cogna records success on this exact independent item. It does not automatically claim broad mastery or delayed retention."
                  : "Cogna records the attempt without claiming that the learning target is secure."}
              </p>
              <div className={styles.resultEvidence}>
                <span>QUESTION</span>
                <strong>{assignment.exit?.prompt}</strong>
                <span>ANSWER ENTERED</span>
                <strong>{answer}</strong>
                <span>WORKING</span>
                <strong>{working}</strong>
              </div>
              <div className={styles.resultActions}>
                <button
                  className={styles.smallButton}
                  onClick={() => {
                    setStage("lesson");
                    setSceneIndex(0);
                    setPlaying(false);
                  }}
                >
                  Replay lesson
                </button>
                <Link className={styles.submit} href="/teacher/pilot-story">Open teacher report →</Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function PersonalizedVideoRoute() {
  return (
    <Suspense fallback={null}>
      <PersonalizedVideoPage />
    </Suspense>
  );
}
