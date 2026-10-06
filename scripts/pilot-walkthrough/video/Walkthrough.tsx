import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * The pilot walkthrough, edited from the recorded clips (record.mjs) by
 * render.mjs. Cards are title and explainer slides; clips are cuts of the
 * teacher's or a student's screen with a caption, sped up where noted;
 * "multi" shows several screens at once; "still" pans down a tall screenshot.
 *
 * Everything is laid out on a 1280×800 stage (the recordings' size) that is
 * scaled into the output frame: 1920×1080 for the wide cut, 1080×1920 for the
 * vertical short (where cards and captions are drawn full-size instead).
 */

export const FPS = 30;
export const STAGE_W = 1280;
export const STAGE_H = 800;
export const SIZES = { wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } } as const;
export type Layout = keyof typeof SIZES;

/** Optional narration: a voice clip (in the run folder) that starts `voiceLead` seconds into the segment. */
type Voiced = { voice?: string; voiceLead?: number };
type Screen = { file: string; from: number; rate: number; who: string };

export type Segment =
  | ({ kind: "card"; seconds: number; eyebrow: string; title: string; lines?: string[] } & Voiced)
  | ({ kind: "architecture"; seconds: number } & Voiced)
  | ({ kind: "clip"; seconds: number; caption: string; note?: string } & Screen & Voiced)
  | ({ kind: "multi"; seconds: number; caption: string; screens: Screen[]; composite?: string; tile?: { w: number; h: number; top: number; side: number; gap: number } } & Voiced)
  | ({ kind: "still"; seconds: number; caption: string; file: string; who: string; imageHeight: number } & Voiced);

export interface WalkthroughProps {
  segments: Segment[];
  model: string;
  layout?: Layout;
  /** Background music in the run folder, kept low under the voice. */
  music?: string;
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

/** Scales the 1280×800 stage into the output frame, centred, over a matching background. */
function Stage({ background, layout, children }: { background: string; layout: Layout; children: React.ReactNode }) {
  const { width, height } = SIZES[layout];
  const scale = Math.min(width / STAGE_W, height / STAGE_H);
  return (
    <AbsoluteFill style={{ background }}>
      <div style={{ position: "absolute", left: (width - STAGE_W * scale) / 2, top: (height - STAGE_H * scale) / 2, width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: "top left", overflow: "hidden" }}>
        {children}
      </div>
    </AbsoluteFill>
  );
}

function Pill({ who, rate, frame }: { who: string; rate?: number; frame: number }) {
  const isTeacher = who === "Teacher";
  return (
    <div style={{ display: "flex", gap: 10, opacity: rise(frame, 4) }}>
      <div style={{ padding: "8px 16px", borderRadius: 999, background: isTeacher ? C.amber : C.accent, color: "white", fontWeight: 800, fontSize: 18, boxShadow: "0 6px 18px rgba(0,0,0,0.2)" }}>{who}</div>
      {rate && rate > 1.05 && (
        <div style={{ padding: "8px 14px", borderRadius: 999, background: "rgba(11,23,18,0.78)", color: "white", fontWeight: 700, fontSize: 16 }}>
          ×{rate >= 10 ? Math.round(rate) : rate.toFixed(1).replace(/\.0$/, "")} speed
        </div>
      )}
    </div>
  );
}

function Caption({ text, frame, size = 25 }: { text: string; frame: number; size?: number }) {
  return (
    <div style={{ maxWidth: 1080, background: "rgba(8,70,58,0.94)", color: "white", borderRadius: 16, padding: "14px 26px", fontSize: size, lineHeight: 1.35, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.25)", opacity: rise(frame, 6), fontFamily: BODY }}>
      {text}
    </div>
  );
}

/** Tall layout: the caption sits above the footage, large, instead of over it. */
function TallFrame({ seg, children }: { seg: { seconds: number; caption: string; who: string; rate?: number }; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  return (
    <AbsoluteFill style={{ background: C.paper, opacity: fade, fontFamily: BODY }}>
      <Stage background="transparent" layout="tall">{children}</Stage>
      <div style={{ position: "absolute", top: 230, left: 60, right: 60, opacity: rise(frame, 4) }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>Cogna.</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 54, fontWeight: 800, lineHeight: 1.12, color: C.ink, marginTop: 18, opacity: rise(frame, 8) }}>{seg.caption}</div>
      </div>
      <div style={{ position: "absolute", top: 1330, left: 60 }}><Pill who={seg.who} rate={seg.rate} frame={frame} /></div>
    </AbsoluteFill>
  );
}

function Card({ seg, layout }: { seg: Extract<Segment, { kind: "card" }>; layout: Layout }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  const tall = layout === "tall";
  const body = (
    <AbsoluteFill style={{ background: C.deep, color: "white", padding: tall ? "320px 80px" : "110px 120px", opacity: fade, fontFamily: BODY }}>
      <div style={{ fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: "#8ad2b8", fontWeight: 700, opacity: rise(frame, 4) }}>{seg.eyebrow}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: tall ? 76 : 64, fontWeight: 800, lineHeight: 1.08, marginTop: 22, maxWidth: 1000, opacity: rise(frame, 10), transform: `translateY(${(1 - rise(frame, 10)) * 18}px)` }}>{seg.title}</div>
      <div style={{ marginTop: 40, display: "grid", gap: 18 }}>
        {(seg.lines ?? []).map((line, i) => {
          const p = rise(frame, 26 + i * 12);
          return (
            <div key={i} style={{ display: "flex", gap: 18, alignItems: "baseline", fontSize: tall ? 34 : 28, lineHeight: 1.35, color: "#d8ece4", opacity: p, transform: `translateX(${(1 - p) * 20}px)` }}>
              <span style={{ color: "#8ad2b8", fontWeight: 800 }}>→</span>
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
  return tall ? body : <Stage background={C.deep} layout={layout}>{body}</Stage>;
}

const ARCH: Array<{ title: string; body: string; tag: string }> = [
  { title: "Teacher console", body: "Create class · join code · release once", tag: "web" },
  { title: "Classroom orchestrator", body: "Opens each student's next stage the moment they finish", tag: "pilot-flow" },
  { title: "Lotus diagnostic", body: "Adaptive · stops at 15 min or once the starting point is found", tag: "stop rule" },
  { title: "Lesson author", body: "Writes the lesson from the student's own answers", tag: "per student" },
  { title: "Maths verifier", body: "Algebra engine re-checks every equation before a student sees it", tag: "code" },
  { title: "Practice + exit", body: "Animated practice · one fresh question, no hints", tag: "server-marked" },
];

function Architecture({ seconds, layout }: { seconds: number; layout: Layout }) {
  const frame = useCurrentFrame();
  const fade = useFade(seconds);
  const boxW = 340;
  const boxH = 150;
  const pos = (i: number) => ({ x: 90 + (i % 3) * (boxW + 45), y: 250 + Math.floor(i / 3) * (boxH + 90) });
  return (
    <Stage background={C.paper} layout={layout}>
      <AbsoluteFill style={{ background: C.paper, padding: "70px 90px", opacity: fade, fontFamily: BODY, color: C.ink }}>
        <div style={{ fontSize: 20, letterSpacing: 3, textTransform: "uppercase", color: C.accent, fontWeight: 700 }}>How it fits together</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 800, marginTop: 10 }}>One button for the teacher. Everything else runs on the server.</div>
        <svg width={STAGE_W} height={STAGE_H} style={{ position: "absolute", inset: 0 }}>
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
    </Stage>
  );
}

function Footage({ s }: { s: Screen }) {
  return <OffthreadVideo src={staticFile(s.file)} startFrom={Math.round(s.from * FPS)} playbackRate={s.rate} muted style={{ width: STAGE_W, height: STAGE_H }} />;
}

function Clip({ seg, layout }: { seg: Extract<Segment, { kind: "clip" }>; layout: Layout }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  if (layout === "tall") return <TallFrame seg={seg}><Footage s={seg} /></TallFrame>;
  return (
    <Stage background={C.paper} layout={layout}>
      <AbsoluteFill style={{ background: "#0b1712", opacity: fade, fontFamily: BODY }}>
        <Footage s={seg} />
        <div style={{ position: "absolute", top: 22, left: 22 }}><Pill who={seg.who} rate={seg.rate} frame={frame} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {seg.note && (
            <div style={{ maxWidth: 1000, background: "rgba(255,255,255,0.94)", color: C.soft, borderRadius: 12, padding: "8px 18px", fontSize: 17, lineHeight: 1.35, textAlign: "center", opacity: rise(frame, 30), boxShadow: "0 6px 18px rgba(0,0,0,0.15)" }}>{seg.note}</div>
          )}
          <Caption text={seg.caption} frame={frame} />
        </div>
      </AbsoluteFill>
    </Stage>
  );
}

/**
 * Several screens side by side, each with its own name tag. render.mjs pre-composites the
 * screens into one video (`composite`), because several OffthreadVideos per frame stall the renderer.
 */
function Multi({ seg, layout }: { seg: Extract<Segment, { kind: "multi" }>; layout: Layout }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  const n = seg.screens.length;
  const t = seg.tile ?? { w: (STAGE_W - 60 - 24 * (n - 1)) / n, h: 0, top: 210, side: 30, gap: 24 };
  const h = t.h || (t.w * STAGE_H) / STAGE_W;
  return (
    <Stage background={C.paper} layout={layout}>
      <AbsoluteFill style={{ background: C.paper, opacity: fade, fontFamily: BODY }}>
        {seg.composite && <Footage s={{ file: seg.composite, from: 0, rate: 1, who: "" }} />}
        <div style={{ position: "absolute", top: 60, left: 30, right: 30, fontFamily: DISPLAY, fontSize: 40, fontWeight: 800, color: C.ink, opacity: rise(frame, 4) }}>
          Three students, three devices.
        </div>
        {seg.screens.map((s, i) => {
          const left = t.side + i * (t.w + t.gap);
          return (
            <React.Fragment key={s.who}>
              <div style={{ position: "absolute", left, top: t.top, width: t.w, height: h, borderRadius: 4, border: "1px solid #dce4dd", boxShadow: "0 12px 32px rgba(22,36,29,0.14)", overflow: "hidden" }}>
                {!seg.composite && (
                  <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${t.w / STAGE_W})`, transformOrigin: "top left" }}><Footage s={s} /></div>
                )}
              </div>
              <div style={{ position: "absolute", left, top: t.top + h + 16 }}><Pill who={s.who} rate={s.rate} frame={frame} /></div>
            </React.Fragment>
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center" }}>
          <Caption text={seg.caption} frame={frame} />
        </div>
      </AbsoluteFill>
    </Stage>
  );
}

/** Pans down a tall full-page screenshot (e.g. the final teacher console). */
function Still({ seg, layout }: { seg: Extract<Segment, { kind: "still" }>; layout: Layout }) {
  const frame = useCurrentFrame();
  const fade = useFade(seg.seconds);
  const total = seg.seconds * FPS;
  const travel = Math.max(0, seg.imageHeight - STAGE_H);
  const y = interpolate(frame, [total * 0.15, total * 0.85], [0, -travel], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  if (layout === "tall") {
    // Tall frames have room for most of the page: show it whole, scaled to width.
    const scale = SIZES.tall.width / STAGE_W;
    return (
      <AbsoluteFill style={{ background: C.paper, opacity: fade, fontFamily: BODY }}>
        <Img src={staticFile(seg.file)} style={{ position: "absolute", top: 520, left: 0, width: STAGE_W * scale }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 520, background: C.paper }} />
        <div style={{ position: "absolute", top: 230, left: 60, right: 60, opacity: rise(frame, 4) }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, color: C.accent }}>Cogna.</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 54, fontWeight: 800, lineHeight: 1.12, color: C.ink, marginTop: 18 }}>{seg.caption}</div>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <Stage background={C.paper} layout={layout}>
      <AbsoluteFill style={{ background: "white", opacity: fade, fontFamily: BODY }}>
        <Img src={staticFile(seg.file)} style={{ position: "absolute", left: 0, top: y, width: STAGE_W }} />
        <div style={{ position: "absolute", top: 22, left: 22 }}><Pill who={seg.who} frame={frame} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, display: "flex", justifyContent: "center" }}>
          <Caption text={seg.caption} frame={frame} />
        </div>
      </AbsoluteFill>
    </Stage>
  );
}

export const Walkthrough: React.FC<WalkthroughProps> = ({ segments, music, layout = "wide" }) => {
  const { fps, durationInFrames } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {music && (
        <Audio
          src={staticFile(music)}
          loop
          volume={(f) => interpolate(f, [0, 30, durationInFrames - 60, durationInFrames], [0, 0.07, 0.07, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      )}
      {segments.map((seg, i) => {
        const duration = Math.max(1, Math.round(seg.seconds * fps));
        const start = from;
        from += duration;
        return (
          <Sequence key={i} from={start} durationInFrames={duration}>
            {seg.kind === "card" ? <Card seg={seg} layout={layout} />
              : seg.kind === "architecture" ? <Architecture seconds={seg.seconds} layout={layout} />
              : seg.kind === "multi" ? <Multi seg={seg} layout={layout} />
              : seg.kind === "still" ? <Still seg={seg} layout={layout} />
              : <Clip seg={seg} layout={layout} />}
            {seg.voice && (
              <Sequence from={Math.round((seg.voiceLead ?? 0.4) * fps)}>
                <Audio src={staticFile(seg.voice)} />
              </Sequence>
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export function totalFrames(segments: Segment[]): number {
  return Math.max(1, segments.reduce((sum, s) => sum + Math.max(1, Math.round(s.seconds * FPS)), 0));
}
