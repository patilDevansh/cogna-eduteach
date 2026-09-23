import type { PilotStudentKey } from "@cogna/shared";
import styles from "./personalized-video.module.css";

/**
 * One tall, static line-art illustration per lesson, sized to run behind
 * the slide card and poke out above and below it — the card's own opaque
 * background naturally covers the middle (no clipping/z-index tricks
 * needed, see .slideWrap/.motif), so each design puts its distinctive
 * parts at the very top and very bottom on purpose. Matches the concept
 * metaphor already implicit in that template's narration.
 */

const STROKE = {
  fill: "none",
  strokeWidth: 9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// All three viewBoxes are 240x600, split at y=300 — the card sits centered
// over that midline, so each design puts a full, substantial composition in
// the top 300 and another in the bottom 300, not just a thin connector with
// small end-caps. That's what actually reads as "half above, half below"
// instead of a sliver peeking out.

/** Divya — "keep the equation balanced": beam and pans above, stand and base below. */
function BalanceScaleMotif() {
  return (
    <svg viewBox="0 0 240 600" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <g {...STROKE} stroke="#5f8fb0">
        <circle cx="120" cy="34" r="8" fill="#5f8fb0" stroke="none" />
        <line x1="24" y1="64" x2="216" y2="64" />
        <line x1="24" y1="64" x2="24" y2="122" />
        <line x1="216" y1="64" x2="216" y2="122" />
        <path d="M -6 122 A 30 30 0 0 0 54 122" />
        <path d="M 186 122 A 30 30 0 0 0 246 122" />
        <line x1="120" y1="42" x2="120" y2="566" />
        <line x1="66" y1="566" x2="174" y2="566" />
        <line x1="90" y1="566" x2="90" y2="590" />
        <line x1="150" y1="566" x2="150" y2="590" />
      </g>
    </svg>
  );
}

/** Aarav & Meena — distributive property: one factor above, two terms below. */
function DistributionMotif() {
  return (
    <svg viewBox="0 0 240 600" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <g {...STROKE} stroke="#d68d5f">
        <circle cx="120" cy="70" r="46" />
        <path d="M 88 108 Q 30 280 60 520" />
        <path d="M 48 504 L 60 526 L 78 508" />
        <path d="M 152 108 Q 210 280 180 520" />
        <path d="M 162 508 L 180 526 L 192 504" />
        <rect x="4" y="530" width="66" height="52" rx="12" />
        <rect x="170" y="530" width="66" height="52" rx="12" />
      </g>
    </svg>
  );
}

/** Rohan — "solve, substitute, confirm": worked steps above, a checked answer below. */
function ChecklistMotif() {
  return (
    <svg viewBox="0 0 240 600" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <g {...STROKE} stroke="#9370b8">
        <rect x="50" y="10" width="140" height="580" rx="20" />
        <line x1="78" y1="66" x2="162" y2="66" />
        <line x1="78" y1="104" x2="162" y2="104" />
        <line x1="78" y1="142" x2="130" y2="142" />
        <circle cx="140" cy="500" r="52" />
        <line x1="176" y1="536" x2="214" y2="574" />
        <path d="M 116 500 L 132 518 L 164 476" />
      </g>
    </svg>
  );
}

const MOTIFS: Partial<Record<PilotStudentKey, () => React.JSX.Element>> = {
  aarav: DistributionMotif,
  meena: DistributionMotif,
  rohan: ChecklistMotif,
  divya: BalanceScaleMotif,
};

export function LessonMotif({ studentKey }: { studentKey?: PilotStudentKey | null }) {
  const Motif = studentKey ? MOTIFS[studentKey] : undefined;
  if (!Motif) return null;
  return (
    <div className={styles.motif}>
      <Motif />
    </div>
  );
}
