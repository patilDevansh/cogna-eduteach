import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { EquationStep, LessonAccent, LessonVideoProps, LessonVideoScene } from "./types";
import { LESSON_VIDEO_FPS } from "./types";

const ACCENTS: Record<string, { background: string; ink: string; muted: string }> = {
  green: { background: "linear-gradient(140deg,#dff2e9,#b8dece)", ink: "#073f34", muted: "#34574e" },
  amber: { background: "linear-gradient(140deg,#fff3d4,#efd49a)", ink: "#073f34", muted: "#5c4a28" },
  violet: { background: "linear-gradient(140deg,#eee8f6,#d8c9e9)", ink: "#073f34", muted: "#4a3a5c" },
};

const EQUATION_BOX_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(7,63,52,0.12)",
  borderRadius: 16,
  padding: "22px 26px",
  fontSize: 34,
  fontWeight: 700,
  color: "#073f34",
};

/**
 * A single step renders as static text for the whole scene — identical to
 * the old plain-string display. Multiple steps split the scene's own
 * duration evenly and crossfade from one line to the next, so a
 * transformation (e.g. distributing a bracket) reads as a worked example
 * building up rather than a wall of text dropped in all at once. Timing is
 * driven by the scene's Sequence-local frame (from useCurrentFrame in the
 * caller), not the composition's absolute frame — an equal split of *this
 * scene's* duration is what keeps step transitions in step with narration
 * regardless of where the scene sits in the overall video.
 */
function EquationDisplay({
  steps,
  durationInFrames,
  fps,
}: {
  steps: EquationStep[];
  durationInFrames: number;
  fps: number;
}) {
  const frame = useCurrentFrame();
  if (steps.length <= 1) {
    return <div style={EQUATION_BOX_STYLE}>{steps[0]?.text ?? ""}</div>;
  }

  const transitionFrames = Math.min(Math.round(0.35 * fps), Math.floor(durationInFrames / steps.length / 2));
  const segmentFrames = durationInFrames / steps.length;
  const index = Math.min(steps.length - 1, Math.floor(frame / segmentFrames));
  const isLastStep = index === steps.length - 1;
  const localFrame = frame - index * segmentFrames;
  const fadeStart = segmentFrames - transitionFrames;

  let currentOpacity = 1;
  let nextOpacity = 0;
  if (!isLastStep && localFrame >= fadeStart && transitionFrames > 0) {
    nextOpacity = Math.min(1, (localFrame - fadeStart) / transitionFrames);
    currentOpacity = 1 - nextOpacity;
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...EQUATION_BOX_STYLE, opacity: currentOpacity }}>{steps[index]!.text}</div>
      {!isLastStep && nextOpacity > 0 && (
        <div style={{ ...EQUATION_BOX_STYLE, position: "absolute", inset: 0, opacity: nextOpacity }}>
          {steps[index + 1]!.text}
        </div>
      )}
    </div>
  );
}

function SceneCard({
  scene,
  index,
  total,
  durationInFrames,
}: {
  scene: LessonVideoScene;
  index: number;
  total: number;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[(scene.accent as LessonAccent) ?? "green"] ?? ACCENTS.green;
  const opacity = Math.min(1, frame / Math.max(1, Math.round(0.25 * fps)));

  return (
    <AbsoluteFill
      style={{
        background: accent.background,
        fontFamily: 'Georgia, "Times New Roman", serif',
        color: accent.ink,
      }}
    >
      {scene.audioSrc && <Audio src={scene.audioSrc} />}
      <div
        style={{
          position: "absolute",
          right: -80,
          top: -90,
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.22)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -70,
          bottom: -80,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.16)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "48px 64px 40px",
          opacity,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0a4b3e",
            }}
          >
            {scene.eyebrow || "Approved lesson"}
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "rgba(7,63,52,0.12)" }}>
            {String(index + 1).padStart(2, "0")}
          </div>
        </div>
        <h1
          style={{
            margin: "18px 0 0",
            fontSize: 48,
            lineHeight: 1.05,
            maxWidth: 760,
          }}
        >
          {scene.headline}
        </h1>
        <div style={{ marginTop: 28 }}>
          <EquationDisplay steps={scene.equation} durationInFrames={durationInFrames} fps={fps} />
        </div>
        <p
          style={{
            marginTop: 22,
            maxWidth: 740,
            fontSize: 22,
            lineHeight: 1.45,
            color: accent.muted,
          }}
        >
          {scene.narration}
        </p>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0a4b3e" }}>
            Cogna · verified working
          </div>
          <div style={{ width: 220, height: 6, background: "rgba(7,63,52,0.15)", borderRadius: 99 }}>
            <div
              style={{
                width: `${((index + 1) / Math.max(total, 1)) * 100}%`,
                height: "100%",
                background: "#1f8a6e",
                borderRadius: 99,
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Every scene after the first gets an implicit head start for its <Audio> to
// decode, simply because Chromium has already been running while earlier
// scenes' frames rendered. Scene 0 has no "before" — nothing has rendered
// yet when its audio needs to start at frame 0 — so its narration can get
// silently dropped from the mux. premountFor asks Remotion to render (but
// not output) a few frames before each Sequence's visible start, giving its
// <Audio> time to settle before the frames that actually get captured.
const AUDIO_PREMOUNT_FRAMES = Math.round(0.4 * LESSON_VIDEO_FPS);

export const LessonVideo: React.FC<LessonVideoProps> = ({ scenes }) => {
  let start = 0;
  return (
    <AbsoluteFill style={{ background: "#f4f7f3" }}>
      {scenes.map((scene, index) => {
        const durationInFrames = Math.max(1, Math.round(Math.max(scene.durationSeconds, 1) * LESSON_VIDEO_FPS));
        const from = start;
        start += durationInFrames;
        return (
          <Sequence
            key={`${scene.headline}-${index}`}
            from={from}
            durationInFrames={durationInFrames}
            premountFor={AUDIO_PREMOUNT_FRAMES}
          >
            <SceneCard scene={scene} index={index} total={scenes.length} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
