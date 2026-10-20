import React, { createContext, useContext } from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { KitBeat, KitScene } from "./lesson-types";
import { lessonTheme, type LessonThemeId } from "./themes";

export type { KitBeat, KitScene };

/**
 * Shared building blocks for evidence-built lesson animations (distribution,
 * trinomial, …): palette, beat timing, math text, arrows, captions and the
 * per-scene frame. Lesson files own layout and choreography only.
 */

/** What the header, captions and scene frame need from any lesson. */
export interface LessonChrome {
  studentName: string;
  topic: string;
  scenes: KitScene[];
}

/**
 * Palette as CSS variables so one composition can wear any theme (themes.ts).
 * ThemeRoot sets the --k-* values; the fallbacks are the classic theme.
 * Keys keep their original names (green = the accent) so lesson code is unchanged.
 */
export const C = {
  paper: "var(--k-paper, #f6f3ea)",
  surface: "var(--k-surface, #ffffff)",
  ink: "var(--k-ink, #0b3b33)",
  muted: "var(--k-muted, #58706a)",
  line: "var(--k-line, rgba(11,59,51,0.12))",
  green: "var(--k-accent, #1f8a6e)",
  greenSoft: "var(--k-accent-soft, rgba(31,138,110,0.14))",
  onAccent: "var(--k-on-accent, #ffffff)",
  miss: "var(--k-miss, #d9480f)",
  missSoft: "var(--k-miss-soft, rgba(217,72,15,0.12))",
  fix: "var(--k-fix, #c77700)",
  fixSoft: "var(--k-fix-soft, rgba(199,119,0,0.16))",
  blue: "var(--k-blue, #3b5bdb)",
  blueSoft: "var(--k-blue-soft, rgba(59,91,219,0.12))",
  /** Paper at a given opacity, for overlays that dim the scene behind them. */
  paperAlpha: (a: number) => `color-mix(in srgb, var(--k-paper, #f6f3ea) ${Math.round(a * 100)}%, transparent)`,
};

/** Sets the theme's palette as CSS variables for everything inside it, and draws its backdrop. */
export function ThemeRoot({ theme, children }: { theme?: string; children: React.ReactNode }) {
  const t = lessonTheme(theme);
  const p = t.palette;
  const vars = {
    "--k-paper": p.paper,
    "--k-surface": p.surface,
    "--k-ink": p.ink,
    "--k-muted": p.muted,
    "--k-line": p.line,
    "--k-accent": p.accent,
    "--k-accent-soft": p.accentSoft,
    "--k-on-accent": p.onAccent,
    "--k-miss": p.miss,
    "--k-miss-soft": p.missSoft,
    "--k-fix": p.fix,
    "--k-fix-soft": p.fixSoft,
    "--k-blue": p.blue,
    "--k-blue-soft": p.blueSoft,
  } as React.CSSProperties;
  return (
    <ThemeContext.Provider value={t.id}>
      <AbsoluteFill style={{ ...vars, background: p.paper }}>{children}</AbsoluteFill>
    </ThemeContext.Provider>
  );
}
export const ThemeContext = createContext<LessonThemeId>("classic");

/** Quiet, theme-specific art behind every scene. Deterministic (no randomness) so frames render identically. */
export function ThemeBackdrop() {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  if (theme === "space") {
    const stars = Array.from({ length: 70 }, (_, i) => ({
      x: (i * 197) % 1280,
      y: (i * 113 + (i % 7) * 41) % 720,
      r: 0.8 + (i % 3) * 0.6,
      tw: 0.35 + 0.35 * Math.sin(frame / 22 + i),
    }));
    return (
      <svg width={1280} height={720} style={{ position: "absolute", inset: 0 }} aria-hidden>
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.tw} />
        ))}
        <g transform={`translate(1150 ${118 + Math.sin(frame / 40) * 6})`} opacity={0.9}>
          <circle r={34} fill="#6d5bd0" />
          <circle r={34} fill="none" stroke="#b9a8ff" strokeWidth={3} opacity={0.5} />
          <ellipse rx={62} ry={14} fill="none" stroke="#ffc857" strokeWidth={4} transform="rotate(-18)" opacity={0.85} />
        </g>
      </svg>
    );
  }
  if (theme === "cricket") {
    const spin = (frame * 4) % 360;
    return (
      <svg width={1280} height={720} style={{ position: "absolute", inset: 0 }} aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={0} y={600 + i * 16} width={1280} height={8} fill="#1d7a3c" opacity={i % 2 ? 0.05 : 0.09} />
        ))}
        <g transform="translate(1160 64)" opacity={0.85}>
          {[0, 14, 28].map((dx) => (
            <rect key={dx} x={dx} y={0} width={7} height={70} rx={3} fill="#c8a165" />
          ))}
          <rect x={-3} y={-6} width={42} height={6} rx={3} fill="#a67c42" />
        </g>
        <g transform={`translate(1110 ${118}) rotate(${spin})`}>
          <circle r={13} fill="#c0262d" />
          <path d="M -9 -9 Q 0 0 -9 9 M 9 -9 Q 0 0 9 9" stroke="#fff" strokeWidth={1.6} fill="none" opacity={0.8} />
        </g>
      </svg>
    );
  }
  return null;
}

export const MATH_FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
export const UI_FONT = '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const WIDTH = 1280;

/** The lesson's variable letter ("x", "y"), or "" for a numeric lesson. */
export const VarContext = createContext("x");

// ---------- timing ----------

export interface BeatClock {
  frame: number;
  fps: number;
  starts: number[];
  lengths: number[];
}

export function useBeatClock(scene: KitScene): BeatClock {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lengths = scene.beats.map((b) => Math.round(b.seconds * fps));
  const starts: number[] = [];
  lengths.reduce((acc, len) => (starts.push(acc), acc + len), 0);
  return { frame, fps, starts, lengths };
}

/** 0→1 between two fractions of a beat's length (clamped, eased). */
export function beatP(clock: BeatClock, beat: number, from: number, to: number): number {
  const start = clock.starts[beat]! + clock.lengths[beat]! * from;
  const end = clock.starts[beat]! + clock.lengths[beat]! * to;
  return interpolate(clock.frame, [start, Math.max(end, start + 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}

/** Springy 0→1 pop starting at a fraction of a beat. */
export function beatPop(clock: BeatClock, beat: number, at: number): number {
  const start = clock.starts[beat]! + clock.lengths[beat]! * at;
  return spring({ frame: clock.frame - start, fps: clock.fps, config: { damping: 13, mass: 0.6 } });
}

export function currentBeat(clock: BeatClock): number {
  let index = 0;
  clock.starts.forEach((s, i) => {
    if (clock.frame >= s) index = i;
  });
  return index;
}

export const pulse = (clock: BeatClock, amount: number) => 1 + 0.05 * Math.sin((clock.frame / clock.fps) * Math.PI * 2) * amount;

// ---------- math text ----------

/** Renders math with the lesson's variable in italics; everything else upright. */
export function MathText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const v = useContext(VarContext);
  const parts = v ? text.split(new RegExp(`(${v})`)) : [text];
  return (
    <span style={{ fontFamily: MATH_FONT, whiteSpace: "pre", ...style }}>
      {parts.map((part, i) =>
        part === v ? (
          <i key={i} style={{ padding: "0 0.03em" }}>
            {v}
          </i>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </span>
  );
}

export const CHAR_EM: Record<string, number> = { "½": 0.8, "(": 0.36, ")": 0.36, "+": 0.62, "−": 0.62, " ": 0.22 };

export function textWidth(text: string, size: number): number {
  return [...text].reduce((w, ch) => w + (CHAR_EM[ch] ?? (/\d/.test(ch) ? 0.56 : /[a-z]/.test(ch) ? 0.52 : 0.6)) * size, 0);
}

// ---------- arrows ----------

export function Arrow({
  from,
  to,
  progress,
  color,
  dashed,
  width = 4,
  below,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  progress: number;
  color: string;
  dashed?: boolean;
  width?: number;
  /** Curve under the line instead of over it. */
  below?: boolean;
}) {
  if (progress <= 0) return null;
  const lift = 46 + Math.abs(to.x - from.x) * 0.22;
  const cx = (from.x + to.x) / 2;
  const cy = below ? Math.max(from.y, to.y) + lift : Math.min(from.y, to.y) - lift;
  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  // Arrowhead oriented along the curve's end tangent (control → end).
  const angle = Math.atan2(to.y - cy, to.x - cx);
  const head = 15;
  const p1 = { x: to.x - head * Math.cos(angle - 0.45), y: to.y - head * Math.sin(angle - 0.45) };
  const p2 = { x: to.x - head * Math.cos(angle + 0.45), y: to.y - head * Math.sin(angle + 0.45) };
  const headOpacity = interpolate(progress, [0.85, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <g>
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashed ? undefined : "1 1"}
        strokeDashoffset={dashed ? undefined : 1 - progress}
        style={dashed ? { strokeDasharray: "0.03 0.03", opacity: progress } : undefined}
      />
      {!dashed && <polygon points={`${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={color} opacity={headOpacity} />}
    </g>
  );
}

export function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width={WIDTH} height={720} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {children}
    </svg>
  );
}

// ---------- small UI pieces ----------

export function Tick({ x, y, p }: { x: number; y: number; p: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - 15,
        top: y - 15,
        width: 30,
        height: 30,
        borderRadius: 15,
        background: C.green,
        color: C.onAccent,
        fontFamily: UI_FONT,
        fontWeight: 800,
        fontSize: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${p})`,
      }}
    >
      ✓
    </div>
  );
}

export function Tag({ x, y, p, text, color, bg }: { x: number; y: number; p: number; text: string; color: string; bg: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * Math.min(1, p)})`,
        opacity: Math.min(1, p),
        background: bg,
        color,
        border: `2px solid ${color}`,
        borderRadius: 999,
        padding: "6px 16px",
        fontSize: 22,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      <MathText text={text} style={{ fontFamily: UI_FONT }} />
    </div>
  );
}

export function PopMath({
  x,
  y,
  text,
  p,
  size,
  color = C.ink,
  bg,
}: {
  x: number;
  y: number;
  text: string;
  p: number;
  size: number;
  color?: string;
  bg?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * Math.min(p, 1.2)})`,
        opacity: Math.min(1, p * 1.4),
        fontSize: size,
        color,
        background: bg,
        borderRadius: 12,
        padding: bg ? "0 12px" : 0,
        whiteSpace: "nowrap",
      }}
    >
      <MathText text={text} />
    </div>
  );
}

export function Ring({ cx, cy, w, h, p, scale }: { cx: number; cy: number; w: number; h: number; p: number; scale: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        borderRadius: 999,
        border: `4px dashed ${C.miss}`,
        background: C.missSoft,
        opacity: Math.min(1, p),
        transform: `scale(${scale})`,
      }}
    />
  );
}

// ---------- chrome: header, captions, scene fade ----------

export function Header({ lesson, sceneIndex }: { lesson: LessonChrome; sceneIndex: number }) {
  const scene = lesson.scenes[sceneIndex]!;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 34,
          fontFamily: UI_FONT,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: C.green,
        }}
      >
        {lesson.studentName ? `For ${lesson.studentName}` : "Your lesson"} · {lesson.topic}
      </div>
      <div style={{ position: "absolute", right: 64, top: 38, display: "flex", gap: 8 }}>
        {lesson.scenes.map((s, i) => (
          <div
            key={s.id}
            style={{ width: i === sceneIndex ? 44 : 14, height: 8, borderRadius: 4, background: i <= sceneIndex ? C.green : C.line }}
          />
        ))}
      </div>
      <div style={{ position: "absolute", left: 64, top: 70, fontFamily: UI_FONT, fontSize: 42, fontWeight: 800, color: C.ink }}>
        {scene.title}
      </div>
    </>
  );
}

export function Caption({ clock, scene }: { clock: BeatClock; scene: KitScene }) {
  const beat = currentBeat(clock);
  const local = clock.frame - clock.starts[beat]!;
  const opacity = interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 1060,
          background: "rgba(11,59,51,0.92)",
          color: "white",
          borderRadius: 14,
          padding: "12px 22px",
          fontFamily: UI_FONT,
          fontSize: 24,
          lineHeight: 1.35,
          textAlign: "center",
          opacity,
        }}
      >
        {scene.beats[beat]!.text}
      </div>
    </div>
  );
}

export function SceneFrame({
  lesson,
  sceneIndex,
  durationInFrames,
  children,
}: {
  lesson: LessonChrome;
  sceneIndex: number;
  durationInFrames: number;
  children: (clock: BeatClock) => React.ReactNode;
}) {
  const scene = lesson.scenes[sceneIndex]!;
  const clock = useBeatClock(scene);
  const fadeIn = interpolate(clock.frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(clock.frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.paper, opacity: Math.min(fadeIn, fadeOut) }}>
      <ThemeBackdrop />
      <Header lesson={lesson} sceneIndex={sceneIndex} />
      {children(clock)}
      <Caption clock={clock} scene={scene} />
      {scene.beats.map((beat, i) =>
        beat.audioSrc ? (
          <Sequence key={i} from={clock.starts[i]!} durationInFrames={clock.lengths[i]!}>
            <Audio src={beat.audioSrc} />
          </Sequence>
        ) : null,
      )}
    </AbsoluteFill>
  );
}

export function Card({ x, p, accent, children }: { x: number; p: number; accent: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 262,
        width: 540,
        height: 270,
        background: C.surface,
        borderRadius: 20,
        border: `1px solid ${C.line}`,
        borderTop: `6px solid ${accent}`,
        boxShadow: "0 10px 30px rgba(11,59,51,0.08)",
        padding: "18px 26px",
        opacity: p,
        transform: `translateY(${(1 - p) * 20}px)`,
      }}
    >
      {children}
    </div>
  );
}

/** Heading is uppercased; the math beside it keeps its case (x ≠ X). */
export function CardLabel({ card }: { card: { heading: string; math: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, color: C.muted }}>
      <span style={{ fontFamily: UI_FONT, fontSize: 17, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{card.heading}</span>
      {card.math && <MathText text={card.math} style={{ fontSize: 24 }} />}
    </div>
  );
}

export function Line({ text, p, size = 38, color = C.ink, suffix }: { text: string; p: number; size?: number; color?: string; suffix?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, height: size * 1.45, opacity: p, transform: `translateX(${(1 - p) * -12}px)` }}>
      <MathText text={text} style={{ fontSize: size, color }} />
      {suffix}
    </div>
  );
}

export function InlinePill({ p, text }: { p: number; text: string }) {
  return (
    <span
      style={{
        opacity: Math.min(1, p),
        transform: `scale(${0.8 + 0.2 * Math.min(1, p)})`,
        background: C.greenSoft,
        color: C.green,
        border: `2px solid ${C.green}`,
        borderRadius: 999,
        padding: "4px 14px",
        fontFamily: UI_FONT,
        fontWeight: 700,
        fontSize: 20,
      }}
    >
      {text}
    </span>
  );
}
