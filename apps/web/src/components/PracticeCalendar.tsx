import type { PracticeCalendarDay } from "@cogna/shared";
import styles from "./dashboard.module.css";

/** Minutes -> intensity level 0..4, thresholds chosen so a single short
 * session (5-15 min, per the product's own session-length range) already
 * reads as visible activity rather than "none". */
function levelFor(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 8) return 1;
  if (minutes < 15) return 2;
  if (minutes < 25) return 3;
  return 4;
}

/** GitHub-heatmap-shaped, but softened — a rhythm signal for the parent,
 * never shown to the student, never a streak-loss mechanic. */
export function PracticeCalendar({ days, weeks = 5 }: { days: PracticeCalendarDay[]; weeks?: number }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const totalDays = weeks * 7;
  const cells: Array<{ date: string; level: 0 | 1 | 2 | 3 | 4 }> = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    cells.push({ date: key, level: levelFor(entry?.minutes ?? 0) });
  }

  return (
    <div>
      <div className={styles.cal} role="img" aria-label={`Practice activity over the last ${weeks} weeks`}>
        {cells.map((c) => (
          <span key={c.date} className={c.level > 0 ? styles[`l${c.level}`] : undefined} title={c.date} />
        ))}
      </div>
      <div className={styles.calLegend}>
        Less
        <span className={styles.sw} style={{ background: "var(--line)" }} />
        <span className={styles.sw} style={{ background: "var(--accent-wash)" }} />
        <span className={styles.sw} style={{ background: "#9fcbb8" }} />
        <span className={styles.sw} style={{ background: "var(--accent)" }} />
        <span className={styles.sw} style={{ background: "var(--accent-deep)" }} />
        More
      </div>
    </div>
  );
}
