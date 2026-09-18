import React from "react";
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type { EquationStep, LessonAccent, LessonVideoProps, LessonVideoScene } from "./types";
import { sceneTransitionFrames } from "./types";

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
  const { fps } = useVideoConfig();
  const accent = ACCENTS[(scene.accent as LessonAccent) ?? "green"] ?? ACCENTS.green;

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

export const LessonVideo: React.FC<LessonVideoProps> = ({ scenes }) => {
  const { fps } = useVideoConfig();
  const transitionFrames = sceneTransitionFrames(fps);

  return (
    <AbsoluteFill style={{ background: "#f4f7f3" }}>
      <TransitionSeries>
        {scenes.map((scene, index) => {
          const durationInFrames = Math.max(1, Math.round(Math.max(scene.durationSeconds, 1) * fps));
          const isLastScene = index === scenes.length - 1;
          return (
            // TransitionSeries requires its own Sequence/Transition pairs as
            // direct children (it walks props.children), not raw Sequence —
            // it's what actually overlaps two adjacent scenes so one can
            // crossfade into the next rather than hard-cutting. A Fragment
            // is fine here: the package flattens fragment-wrapped children.
            <React.Fragment key={`${scene.headline}-${index}`}>
              <TransitionSeries.Sequence durationInFrames={durationInFrames}>
                <SceneCard scene={scene} index={index} total={scenes.length} durationInFrames={durationInFrames} />
              </TransitionSeries.Sequence>
              {!isLastScene && (
                <TransitionSeries.Transition
                  presentation={fade({ shouldFadeOutExitingScene: true })}
                  timing={linearTiming({ durationInFrames: transitionFrames })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
