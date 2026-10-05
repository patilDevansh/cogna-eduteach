"use client";

import { useEffect, useMemo, useState } from "react";
import { LOTUS_SELECT_SEPARATOR } from "@cogna/shared";
import { prettyAlgebra } from "./TileGame";
import styles from "./lotus-games.module.css";

/**
 * Game staging for Lotus diagnostic questions. These are skins only: each
 * one sets the same answer text the plain question would, the server marks
 * it, and nothing here shows right or wrong (it's a diagnostic).
 */

/** A lotus with `petals` petals; one grows for every answer, right or wrong. */
export function LotusFlower({ petals, size = 46, bloom = false }: { petals: number; size?: number; bloom?: boolean }) {
  const n = Math.max(0, Math.min(8, petals));
  return (
    <svg viewBox="0 0 60 56" width={size} height={size * 0.93} aria-hidden="true" className={bloom ? styles.bloom : undefined}>
      <ellipse cx="30" cy="50" rx="24" ry="5" fill="#5fae7d" />
      {Array.from({ length: n }, (_, i) => {
        const angle = n === 1 ? 0 : -72 + (144 * i) / (n - 1);
        return (
          <g key={i} transform={`rotate(${angle} 30 46)`}>
            <ellipse cx="30" cy={bloom ? 24 : 28} rx={bloom ? 7.5 : 6} ry={bloom ? 18 : 14} fill="#f6b3c8" stroke="#e07ba0" strokeWidth="1.2" className={styles.petal} style={{ animationDelay: `${bloom ? i * 80 : 0}ms` }} />
          </g>
        );
      })}
      <circle cx="30" cy="44" r="4" fill="#f2c14e" />
    </svg>
  );
}

/** The pond: a lily pad per question, the frog hops after every answer. */
export function PondMap({ answered, total }: { answered: number; total: number }) {
  const pads = Math.min(Math.max(total, 1), 12);
  const at = Math.min(answered, pads - 1);
  return (
    <div className={styles.pond} aria-label={`${answered} answered`}>
      {Array.from({ length: pads }, (_, i) => (
        <i key={i} className={styles.pad} data-done={i < answered || undefined} style={{ left: `${4 + (i * 84) / Math.max(pads - 1, 1)}%`, bottom: i % 2 ? 18 : 10 }} />
      ))}
      <span key={answered} className={styles.frog} style={{ left: `${3 + (at * 84) / Math.max(pads - 1, 1)}%`, bottom: (at % 2 ? 18 : 10) + 8 }} aria-hidden="true">🐸</span>
      <span className={styles.flower}><LotusFlower petals={Math.min(answered, 8)} size={40} /></span>
      <span className={styles.petals}>{answered} petal{answered === 1 ? "" : "s"}</span>
    </div>
  );
}

/** Catch the firefly: one of the options, drifting in a night sky. No clock. */
export function FireflyChoice({ options, value, disabled, onChange }: { options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div className={styles.night} role="radiogroup" aria-label="Catch a firefly">
      {options.map((option, i) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={styles.fly}
          data-caught={value === option || undefined}
          disabled={disabled}
          style={{ left: `${6 + ((i * 23) % 70)}%`, top: `${14 + ((i * 41) % 58)}%`, animationDuration: `${2.6 + i * 0.5}s`, ["--fx" as string]: `${(i % 2 ? 1 : -1) * (10 + i * 4)}px`, ["--fy" as string]: `${(i % 3) * 8 - 10}px` }}
          onClick={() => onChange(option)}
        >
          {prettyAlgebra(option)}
        </button>
      ))}
    </div>
  );
}

const CRITTERS = ["#7fc8a9", "#9db4f0", "#f2b880", "#d6a6e8", "#9fd8c0", "#f6b3c8"];

/** Spot the impostor: critters each hold an expression; one of them isn't what it claims. */
export function ImpostorChoice({ options, value, disabled, onChange }: { options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div className={styles.crits} role="radiogroup" aria-label="Which one is the impostor?">
      {options.map((option, i) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} className={styles.crit} data-picked={value === option || undefined} disabled={disabled} style={{ animationDelay: `${i * 0.3}s` }} onClick={() => onChange(option)}>
          <svg viewBox="0 0 60 50" width="54" height="44" aria-hidden="true">
            <path d="M8 42 Q4 14 30 10 Q56 14 52 42 Z" fill={CRITTERS[i % CRITTERS.length]} />
            <circle cx="22" cy="26" r="6" fill="#fff" /><circle cx="38" cy="26" r="6" fill="#fff" />
            <circle cx={23 + (i % 2)} cy="27" r="3" fill="#16241d" /><circle cx={39 - (i % 2)} cy="27" r="3" fill="#16241d" />
            <path d={`M24 36 Q30 ${i % 2 ? 40 : 34} 36 36`} stroke="#16241d" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          <span className={styles.sign}>{prettyAlgebra(option)}</span>
        </button>
      ))}
    </div>
  );
}

/** Detective: the working appears line by line; tap the first line that goes wrong, or say nothing is wrong. */
export function DetectiveLines({ lines, options, value, disabled, onChange }: { lines: string[]; options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const timers = lines.map((_, i) => window.setTimeout(() => setShown(i + 1), 450 + i * 600));
    return () => timers.forEach(window.clearTimeout);
  }, [lines]);
  const nothing = options.find((o) => !/^Line \d+$/.test(o));
  return (
    <div className={styles.caseFile}>
      <p className={styles.caseLabel}>🔍 Case file</p>
      <ol className={styles.lines}>
        {lines.map((line, i) => {
          const option = `Line ${i}`;
          const pickable = i > 0 && options.includes(option);
          return (
            <li key={i} className={styles.line} data-in={i < shown || undefined}>
              <button type="button" disabled={disabled || !pickable || i >= shown} data-picked={value === option || undefined} onClick={() => onChange(option)} aria-label={pickable ? `${option}: ${line}` : line}>
                <span className={styles.lineNo}>{i === 0 ? "" : `${i}`}</span>
                <span className={styles.eq}>{i === 0 ? "" : "="}</span>
                <span>{prettyAlgebra(line)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {nothing && (
        <button type="button" className={styles.nothing} data-picked={value === nothing || undefined} disabled={disabled || shown < lines.length} onClick={() => onChange(nothing)}>
          {nothing}
        </button>
      )}
    </div>
  );
}

/** Fishing: net every fish that fits. The answer is the netted options, in any order. */
export function FishingSelect({ options, value, disabled, onChange }: { options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const netted = useMemo(() => new Set(value ? value.split(LOTUS_SELECT_SEPARATOR) : []), [value]);
  function toggle(option: string) {
    const next = new Set(netted);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(options.filter((o) => next.has(o)).join(LOTUS_SELECT_SEPARATOR));
  }
  return (
    <div className={styles.fishpond} role="group" aria-label="Net the fish">
      {options.map((option, i) => (
        <button
          key={option}
          type="button"
          aria-pressed={netted.has(option)}
          className={styles.fish}
          disabled={disabled}
          style={{ top: 8 + i * 44, animationDuration: `${7 + (i % 3) * 2}s`, animationDelay: `-${i * 1.3}s` }}
          onClick={() => toggle(option)}
        >
          <svg viewBox="0 0 40 24" width="32" height="19" aria-hidden="true"><path d="M2 12 L10 4 L10 20 Z" fill="#f08a5d" /><ellipse cx="24" cy="12" rx="14" ry="9" fill="#f6a96b" /><circle cx="31" cy="10" r="2" fill="#16241d" /></svg>
          <span className={styles.tag}>{prettyAlgebra(option)}</span>
          {netted.has(option) && <span aria-hidden="true">🎣</span>}
        </button>
      ))}
    </div>
  );
}

/** Shown when the diagnostic ends: the child sees their lotus bloom, never a score. */
export function LotusBloom({ answered, firstName }: { answered: number; firstName?: string }) {
  return (
    <div className={styles.bloomCard}>
      <LotusFlower petals={Math.max(5, Math.min(8, answered))} size={110} bloom />
      <div>
        <p className={styles.bloomEyebrow}>Your lotus bloomed</p>
        <h3>{firstName ? `Well done, ${firstName}.` : "Well done."} You crossed {answered} stone{answered === 1 ? "" : "s"}.</h3>
        <p>Your teacher will see how you got on, and your first lesson is being made from your answers.</p>
      </div>
    </div>
  );
}
