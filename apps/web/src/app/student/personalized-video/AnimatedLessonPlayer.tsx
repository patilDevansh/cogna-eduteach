"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import type { LessonThemeChoice, PersonalizedLessonAnimationView } from "@cogna/shared";
import {
  AuthoredLesson,
  DistributionLesson,
  authoredDurationInFrames,
  LESSON_THEMES,
  LESSON_VIDEO_HEIGHT,
  LESSON_VIDEO_WIDTH,
  TrinomialLesson,
  distributionLessonDurationInFrames,
  lessonFps,
  trinomialDurationInFrames,
  type KitScene,
  type LessonCheckpoint,
} from "@cogna/lesson-video/player";
import { api } from "@/lib/api";
import styles from "./animated-lesson.module.css";

/**
 * The lesson plays live in the browser (no rendered video): the child picks a
 * world, a narrator reads it in that world's voice, and the animation stops
 * at each checkpoint until they answer it.
 */

const THEME_ORDER: LessonThemeChoice[] = ["classic", "cricket", "space"];
const THEME_ICON: Record<LessonThemeChoice, string> = { classic: "✎", cricket: "🏏", space: "🚀" };

function themeKey(studentId: string) {
  return `cogna_lesson_theme_${studentId}`;
}

function readTheme(studentId: string): LessonThemeChoice | null {
  try {
    const value = localStorage.getItem(themeKey(studentId));
    return value && (THEME_ORDER as string[]).includes(value) ? (value as LessonThemeChoice) : null;
  } catch {
    return null;
  }
}

/** Frame to pause on for a checkpoint: the end of its beat, before a scene's closing fade. */
function checkpointFrame(scenes: KitScene[], cp: LessonCheckpoint, fps: number): number {
  let frames = 0;
  for (let s = 0; s <= cp.afterScene; s++) {
    const beats = scenes[s]!.beats;
    const upto = s === cp.afterScene ? cp.afterBeat : beats.length - 1;
    for (let b = 0; b <= upto; b++) frames += Math.round(beats[b]!.seconds * fps);
  }
  const lastInScene = cp.afterBeat === scenes[cp.afterScene]!.beats.length - 1;
  return Math.max(0, frames - (lastInScene ? 10 : 3));
}

export function AnimatedLessonPlayer({
  assignmentId,
  studentId,
  onStart,
  onFinish,
  devMode,
}: {
  assignmentId: string;
  studentId: string;
  onStart: () => void;
  onFinish: () => void;
  devMode: boolean;
}) {
  const [theme, setTheme] = useState<LessonThemeChoice | null>(null);
  const [picking, setPicking] = useState(false);
  const [view, setView] = useState<PersonalizedLessonAnimationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<LessonCheckpoint | null>(null);
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<{ index: number; correct: boolean } | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  // Set synchronously: seekTo() fires "seeked" before React state updates, so a
  // state-only guard would reopen the same checkpoint recursively.
  const activeRef = useRef<string | null>(null);
  const passedRef = useRef<Set<string>>(new Set());

  // First visit: ask which world. Later visits: remember it.
  useEffect(() => {
    const saved = readTheme(studentId);
    if (saved) setTheme(saved);
    else setPicking(true);
  }, [studentId]);

  useEffect(() => {
    if (!theme) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setView(null);
    setPassed(new Set());
    passedRef.current = new Set();
    activeRef.current = null;
    setActive(null);
    api
      .getLessonAnimation(assignmentId, theme)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Your lesson could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, theme]);

  const fps = lessonFps();
  const lesson = view?.props as unknown as ({ scenes: KitScene[]; checkpoints: LessonCheckpoint[] } & Record<string, unknown>) | undefined;
  const durationInFrames = useMemo(() => {
    if (!view || !lesson) return 1;
    return view.kind === "authored"
      ? authoredDurationInFrames(lesson as never, fps)
      : view.kind === "trinomial"
        ? trinomialDurationInFrames(lesson as never, fps)
        : distributionLessonDurationInFrames(lesson as never, fps);
  }, [view, lesson, fps]);
  const stops = useMemo(
    () => (lesson?.checkpoints ?? []).map((cp) => ({ cp, frame: checkpointFrame(lesson!.scenes, cp, fps) })).sort((a, b) => a.frame - b.frame),
    [lesson, fps],
  );

  const speak = useCallback((url: string | undefined) => {
    voiceRef.current?.pause();
    if (!url) return;
    const audio = new Audio(url);
    voiceRef.current = audio;
    void audio.play().catch(() => undefined);
  }, []);

  const openCheckpoint = useCallback(
    (stop: { cp: LessonCheckpoint; frame: number }) => {
      if (activeRef.current) return;
      activeRef.current = stop.cp.id;
      const player = playerRef.current;
      player?.pause();
      player?.seekTo(stop.frame);
      setChosen(null);
      setActive(stop.cp);
      speak(view?.checkpointAudio[stop.cp.id]?.prompt);
    },
    [speak, view],
  );

  // Stop at every unanswered checkpoint — including when the child skips ahead on the timeline.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !stops.length) return;
    const guard = (frame: number) => {
      if (activeRef.current) return;
      const next = stops.find((stop) => !passedRef.current.has(stop.cp.id));
      if (next && frame >= next.frame) openCheckpoint(next);
    };
    const onFrame = (event: { detail: { frame: number } }) => guard(event.detail.frame);
    const onPlay = () => {
      if (!startedRef.current) {
        startedRef.current = true;
        onStart();
      }
    };
    const onEnded = () => onFinish();
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("seeked", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("seeked", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("ended", onEnded);
    };
  }, [stops, passed, active, openCheckpoint, onStart, onFinish, view]);

  useEffect(() => () => voiceRef.current?.pause(), []);

  function answer(index: number) {
    if (!active || chosen?.correct) return;
    const option = active.options[index]!;
    setChosen({ index, correct: option.correct });
    speak(view?.checkpointAudio[active.id]?.options[index]);
    if (option.correct) {
      const id = active.id;
      const resume = () => {
        passedRef.current.add(id);
        setPassed((prev) => new Set(prev).add(id));
        activeRef.current = null;
        setActive(null);
        setChosen(null);
        playerRef.current?.play();
      };
      const audio = voiceRef.current;
      if (audio && view?.checkpointAudio[id]?.options[index]) {
        audio.addEventListener("ended", resume, { once: true });
        audio.addEventListener("error", resume, { once: true });
      } else {
        window.setTimeout(resume, 1800);
      }
    }
  }

  function pickTheme(next: LessonThemeChoice) {
    try {
      localStorage.setItem(themeKey(studentId), next);
    } catch {
      /* the choice still applies to this visit */
    }
    startedRef.current = false;
    setPicking(false);
    setTheme(next);
  }

  if (picking || !theme) {
    return (
      <section className={styles.picker} aria-label="Choose your lesson world">
        <h2>Choose your world</h2>
        <p>Same maths, your style. You can switch any time.</p>
        <div className={styles.worlds}>
          {THEME_ORDER.map((id) => {
            const t = LESSON_THEMES[id];
            return (
              <button key={id} type="button" className={styles.world} data-selected={theme === id} onClick={() => pickTheme(id)}>
                <span className={styles.swatch} style={{ background: t.palette.paper, color: t.palette.accent, borderColor: t.palette.line }}>
                  <span aria-hidden="true">{THEME_ICON[id]}</span>
                </span>
                <strong>{t.label}</strong>
                <span>{t.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <span className={styles.worldTag}>
          <span aria-hidden="true">{THEME_ICON[theme]}</span> {LESSON_THEMES[theme].label}{view ? ` · voice ${view.voice.name}` : ""}
        </span>
        <button type="button" className={styles.change} onClick={() => setPicking(true)}>
          Change world
        </button>
      </div>

      <div className={styles.stage}>
        {loading || !view || !lesson ? (
          <div className={styles.loading} aria-live="polite">
            {error ? (
              <p>{error}</p>
            ) : (
              <>
                <div className={styles.bars} aria-hidden="true">
                  <span /><span /><span /><span />
                </div>
                <p>Getting your {LESSON_THEMES[theme].label.toLowerCase()} lesson ready…</p>
              </>
            )}
          </div>
        ) : (
          <>
            <Player
              ref={playerRef}
              component={(view.kind === "authored" ? AuthoredLesson : view.kind === "trinomial" ? TrinomialLesson : DistributionLesson) as never}
              inputProps={lesson as never}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={LESSON_VIDEO_WIDTH}
              compositionHeight={LESSON_VIDEO_HEIGHT}
              controls
              clickToPlay={!active}
              spaceKeyToPlayOrPause={!active}
              style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 18, overflow: "hidden" }}
            />
            {active && (
              <div className={styles.overlay} role="dialog" aria-label="Checkpoint question">
                <div className={styles.question}>
                  <p className={styles.qLabel}>Your turn</p>
                  <h3>{active.prompt}</h3>
                  <div className={styles.options}>
                    {active.options.map((option, index) => (
                      <button
                        key={option.label}
                        type="button"
                        className={styles.option}
                        data-state={chosen?.index === index ? (option.correct ? "right" : "wrong") : undefined}
                        onClick={() => answer(index)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {chosen && (
                    <p className={styles.feedback} data-correct={chosen.correct} aria-live="polite">
                      {active.options[chosen.index]!.feedback}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {devMode && view && (
        <p className={styles.dev}>
          Dev · {view.kind}
          {view.authoredBy ? ` (AI: ${view.authoredBy.model}, ${view.authoredBy.attempts} draft${view.authoredBy.attempts === 1 ? "" : "s"}, ${view.authoredBy.claimsChecked} maths claims verified)` : ""} · theme {view.theme} · voice {view.voice.name} · {view.tts ? `${view.tts.provider} key ${view.tts.keyHint ?? "none"}` : "tts off"} · {stops.length} checkpoints
          {view.silentBeats ? ` · ${view.silentBeats} silent beat(s)` : ""}
        </p>
      )}
    </div>
  );
}
