import type { ConceptMasteryBand } from "@cogna/shared";
import { conceptLabel } from "@/lib/concept-labels";
import styles from "./dashboard.module.css";

const BAND_TEXT: Record<ConceptMasteryBand["band"], string> = {
  JUST_STARTED: "Just started",
  BUILDING: "Building",
  STRONG: "Strong",
};

/** Per-concept mastery, shown as bands (never a percentage) — one blended
 * average hides exactly the thing a parent needs to see: which sub-topic
 * needs attention. */
export function ConceptMeters({ bands }: { bands: ConceptMasteryBand[] }) {
  if (bands.length === 0) {
    return <p className="faint">No concepts practiced yet.</p>;
  }

  const sorted = [...bands].sort((a, b) => b.value - a.value);

  return (
    <div className={styles.meterRow}>
      {sorted.map((b) => (
        <div key={b.conceptId} className={styles.meter}>
          <span className={styles.name}>{conceptLabel(b.conceptId)}</span>
          <span className={`${styles.band} ${b.band === "JUST_STARTED" ? styles.low : ""}`}>
            {BAND_TEXT[b.band]}
          </span>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${Math.round(b.value * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
