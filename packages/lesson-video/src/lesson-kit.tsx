import React, { createContext, useContext } from "react";
import { carry, tokenize } from "./morph";
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

/** The one curve every lesson movement uses (the web's --ease-settle). */
export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

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
    easing: EASE,
  });
}

/** 0→1 arrival starting at a fraction of a beat. Critically damped: it never passes 1. */
export function beatPop(clock: BeatClock, beat: number, at: number): number {
  const start = clock.starts[beat]! + clock.lengths[beat]! * at;
  return spring({ frame: clock.frame - start, fps: clock.fps, config: { damping: 200 } });
}

export function currentBeat(clock: BeatClock): number {
  let index = 0;
  clock.starts.forEach((s, i) => {
    if (clock.frame >= s) index = i;
  });
  return index;
}

/** Kept for lesson files that still call it: nothing in a lesson pulses any more. */
export const pulse = (_clock: BeatClock, _amount: number) => 1;

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

/** Width of maths as it will be set: real font metrics in a browser, the table above where there is no canvas. */
let ruler: CanvasRenderingContext2D | null | undefined;
export function mathWidth(text: string, size: number, italic = false): number {
  if (ruler === undefined) ruler = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ruler) return textWidth(text, size);
  ruler.font = `${italic ? "italic " : ""}${size}px ${MATH_FONT}`;
  return ruler.measureText(text).width;
}

// ---------- carry: a line of maths whose terms come from the line above ----------

/**
 * One line of maths. With `from`, every term that was already in that line
 * lifts off it and travels here (`rise` px below it); terms that are new come
 * into focus once the travellers are nearly home. `marks` puts the hairline
 * under single terms and quietens the rest (the lens); `ruled` draws the
 * finishing line under the whole line.
 */
export function CarryLine({
  text,
  from,
  size,
  t,
  rise = 0,
  align = "left",
  color = C.ink,
  marks,
  markP = 0,
  ruled = 0,
}: {
  text: string;
  from?: string;
  size: number;
  /** 0→1 arrival of this line. */
  t: number;
  rise?: number;
  /** How this line and `from` are placed: sharing a left edge, or both centred. */
  align?: "left" | "center";
  color?: string;
  marks?: boolean[];
  markP?: number;
  ruled?: number;
}) {
  const v = useContext(VarContext);
  const tokens = tokenize(text);
  const widths = (list: string[]) => list.map((tok) => mathWidth(tok, size, tok === v));
  const starts = (w: number[]) => w.map((_, i) => w.slice(0, i).reduce((a, b) => a + b, 0));
  const w = widths(tokens), x = starts(w);
  const prev = from === undefined ? [] : tokenize(from);
  const pw = widths(prev), px = starts(pw);
  const sources = from === undefined ? tokens.map(() => -1) : carry(prev, tokens);
  const total = (list: number[]) => list.reduce((a, b) => a + b, 0);
  const shift = align === "center" ? (total(w) - total(pw)) / 2 : 0;
  const fresh = interpolate(t, [0.45, 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "baseline", whiteSpace: "pre", fontFamily: MATH_FONT, fontSize: size, lineHeight: 1.3, color }}>
      {tokens.map((tok, i) => {
        const src = sources[i]!;
        const travels = src >= 0;
        const show = travels ? Math.min(1, t * 5) : fresh;
        const marked = marks?.[i];
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              fontStyle: tok === v ? "italic" : "normal",
              opacity: show * (marks && !marked ? 1 - 0.72 * markP : 1),
              transform: travels ? `translate(${(px[src]! + shift - x[i]!) * (1 - t)}px, ${-rise * (1 - t)}px)` : `translateY(${(1 - fresh) * 8}px)`,
              filter: !travels && fresh < 1 ? `blur(${(1 - fresh) * 6}px)` : undefined,
            }}
          >
            {tok}
            {marked && <span style={{ position: "absolute", left: 0, right: 0, bottom: "0.04em", height: 3, background: C.fix, transform: `scaleX(${markP})`, transformOrigin: "left" }} />}
          </span>
        );
      })}
      {ruled > 0 && <span style={{ position: "absolute", left: -10, right: -10, bottom: "-0.18em", height: 3, background: C.green, transform: `scaleX(${ruled})`, transformOrigin: "left" }} />}
    </div>
  );
}

// ---------- arrows ----------

export function Arrow({
  from,
  to,
  progress,
  color,
  dashed,
  width = 2.5,
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
  const head = 11;
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
    <div style={{ position: "absolute", left: x - 15, top: y - 15, width: 30, height: 30, color: C.green, fontFamily: UI_FONT, fontWeight: 700, fontSize: 24, lineHeight: "30px", textAlign: "center", opacity: Math.min(1, p) }}>
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
        transform: `translate(-50%, calc(-50% + ${(1 - Math.min(1, p)) * 8}px))`,
        opacity: Math.min(1, p),
        background: bg,
        color,
        borderRadius: 8,
        padding: "6px 14px",
        fontSize: 22,
        fontWeight: 600,
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
        transform: `translate(-50%, calc(-50% + ${(1 - Math.min(1, p)) * 10}px))`,
        filter: p < 1 ? `blur(${(1 - Math.min(1, p)) * 6}px)` : undefined,
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

/** Marks a term with one drawn hairline under it. (Named Ring for the lesson files that place it.) */
export function Ring({ cx, cy, w, h, p }: { cx: number; cy: number; w: number; h: number; p: number; scale?: number }) {
  return <div style={{ position: "absolute", left: cx - w / 2, top: cy + h / 2 - 6, width: w, height: 3, background: C.fix, transform: `scaleX(${Math.min(1, p)})`, transformOrigin: "left" }} />;
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
        borderTop: `2px solid ${accent}`,
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
        background: C.greenSoft,
        color: C.green,
        borderRadius: 8,
        padding: "4px 12px",
        fontFamily: UI_FONT,
        fontWeight: 600,
        fontSize: 20,
      }}
    >
      {text}
    </span>
  );
}
