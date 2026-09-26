"use client";

import { useState } from "react";
import type { PilotStudentKey, VideoThemeKey } from "@cogna/shared";
import styles from "./personalized-video.module.css";

/**
 * A pair of small, static line-art illustrations per lesson — one above the
 * slide, one below — placed in normal document flow with real margin
 * spacing, not overlapping or hidden behind the card. Each half is a
 * complete, self-contained little image on its own (not a cropped fragment
 * of something bigger), matching the concept metaphor already implicit in
 * that template's narration.
 */

const STROKE = {
  fill: "none",
  strokeWidth: 8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Divya — "keep the equation balanced": the scale's beam/pans above, its base below. */
function BalanceScaleTop() {
  return (
    <svg viewBox="0 0 240 130" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#5f8fb0">
        <circle cx="120" cy="16" r="8" fill="#5f8fb0" stroke="none" />
        <line x1="120" y1="24" x2="120" y2="44" />
        <line x1="24" y1="44" x2="216" y2="44" />
        <line x1="24" y1="44" x2="24" y2="94" />
        <line x1="216" y1="44" x2="216" y2="94" />
        <path d="M 0 94 A 24 24 0 0 0 48 94" />
        <path d="M 192 94 A 24 24 0 0 0 240 94" />
      </g>
    </svg>
  );
}
function BalanceScaleBottom() {
  return (
    <svg viewBox="0 0 240 100" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#5f8fb0">
        <line x1="120" y1="0" x2="120" y2="50" />
        <line x1="66" y1="50" x2="174" y2="50" />
        <line x1="90" y1="50" x2="90" y2="74" />
        <line x1="150" y1="50" x2="150" y2="74" />
      </g>
    </svg>
  );
}

/** Aarav & Meena — distributive property: the outside factor above, two terms below. */
function DistributionTop() {
  return (
    <svg viewBox="0 0 240 130" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#d68d5f">
        <circle cx="120" cy="50" r="38" />
        <path d="M 92 80 Q 65 100 54 128" />
        <path d="M 42 112 L 54 128 L 70 118" />
        <path d="M 148 80 Q 175 100 186 128" />
        <path d="M 170 118 L 186 128 L 198 112" />
      </g>
    </svg>
  );
}
function DistributionBottom() {
  return (
    <svg viewBox="0 0 240 100" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#d68d5f">
        <path d="M 46 0 L 46 20" />
        <path d="M 36 12 L 46 24 L 56 12" />
        <path d="M 194 0 L 194 20" />
        <path d="M 184 12 L 194 24 L 204 12" />
        <rect x="14" y="30" width="64" height="50" rx="12" />
        <rect x="162" y="30" width="64" height="50" rx="12" />
      </g>
    </svg>
  );
}

/** Rohan — "solve, substitute, confirm": worked steps above, a checked answer below. */
function ChecklistTop() {
  return (
    <svg viewBox="0 0 240 130" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#9370b8">
        <path d="M 50 130 V 30 A 20 20 0 0 1 70 10 H 170 A 20 20 0 0 1 190 30 V 130" />
        <line x1="78" y1="56" x2="162" y2="56" />
        <line x1="78" y1="94" x2="130" y2="94" />
      </g>
    </svg>
  );
}
function ChecklistBottom() {
  return (
    <svg viewBox="0 0 240 110" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#9370b8">
        <circle cx="110" cy="46" r="44" />
        <line x1="141" y1="77" x2="172" y2="108" />
        <path d="M 86 46 L 102 64 L 134 24" />
      </g>
    </svg>
  );
}

type PipPose = "wave" | "think" | "cheer" | "book";
const PIP_POSES: PipPose[] = ["wave", "think", "cheer", "book"];
const WING = "#5a3f99";

/** Pip the owl mascot (wizard hat). Each pose changes wings, eyes and props, not just position. */
function PipOwl({ pose }: { pose: PipPose }) {
  const look = pose === "think" ? { dx: -3, dy: -4 } : pose === "book" ? { dx: 0, dy: 4 } : { dx: 0, dy: 0 };
  const happy = pose === "cheer";
  return (
    <svg viewBox="60 -6 120 150" width="100%" aria-hidden="true">
      <defs>
        <linearGradient id="pip-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a58be0" />
          <stop offset="1" stopColor="#6b4fa3" />
        </linearGradient>
        <linearGradient id="pip-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b3a8f" />
          <stop offset="1" stopColor="#2b1d4f" />
        </linearGradient>
      </defs>
      {/* feet */}
      <g fill="#f3a93b">
        <ellipse cx="106" cy="132" rx="9" ry="4" />
        <ellipse cx="134" cy="132" rx="9" ry="4" />
      </g>
      {/* wings behind the body */}
      {pose === "cheer" ? (
        <>
          <path d="M 90 84 Q 62 74 64 42 Q 76 58 92 66 Z" fill={WING} />
          <path d="M 150 84 Q 178 74 176 42 Q 164 58 148 66 Z" fill={WING} />
        </>
      ) : pose === "wave" ? (
        <>
          <path d="M 88 78 Q 70 100 92 122 Q 96 100 96 84 Z" fill={WING} />
          <g className={styles.pipWave}>
            <path d="M 150 84 Q 178 74 176 44 Q 164 58 148 66 Z" fill={WING} />
          </g>
        </>
      ) : (
        <>
          <path d="M 88 78 Q 70 100 92 122 Q 96 100 96 84 Z" fill={WING} />
          <path d="M 152 78 Q 170 100 148 122 Q 144 100 144 84 Z" fill={WING} />
        </>
      )}
      {/* body + belly */}
      <ellipse cx="120" cy="88" rx="35" ry="44" fill="url(#pip-body)" />
      <ellipse cx="120" cy="100" rx="22" ry="28" fill="#eadffc" />
      <g fill="none" stroke="#b9a3ea" strokeWidth="2" strokeLinecap="round">
        <path d="M 108 96 q 4 4 8 0 M 120 96 q 4 4 8 0 M 112 108 q 4 4 8 0 M 124 108 q 4 4 8 0 M 116 120 q 4 4 8 0" />
      </g>
      {/* ear tufts */}
      <path d="M 92 58 L 86 44 L 100 52 Z" fill="#6b4fa3" />
      <path d="M 148 58 L 154 44 L 140 52 Z" fill="#6b4fa3" />
      {/* eyes */}
      {happy ? (
        <g fill="none" stroke="#2b1d4f" strokeWidth="3.5" strokeLinecap="round">
          <path d="M 96 74 q 11 -13 22 0" />
          <path d="M 122 74 q 11 -13 22 0" />
        </g>
      ) : (
        <>
          <circle cx="107" cy="70" r="13" fill="#fff" />
          <circle cx="133" cy="70" r="13" fill="#fff" />
          <circle cx={109 + look.dx} cy={72 + look.dy} r="8" fill="#2b1d4f" />
          <circle cx={131 + look.dx} cy={72 + look.dy} r="8" fill="#2b1d4f" />
          <circle cx={112 + look.dx} cy={68 + look.dy} r="3" fill="#fff" />
          <circle cx={134 + look.dx} cy={68 + look.dy} r="3" fill="#fff" />
        </>
      )}
      <path d="M 114 82 L 126 82 L 120 93 Z" fill="#f3a93b" />
      <ellipse cx="94" cy="84" rx="6" ry="4" fill="#f4a6c0" opacity="0.6" />
      <ellipse cx="146" cy="84" rx="6" ry="4" fill="#f4a6c0" opacity="0.6" />
      {/* hat */}
      <path d="M 92 54 Q 96 30 122 2 Q 128 30 148 54 Z" fill="url(#pip-hat)" />
      <ellipse cx="120" cy="55" rx="34" ry="7" fill="#3a2b74" />
      <path d="M 96 50 Q 120 58 144 50 L 143 46 Q 120 54 97 46 Z" fill="#c9a227" />
      <path d="M 116 24 l 3.5 7 7.5 1 -5.5 5 1.5 7.5 -7 -4 -7 4 1.5 -7.5 -5.5 -5 7.5 -1 z" fill="#f3d36b" />
      {/* per-pose props */}
      {pose === "think" && (
        <g className={styles.pipFloat}>
          <path d="M 152 88 Q 134 92 122 90 Q 130 106 154 104 Z" fill={WING} />
          <circle cx="156" cy="47" r="2.5" fill="#f3d36b" />
          <circle cx="161" cy="38" r="3.5" fill="#f3d36b" />
          <path d="M 166 3 l 4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1 z" fill="#f3d36b" />
        </g>
      )}
      {pose === "cheer" && (
        <g fill="#f3d36b" className={styles.pipFloat}>
          <path d="M 70 26 l 2 5 5 1 -4 4 1 5 -4 -3 -4 3 1 -5 -4 -4 5 -1 z" />
          <path d="M 170 22 l 2 5 5 1 -4 4 1 5 -4 -3 -4 3 1 -5 -4 -4 5 -1 z" />
          <circle cx="82" cy="14" r="2.5" />
          <circle cx="160" cy="10" r="2.5" />
        </g>
      )}
      {pose === "book" && (
        <g>
          <path d="M 120 104 L 92 100 L 92 128 L 120 132 Z" fill="#fff8e1" stroke="#c9a227" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M 120 104 L 148 100 L 148 128 L 120 132 Z" fill="#fff8e1" stroke="#c9a227" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M 98 108 L 114 110 M 98 115 L 114 117 M 126 110 L 142 108 M 126 117 L 142 115" stroke="#d9c98a" strokeWidth="2" strokeLinecap="round" />
          <path d="M 88 106 Q 84 122 96 128 Q 98 116 100 108 Z" fill={WING} />
          <path d="M 152 106 Q 156 122 144 128 Q 142 116 140 108 Z" fill={WING} />
          <path d="M 166 98 l 3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 z" fill="#f3d36b" className={styles.pipFloat} />
        </g>
      )}
    </svg>
  );
}
function MagicBottom() {
  const star = (x: number, y: number, r: number) => (
    <path
      key={`${x}-${y}`}
      d={`M ${x} ${y - r} L ${x + r * 0.3} ${y - r * 0.3} L ${x + r} ${y} L ${x + r * 0.3} ${y + r * 0.3} L ${x} ${y + r} L ${x - r * 0.3} ${y + r * 0.3} L ${x - r} ${y} L ${x - r * 0.3} ${y - r * 0.3} Z`}
      fill="#c9a227"
    />
  );
  return (
    <svg viewBox="0 0 240 100" height="100%" aria-hidden="true">
      {star(150, 34, 10)}
      {star(40, 30, 6)}
      {star(205, 70, 7)}
      {star(60, 74, 4)}
      {star(120, 14, 5)}
    </svg>
  );
}

const THEME_MOTIFS: Record<VideoThemeKey, { Top: (() => React.JSX.Element) | null; Bottom: () => React.JSX.Element }> = {
  magic: { Top: null, Bottom: MagicBottom },
};

const MOTIFS: Partial<
  Record<PilotStudentKey, { Top: () => React.JSX.Element; Bottom: () => React.JSX.Element }>
> = {
  aarav: { Top: DistributionTop, Bottom: DistributionBottom },
  meena: { Top: DistributionTop, Bottom: DistributionBottom },
  rohan: { Top: ChecklistTop, Bottom: ChecklistBottom },
  divya: { Top: BalanceScaleTop, Bottom: BalanceScaleBottom },
};

export function LessonMotifTop({
  studentKey,
  theme,
}: {
  studentKey?: PilotStudentKey | null;
  theme?: VideoThemeKey;
}) {
  const motif = theme ? THEME_MOTIFS[theme] : studentKey ? MOTIFS[studentKey] : undefined;
  if (!motif?.Top) return null;
  const { Top } = motif;
  return (
    <div className={styles.motifTop}>
      <Top />
    </div>
  );
}

export function LessonMotifBottom({
  studentKey,
  theme,
}: {
  studentKey?: PilotStudentKey | null;
  theme?: VideoThemeKey;
}) {
  const motif = theme ? THEME_MOTIFS[theme] : studentKey ? MOTIFS[studentKey] : undefined;
  if (!motif) return null;
  const { Bottom } = motif;
  return (
    <div className={styles.motifBottom}>
      <Bottom />
    </div>
  );
}

// Which generated clip set to play (folders under public/themes/<theme>/). Switch after comparing models.
const CLIP_SET = "seedance";

/** Looping AI-generated backdrop for a themed scene; renders nothing if the clip is missing. */
export function SceneBackdrop({ theme, sceneIndex }: { theme?: VideoThemeKey; sceneIndex: number }) {
  const [failed, setFailed] = useState(false);
  if (!theme || failed) return null;
  return (
    <video
      key={sceneIndex}
      className={styles.backdrop}
      src={`/themes/${theme}/${CLIP_SET}/scene-${sceneIndex + 1}.mp4`}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}

/** Pip enters the bottom-right of the screen with a different move each scene (cycles through 4). */
export function PipMascot({ theme, sceneIndex }: { theme?: VideoThemeKey; sceneIndex: number }) {
  if (theme !== "magic") return null;
  return (
    <div className={`${styles.pip} ${styles[`pip${sceneIndex % 4}` as "pip0"]}`} key={sceneIndex} aria-hidden="true">
      <PipOwl pose={PIP_POSES[sceneIndex % PIP_POSES.length]!} />
    </div>
  );
}
