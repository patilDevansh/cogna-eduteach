"use client";

import { useEffect, useRef } from "react";
import { PRINT_FAMILIES, type PrintFamily, type PrintMark } from "./thinking-print";
import styles from "./seven-ways.module.css";

/**
 * The thinking print: strokes flow across a circle, one small burst per answer.
 * Each student's field is seeded from their session, so no two prints match and
 * a reload redraws the same picture. It grows from what the student shows and
 * never from right or wrong (see thinking-print.ts).
 */
const SIZE = 200;
const ANCHOR: Record<PrintFamily, number> = { PAIR: 0, SQUARES: 1, SIGNS: 2, CHECK: 3, GROUP: 4 };
const COLOR = Object.fromEntries(PRINT_FAMILIES.map((f) => [f.family, f.color])) as Record<PrintFamily, string>;

interface Stroke { x: number; y: number; speed: number; turn: number; life: number; color: string; width: number; alpha: number }

function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function seeded(text: string): () => number {
  let h = hashOf(text);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function strokesFor(mark: PrintMark, seed: string): Stroke[] {
  const rand = seeded(`${seed}|${mark.id}`);
  const angle = (ANCHOR[mark.family] / 5) * Math.PI * 2 + rand() * 0.8;
  const count = Math.round(26 + 60 * mark.strength);
  const width = 0.5 + (1 - mark.certainty) * 2.6;
  const alpha = 0.12 + mark.certainty * 0.38;
  return Array.from({ length: count }, () => {
    const reach = (18 + rand() * 40) * rand();
    return {
      x: SIZE / 2 + Math.cos(angle) * reach + (rand() - 0.5) * 30,
      y: SIZE / 2 + Math.sin(angle) * reach + (rand() - 0.5) * 30,
      speed: 0.7 + rand() * 0.6,
      turn: (rand() - 0.5) * 0.6,
      life: 50 + rand() * 90,
      color: COLOR[mark.family],
      width,
      alpha,
    };
  });
}

export function ThinkingPrint({ seed, marks, share, label }: { seed: string; marks: readonly PrintMark[]; /** How full the ring is, 0 to 1. */ share: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<{ seed: string; ids: Set<string> } | null>(null);
  const live = useRef<Stroke[]>([]);
  const frame = useRef(0);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const previous = drawn.current;
    const firstPaint = !previous || previous.seed !== seed;
    if (firstPaint) {
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.current!.width = SIZE * scale;
      canvas.current!.height = SIZE * scale;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.lineCap = "round";
      live.current = [];
      drawn.current = { seed, ids: new Set() };
    }
    const seedValue = hashOf(seed) % 1000;
    const field = (x: number, y: number) => Math.sin(x * 0.021 + seedValue) * 1.7 + Math.cos(y * 0.019 - seedValue * 0.7) * 1.7 + Math.sin((x + y) * 0.008 + seedValue * 1.3);
    const step = () => {
      for (let pass = 0; pass < 2; pass++) {
        for (const s of live.current) {
          const a = field(s.x, s.y) + s.turn;
          const nx = s.x + Math.cos(a) * s.speed;
          const ny = s.y + Math.sin(a) * s.speed;
          if (Math.hypot(nx - SIZE / 2, ny - SIZE / 2) > SIZE / 2 - 3) { s.life = 0; continue; }
          context.strokeStyle = s.color;
          context.globalAlpha = s.alpha;
          context.lineWidth = s.width;
          context.beginPath();
          context.moveTo(s.x, s.y);
          context.lineTo(nx, ny);
          context.stroke();
          s.x = nx;
          s.y = ny;
          s.life--;
        }
      }
      live.current = live.current.filter((s) => s.life > 0);
    };
    const fresh = marks.filter((mark) => !drawn.current!.ids.has(mark.id));
    for (const mark of fresh) {
      drawn.current!.ids.add(mark.id);
      live.current.push(...strokesFor(mark, seed));
      // What was already there on load is drawn at once, in order, so a reload gives the same picture.
      if (firstPaint) while (live.current.length) step();
    }
    if (!live.current.length) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      while (live.current.length) step();
      return;
    }
    cancelAnimationFrame(frame.current);
    const run = () => { step(); if (live.current.length) frame.current = requestAnimationFrame(run); };
    frame.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame.current);
  }, [seed, marks]);

  // The test's length can shrink mid-way; the ring never takes anything back.
  const peak = useRef({ seed, share: 0 });
  if (peak.current.seed !== seed) peak.current = { seed, share: 0 };
  peak.current.share = Math.max(peak.current.share, share);
  const circumference = 2 * Math.PI * 56;
  return (
    <div className={styles.print} role="img" aria-label={label}>
      <canvas ref={canvas} className={styles.printCanvas} />
      <svg viewBox="0 0 120 120" className={styles.printRing} aria-hidden="true">
        <circle cx="60" cy="60" r="56" className={styles.ringBack} />
        <circle cx="60" cy="60" r="56" className={styles.ringFill} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - peak.current.share)} transform="rotate(-90 60 60)" />
      </svg>
    </div>
  );
}

/** The print with its key, as it sits beside the question. */
export function ThinkingPrintPanel({ seed, marks, share, answered }: { seed: string; marks: readonly PrintMark[]; share: number; answered: number }) {
  return (
    <aside className={styles.printPanel} aria-label="Your thinking print">
      <ThinkingPrint seed={seed} marks={marks} share={share} label={`Your thinking print, ${answered} ${answered === 1 ? "answer" : "answers"} drawn`} />
      <div className={styles.printWords}>
        <strong>Thinking print</strong>
        <p>Each answer adds strokes in that skill&apos;s colour. A sure answer draws crisp lines, a guess draws soft ones. It never shows right or wrong.</p>
      </div>
      <PrintKey />
    </aside>
  );
}

export function PrintKey() {
  return (
    <ul className={styles.printKey} aria-hidden="true">
      {PRINT_FAMILIES.map((f) => <li key={f.family}><i style={{ background: f.color }} />{f.label}</li>)}
    </ul>
  );
}
