import type { PilotStudentKey } from "@cogna/shared";
import styles from "./personalized-video.module.css";

/**
 * A pair of small, static line-art illustrations per lesson — one above the
 * slide, one below — placed in normal document flow with real margin
 * spacing, not overlapping or hidden behind the card. Each half is a
 * complete, self-contained little image on its own (not a cropped fragment
 * of something bigger), matching the concept metaphor already implicit in
 * that template's narration.
 */

const STROKE = {
  fill: "none",
  strokeWidth: 8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Divya — "keep the equation balanced": the scale's beam/pans above, its base below. */
function BalanceScaleTop() {
  return (
    <svg viewBox="0 0 240 130" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#5f8fb0">
        <circle cx="120" cy="16" r="8" fill="#5f8fb0" stroke="none" />
        <line x1="120" y1="24" x2="120" y2="44" />
        <line x1="24" y1="44" x2="216" y2="44" />
        <line x1="24" y1="44" x2="24" y2="94" />
        <line x1="216" y1="44" x2="216" y2="94" />
        <path d="M 0 94 A 24 24 0 0 0 48 94" />
        <path d="M 192 94 A 24 24 0 0 0 240 94" />
      </g>
    </svg>
  );
}
function BalanceScaleBottom() {
  return (
    <svg viewBox="0 0 240 100" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#5f8fb0">
        <line x1="120" y1="0" x2="120" y2="50" />
        <line x1="66" y1="50" x2="174" y2="50" />
        <line x1="90" y1="50" x2="90" y2="74" />
        <line x1="150" y1="50" x2="150" y2="74" />
      </g>
    </svg>
  );
}

/** Aarav & Meena — distributive property: the outside factor above, two terms below. */
function DistributionTop() {
  return (
    <svg viewBox="0 0 240 130" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#d68d5f">
        <circle cx="120" cy="50" r="38" />
        <path d="M 92 80 Q 65 100 54 128" />
        <path d="M 42 112 L 54 128 L 70 118" />
        <path d="M 148 80 Q 175 100 186 128" />
        <path d="M 170 118 L 186 128 L 198 112" />
      </g>
    </svg>
  );
}
function DistributionBottom() {
  return (
    <svg viewBox="0 0 240 100" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#d68d5f">
        <path d="M 46 0 L 46 20" />
        <path d="M 36 12 L 46 24 L 56 12" />
        <path d="M 194 0 L 194 20" />
        <path d="M 184 12 L 194 24 L 204 12" />
        <rect x="14" y="30" width="64" height="50" rx="12" />
        <rect x="162" y="30" width="64" height="50" rx="12" />
      </g>
    </svg>
  );
}

/** Rohan — "solve, substitute, confirm": worked steps above, a checked answer below. */
function ChecklistTop() {
  return (
    <svg viewBox="0 0 240 130" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#9370b8">
        <path d="M 50 130 V 30 A 20 20 0 0 1 70 10 H 170 A 20 20 0 0 1 190 30 V 130" />
        <line x1="78" y1="56" x2="162" y2="56" />
        <line x1="78" y1="94" x2="130" y2="94" />
      </g>
    </svg>
  );
}
function ChecklistBottom() {
  return (
    <svg viewBox="0 0 240 110" height="100%" aria-hidden="true">
      <g {...STROKE} stroke="#9370b8">
        <circle cx="110" cy="46" r="44" />
        <line x1="141" y1="77" x2="172" y2="108" />
        <path d="M 86 46 L 102 64 L 134 24" />
      </g>
    </svg>
  );
}

const MOTIFS: Partial<
  Record<PilotStudentKey, { Top: () => React.JSX.Element; Bottom: () => React.JSX.Element }>
> = {
  aarav: { Top: DistributionTop, Bottom: DistributionBottom },
  meena: { Top: DistributionTop, Bottom: DistributionBottom },
  rohan: { Top: ChecklistTop, Bottom: ChecklistBottom },
  divya: { Top: BalanceScaleTop, Bottom: BalanceScaleBottom },
};

export function LessonMotifTop({ studentKey }: { studentKey?: PilotStudentKey | null }) {
  const motif = studentKey ? MOTIFS[studentKey] : undefined;
  if (!motif) return null;
  const { Top } = motif;
  return (
    <div className={styles.motifTop}>
      <Top />
    </div>
  );
}

export function LessonMotifBottom({ studentKey }: { studentKey?: PilotStudentKey | null }) {
  const motif = studentKey ? MOTIFS[studentKey] : undefined;
  if (!motif) return null;
  const { Bottom } = motif;
  return (
    <div className={styles.motifBottom}>
      <Bottom />
    </div>
  );
}
