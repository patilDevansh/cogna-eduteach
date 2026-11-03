"use client";

import type { LotusTheme } from "@cogna/shared";
import { ThemeProgress } from "./ThemeProgress";
import styles from "./lotus-themes.module.css";

/**
 * The end of the test, in the student's look: the progress art drawn finished,
 * with one line in the theme's own words. It says the check is done and never
 * how it went.
 */
const FINISH_WORDS: Record<LotusTheme, { title: string; count: (n: number) => string }> = {
  studio: { title: "Your thinking print is finished", count: (n) => `${n} ${n === 1 ? "ring" : "rings"} drawn` },
  drafting: { title: "The building is complete", count: (n) => `${n} ${n === 1 ? "sheet" : "sheets"} issued` },
  cabinet: { title: "Every drawer is open", count: (n) => `${n} ${n === 1 ? "file" : "files"} consulted` },
  soundlab: { title: "The track is recorded", count: (n) => `${n} ${n === 1 ? "take" : "takes"} laid down` },
};

export function ThemeFinish({ theme, answered }: { theme: LotusTheme; answered: number }) {
  const words = FINISH_WORDS[theme];
  return (
    <figure className={styles.finish} data-theme-finish={theme}>
      <ThemeProgress theme={theme} answered={answered} complete />
      <figcaption className={styles.finishText}>
        <strong>{words.title}</strong>
        <span>{words.count(answered)}</span>
      </figcaption>
    </figure>
  );
}
