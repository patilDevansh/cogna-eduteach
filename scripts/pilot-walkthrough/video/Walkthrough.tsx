import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * The pilot walkthrough, edited from the recorded clips (record.mjs) by
 * render.mjs. Cards are title and explainer slides; clips are cuts of the
 * teacher's or a student's screen with a caption, sped up where noted.
 */

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 800;

export type Segment =
  | { kind: "card"; seconds: number; eyebrow: string; title: string; lines?: string[] }
  | { kind: "architecture"; seconds: number }
  | { kind: "clip"; seconds: number; file: string; from: number; rate: number; who: string; caption: string };

export interface WalkthroughProps {
  segments: Segment[];
  model: string;
}

const C = {
  deep: "#08463a",
  accent: "#0e6b54",
  wash: "#e3efe9",
  ink: "#16241d",
  soft: "#51635a",
  paper: "#f4f7f3",
  amber: "#a2660d",
};
const DISPLAY = '"Bricolage Grotesque", "Avenir Next", "Helvetica Neue", sans-serif';
const BODY = '"Instrument Sans", "Avenir Next", "Helvetica Neue", sans-serif';

function useFade(seconds: number) {
  const frame = useCurrentFrame();
  const total = seconds * FPS;
  return Math.min(
    interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [total - 10, total], [1, 0], { extrapolateLeft: "clamp" }),
  );
}

function rise(frame: number, at: number) {
  return interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
}

function Card({ seg }: { seg: Extract<Segment, { kind: "card" }> }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  return (
    <AbsoluteFill style={{ background: C.deep, color: "white", padding: "110px 120px", opacity: fade, fontFamily: BODY }}>
      <div style={{ fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: "#8ad2b8", fontWeight: 700, opacity: rise(frame, 4) }}>{seg.eyebrow}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 800, lineHeight: 1.08, marginTop: 22, maxWidth: 1000, opacity: rise(frame, 10), transform: `translateY(${(1 - rise(frame, 10)) * 18}px)` }}>{seg.title}</div>
      <div style={{ marginTop: 40, display: "grid", gap: 18 }}>
        {(seg.lines ?? []).map((line, i) => {
          const p = rise(frame, 26 + i * 12);
          return (
            <div key={i} style={{ display: "flex", gap: 18, alignItems: "baseline", fontSize: 28, lineHeight: 1.35, color: "#d8ece4", opacity: p, transform: `translateX(${(1 - p) * 20}px)` }}>
              <span style={{ color: "#8ad2b8", fontWeight: 800 }}>→</span>
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

const ARCH: Array<{ title: string; body: string; tag: string }> = [
  { title: "Teacher console", body: "Create class · join code · release once", tag: "web" },
  { title: "Classroom orchestrator", body: "Opens each student's next stage the moment they finish", tag: "pilot-flow.ts" },
  { title: "Lotus diagnostic", body: "Adaptive · stops at 15 min or once the starting point is found", tag: "stop rule" },
  { title: "AI lesson author", body: "GPT writes the lesson from the student's own answers", tag: "LLM" },
  { title: "Maths verifier", body: "Algebra engine re-checks every claim before a student sees it", tag: "code" },
  { title: "Practice + exit", body: "Animated practice · one fresh question, no hints", tag: "server-marked" },
];

function Architecture({ seconds }: { seconds: number }) {
  const frame = useCurrentFrame();
  const fade = useFade(seconds);
  const boxW = 340;
  const boxH = 150;
  const pos = (i: number) => ({ x: 90 + (i % 3) * (boxW + 45), y: 250 + Math.floor(i / 3) * (boxH + 90) });
  return (
    <AbsoluteFill style={{ background: C.paper, padding: "70px 90px", opacity: fade, fontFamily: BODY, color: C.ink }}>
      <div style={{ fontSize: 20, letterSpacing: 3, textTransform: "uppercase", color: C.accent, fontWeight: 700 }}>How it fits together</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 800, marginTop: 10 }}>One button for the teacher. Everything else runs on the server.</div>
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
        {ARCH.slice(1).map((_, i) => {
          const a = pos(i);
          const b = pos(i + 1);
          const p = rise(frame, 18 + (i + 1) * 14);
          const sameRow = a.y === b.y;
          const x1 = sameRow ? a.x + boxW : a.x + boxW / 2;
          const y1 = sameRow ? a.y + boxH / 2 : a.y + boxH;
          const x2 = sameRow ? b.x : b.x + boxW / 2;
          const y2 = sameRow ? b.y + boxH / 2 : b.y;
          const d = sameRow ? `M ${x1} ${y1} L ${x2 - 8} ${y2}` : `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2 - 8}`;
          return <path key={i} d={d} stroke={C.accent} strokeWidth={3} fill="none" strokeDasharray="1000" strokeDashoffset={1000 * (1 - p)} markerEnd="url(#head)" opacity={p > 0 ? 1 : 0} />;
        })}
        <defs>
          <marker id="head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={C.accent} />
          </marker>
        </defs>
      </svg>
      {ARCH.map((box, i) => {
        const { x, y } = pos(i);
        const p = rise(frame, 10 + i * 14);
        return (
          <div key={box.title} style={{ position: "absolute", left: x, top: y, width: boxW, height: boxH, borderRadius: 18, background: "white", border: `1px solid #dce4dd`, borderTop: `6px solid ${i === 4 ? C.amber : C.accent}`, padding: "18px 22px", boxShadow: "0 10px 30px rgba(22,36,29,0.08)", opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 800 }}>{box.title}</div>
              <div style={{ fontSize: 14, color: i === 4 ? C.amber : C.accent, fontWeight: 700 }}>{box.tag}</div>
            </div>
            <div style={{ fontSize: 19, color: C.soft, marginTop: 10, lineHeight: 1.35 }}>{box.body}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 90, bottom: 60, right: 90, fontSize: 21, color: C.soft, opacity: rise(frame, 110) }}>
        Class report: built only from stored evidence. Practice never counts as progress; only the independent exit does.
      </div>
    </AbsoluteFill>
  );
}

function Clip({ seg }: { seg: Extract<Segment, { kind: "clip" }> }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  const isTeacher = seg.who === "Teacher";
  return (
    <AbsoluteFill style={{ background: "#0b1712", opacity: fade, fontFamily: BODY }}>
      <OffthreadVideo src={staticFile(seg.file)} startFrom={Math.round(seg.from * FPS)} playbackRate={seg.rate} muted style={{ width: WIDTH, height: HEIGHT }} />
      <div style={{ position: "absolute", top: 22, left: 22, display: "flex", gap: 10, opacity: rise(frame, 4) }}>
        <div style={{ padding: "8px 16px", borderRadius: 999, background: isTeacher ? C.amber : C.accent, color: "white", fontWeight: 800, fontSize: 18, boxShadow: "0 6px 18px rgba(0,0,0,0.2)" }}>
          {seg.who}
        </div>
        {seg.rate > 1.05 && (
          <div style={{ padding: "8px 14px", borderRadius: 999, background: "rgba(11,23,18,0.78)", color: "white", fontWeight: 700, fontSize: 16 }}>
            ×{seg.rate >= 10 ? Math.round(seg.rate) : seg.rate.toFixed(1).replace(/\.0$/, "")} speed
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, display: "flex", justifyContent: "center", opacity: rise(frame, 6) }}>
        <div style={{ maxWidth: 1080, background: "rgba(8,70,58,0.94)", color: "white", borderRadius: 16, padding: "14px 26px", fontSize: 25, lineHeight: 1.35, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
          {seg.caption}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const Walkthrough: React.FC<WalkthroughProps> = ({ segments }) => {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "black" }}>
      {segments.map((seg, i) => {
        const duration = Math.max(1, Math.round(seg.seconds * fps));
        const start = from;
        from += duration;
        return (
          <Sequence key={i} from={start} durationInFrames={duration}>
            {seg.kind === "card" ? <Card seg={seg} /> : seg.kind === "architecture" ? <Architecture seconds={seg.seconds} /> : <Clip seg={seg} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export function totalFrames(segments: Segment[]): number {
  return Math.max(1, segments.reduce((sum, s) => sum + Math.max(1, Math.round(s.seconds * FPS)), 0));
}
