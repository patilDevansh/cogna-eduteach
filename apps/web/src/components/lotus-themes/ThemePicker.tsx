"use client";

import { LOTUS_OFFERED_THEMES, LOTUS_THEME_NAMES, type LotusTheme, type LotusThemeSettings } from "@cogna/shared";
import { ThemeProgress } from "./ThemeProgress";
import styles from "./lotus-themes.module.css";

const BLURB: Record<LotusTheme, { line: string; builds: string }> = {
  sevenways: { line: "A studio where the motion is the maths.", builds: "A thinking print" },
  studio: { line: "Calm and plain.", builds: "A print that grows with your work" },
  drafting: { line: "An architect's desk on blueprint paper.", builds: "A building, floor by floor" },
  cabinet: { line: "A cabinet of brass and walnut mechanisms.", builds: "Sixteen drawers to open" },
  soundlab: { line: "A producer's desk of pads and faders.", builds: "A track you can play back" },
};

/**
 * The four looks a student can take Lotus in. Same questions, same maths,
 * same marking in every one; only the dress changes. When a teacher has
 * locked the class, the choice is replaced by a plain note.
 */
export function ThemePicker({ settings, ready = true, busy, onChoose }: { settings: LotusThemeSettings; ready?: boolean; busy?: boolean; onChoose: (theme: LotusTheme) => void }) {
  // With one look on offer there is nothing to choose, so nothing on the page repaints.
  if (LOTUS_OFFERED_THEMES.length < 2) return null;
  if (!ready) return <p className={styles.pickerHint} role="status">Getting your look ready…</p>;
  if (settings.lockedTheme) {
    return (
      <p className={styles.lockNote} role="status">
        Your teacher chose the <b>{LOTUS_THEME_NAMES[settings.lockedTheme]}</b> look for this class.
      </p>
    );
  }
  return (
    <fieldset className={styles.picker} disabled={busy}>
      <legend>Pick a look for your test</legend>
      <p className={styles.pickerHint}>The questions and the maths are the same in every look. Choose the one you like; it stays the same for this test.</p>
      <div className={styles.cards} role="radiogroup" aria-label="Look for your test">
        {LOTUS_OFFERED_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={settings.effective === theme}
            className={styles.card}
            data-lotus-theme={theme}
            data-lotus-theme-card={theme}
            data-selected={settings.effective === theme || undefined}
            onClick={() => onChoose(theme)}
          >
            <span className={styles.cardArt}><ThemeProgress theme={theme} answered={12} total={25} /></span>
            {settings.effective === theme && <span className={styles.cardCheck} aria-hidden="true">✓</span>}
            <strong>{LOTUS_THEME_NAMES[theme]}</strong>
            <span>{BLURB[theme].line}</span>
            <em>{BLURB[theme].builds}</em>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
