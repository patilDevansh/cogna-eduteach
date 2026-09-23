import type { PilotStudentKey } from "@cogna/shared";
import styles from "./personalized-video.module.css";

/**
 * One faint, static line-art illustration per lesson, chosen to match the
 * concept metaphor already implicit in that template's narration — not
 * generic decoration. Deliberately minimal (a handful of primitive shapes,
 * no fill, no motion) so it reads as ambient background texture behind the
 * slide, never competing with the equation or narration for attention.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Divya — "keep the equation balanced": a level balance scale. */
function BalanceScaleMotif() {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%" aria-hidden="true">
      <circle cx="120" cy="40" r="6" fill="currentColor" stroke="none" />
      <g {...STROKE}>
        <line x1="120" y1="46" x2="120" y2="200" />
        <line x1="88" y1="200" x2="152" y2="200" />
        <line x1="40" y1="46" x2="200" y2="46" />
        <line x1="40" y1="46" x2="40" y2="92" />
        <line x1="200" y1="46" x2="200" y2="92" />
        <path d="M 13 92 A 27 27 0 0 0 67 92" />
        <path d="M 173 92 A 27 27 0 0 0 227 92" />
      </g>
    </svg>
  );
}

/** Aarav & Meena — distributive property: one factor reaching two terms. */
function DistributionMotif() {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%" aria-hidden="true">
      <g {...STROKE}>
        <circle cx="52" cy="120" r="28" />
        <path d="M 80 106 Q 132 62 186 72" />
        <path d="M 184 63 L 197 71 L 183 80" />
        <path d="M 80 134 Q 132 178 186 168" />
        <path d="M 184 177 L 197 169 L 183 160" />
        <rect x="188" y="50" width="42" height="32" rx="9" />
        <rect x="188" y="158" width="42" height="32" rx="9" />
      </g>
    </svg>
  );
}

/** Rohan — "solve, substitute, confirm": worked steps plus a checked answer. */
function ChecklistMotif() {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%" aria-hidden="true">
      <g {...STROKE}>
        <rect x="46" y="28" width="124" height="164" rx="14" />
        <line x1="72" y1="68" x2="144" y2="68" />
        <line x1="72" y1="98" x2="144" y2="98" />
        <line x1="72" y1="128" x2="118" y2="128" />
        <circle cx="168" cy="166" r="36" />
        <line x1="193" y1="191" x2="219" y2="217" />
        <path d="M 152 166 L 164 178 L 186 150" />
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
