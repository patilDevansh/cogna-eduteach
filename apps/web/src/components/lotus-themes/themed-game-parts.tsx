"use client";

import styles from "./themed-game.module.css";

/** Pieces the themed games share. */

export const signed = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

/** Steps a whole number up or down, skipping 0 (a bracket of x + 0 is not an answer here). */
export function Stepper({ label, value, range, disabled, showPlus, allowZero, min, onChange }: { label: string; value: number; range: number; disabled?: boolean; showPlus?: boolean; /** x = 0 is a value to try, not a number to skip. */ allowZero?: boolean; /** The lowest value; defaults to −range. */ min?: number; onChange: (next: number) => void }) {
  const step = (d: number) => {
    let next = value + d;
    if (next === 0 && !allowZero) next += d;
    onChange(Math.max(min ?? -range, Math.min(range, next)));
  };
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <span className={styles.stepLabel}>{label}</span>
      <div className={styles.stepRow}>
        <button type="button" className={styles.stepBtn} disabled={disabled || value <= (min ?? -range)} onClick={() => step(-1)} aria-label={`${label}: lower`}>‹</button>
        <output className={styles.stepValue} aria-live="polite">{showPlus ? `${value < 0 ? "−" : "+"} ${Math.abs(value)}` : signed(value)}</output>
        <button type="button" className={styles.stepBtn} disabled={disabled || value >= range} onClick={() => step(1)} aria-label={`${label}: higher`}>›</button>
      </div>
    </div>
  );
}

