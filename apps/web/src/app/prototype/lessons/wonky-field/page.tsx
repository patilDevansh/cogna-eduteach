"use client";

/**
 * Prototype: "Ramesh uncle's wonky field" rebuilt as a premium hands-on lesson — the area of a parallelogram is
 * base × height. Same beats as the school-pilot trail lesson (cut, slide, count, measure, lean), rebuilt for feel:
 * Motion drives every movement (springs, magnetic snap, velocity tilt, shared-element formula), a Rive companion
 * watches and reacts, and sound is synthesized (sfx.ts). Not wired to Lotus or the trail yet.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useSpring, useTransform, useVelocity } from "motion/react";
import { PracticeBuddy, type BuddyReaction } from "@/components/games/PracticeBuddy";
import { buzz, sfx, sound } from "./sfx";
import s from "./lesson.module.css";

type Pt = [number, number];

const U = 64; // one square of land, in drawing units
const VB = { x: -3 * U, y: -1.3 * U, w: 14 * U, h: 7.5 * U };
const WONKY: Pt[] = [[0, 4], [6, 4], [8, 0], [2, 0]];
const RECT2: Pt[] = [[0, 3], [6, 3], [6, 0], [0, 0]];
const STAG = 0.06; // seconds between counted squares
const snappy = { type: "spring", stiffness: 520, damping: 34 } as const;
const soft = { type: "spring", stiffness: 140, damping: 22 } as const;
const bouncy = { type: "spring", stiffness: 420, damping: 14 } as const;
const ease = [0.65, 0, 0.35, 1] as const;

type StepId = "meet" | "broken" | "cut" | "move" | "count" | "measure" | "lean" | "why" | "rule";
const STEPS: { id: StepId; say: string; task?: boolean }[] = [
  { id: "meet", say: "Meet Ramesh uncle's field. It's a bit wonky, isn't it?" },
  { id: "broken", say: "He wants to know how much land he has. But along the slanted edges, the squares are broken." },
  { id: "cut", say: "Here's a trick. Swipe straight down across the field to cut it.", task: true },
  { id: "move", say: "Now drag the left piece. Where can it go to make a rectangle?", task: true },
  { id: "count", say: "Look, a rectangle! Let's count the land." },
  { id: "measure", say: "6 along the bottom, 4 going up. And we didn't lose a bit of land, so the wonky field had 24 too." },
  { id: "lean", say: "Here's another field. Grab the gold handle and lean it. Keep your eye on the land.", task: true },
  { id: "why", say: "Here's why. The bit that sticks out on one side fits exactly into the gap on the other." },
  { id: "rule", say: "So leaning never changes the land. Only the base and the straight-up height matter." },
];
const R = {
  cutShort: "Go all the way across, from the top edge to the bottom edge.",
  cutSlant: "Ooh, a slanted cut. That won't make a square corner. Try straight down.",
  cutGood: "Clean cut. Nice!",
  dropWrong: "Hmm, not there. Try the other end of the field.",
  dropHint: "Psst. Look at the two slanted edges. They match.",
  dropGood: "Click! A perfect fit.",
  counted: "24 squares! 6 in each row, and 4 rows.",
  leanDone: "See that? The slanted side keeps changing, but the land stays 18.",
  whyDone: "Back to a rectangle: 6 × 3 = 18. Same land as before.",
};

/* ---------- geometry (in squares; × U to draw) ---------- */
const pts = (P: Pt[]) => P.map(([x, y]) => `${(x * U).toFixed(1)},${(y * U).toFixed(1)}`).join(" ");
const shift = (P: Pt[], dx: number, dy = 0): Pt[] => P.map(([x, y]) => [x + dx, y + dy]);
function bbox(P: Pt[]) {
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}
/** the slab of earth under a patch of grass: the patch extruded straight down */
const slab = (P: Pt[]) => hull([...P, ...shift(P, 0, 0.28)]);
function inside(P: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i]!, [xj, yj] = P[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** grid squares the shape only partly covers */
function brokenCells(P: Pt[]): Pt[] {
  const b = bbox(P), out: Pt[] = [];
  for (let i = Math.floor(b.x0); i < Math.ceil(b.x1); i++)
    for (let j = Math.floor(b.y0); j < Math.ceil(b.y1); j++) {
      let n = 0;
      for (let a = 0; a < 6; a++) for (let q = 0; q < 6; q++) if (inside(P, i + (a + 0.5) / 6, j + (q + 0.5) / 6)) n++;
      if (n > 0 && n < 36) out.push([i, j]);
    }
  return out.sort((p, q) => p[0] - q[0]);
}
const rnd = (a: number, b: number, k: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
function gridPath(P: Pt[]) {
  const b = bbox(P);
  let d = "";
  for (let x = Math.ceil(b.x0); x <= Math.floor(b.x1); x++) d += `M${x * U} ${b.y0 * U}V${b.y1 * U}`;
  for (let y = Math.ceil(b.y0); y <= Math.floor(b.y1); y++) d += `M${b.x0 * U} ${y * U}H${b.x1 * U}`;
  return d;
}
/** grass tufts on a fixed world grid, so a cut piece carries exactly the tufts it had */
function tuftPath(P: Pt[]) {
  const b = bbox(P);
  let d = "";
  for (let i = Math.floor(b.x0); i < Math.ceil(b.x1); i++)
    for (let j = Math.floor(b.y0); j < Math.ceil(b.y1); j++)
      for (let k = 0; k < 2; k++) {
        const x = (i + 0.15 + rnd(i, j, k) * 0.7) * U, y = (j + 0.3 + rnd(j, i, k + 3) * 0.6) * U;
        const [tx, ty] = [x.toFixed(1), y.toFixed(1)];
        d += `M${tx} ${ty}l-3 -6M${tx} ${ty}l0 -8M${tx} ${ty}l3 -6`;
      }
  return d;
}
const leanField = (l: number): Pt[] => [[0, 3], [6, 3], [6 + l, 0], [l, 0]];
function leanSplit(l: number) {
  return l >= 0
    ? { rest: [[0, 3], [6, 3], [6, 0], [l, 0]] as Pt[], extra: [[6, 0], [6 + l, 0], [6, 3]] as Pt[], seamX: 6, dir: -1, landAt: [0.1, 3.1] as Pt }
    : { rest: [[0, 3], [6, 3], [6 + l, 0], [0, 0]] as Pt[], extra: [[l, 0], [0, 0], [0, 3]] as Pt[], seamX: 0, dir: 1, landAt: [5.9, 3.1] as Pt };
}

/* ---------- pointer → drawing ---------- */
function toView(svg: SVGSVGElement | null, e: { clientX: number; clientY: number }): Pt {
  const m = svg?.getScreenCTM();
  if (!m) return [0, 0];
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return [p.x / U, p.y / U];
}
type DragHandlers = { start?: (p: Pt) => void; move: (p: Pt, d: Pt) => void; end: (p: Pt, d: Pt) => void };
/** Pointer drag with capture, in squares. Handlers are read fresh each event, so they always see current state. */
function useDrag(svg: RefObject<SVGSVGElement | null>, on: DragHandlers) {
  const from = useRef<Pt | null>(null);
  const h = useRef(on);
  h.current = on;
  const at = (e: PointerEvent) => toView(svg.current, e);
  const finish = (e: PointerEvent) => {
    const a = from.current;
    if (!a) return;
    from.current = null;
    const p = at(e);
    h.current.end(p, [p[0] - a[0], p[1] - a[1]]);
  };
  return {
    onPointerDown: (e: PointerEvent<Element>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      from.current = at(e);
      h.current.start?.(from.current);
    },
    onPointerMove: (e: PointerEvent) => {
      const a = from.current;
      if (!a) return;
      const p = at(e);
      h.current.move(p, [p[0] - a[0], p[1] - a[1]]);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}

/* ---------- pieces of the scene ---------- */

/** A patch of land: a soft shadow on the ground, a slab of soil, then grass with mown stripes, tufts and a grid. */
function Land({ P, id, lifted = false, children }: { P: Pt[]; id: string; lifted?: boolean; children?: ReactNode }) {
  const b = bbox(P);
  return (
    <g>
      <motion.polygon points={pts(P)} className={s.shadow} filter="url(#wf-blur)" initial={false}
        animate={lifted ? { x: 18, y: 36, opacity: 0.14 } : { x: 3, y: 13, opacity: 0.3 }} transition={soft} />
      <motion.g initial={false} animate={{ y: lifted ? -16 : 0 }} transition={snappy}>
        <polygon points={pts(slab(P))} className={s.soil} />
        <polygon points={pts(shift(P, 0, 0.17))} className={s.midsoil} />
        <polygon points={pts(shift(P, 0, 0.09))} className={s.topsoil} />
        <clipPath id={id}><polygon points={pts(P)} /></clipPath>
        <g clipPath={`url(#${id})`}>
          <rect x={b.x0 * U} y={b.y0 * U} width={(b.x1 - b.x0) * U} height={(b.y1 - b.y0) * U} fill="url(#wf-grass)" />
          <rect x={b.x0 * U} y={b.y0 * U} width={(b.x1 - b.x0) * U} height={(b.y1 - b.y0) * U} fill="url(#wf-mow)" />
          <path d={tuftPath(P)} className={s.tuft} />
          <path d={gridPath(P)} className={s.grid} />
          {children}
          <polygon points={pts(P)} className={s.rim} />
        </g>
      </motion.g>
    </g>
  );
}

function Tree({ x, y, k = 1, delay = 0 }: { x: number; y: number; k?: number; delay?: number }) {
  return (
    <g transform={`translate(${x * U} ${y * U}) scale(${k})`}>
      <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 13, delay }}
        style={{ originX: 0.5, originY: 1 }}>
        <ellipse cx={12} cy={1} rx={36} ry={9} className={s.treeShadow} />
        <g className={s.tree}>
          <rect x={-5} y={-40} width={10} height={42} rx={4} fill="url(#wf-trunk)" />
          <circle cx={-16} cy={-48} r={22} fill="url(#wf-leaf)" />
          <circle cx={15} cy={-52} r={24} fill="url(#wf-leaf)" />
          <circle cx={-1} cy={-74} r={27} fill="url(#wf-leaf)" />
          <circle cx={-9} cy={-84} r={8} className={s.leafShine} />
        </g>
      </motion.g>
    </g>
  );
}

function Flowers({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x * U} ${y * U})`} className={s.flowers}>
      {[[0, 0], [14, 6], [-10, 9], [24, -4]].map(([fx, fy], k) => (
        <g key={k} transform={`translate(${fx} ${fy})`}>
          <path d="M0 0l-2 -6M0 0l2 -7" className={s.flowerStem} />
          <circle cy={-8} r={3.4} className={k % 2 ? s.petalWarm : s.petal} />
          <circle cy={-8} r={1.3} className={s.flowerEye} />
        </g>
      ))}
    </g>
  );
}

/** A ghost fingertip that shows the move, looping until the learner tries it. */
function GhostTouch({ from, to }: { from: Pt; to: Pt }) {
  const [x0, y0, x1, y1] = [from[0] * U, from[1] * U, to[0] * U, to[1] * U];
  const loop = { duration: 2, repeat: Infinity, repeatDelay: 0.7, ease: "easeInOut" } as const;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} pointerEvents="none">
      <motion.line x1={x0} y1={y0} x2={x1} y2={y1} className={s.ghostTrail}
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 0, 1, 1], opacity: [0, 0.9, 0.9, 0] }} transition={{ ...loop, times: [0, 0.15, 0.75, 1] }} />
      <motion.circle r={13} className={s.ghostDot} initial={{ cx: x0, cy: y0, opacity: 0 }}
        animate={{ cx: [x0, x0, x1, x1], cy: [y0, y0, y1, y1], opacity: [0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.15, 0.75, 1] }} />
    </motion.g>
  );
}

function Puff({ at }: { at: Pt }) {
  return (
    <g pointerEvents="none">
      {Array.from({ length: 10 }, (_, k) => {
        const a = Math.PI * (1.08 + (k / 9) * 0.84), r = 26 + rnd(k, at[0], 1) * 26;
        return (
          <motion.circle key={k} className={s.dust} initial={{ cx: at[0] * U, cy: at[1] * U, r: 3, opacity: 0.85 }}
            animate={{ cx: at[0] * U + Math.cos(a) * r * 1.4, cy: at[1] * U + Math.sin(a) * r * 0.7, r: 6 + rnd(k, 2, 3) * 5, opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }} />
        );
      })}
    </g>
  );
}

const CONFETTI = ["#f2b134", "#0e6b54", "#4f5bd5", "#e8743b", "#7cc46a"];
function Confetti({ n }: { n: number }) {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, k) => ({
    x: (rnd(k, n, 1) - 0.5) * 640, y: -110 - rnd(k, n, 2) * 170, r: (rnd(k, n, 3) - 0.5) * 900, d: rnd(k, n, 4) * 0.18, c: CONFETTI[k % 5],
  })), [n]);
  return (
    <div className={s.confetti} aria-hidden>
      {bits.map((b, k) => (
        <motion.i key={`${n}-${k}`} style={{ background: b.c }} initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{ x: [0, b.x * 0.8, b.x], y: [0, b.y, b.y + 420], rotate: [0, b.r * 0.5, b.r], opacity: [1, 1, 0], scale: [0.4, 1, 1] }}
          transition={{ duration: 1.9, delay: b.d, times: [0, 0.32, 1], ease: [0.2, 0.7, 0.4, 1] }} />
      ))}
    </div>
  );
}

function Caption({ text }: { text: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.p key={text} className={s.say} initial="hide" animate="show" exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
        variants={{ show: { transition: { staggerChildren: 0.022 } } }}>
        {text.split(" ").map((w, k) => (
          <motion.span key={k} className={s.word} variants={{ hide: { opacity: 0, y: 8, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.32, ease: "easeOut" } } }}>
            {w}{" "}
          </motion.span>
        ))}
      </motion.p>
    </AnimatePresence>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return <span className={s.term}>{children}<small>{label}</small></span>;
}

/** where a point in the drawing sits on the stage, as CSS percentages (for HTML laid over the SVG) */
const onStage = (x: number, y: number) => ({ left: `${((x * U - VB.x) / VB.w) * 100}%`, top: `${((y * U - VB.y) / VB.h) * 100}%` });

/* ---------- the lesson ---------- */

export default function WonkyFieldPage() {
  const [run, setRun] = useState(0);
  return (
    <MotionConfig reducedMotion="user">
      <WonkyField key={run} onReplay={() => setRun((r) => r + 1)} />
    </MotionConfig>
  );
}

function WonkyField({ onReplay }: { onReplay: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState(0);
  const id = STEPS[step]!.id;
  const scene = step >= STEPS.findIndex((x) => x.id === "lean") ? 2 : 1;
  const [done, setDone] = useState(false);
  const [say, setSay] = useState<string | null>(null);
  const [reaction, setReaction] = useState<BuddyReaction>({ kind: "idle", n: 0 });
  const react = (kind: BuddyReaction["kind"]) => setReaction((r) => ({ kind, n: r.n + 1 }));
  const [look, setLook] = useState(50);
  const lookAt = (p: Pt) => setLook(Math.max(0, Math.min(100, ((p[0] * U - VB.x) / VB.w) * 100)));
  const [soundOn, setSoundOn] = useState(true);

  // timers belong to the step they were started in
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const armHint = () => { clearTimeout(hintTimer.current); setHint(false); hintTimer.current = setTimeout(() => setHint(true), 3500); };
  const touch = () => { clearTimeout(hintTimer.current); setHint(false); };

  // camera: the world slides under a fixed frame
  const camX = useMotionValue(0), camY = useMotionValue(0);
  const pan = (x: number, y = 0) => { animate(camX, x * U, soft); animate(camY, y * U, soft); };
  const world = (p: Pt): Pt => [p[0] - camX.get() / U, p[1] - camY.get() / U];
  const shakeX = useMotionValue(0);

  // field 1: cut, slide, count, measure
  const [broken, setBroken] = useState(false);
  const cutFrom = useRef<Pt | null>(null);
  const [blade, setBlade] = useState<{ a: Pt; b: Pt; bad?: boolean } | null>(null);
  const [cut, setCut] = useState<{ c: number; a: Pt; b: Pt } | null>(null);
  const c = cut?.c ?? 3;
  const px = useMotionValue(0), py = useMotionValue(0);
  const tilt = useSpring(useTransform(useVelocity(px), [-1800, 1800], [-5, 5]), { stiffness: 300, damping: 26 });
  const pieceFrom = useRef<Pt>([0, 0]);
  const [lifted, setLifted] = useState(false);
  const [near, setNear] = useState(false);
  const [placed, setPlaced] = useState(false);
  const misses = useRef(0);
  const [puff, setPuff] = useState<{ at: Pt; n: number } | null>(null);
  const [counting, setCounting] = useState(false);
  const land = useMotionValue(0);
  const landText = useTransform(land, (v) => String(Math.round(v)));
  const [known, setKnown] = useState(false);
  const [pop, setPop] = useState(0);
  const [formula, setFormula] = useState(false);

  // field 2: lean
  const [lean, setLean] = useState(1.5);
  const seen = useRef<[number, number]>([1.5, 1.5]);
  const leanDone = useRef(false);
  const leanFrom = useRef(0);
  const [leaning, setLeaning] = useState(false);
  const [leanTouched, setLeanTouched] = useState(false);
  const [why, setWhy] = useState(0); // 1 seam shows · 2 bit lifts · 3 flies · 4 set down · 5 one rectangle
  const sp = leanSplit(lean);
  const [party, setParty] = useState(0);

  useEffect(() => {
    const st = STEPS[step]!;
    setSay(null);
    setDone(!st.task && st.id !== "count" && st.id !== "why");
    if (st.task) armHint(); else touch();
    switch (st.id) {
      case "broken":
        later(() => setBroken(true), 250);
        break;
      case "cut":
        setBroken(false);
        break;
      case "count":
        pan(1 - c);
        later(() => {
          setCounting(true);
          setKnown(true);
          animate(land, 24, { duration: 24 * STAG + 0.15, ease: "linear" });
          for (let k = 0; k < 24; k++) later(() => sfx.tick(k), k * STAG * 1000 + 90);
          later(() => { setPop((n) => n + 1); sfx.chime(); react("right"); setSay(R.counted); setDone(true); }, 24 * STAG * 1000 + 350);
        }, 650);
        break;
      case "measure":
        later(() => setFormula(true), 1900);
        break;
      case "lean":
        pan(1, 0.5);
        land.set(18);
        later(() => setPop((n) => n + 1), 500);
        break;
      case "why": {
        const go = () => {
          setWhy(1); sfx.cut();
          later(() => { setWhy(2); sfx.lift(); }, 650);
          later(() => { setWhy(3); sfx.whoosh(); }, 950);
          later(() => { setWhy(4); sfx.place(); buzz(15); setPuff((q) => ({ at: leanSplit(Math.abs(lean) < 1 ? 2 : lean).landAt, n: (q?.n ?? 0) + 1 })); }, 2000);
          later(() => { setWhy(5); react("right"); setPop((n) => n + 1); setSay(R.whyDone); setDone(true); }, 2250);
        };
        if (Math.abs(lean) < 1) animate(lean, 2, { duration: 0.6, ease, onUpdate: setLean }).then(go);
        else go();
        break;
      }
      case "rule":
        setParty((n) => n + 1); sfx.chime(); react("right");
        break;
    }
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // Each step's entrance runs once, when the step starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const next = () => (step === STEPS.length - 1 ? onReplay() : setStep((i) => i + 1));

  /* cutting */
  const doCut = (cx: number, a: Pt = [cx, -0.4], b: Pt = [cx, 4.4]) => {
    touch();
    setBlade(null);
    setCut({ c: cx, a, b });
    sfx.cut(); buzz(); react("right");
    setSay(R.cutGood); setDone(true);
    animate(px, -0.08 * U, snappy);
    pan(4 - (cx + 6) / 2);
    later(() => setStep((i) => i + 1), 1300);
  };
  const cutDrag = useDrag(svg, {
    start: (p) => { touch(); cutFrom.current = world(p); setBlade({ a: world(p), b: world(p) }); react("thinking"); lookAt(p); },
    move: (p) => { const b = world(p); setBlade((x) => x && { ...x, b }); lookAt(p); },
    end: (p) => {
      const a = cutFrom.current, b = world(p);
      cutFrom.current = null;
      if (!a) return;
      const top = Math.min(a[1], b[1]), bot = Math.max(a[1], b[1]), dx = Math.abs(a[0] - b[0]), dy = bot - top;
      if (dy < 0.4) { setBlade(null); react("idle"); return; }
      const wrong = top > 0.35 || bot < 3.65 ? R.cutShort : dx > dy * 0.3 ? R.cutSlant : null;
      if (wrong) {
        setBlade({ a, b, bad: true }); setSay(wrong); sfx.nope(); react("wrong");
        animate(shakeX, [0, -8, 8, -5, 5, 0], { duration: 0.42 });
        later(() => setBlade(null), 650);
        armHint();
        return;
      }
      doCut(Math.min(5, Math.max(2, Math.round((a[0] + b[0]) / 2))), a, b);
    },
  });

  /* sliding the left piece */
  const place = () => {
    touch(); setNear(false);
    Promise.all([animate(px, 6 * U, snappy), animate(py, 0, snappy)]).then(() => {
      setLifted(false);
      later(() => {
        setPlaced(true); sfx.place(); buzz(15); react("right");
        setSay(R.dropGood); setDone(true);
        setPuff((q) => ({ at: [6.1, 4.15], n: (q?.n ?? 0) + 1 }));
        later(() => setStep((i) => i + 1), 1100);
      }, 170);
    });
  };
  const pieceDrag = useDrag(svg, {
    start: (p) => { touch(); pieceFrom.current = [px.get(), py.get()]; setLifted(true); sfx.lift(); react("thinking"); lookAt(p); },
    move: (p, d) => {
      let x = pieceFrom.current[0] + d[0] * U, y = pieceFrom.current[1] + d[1] * U;
      const isNear = Math.hypot(x - 6 * U, y) < 1.3 * U;
      setNear(isNear);
      if (isNear) { x += (6 * U - x) * 0.45; y += (0 - y) * 0.45; } // magnetic pull into place
      px.set(x); py.set(y); lookAt(p);
    },
    end: (_p, d) => {
      if (Math.hypot(px.get() - 6 * U, py.get()) < 0.75 * U) return place();
      setLifted(false); setNear(false);
      animate(px, -0.08 * U, soft); animate(py, 0, soft);
      if (Math.hypot(d[0], d[1]) < 0.5) { react("idle"); return; }
      sfx.nope(); react("wrong");
      misses.current += 1;
      setSay(misses.current >= 2 ? R.dropHint : R.dropWrong);
      armHint();
    },
  });

  /* leaning the second field */
  const setL = (l: number) => {
    const v = Math.max(-2.5, Math.min(2.5, l));
    setLean((old) => { if (Math.round(old * 2) !== Math.round(v * 2)) sfx.detent(); return v; });
    const sn = seen.current;
    sn[0] = Math.min(sn[0], v); sn[1] = Math.max(sn[1], v);
    if (!leanDone.current && sn[1] - sn[0] >= 3) {
      leanDone.current = true;
      setDone(true); setSay(R.leanDone); react("right"); sfx.chime();
    }
  };
  const leanDrag = useDrag(svg, {
    start: (p) => { touch(); setLeanTouched(true); leanFrom.current = lean; setLeaning(true); react("thinking"); lookAt(p); sfx.lift(); },
    move: (p, d) => { setL(leanFrom.current + d[0]); lookAt(p); },
    end: () => { setLeaning(false); if (!leanDone.current) react("idle"); },
  });
  const leanKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault(); touch(); setLeanTouched(true);
    setL(lean + (e.key === "ArrowLeft" ? -0.5 : 0.5));
  };

  const assist = () => {
    if (id === "cut") doCut(3);
    if (id === "move") place();
    if (id === "lean") { touch(); setLeanTouched(true); animate(lean, -2, { duration: 0.9, ease, onUpdate: setL }).then(() => animate(-2, 2, { duration: 1.3, ease, onUpdate: setL })); }
  };

  const toggleSound = () => { sound.on = !soundOn; setSoundOn(!soundOn); };
  const caption = say ?? STEPS[step]!.say;
  const seamGlow = (from: Pt, to: Pt, key: string) => (
    <motion.line key={key} x1={from[0] * U} y1={from[1] * U} x2={to[0] * U} y2={to[1] * U} className={s.seam}
      initial={{ opacity: 0, pathLength: 0 }} animate={{ opacity: [0, 1, 0], pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
  );
  const sideLen = Math.hypot(lean, 3);

  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <header className={s.top}>
          <PracticeBuddy reaction={reaction} look={look} className={s.buddy} />
          <div className={s.bubble} aria-live="polite"><Caption text={caption} /></div>
          <button type="button" className={s.sound} onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Turn sound off" : "Turn sound on"}>
            {soundOn ? "🔊" : "🔈"}
          </button>
        </header>

        <div className={s.stage}>
          <svg ref={svg} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className={s.svg} role="img"
            aria-label={scene === 1 ? "Ramesh uncle's wonky field, drawn on a grid of squares" : "A parallelogram field you can lean with a gold handle"}>
            <defs>
              <linearGradient id="wf-grass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={4 * U}>
                <stop offset="0" stopColor="#a6dc84" /><stop offset="1" stopColor="#62b05c" />
              </linearGradient>
              <pattern id="wf-mow" width={U} height={U} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
                <rect width={U / 2} height={U} fill="#fff" opacity="0.08" />
              </pattern>
              <linearGradient id="wf-trunk" x1="0" x2="1"><stop offset="0" stopColor="#9b6a43" /><stop offset="1" stopColor="#6d4529" /></linearGradient>
              <radialGradient id="wf-leaf" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#97d67e" /><stop offset="1" stopColor="#3f8c4a" /></radialGradient>
              <radialGradient id="wf-cloud"><stop offset="0" stopColor="#1d3a22" stopOpacity="0.09" /><stop offset="1" stopColor="#1d3a22" stopOpacity="0" /></radialGradient>
              <radialGradient id="wf-gold" cx="0.35" cy="0.3"><stop offset="0" stopColor="#ffe08a" /><stop offset="0.6" stopColor="#f2b134" /><stop offset="1" stopColor="#d48a12" /></radialGradient>
              <filter id="wf-blur" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="7" /></filter>
              <filter id="wf-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* the ground: drifting cloud shadows, flowers and trees, fixed to the frame */}
            <ellipse className={s.cloud} cx={0} cy={1.2 * U} rx={4.5 * U} ry={1.8 * U} fill="url(#wf-cloud)" />
            <ellipse className={`${s.cloud} ${s.cloudLate}`} cx={0} cy={4.4 * U} rx={3.5 * U} ry={1.4 * U} fill="url(#wf-cloud)" />
            <Flowers x={-2.3} y={4.9} />
            <Flowers x={9.9} y={2.6} />
            <Tree x={-2.2} y={1.5} delay={0.35} />
            <Tree x={-1.75} y={4.3} k={0.7} delay={0.5} />
            <Tree x={10.3} y={0.6} k={0.8} delay={0.6} />

            <motion.g style={{ x: camX, y: camY }}>
              <AnimatePresence mode="wait">
                {scene === 1 ? (
                  <motion.g key="field-1" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30, transition: { duration: 0.3 } }}
                    transition={{ ...soft, delay: 0.1 }}>
                    <motion.g style={{ x: shakeX }}>
                      {!cut && (
                        <Land P={WONKY} id="wf-whole">
                          {broken && brokenCells(WONKY).map(([i, j], k) => (
                            <motion.rect key={k} x={i * U} y={j * U} width={U} height={U} className={s.broken}
                              initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0.5, 0.85] }} transition={{ delay: k * 0.08, duration: 1.6, times: [0, 0.2, 0.6, 1] }} />
                          ))}
                        </Land>
                      )}
                      {cut && !placed && (
                        <>
                          <motion.g initial={{ x: 0 }} animate={{ x: 0.08 * U }} transition={snappy}>
                            <Land P={[[c, 4], [6, 4], [8, 0], [c, 0]]} id="wf-right" />
                          </motion.g>
                          <AnimatePresence>
                            {(lifted || hint) && (
                              <motion.polygon points={pts(shift([[0, 4], [c, 4], [c, 0], [2, 0]], 6))} className={`${s.target} ${near ? s.targetNear : ""}`}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                            )}
                          </AnimatePresence>
                          <motion.g style={{ x: px, y: py }} className={s.grab} {...pieceDrag} tabIndex={0} role="button"
                            aria-label="The left piece of the field. Press Enter to move it to the other end."
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); place(); } }}>
                            <motion.g style={{ rotate: tilt }}>
                              <Land P={[[0, 4], [c, 4], [c, 0], [2, 0]]} id="wf-left" lifted={lifted} />
                            </motion.g>
                          </motion.g>
                        </>
                      )}
                      {placed && (
                        <Land P={[[c, 4], [c + 6, 4], [c + 6, 0], [c, 0]]} id="wf-rect">
                          <g className={id === "count" ? undefined : s.quiet}>
                            {counting && Array.from({ length: 24 }, (_, k) => {
                              const i = k % 6, j = 3 - Math.floor(k / 6);
                              return (
                                <motion.g key={k} initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...bouncy, delay: k * STAG }}>
                                  <rect x={(c + i) * U + 4} y={j * U + 4} width={U - 8} height={U - 8} rx={10} className={s.countCell} />
                                  <text x={(c + i + 0.5) * U} y={(j + 0.5) * U} className={s.countNum}>{k + 1}</text>
                                </motion.g>
                              );
                            })}
                          </g>
                        </Land>
                      )}
                    </motion.g>

                    {placed && seamGlow([6, 4], [8, 0], "seam-1")}
                    {cut && id === "move" && !placed && (
                      <g pointerEvents="none">
                        <motion.line className={s.blade} initial={{ x1: cut.a[0] * U, y1: cut.a[1] * U, x2: cut.b[0] * U, y2: cut.b[1] * U, opacity: 1 }}
                          animate={{ x1: c * U, y1: -0.35 * U, x2: c * U, y2: 4.35 * U, opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} />
                      </g>
                    )}
                    {cut && id === "cut" && (
                      <g pointerEvents="none">
                        <motion.line className={s.blade} initial={{ x1: cut.a[0] * U, y1: cut.a[1] * U, x2: cut.b[0] * U, y2: cut.b[1] * U, opacity: 1 }}
                          animate={{ x1: c * U, y1: -0.35 * U, x2: c * U, y2: 4.35 * U, opacity: [1, 1, 0] }} transition={{ duration: 0.8, ease: "easeOut" }} />
                        <motion.circle r={7} className={s.glint} initial={{ cx: c * U, cy: -0.35 * U, opacity: 1 }}
                          animate={{ cy: 4.35 * U, opacity: [1, 1, 0] }} transition={{ duration: 0.4, ease: "easeIn" }} />
                      </g>
                    )}

                    {id === "cut" && !cut && (
                      <rect x={-1} y={-1.5 * U} width={8 * U + 2} height={7.5 * U} fill="transparent" className={s.cutZone} {...cutDrag} />
                    )}
                    {blade && (
                      <g pointerEvents="none">
                        <line x1={blade.a[0] * U} y1={blade.a[1] * U} x2={blade.b[0] * U} y2={blade.b[1] * U} className={`${s.blade} ${blade.bad ? s.bladeBad : ""}`} />
                        <circle cx={blade.b[0] * U} cy={blade.b[1] * U} r={7} className={blade.bad ? s.bladeTipBad : s.glint} />
                      </g>
                    )}

                    {id === "measure" && (
                      <g pointerEvents="none">
                        <motion.path d={`M${c * U} ${4.6 * U}H${(c + 6) * U}`} className={`${s.ruler} ${s.rulerBase}`}
                          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease }} />
                        {Array.from({ length: 7 }, (_, k) => (
                          <motion.line key={k} x1={(c + k) * U} x2={(c + k) * U} y1={4.5 * U} y2={4.7 * U} className={`${s.ruler} ${s.rulerBase}`}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + k * 0.1 }} />
                        ))}
                        <motion.path d={`M${(c + 6.55) * U} ${4 * U}V0`} className={`${s.ruler} ${s.rulerHeight}`}
                          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: 0.85, ease }} />
                        {Array.from({ length: 5 }, (_, k) => (
                          <motion.line key={k} x1={(c + 6.45) * U} x2={(c + 6.65) * U} y1={(4 - k) * U} y2={(4 - k) * U} className={`${s.ruler} ${s.rulerHeight}`}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95 + k * 0.1 }} />
                        ))}
                      </g>
                    )}

                    <AnimatePresence>
                      {hint && id === "cut" && !cut && <GhostTouch key="g-cut" from={[3.5, -0.6]} to={[3.5, 4.6]} />}
                      {hint && id === "move" && !placed && <GhostTouch key="g-move" from={[c / 2 + 0.6, 2]} to={[c / 2 + 6.6, 2]} />}
                    </AnimatePresence>
                    {puff && scene === 1 && <Puff key={`p${puff.n}`} at={puff.at} />}
                  </motion.g>
                ) : (
                  <motion.g key="field-2" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...soft, delay: 0.15 }}>
                    {why === 0 && <Land P={leanField(lean)} id="wf-lean" />}
                    {why >= 1 && why < 5 && (
                      <>
                        <Land P={sp.rest} id="wf-rest" />
                        {why >= 2 && <polygon points={pts(shift(sp.extra, sp.dir * 6))} className={s.target} />}
                        <motion.g variants={{ home: { x: 0, y: 0 }, fly: { x: [0, sp.dir * 3 * U, sp.dir * 6 * U], y: [0, -1.8 * U, 0], transition: { duration: 1.05, ease: "easeInOut" } } }}
                          initial="home" animate={why >= 3 ? "fly" : "home"}>
                          <Land P={sp.extra} id="wf-extra" lifted={why === 2 || why === 3} />
                        </motion.g>
                      </>
                    )}
                    {why === 5 && <Land P={RECT2} id="wf-rect2" />}
                    {why === 1 && seamGlow([sp.seamX, 0], [sp.seamX, 3], "seam-2")}
                    {why === 5 && seamGlow(sp.dir < 0 ? [0, 3] : [6, 3], sp.dir < 0 ? [lean, 0] : [6 + lean, 0], "seam-3")}

                    {why === 0 && (
                      <g>
                        <line x1={(lean >= 0 ? lean : 6 + lean) * U} y1={0} x2={(lean >= 0 ? lean : 6 + lean) * U} y2={3 * U} className={s.heightLine} />
                        <path d={`M${(lean >= 0 ? lean : 6 + lean) * U} ${3 * U - 14}h14v14`} className={s.rightAngle} />
                        <line x1={0} y1={3 * U + 1} x2={6 * U} y2={3 * U + 1} className={s.baseLine} />
                        <g transform={`translate(${(lean / 2 - 0.8) * U} ${1.5 * U})`}>
                          <rect x={-30} y={-16} width={60} height={32} rx={11} className={s.sideChip} />
                          <text className={s.sideText}>{sideLen.toFixed(1)}</text>
                        </g>
                        <g transform={`translate(${(3 + lean) * U} 0)`} className={s.handle} {...leanDrag} tabIndex={0} role="slider"
                          aria-label="Lean the field" aria-valuemin={-2.5} aria-valuemax={2.5} aria-valuenow={Number(lean.toFixed(1))} onKeyDown={leanKey}>
                          <circle r={34} fill="transparent" />
                          {!leanTouched && (
                            <motion.circle r={18} className={s.knobHalo} initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.9, opacity: 0 }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }} />
                          )}
                          <motion.g animate={{ scale: leaning ? 1.18 : 1 }} transition={snappy}>
                            <circle r={17} className={s.knob} />
                            <path d="M-6 -5l-5 5l5 5M6 -5l5 5l-5 5" className={s.knobArrows} />
                          </motion.g>
                        </g>
                      </g>
                    )}
                    <AnimatePresence>
                      {hint && id === "lean" && !leanTouched && <GhostTouch key="g-lean" from={[3 + lean - 1.4, 0]} to={[3 + lean + 1.4, 0]} />}
                    </AnimatePresence>
                    {puff && why >= 4 && <Puff key={`p${puff.n}`} at={puff.at} />}
                    {id === "rule" && (
                      <motion.circle cx={3 * U} cy={1.5 * U} className={s.burst} initial={{ r: 0, opacity: 0.9 }} animate={{ r: 5 * U, opacity: 0 }} transition={{ duration: 1.2, ease: "easeOut" }} />
                    )}
                  </motion.g>
                )}
              </AnimatePresence>
            </motion.g>
          </svg>

          <motion.div className={s.badge} data-steady={leaning} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...soft, delay: 0.6 }}>
            <small>Land</small>
            <motion.b key={pop} initial={false} animate={pop ? { scale: [1, 1.18, 1] } : undefined} transition={{ duration: 0.45 }}>
              {known || scene === 2 ? <motion.span>{landText}</motion.span> : "?"}
              <span className={s.unit}> squares</span>
            </motion.b>
          </motion.div>

          {id === "measure" && !formula && (
            <>
              <motion.span layoutId="wf-base" className={`${s.chip} ${s.chipBase} ${s.label}`} style={onStage(c + 3 + (1 - c), 5.05)}
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...bouncy, delay: 0.6 }}>6</motion.span>
              <motion.span layoutId="wf-height" className={`${s.chip} ${s.chipHeight} ${s.label}`} style={onStage(c + 7.05 + (1 - c), 2)}
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...bouncy, delay: 1.4 }}>4</motion.span>
            </>
          )}
          {party > 0 && <Confetti n={party} />}
        </div>

        <div className={s.board}>
          <AnimatePresence mode="popLayout">
            {id === "measure" && formula && (
              <motion.div key="f1" className={s.formula} exit={{ opacity: 0, y: -10 }}>
                <motion.span className={s.areaWord} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Area</motion.span>
                <motion.span className={s.op} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>=</motion.span>
                <Term label="base"><motion.span layoutId="wf-base" className={`${s.chip} ${s.chipBase}`} transition={snappy}>6</motion.span></Term>
                <motion.span className={s.op} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>×</motion.span>
                <Term label="height"><motion.span layoutId="wf-height" className={`${s.chip} ${s.chipHeight}`} transition={snappy}>4</motion.span></Term>
                <motion.span className={s.op} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>=</motion.span>
                <Term label="squares">
                  <motion.span className={`${s.chip} ${s.chipLand}`} initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...bouncy, delay: 0.55 }}>24</motion.span>
                </Term>
              </motion.div>
            )}
            {(id === "lean" || id === "why") && (
              <motion.div key="f2" className={s.readout} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <Term label="base"><span className={`${s.chip} ${s.chipBase}`}>6</span></Term>
                <Term label="height"><span className={`${s.chip} ${s.chipHeight}`}>3</span></Term>
                <Term label="slanted side"><span className={`${s.chip} ${s.chipSide}`}>{why ? "—" : sideLen.toFixed(1)}</span></Term>
                <Term label="land, always"><span className={`${s.chip} ${s.chipLand}`} data-steady={leaning}>18</span></Term>
              </motion.div>
            )}
            {id === "rule" && (
              <motion.div key="f3" className={s.rule} initial={{ opacity: 0, scale: 0.9, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={bouncy}>
                <small>Area of a parallelogram</small>
                <b><span className={s.ruleBase}>base</span> × <span className={s.ruleHeight}>height</span></b>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className={s.foot}>
          <div className={s.dots} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((x, k) => (
              <span key={x.id} className={`${s.dot} ${k < step ? s.dotDone : ""}`}>
                {k === step && <motion.span layoutId="wf-step" className={s.dotPill} transition={snappy} />}
              </span>
            ))}
          </div>
          <div className={s.actions}>
            {STEPS[step]!.task && !done && <button type="button" className={s.assist} onClick={assist}>Show me</button>}
            <motion.button type="button" className={s.next} disabled={!done} onClick={next}
              animate={done ? { scale: [1, 1.06, 1] } : { scale: 1 }} transition={{ duration: 0.35 }} whileTap={{ scale: 0.96 }}>
              {step === STEPS.length - 1 ? "Play again" : "Continue"}
            </motion.button>
          </div>
        </footer>
      </div>
    </main>
  );
}
