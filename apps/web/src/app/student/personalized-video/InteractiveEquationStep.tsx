"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PersonalizedVideoAssignmentView,
  PersonalizedVideoLessonScene,
  VideoMathClaim,
} from "@cogna/shared";
import { api } from "@/lib/api";
import { renderEquationSteps } from "./equation-highlight";
import { LessonMotifBottom, LessonMotifTop, PipMascot, SceneBackdrop } from "./lesson-motifs";
import styles from "./personalized-video.module.css";

type TransformationClaim = Extract<VideoMathClaim, { kind: "EQUATION_TRANSFORMATION" }> & {
  chipLabel: string;
};

function findChipClaim(scene: PersonalizedVideoLessonScene): TransformationClaim | undefined {
  return scene.claims?.find(
    (claim): claim is TransformationClaim =>
      claim.kind === "EQUATION_TRANSFORMATION" && Boolean(claim.chipLabel),
  );
}

/**
 * "+ 6" / "÷ 2" style chip labels map to the parser-friendly operator the
 * backend's verifyStepValidity (linear-bracket-verifier) already accepts —
 * confirmed empirically (e.g. "2x=14" + "÷ 2" chip assembles to "2x/2=14/2",
 * which verifies as a valid DIVIDE_BOTH_SIDES step).
 */
function chipOperator(chipLabel: string): { op: "+" | "-" | "*" | "/"; value: string } | null {
  const match = chipLabel.trim().match(/^([+\-×x÷/])\s*(.+)$/);
  if (!match) return null;
  const symbolMap: Record<string, "+" | "-" | "*" | "/"> = {
    "+": "+",
    "-": "-",
    "×": "*",
    x: "*",
    "÷": "/",
    "/": "/",
  };
  const op = symbolMap[match[1]!];
  if (!op) return null;
  return { op, value: match[2]!.trim() };
}

function applyChip(side: string, chip: { op: string; value: string }): string {
  return `${side}${chip.op}${chip.value}`;
}

type Zone = "left" | "right";

function InteractiveEquationStep({
  assignmentId,
  sceneIndex,
  claim,
  onCorrect,
}: {
  assignmentId: string;
  sceneIndex: number;
  claim: TransformationClaim;
  onCorrect: () => void;
}) {
  const [leftFilled, setLeftFilled] = useState(false);
  const [rightFilled, setRightFilled] = useState(false);
  const [hoverZone, setHoverZone] = useState<Zone | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const leftZoneRef = useRef<HTMLDivElement | null>(null);
  const rightZoneRef = useRef<HTMLDivElement | null>(null);

  const [leftSide, rightSide] = claim.from.split("=");
  const chip = chipOperator(claim.chipLabel);
  const bothFilled = leftFilled && rightFilled;

  useEffect(() => {
    // A fresh scene resets any in-progress drag/feedback state.
    setLeftFilled(false);
    setRightFilled(false);
    setFeedback(null);
  }, [sceneIndex]);

  if (!chip) return null;
  const safeChip = chip;

  function zoneAt(x: number, y: number): Zone | null {
    const left = leftZoneRef.current?.getBoundingClientRect();
    const right = rightZoneRef.current?.getBoundingClientRect();
    if (left && x >= left.left && x <= left.right && y >= left.top && y <= left.bottom) return "left";
    if (right && x >= right.left && x <= right.right && y >= right.top && y <= right.bottom) return "right";
    return null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (bothFilled || checking) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPos({ x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragPos) return;
    setDragPos({ x: event.clientX, y: event.clientY });
    setHoverZone(zoneAt(event.clientX, event.clientY));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragPos) return;
    const zone = zoneAt(event.clientX, event.clientY);
    if (zone === "left") setLeftFilled(true);
    if (zone === "right") setRightFilled(true);
    setDragPos(null);
    setHoverZone(null);
  }

  async function check() {
    setChecking(true);
    const assembled = `${applyChip(leftSide!.trim(), safeChip)}=${applyChip(rightSide!.trim(), safeChip)}`;
    try {
      const result = await api.verifyPersonalizedVideoStep(assignmentId, sceneIndex, assembled);
      if (result.valid) {
        setFeedback("correct");
        setTimeout(onCorrect, 700);
      } else {
        setFeedback("incorrect");
        setTimeout(() => {
          setLeftFilled(false);
          setRightFilled(false);
          setFeedback(null);
        }, 1400);
      }
    } catch {
      setFeedback("incorrect");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={styles.dragBoard}>
      <div className={styles.dragEquation}>
        <div className={styles.dragSide}>{leftSide}</div>
        <div
          ref={leftZoneRef}
          className={`${styles.dragZone} ${leftFilled ? styles.dragZoneFilled : ""} ${
            hoverZone === "left" ? styles.dragZoneHover : ""
          }`}
        >
          {leftFilled ? claim.chipLabel : ""}
        </div>
        <span className={styles.dragEquals}>=</span>
        <div className={styles.dragSide}>{rightSide}</div>
        <div
          ref={rightZoneRef}
          className={`${styles.dragZone} ${rightFilled ? styles.dragZoneFilled : ""} ${
            hoverZone === "right" ? styles.dragZoneHover : ""
          }`}
        >
          {rightFilled ? claim.chipLabel : ""}
        </div>
      </div>
      {!bothFilled && (
        <div className={styles.dragTray}>
          <span>Drag onto both sides</span>
          <div
            className={styles.dragChip}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {claim.chipLabel}
          </div>
        </div>
      )}
      {dragPos && (
        <div
          className={`${styles.dragChip} ${styles.dragChipGhost}`}
          style={{ left: dragPos.x, top: dragPos.y }}
        >
          {claim.chipLabel}
        </div>
      )}
      {bothFilled && !feedback && (
        <button className={styles.playButton} disabled={checking} onClick={() => void check()}>
          {checking ? "Checking…" : "Check"}
        </button>
      )}
      {feedback && (
        <div
          className={`${styles.dragFeedback} ${
            feedback === "correct" ? styles.dragFeedbackCorrect : styles.dragFeedbackIncorrect
          }`}
        >
          {feedback === "correct"
            ? "That keeps the equation balanced."
            : "Not balanced yet — try again."}
        </div>
      )}
    </div>
  );
}

/**
 * Drives the whole SLIDES delivery — real per-scene narration audio (no
 * baked video, no speechSynthesis) for every lesson, not just ones with a
 * drag step. Scenes that carry a chip-eligible EQUATION_TRANSFORMATION
 * claim render as the drag widget above, gating advancement on a
 * verified-correct check. Every other scene (distribute/simplify/
 * arithmetic/none) plays as a narrated static card and auto-advances when
 * its audio finishes.
 */
// Breathing room between scenes once one finishes (narration ends, the
// fallback timer fires, or a drag check is confirmed correct) before the
// next one appears — the previous fixed-timer pacing advanced the instant a
// scene "completed," which read as abrupt with no room to actually look at
// the equation.
const ADVANCE_GAP_MS = 1800;

export function InteractiveLessonPlayer({
  assignment,
  onStart,
  onFinish,
  belowSlide,
}: {
  assignment: PersonalizedVideoAssignmentView;
  onStart: () => void;
  onFinish: () => void;
  /** Rendered directly under the slide, above the decorative bottom motif and the controls. */
  belowSlide?: React.ReactNode;
}) {
  const scenes = assignment.lesson?.scenes ?? [];
  const [sceneIndex, setSceneIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Browsers block audio autoplay until the page has a user gesture — the
  // very first scene's <audio autoPlay> was silently rejected on load
  // (confirmed: it only started playing after clicking Pause/Resume, which
  // supplied that first gesture). Gating the whole player behind an
  // explicit "Start" click supplies that gesture up front, so every scene's
  // audio — including the first — plays without needing a manual unlock.
  const [started, setStarted] = useState(false);
  const scene = scenes[sceneIndex];
  const claim = scene ? findChipClaim(scene) : undefined;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGapTimer = () => {
    if (gapTimer.current) {
      clearTimeout(gapTimer.current);
      gapTimer.current = null;
    }
  };

  // Called when a scene has "naturally" finished — narration ended, the
  // no-audio fallback timer elapsed, or a drag check was confirmed correct.
  // Never advances immediately; always leaves a pause first, and never
  // advances at all while paused (goPrevious/resume re-triggers it).
  const requestAdvance = () => {
    clearGapTimer();
    if (paused) return;
    gapTimer.current = setTimeout(() => {
      setSceneIndex((index) => {
        if (index >= scenes.length - 1) {
          onFinish();
          return index;
        }
        return index + 1;
      });
    }, ADVANCE_GAP_MS);
  };

  const goPrevious = () => {
    clearGapTimer();
    setSceneIndex((index) => Math.max(0, index - 1));
  };

  const togglePause = () => setPaused((value) => !value);

  useEffect(() => clearGapTimer, []);

  useEffect(() => {
    if (!started) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (paused) audio.pause();
    else void audio.play().catch(() => undefined);
  }, [started, paused, sceneIndex]);

  useEffect(() => {
    if (!started || !scene || claim || scene.audioUrl || paused) return;
    // No audio for this scene (TTS unavailable) — fall back to a plain timer
    // so the lesson never stalls waiting on an audio event that won't fire.
    const id = setTimeout(requestAdvance, Math.max(scene.durationSeconds, 1) * 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, sceneIndex, scene, claim, paused]);

  if (!scene) return null;

  if (!started) {
    return (
      <>
        <LessonMotifTop studentKey={assignment.studentKey} theme={assignment.lesson?.theme} />
        <div className={`${styles.videoStage} ${styles[scene.accent as "green" | "amber" | "violet"] ?? ""}`}>
          <div className={styles.sceneCopy}>
            <span>{scene.eyebrow}</span>
            <h2>{scene.headline}</h2>
            <p>Press start to begin</p>
          </div>
          <button
            className={styles.playButton}
            onClick={() => {
              setStarted(true);
              onStart();
            }}
          >
            ▶ Start lesson
          </button>
        </div>
        {belowSlide}
      <LessonMotifBottom studentKey={assignment.studentKey} theme={assignment.lesson?.theme} />
      </>
    );
  }

  return (
    <>
      <LessonMotifTop studentKey={assignment.studentKey} theme={assignment.lesson?.theme} />
      <div className={`${styles.videoStage} ${styles[scene.accent as "green" | "amber" | "violet"] ?? ""}`}>
        <SceneBackdrop theme={assignment.lesson?.theme} sceneIndex={sceneIndex} />
        <PipMascot theme={assignment.lesson?.theme} sceneIndex={sceneIndex} />
        <div className={styles.sceneNumber}>0{sceneIndex + 1}</div>
        <div className={styles.sceneCopy} key={`${assignment.id}-${sceneIndex}`}>
          <span>{scene.eyebrow}</span>
          <h2>{scene.headline}</h2>
          {claim ? (
            <InteractiveEquationStep
              assignmentId={assignment.id}
              sceneIndex={sceneIndex}
              claim={claim}
              onCorrect={requestAdvance}
            />
          ) : (
            <div className={styles.equation}>{renderEquationSteps(scene.equation)}</div>
          )}
          <p>{scene.narration}</p>
        </div>
        {scene.audioUrl && (
          <audio
            ref={audioRef}
            key={scene.audioUrl}
            src={scene.audioUrl}
            autoPlay
            onEnded={claim ? undefined : requestAdvance}
          />
        )}
        <div className={styles.progress}>
          <span style={{ width: `${((sceneIndex + 1) / scenes.length) * 100}%` }} />
        </div>
      </div>
      {belowSlide}
      <LessonMotifBottom studentKey={assignment.studentKey} theme={assignment.lesson?.theme} />
      <div className={styles.controls}>
        <button className={styles.smallButton} disabled={sceneIndex === 0} onClick={goPrevious}>
          ← Previous
        </button>
        <button className={styles.playButton} onClick={togglePause}>
          {paused ? "▶ Resume" : "Pause"}
        </button>
        <span />
      </div>
    </>
  );
}
