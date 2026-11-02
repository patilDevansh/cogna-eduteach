"use client";

import type { ReactElement } from "react";
import type { LotusTheme } from "@cogna/shared";
import styles from "./lotus-themes.module.css";

/**
 * Progress art, one per theme. It grows with every question finished, right or
 * wrong, so it never rewards guessing and never reveals a mark. The plan's
 * length changes as Lotus adapts, so none of these show "of N".
 */
export interface ThemeProgressProps {
  theme: LotusTheme;
  answered: number;
  /** Only sizes the art; never shown as a number. */
  total?: number;
}

const FLOORS = 10;
const DRAWERS = 16;
const SEQ_COLS = 16;
const SEQ_ROWS = ["#ff6a1a", "#ffd23f", "#3ee0b4", "#7aa2ff", "#ff4f6b"];

/** Drafting Room: a building section drawn floor by floor. */
function Building({ answered }: { answered: number }) {
  const done = Math.min(answered, FLOORS);
  const w = 150, floorH = 13, base = 128;
  return (
    <svg viewBox="0 0 220 150" className={styles.art} role="img" aria-label={`${answered} questions finished`}>
      <line x1="10" y1={base} x2="210" y2={base} stroke="var(--ink-soft)" strokeWidth="1.5" />
      {Array.from({ length: FLOORS }, (_, i) => {
        const y = base - (i + 1) * floorH;
        const built = i < done;
        return (
          <g key={i} className={built ? styles.rise : undefined}>
            <rect x={35} y={y} width={w} height={floorH} fill={built ? "rgba(255,209,102,.14)" : "none"} stroke={built ? "var(--accent)" : "var(--line-strong)"} strokeDasharray={built ? undefined : "3 3"} strokeWidth="1.2" />
            {built && [0, 1, 2, 3].map((k) => <rect key={k} x={50 + k * 34} y={y + 3} width="14" height="7" fill="none" stroke="var(--ink-soft)" strokeWidth=".8" />)}
          </g>
        );
      })}
      {done >= FLOORS && <path d={`M30 ${base - FLOORS * floorH} L110 ${base - FLOORS * floorH - 18} L190 ${base - FLOORS * floorH} Z`} fill="none" stroke="var(--accent)" strokeWidth="1.4" />}
      {done > 0 && <text x="195" y={base - done * floorH + 9} fontSize="9" fill="var(--accent)" fontFamily="var(--font-math)">▸ +{(done * 3.2).toFixed(1)}m</text>}
    </svg>
  );
}

/** The Cabinet: a wall of 16 drawers; each answer opens one, and a gear turns. */
function Drawers({ answered }: { answered: number }) {
  const open = Math.min(answered, DRAWERS);
  return (
    <div className={styles.cabinet} role="img" aria-label={`${answered} questions finished`}>
      <div className={styles.drawerGrid}>
        {Array.from({ length: DRAWERS }, (_, i) => (
          <span key={i} className={styles.drawer} data-open={i < open || undefined}>
            <i className={styles.gem} />
            <b className={styles.front}><u /></b>
          </span>
        ))}
      </div>
      <svg viewBox="0 0 40 40" className={styles.gear} data-turning={answered > 0 || undefined} aria-hidden="true">
        <g fill="none" stroke="var(--accent)" strokeWidth="2">
          <circle cx="20" cy="20" r="7" />
          {Array.from({ length: 8 }, (_, i) => <line key={i} x1="20" y1="3" x2="20" y2="9" transform={`rotate(${i * 45} 20 20)`} />)}
        </g>
      </svg>
    </div>
  );
}

/** Studio: a thinking print; one ring per answer, a little different each time. */
function Print({ answered }: { answered: number }) {
  const rings = Math.min(answered, 14);
  return (
    <svg viewBox="-60 -60 120 120" className={styles.print} role="img" aria-label={`${answered} questions finished`}>
      <circle r="52" fill="var(--accent-wash)" />
      {Array.from({ length: rings }, (_, i) => {
        const r = 6 + i * 3.4;
        const wobble = ((i * 37) % 7) / 10;
        return (
          <ellipse key={i} rx={r + wobble} ry={r - wobble} transform={`rotate(${(i * 23) % 90})`} fill="none" stroke="var(--accent)" strokeOpacity={0.35 + (i % 4) * 0.15} strokeWidth={1 + (i % 3) * 0.6} className={i === rings - 1 ? styles.ringIn : undefined} />
        );
      })}
      {rings === 0 && <circle r="3" fill="var(--accent)" />}
    </svg>
  );
}

/** Sound Lab: a 16-step track; each answer lights a pad. */
function Sequencer({ answered }: { answered: number }) {
  const lit = Math.min(answered, SEQ_COLS * SEQ_ROWS.length);
  const on = new Set<string>();
  for (let i = 0; i < lit; i++) on.add(`${i % SEQ_ROWS.length}:${i % SEQ_COLS}`);
  return (
    <div className={styles.seq} role="img" aria-label={`${answered} questions finished`}>
      {SEQ_ROWS.map((color, row) => (
        <div key={row} className={styles.seqRow}>
          {Array.from({ length: SEQ_COLS }, (_, col) => (
            <i key={col} className={styles.pad} data-on={on.has(`${row}:${col}`) || undefined} style={{ ["--c" as string]: color }} />
          ))}
        </div>
      ))}
    </div>
  );
}

const ART: Record<LotusTheme, (props: { answered: number }) => ReactElement> = {
  drafting: Building,
  cabinet: Drawers,
  studio: Print,
  soundlab: Sequencer,
};

export function ThemeProgress({ theme, answered }: ThemeProgressProps) {
  const Art = ART[theme];
  return (
    <div className={styles.progress} data-theme-progress={theme}>
      <Art answered={answered} />
    </div>
  );
}
