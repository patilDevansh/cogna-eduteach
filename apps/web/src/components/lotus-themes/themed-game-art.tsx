"use client";

import type { ReactElement } from "react";
import type { LotusTheme } from "@cogna/shared";
import { signed } from "./themed-game-parts";
import styles from "./themed-game.module.css";

/**
 * The objects the themed games are played on: dials, a balance, padlocks,
 * weights. Decoration that redraws from the student's own numbers. Nothing here
 * knows the answer, and no picture ever says right or wrong.
 */

// ---------- Two numbers ----------

function BrassDial({ cx, value }: { cx: number; value: number }) {
  return (
    <g transform={`translate(${cx} 96)`}>
      <circle r="64" fill="url(#lotus-brass)" stroke="#5a3d0e" strokeWidth="2" />
      <g className={styles.turn} style={{ transform: `rotate(${value * 20}deg)` }}>
        {Array.from({ length: 24 }, (_, i) => <line key={i} x1="0" y1="-60" x2="0" y2={i % 6 === 0 ? -48 : -54} stroke="#5a3d0e" strokeWidth={i % 6 === 0 ? 2.4 : 1.2} transform={`rotate(${i * 15})`} />)}
      </g>
      <circle r="36" fill="#2a1906" stroke="#8a6420" strokeWidth="2" />
      <text y="11" textAnchor="middle" fontSize="30" fill="#f4dc92" fontFamily="var(--font-math)">{signed(value)}</text>
      <path d="M-9 -78 L0 -62 L9 -78 Z" fill="#e88a6c" stroke="#7d1a12" />
    </g>
  );
}

function RoomPlan({ p, q }: { p: number; q: number }) {
  const base = 104;
  const w = Math.max(14, base + p * 10);
  const h = Math.max(14, base + q * 10);
  const left = 62;
  const top = 44;
  return (
    <svg viewBox="0 0 330 290" className={styles.art} aria-hidden="true">
      <defs>
        <pattern id="lotus-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--accent)" strokeOpacity=".28" strokeWidth="1.2" /></pattern>
      </defs>
      <rect x={left} y={top} width={w} height={h} fill="url(#lotus-hatch)" stroke="var(--ink)" strokeWidth="2" className={styles.grow} style={{ width: w, height: h }} />
      <rect x={left} y={top} width={base} height={base} fill="none" stroke="var(--ink-faint)" strokeDasharray="5 4" />
      <text x={left + base / 2} y={top + base / 2 + 5} textAnchor="middle" fontSize="15" fill="var(--ink-soft)" fontFamily="var(--font-math)">x²</text>
      <path d={`M${left} 24 V34 M${left} 29 H${left + w} M${left + w} 24 V34`} stroke="var(--accent)" strokeWidth="1.4" fill="none" />
      <text x={left + w / 2} y="18" textAnchor="middle" fontSize="14" fill="var(--accent)" fontFamily="var(--font-math)">x {p < 0 ? "−" : "+"} {Math.abs(p)}</text>
      <path d={`M42 ${top} H52 M47 ${top} V${top + h} M42 ${top + h} H52`} stroke="var(--accent)" strokeWidth="1.4" fill="none" />
      <text transform={`translate(32 ${top + h / 2}) rotate(-90)`} textAnchor="middle" fontSize="14" fill="var(--accent)" fontFamily="var(--font-math)">x {q < 0 ? "−" : "+"} {Math.abs(q)}</text>
    </svg>
  );
}

function Oscilloscope({ p, q }: { p: number; q: number }) {
  const wave = (n: number, y: number, color: string) => {
    const f = Math.min(9, Math.abs(n)) / 1.6 + 0.6;
    const d = Array.from({ length: 121 }, (_, i) => `${i ? "L" : "M"}${10 + i * 2.5} ${y - Math.sin((i / 120) * Math.PI * 2 * f) * 26 * (n < 0 ? -1 : 1)}`).join(" ");
    return <path d={d} fill="none" stroke={color} strokeWidth="2.4" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />;
  };
  return (
    <svg viewBox="0 0 320 200" className={styles.art} aria-hidden="true">
      {[50, 100, 150].map((y) => <line key={y} x1="10" y1={y} x2="310" y2={y} stroke="#2b2c31" />)}
      {Array.from({ length: 13 }, (_, i) => <line key={i} x1={10 + i * 25} y1="10" x2={10 + i * 25} y2="190" stroke="#1d1e22" />)}
      <text x="14" y="24" fontSize="17" fill="#ff8a3d" fontFamily="var(--font-label)">OSC A · {signed(p)}</text>
      <text x="14" y="124" fontSize="17" fill="#ffd23f" fontFamily="var(--font-label)">OSC B · {signed(q)}</text>
      {wave(p, 56, "#ff6a1a")}{wave(q, 150, "#ffd23f")}
    </svg>
  );
}

function PlainBars({ p, q, productLabel, sumLabel }: { p: number; q: number; productLabel: string; sumLabel: string }) {
  const row = (label: string, value: number, unit: number, y: number) => {
    const width = Math.min(130, Math.abs(value) * unit);
    return (
      <g>
        <text x="20" y={y - 12} fontSize="13" fill="var(--ink-soft)" fontFamily="var(--font-math)">{label} {signed(value)}</text>
        <rect x="20" y={y} width="280" height="16" rx="8" fill="var(--line)" />
        <rect x={value < 0 ? 160 - width : 160} y={y} width={width} height="16" rx="8" fill="var(--accent)" className={styles.grow} style={{ width, x: value < 0 ? 160 - width : 160 }} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 320 170" className={styles.art} aria-hidden="true">
      <line x1="160" y1="16" x2="160" y2="150" stroke="var(--ink-faint)" strokeDasharray="3 4" />
      {row(productLabel, p * q, 3.2, 48)}
      {row(sumLabel, p + q, 8, 118)}
    </svg>
  );
}

export function TwoNumbersArt({ theme, p, q, productLabel, sumLabel }: { theme: LotusTheme; p: number; q: number; productLabel: string; sumLabel: string }): ReactElement {
  if (theme === "drafting") return <RoomPlan p={p} q={q} />;
  if (theme === "soundlab") return <Oscilloscope p={p} q={q} />;
  if (theme === "cabinet") {
    return (
      <svg viewBox="0 0 340 192" className={styles.art} aria-hidden="true">
        <defs>
          <radialGradient id="lotus-brass" cx="40%" cy="32%"><stop offset="0" stopColor="#f4dc92" /><stop offset=".6" stopColor="#c9a24a" /><stop offset="1" stopColor="#6b4a14" /></radialGradient>
        </defs>
        <rect x="4" y="4" width="332" height="184" rx="8" fill="#1d4a3f" stroke="#c9a24a" strokeWidth="3" />
        <rect x="14" y="14" width="312" height="164" rx="4" fill="none" stroke="#c9a24a" strokeOpacity=".3" />
        <BrassDial cx={92} value={p} />
        <BrassDial cx={248} value={q} />
      </svg>
    );
  }
  return <PlainBars p={p} q={q} productLabel={productLabel} sumLabel={sumLabel} />;
}

// ---------- Tokens for "split your confidence" ----------

export function Token({ theme }: { theme: LotusTheme }): ReactElement {
  if (theme === "cabinet") {
    return (
      <svg viewBox="0 0 34 34" className={styles.tokenArt} aria-hidden="true">
        <defs><linearGradient id="lotus-weight" x1="0" x2="1"><stop offset="0" stopColor="#8a6420" /><stop offset=".5" stopColor="#f4dc92" /><stop offset="1" stopColor="#8a6420" /></linearGradient></defs>
        <path d="M11 10 H23 L27 30 H7 Z" fill="url(#lotus-weight)" stroke="#5a3d0e" />
        <rect x="14" y="3" width="6" height="7" rx="2.5" fill="none" stroke="#c9a24a" strokeWidth="2" />
      </svg>
    );
  }
  if (theme === "drafting") {
    return (
      <svg viewBox="0 0 34 34" className={styles.tokenArt} aria-hidden="true">
        <line x1="17" y1="17" x2="17" y2="32" stroke="#f4f8ff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="17" cy="11" r="9" fill="#ff8a76" stroke="#7d1a12" />
        <circle cx="14" cy="8" r="2.4" fill="#ffd8cf" />
      </svg>
    );
  }
  if (theme === "soundlab") return <i className={styles.tokenLed} aria-hidden="true" />;
  return <i className={styles.tokenDot} aria-hidden="true" />;
}

// ---------- Four sign cases ----------

export function CaseArt({ theme, set }: { theme: LotusTheme; set: boolean }): ReactElement | null {
  if (theme === "cabinet") {
    return (
      <svg viewBox="0 0 120 112" className={styles.caseArt} aria-hidden="true">
        <defs><linearGradient id="lotus-lock" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#c9a24a" /><stop offset="1" stopColor="#6b4a14" /></linearGradient></defs>
        <path d="M38 54 V34 a22 22 0 0 1 44 0 V54" fill="none" stroke="#c9a24a" strokeWidth="9" strokeLinecap="round" className={styles.shackle} data-open={set || undefined} />
        <rect x="22" y="52" width="76" height="56" rx="11" fill="url(#lotus-lock)" stroke="#5a3d0e" strokeWidth="2" />
        <circle cx="60" cy="74" r="7" fill="#1a0f06" />
        <rect x="57" y="76" width="6" height="16" rx="3" fill="#1a0f06" />
      </svg>
    );
  }
  if (theme === "drafting") {
    const glass = set ? "var(--accent)" : "none";
    return (
      <svg viewBox="0 0 160 100" className={styles.caseArt} aria-hidden="true">
        <path d="M6 96 H154" stroke="var(--ink-soft)" strokeWidth="2" />
        <path d="M30 96 V44 L80 12 L130 44 V96" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M20 50 L80 10 L140 50" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
        {[44, 98].map((x) => <rect key={x} x={x} y="52" width="20" height="18" fill={glass} fillOpacity=".55" stroke="var(--ink-soft)" className={styles.glass} />)}
        <rect x="70" y="70" width="20" height="26" fill="none" stroke="var(--ink-soft)" />
      </svg>
    );
  }
  if (theme === "soundlab") {
    return (
      <svg viewBox="0 0 120 92" className={styles.caseArt} aria-hidden="true">
        <rect x="24" y="6" width="72" height="80" rx="12" fill={set ? "#ff6a1a" : "#2a2b30"} stroke={set ? "#ffb36b" : "#3a3b40"} strokeWidth="2" className={styles.glass} style={set ? { filter: "drop-shadow(0 0 10px rgba(255,106,26,.6))" } : undefined} />
        <circle cx="60" cy="46" r="12" fill={set ? "#c44a08" : "#17181b"} />
      </svg>
    );
  }
  return null;
}

// ---------- Test the claim ----------

function Balance({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const angle = Math.max(-1, Math.min(1, (b - a) / 30)) * 13;
  const r = (angle * Math.PI) / 180;
  const pan = (side: -1 | 1, value: number, label: string) => {
    const x = 300 + side * 200 * Math.cos(r);
    const y = 70 + side * 200 * Math.sin(r);
    return (
      <g className={styles.swing} style={{ transform: `translate(${x}px, ${y}px)` }}>
        <path d="M0 0 L-58 100 M0 0 L58 100" stroke="#f3e6cc" strokeOpacity=".5" />
        <path d="M-74 100 Q0 138 74 100 Z" fill="#c9a24a" stroke="#6b4a14" />
        <text y="166" textAnchor="middle" fontSize="16" fill="#f3e6cc" fontFamily="var(--font-math)">{label}</text>
        <text y="196" textAnchor="middle" fontSize="28" fill="#f4dc92" fontFamily="var(--font-math)">{value}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 600 320" className={styles.art} aria-hidden="true">
      <rect x="284" y="72" width="32" height="208" fill="#8a6420" />
      <rect x="226" y="276" width="148" height="20" rx="4" fill="#5a3d0e" />
      <g className={styles.swing} style={{ transform: `rotate(${angle}deg)`, transformOrigin: "300px 70px" }}>
        <rect x="92" y="63" width="416" height="13" rx="6" fill="#c9a24a" stroke="#6b4a14" />
      </g>
      <circle cx="300" cy="70" r="11" fill="#f4dc92" stroke="#6b4a14" />
      {pan(-1, a, labelA)}
      {pan(1, b, labelB)}
    </svg>
  );
}

function Meters({ a, b, labelA, labelB, top }: { a: number; b: number; labelA: string; labelB: string; top: number }) {
  const SEGMENTS = 16;
  const column = (x: number, value: number, label: string, tag: string) => {
    const lit = value <= 0 ? 0 : Math.max(1, Math.round((value / top) * SEGMENTS));
    return (
      <g>
        <text x={x + 34} y="18" textAnchor="middle" fontSize="16" fill="#85868b" fontFamily="var(--font-label)">{tag}</text>
        {Array.from({ length: SEGMENTS }, (_, i) => <rect key={i} x={x} y={190 - i * 11} width="68" height="8" rx="1.5" fill={i < lit ? (i > 11 ? "#ff6a1a" : "#3ee0b4") : "#232428"} />)}
        <text x={x + 34} y="226" textAnchor="middle" fontSize="28" fill="#ff8a3d" fontFamily="var(--font-label)">{value}</text>
        <text x={x + 34} y="250" textAnchor="middle" fontSize="14" fill="#b4b4b0" fontFamily="var(--font-math)">{label}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 420 260" className={styles.art} aria-hidden="true">
      {column(60, a, labelA, "SIGNAL A")}
      {column(292, b, labelB, "SIGNAL B")}
      <text x="210" y="124" textAnchor="middle" fontSize="42" fill="#ecebe6" fontFamily="var(--font-label)">{a === b ? "=" : "≠"}</text>
    </svg>
  );
}

function RoomAudit({ a, b, labelA, labelB, top }: { a: number; b: number; labelA: string; labelB: string; top: number }) {
  const room = (x: number, value: number, label: string, tag: string) => {
    const side = Math.max(6, Math.sqrt(value / top) * 140);
    const y = 180 - side;
    return (
      <g>
        <text x={x + 70} y="20" textAnchor="middle" fontSize="13" fill="var(--ink-soft)" fontFamily="var(--font-math)">{tag}: {label}</text>
        <rect x={x + 70 - side / 2} y={y} width={side} height={side} fill="rgba(255,209,102,.14)" stroke="var(--accent)" strokeWidth="2" className={styles.grow} style={{ width: side, height: side, x: x + 70 - side / 2, y }} />
        <text x={x + 70} y="212" textAnchor="middle" fontSize="20" fill="var(--accent)" fontFamily="var(--font-math)">area {value}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 420 228" className={styles.art} aria-hidden="true">
      <path d="M10 180 H410" stroke="var(--ink-faint)" />
      {room(20, a, labelA, "A")}
      {room(260, b, labelB, "B")}
      <text x="210" y="112" textAnchor="middle" fontSize="34" fill="var(--ink)" fontFamily="var(--font-math)">{a === b ? "=" : "≠"}</text>
    </svg>
  );
}

function PlainCompare({ a, b, labelA, labelB, top }: { a: number; b: number; labelA: string; labelB: string; top: number }) {
  const bar = (y: number, value: number, label: string) => {
    const width = Math.max(10, (value / top) * 280);
    return (
      <g>
        <text x="20" y={y - 10} fontSize="15" fill="var(--ink-soft)" fontFamily="var(--font-math)">{label}</text>
        <text x="400" y={y - 10} textAnchor="end" fontSize="22" fill="var(--ink)" fontFamily="var(--font-math)">{value}</text>
        <rect x="20" y={y} width="380" height="20" rx="10" fill="var(--line)" />
        <rect x="20" y={y} width={(width / 280) * 380} height="20" rx="10" fill="var(--accent)" className={styles.grow} style={{ width: (width / 280) * 380 }} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 420 170" className={styles.art} aria-hidden="true">
      {bar(40, a, labelA)}
      {bar(128, b, labelB)}
      <text x="210" y="96" textAnchor="middle" fontSize="26" fill="var(--ink-soft)" fontFamily="var(--font-math)">{a === b ? "=" : "≠"}</text>
    </svg>
  );
}

export function CompareArt({ theme, a, b, labelA, labelB }: { theme: LotusTheme; a: number; b: number; labelA: string; labelB: string }): ReactElement {
  const top = Math.max(a, b, 1);
  if (theme === "cabinet") return <Balance a={a} b={b} labelA={labelA} labelB={labelB} />;
  if (theme === "soundlab") return <Meters a={a} b={b} labelA={labelA} labelB={labelB} top={top} />;
  if (theme === "drafting") return <RoomAudit a={a} b={b} labelA={labelA} labelB={labelB} top={top} />;
  return <PlainCompare a={a} b={b} labelA={labelA} labelB={labelB} top={top} />;
}

// ---------- Order the steps ----------

function gearPath(teeth: number, inner: number, outer: number): string {
  let d = "";
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 ? inner : outer;
    const from = (i / (teeth * 2)) * Math.PI * 2;
    const to = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    d += `${i ? "L" : "M"}${(Math.cos(from) * r).toFixed(2)} ${(Math.sin(from) * r).toFixed(2)} L${(Math.cos(to) * r).toFixed(2)} ${(Math.sin(to) * r).toFixed(2)} `;
  }
  return `${d}Z`;
}

/** What marks a step in this look: a gear in the Cabinet, nothing in the others (their card itself is the object). */
export function StepMark({ theme }: { theme: LotusTheme }): ReactElement | null {
  if (theme !== "cabinet") return null;
  return (
    <svg viewBox="-20 -20 40 40" className={styles.stepMark} aria-hidden="true">
      <path d={gearPath(10, 13, 18)} fill="#c9a24a" stroke="#2a1906" />
      <circle r="5.5" fill="#1a0f06" />
    </svg>
  );
}

// ---------- Chunk it ----------

export function ChunkArt({ theme, chunk }: { theme: LotusTheme; chunk: string }): ReactElement {
  const box = theme === "cabinet" ? { fill: "#6b4423", line: "#c9a24a", ink: "#f4dc92" }
    : theme === "soundlab" ? { fill: "#2a2b30", line: "#ff6a1a", ink: "#ff8a3d" }
    : theme === "drafting" ? { fill: "rgba(255,209,102,.12)", line: "var(--accent)", ink: "var(--accent)" }
    : theme === "sevenways" ? { fill: "var(--violet-wash)", line: "var(--violet)", ink: "var(--violet)" }
    : { fill: "var(--accent)", line: "var(--accent)", ink: "#fff" };
  return (
    <svg viewBox="0 0 240 180" className={styles.art} role="img" aria-label={`(${chunk}) treated as one block, A`}>
      <text x="120" y="30" textAnchor="middle" fontSize="20" fill="var(--ink-soft)" fontFamily="var(--font-math)">({chunk})</text>
      <path d="M120 40 V62" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="3 3" />
      <path d="M114 56 L120 66 L126 56" fill="none" stroke="var(--ink-faint)" strokeWidth="2" />
      <rect x="60" y="72" width="120" height="92" rx="8" fill={box.fill} stroke={box.line} strokeWidth="2.5" />
      <text x="120" y="134" textAnchor="middle" fontSize="44" fill={box.ink} fontFamily="var(--font-display)" fontWeight="700">A</text>
    </svg>
  );
}
