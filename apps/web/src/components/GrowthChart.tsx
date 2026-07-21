import type { MasteryTrendPoint } from "@cogna/shared";
import styles from "./dashboard.module.css";

const W = 520;
const H = 190;
const PAD_LEFT = 40;
const PAD_RIGHT = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 40;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

/** value 0..1 -> y pixel, higher value = higher on screen (lower y). */
function yFor(value: number): number {
  return PAD_TOP + PLOT_H * (1 - Math.max(0, Math.min(1, value)));
}

/**
 * Single-concept mastery trend, six-week default window. Y-axis is
 * intentionally labeled in qualitative bands, never a raw percentage —
 * this is a progress signal for a parent, not a grade.
 */
export function GrowthChart({ points }: { points: MasteryTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className={styles.chartWrap}>
        <p className="faint">Not enough weeks of practice yet to show a trend.</p>
      </div>
    );
  }

  const n = points.length;
  const xFor = (i: number) => (n === 1 ? PAD_LEFT + PLOT_W / 2 : PAD_LEFT + (PLOT_W * i) / (n - 1));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.value)}`).join(" ");
  const areaPath = `${linePath} L ${xFor(n - 1)} ${PAD_TOP + PLOT_H} L ${xFor(0)} ${PAD_TOP + PLOT_H} Z`;
  const last = points[points.length - 1]!;

  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mastery trend over recent weeks">
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + PLOT_H} stroke="var(--line)" strokeWidth="1" />
        <line x1={PAD_LEFT} y1={PAD_TOP + PLOT_H} x2={W - PAD_RIGHT} y2={PAD_TOP + PLOT_H} stroke="var(--line)" strokeWidth="1" />
        <line x1={PAD_LEFT} y1={yFor(0.4)} x2={W - PAD_RIGHT} y2={yFor(0.4)} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 5" />
        <line x1={PAD_LEFT} y1={yFor(0.75)} x2={W - PAD_RIGHT} y2={yFor(0.75)} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 5" />

        <text x={PAD_LEFT - 6} y={PAD_TOP + PLOT_H + 3} textAnchor="end" fontSize="11" fill="var(--ink-faint)">Just started</text>
        <text x={PAD_LEFT - 6} y={yFor(0.4) + 3} textAnchor="end" fontSize="11" fill="var(--ink-faint)">Building</text>
        <text x={PAD_LEFT - 6} y={yFor(0.75) + 3} textAnchor="end" fontSize="11" fill="var(--ink-faint)">Strong</text>

        <path d={areaPath} fill="var(--accent-wash)" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {points.slice(0, -1).map((p, i) => (
          <circle key={p.weekStart} cx={xFor(i)} cy={yFor(p.value)} r="3" fill="var(--accent)" />
        ))}
        <circle cx={xFor(n - 1)} cy={yFor(last.value)} r="6" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />

        {points.map((p, i) => (
          <text
            key={p.weekStart}
            x={xFor(i)}
            y={PAD_TOP + PLOT_H + 20}
            textAnchor="middle"
            fontSize="10"
            fontFamily="var(--font-math)"
            fill={i === n - 1 ? "var(--accent-deep)" : "var(--ink-faint)"}
            fontWeight={i === n - 1 ? 700 : 400}
          >
            {i === n - 1 ? "Now" : formatWeek(p.weekStart)}
          </text>
        ))}
      </svg>
      <div className={styles.chartLegend}>
        <span className={styles.swatch} />
        {n > 1 ? "Trend across recent weeks — one session never decides this line." : "First week of data — a trend needs a few more."}
      </div>
    </div>
  );
}

function formatWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}
