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
  strokeWidth: 5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Divya — "keep the equation balanced": beam and pans above, stand and base below. */
function BalanceScaleMotif() {
  return (
    <svg viewBox="0 0 220 680" width="100%" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#6f95b3">
        <circle cx="110" cy="36" r="6" fill="#6f95b3" stroke="none" />
        <line x1="30" y1="60" x2="190" y2="60" />
        <line x1="30" y1="60" x2="30" y2="104" />
        <line x1="190" y1="60" x2="190" y2="104" />
        <path d="M 5 104 A 25 25 0 0 0 55 104" />
        <path d="M 165 104 A 25 25 0 0 0 215 104" />
        <line x1="110" y1="42" x2="110" y2="644" />
        <line x1="78" y1="644" x2="142" y2="644" />
      </g>
    </svg>
  );
}

/** Aarav & Meena — distributive property: one factor above, two terms below. */
function DistributionMotif() {
  return (
    <svg viewBox="0 0 220 680" width="100%" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#d99a7c">
        <circle cx="110" cy="56" r="30" />
        <path d="M 88 82 Q 40 300 62 590" />
        <path d="M 54 578 L 62 592 L 74 580" />
        <path d="M 132 82 Q 180 300 158 590" />
        <path d="M 150 580 L 158 592 L 166 578" />
        <rect x="20" y="596" width="46" height="34" rx="9" />
        <rect x="154" y="596" width="46" height="34" rx="9" />
      </g>
    </svg>
  );
}

/** Rohan — "solve, substitute, confirm": worked steps above, a checked answer below. */
function ChecklistMotif() {
  return (
    <svg viewBox="0 0 220 680" width="100%" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#a58bc4">
        <rect x="58" y="20" width="104" height="640" rx="16" />
        <line x1="80" y1="58" x2="140" y2="58" />
        <line x1="80" y1="86" x2="140" y2="86" />
        <line x1="80" y1="114" x2="120" y2="114" />
        <circle cx="130" cy="600" r="34" />
        <line x1="153" y1="623" x2="177" y2="647" />
        <path d="M 115 600 L 126 611 L 146 585" />
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
