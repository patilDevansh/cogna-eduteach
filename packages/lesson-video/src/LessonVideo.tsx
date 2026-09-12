import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { LessonAccent, LessonVideoProps, LessonVideoScene } from "./types";
import { LESSON_VIDEO_FPS } from "./types";

const ACCENTS: Record<string, { background: string; ink: string; muted: string }> = {
  green: { background: "linear-gradient(140deg,#dff2e9,#b8dece)", ink: "#073f34", muted: "#34574e" },
  amber: { background: "linear-gradient(140deg,#fff3d4,#efd49a)", ink: "#073f34", muted: "#5c4a28" },
  violet: { background: "linear-gradient(140deg,#eee8f6,#d8c9e9)", ink: "#073f34", muted: "#4a3a5c" },
};

function SceneCard({ scene, index, total }: { scene: LessonVideoScene; index: number; total: number }) {
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
        <div
          style={{
            marginTop: 28,
            background: "rgba(255,255,255,0.82)",
            border: "1px solid rgba(7,63,52,0.12)",
            borderRadius: 16,
            padding: "22px 26px",
            fontSize: 34,
            fontWeight: 700,
            color: "#073f34",
          }}
        >
          {scene.equation}
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
  let start = 0;
  return (
    <AbsoluteFill style={{ background: "#f4f7f3" }}>
      {scenes.map((scene, index) => {
        const durationInFrames = Math.max(1, Math.round(Math.max(scene.durationSeconds, 1) * LESSON_VIDEO_FPS));
        const from = start;
        start += durationInFrames;
        return (
          <Sequence key={`${scene.headline}-${index}`} from={from} durationInFrames={durationInFrames}>
            <SceneCard scene={scene} index={index} total={scenes.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
