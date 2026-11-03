"use client";

import type { LotusTheme } from "@cogna/shared";
import { ThemeProgress } from "./ThemeProgress";
import { ThinkingPrint, PrintKey } from "./ThinkingPrint";
import type { PrintMark } from "./thinking-print";
import sevenStyles from "./seven-ways.module.css";
import styles from "./lotus-themes.module.css";

/**
 * The end of the test, in the student's look: the progress art drawn finished,
 * with one line in the theme's own words. It says the check is done and never
 * how it went.
 */
const FINISH_WORDS: Record<LotusTheme, { title: string; count: (n: number) => string }> = {
  sevenways: { title: "Your thinking print", count: (n) => `${n} ${n === 1 ? "answer" : "answers"} drawn. No one else has this print.` },
  studio: { title: "Your thinking print is finished", count: (n) => `${n} ${n === 1 ? "ring" : "rings"} drawn` },
  drafting: { title: "The building is complete", count: (n) => `${n} ${n === 1 ? "sheet" : "sheets"} issued` },
  cabinet: { title: "Every drawer is open", count: (n) => `${n} ${n === 1 ? "file" : "files"} consulted` },
  soundlab: { title: "The track is recorded", count: (n) => `${n} ${n === 1 ? "take" : "takes"} laid down` },
};

export function ThemeFinish({ theme, answered, print }: { theme: LotusTheme; answered: number; /** Seven Ways: the student's own print. */ print?: { seed: string; marks: readonly PrintMark[] } }) {
  const words = FINISH_WORDS[theme];
  return (
    <figure className={styles.finish} data-theme-finish={theme}>
      {theme === "sevenways" && print
        ? <><div className={sevenStyles.finishPrint}><ThinkingPrint seed={print.seed} marks={print.marks} share={1} label={`Your finished thinking print, ${answered} answers drawn`} /></div><PrintKey /></>
        : <ThemeProgress theme={theme} answered={answered} complete />}
      <figcaption className={styles.finishText}>
        <strong>{words.title}</strong>
        <span>{words.count(answered)}</span>
      </figcaption>
    </figure>
  );
}
