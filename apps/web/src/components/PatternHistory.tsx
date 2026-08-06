import type { PatternHistoryItem } from "@cogna/shared";
import { conceptLabel, misconceptionLabel } from "@/lib/concept-labels";
import styles from "./dashboard.module.css";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

/** A running log across weeks, not a single-session snapshot — and it
 * explicitly shows patterns getting resolved, not just flagged. */
export function PatternHistory({ items }: { items: PatternHistoryItem[] }) {
  if (items.length === 0) {
    return <p className="faint">No patterns checked yet — that&apos;s a good sign, not a gap.</p>;
  }

  return (
    <div className={styles.patternList}>
      {items.map((item) => (
        <div
          key={`${item.misconceptionId}|${item.conceptId}`}
          className={`${styles.patternItem} ${item.status === "resolved" ? styles.resolved : ""}`}
        >
          <div className={styles.stripe} />
          <div className={styles.txt}>
            <p>
              {conceptLabel(item.conceptId)} — {misconceptionLabel(item.misconceptionId)}
              <span className={`${styles.pill} ${item.status === "resolved" ? styles.resolved : styles.checking}`}>
                {item.status === "resolved" ? "Resolved" : "Checking"}
              </span>
            </p>
            <span className={styles.meta}>
              {item.status === "resolved"
                ? `Seen ${formatDate(item.firstSeenAt)}–${formatDate(item.lastSeenAt)} · hasn't recurred since`
                : `Seen ${formatDate(item.firstSeenAt)}–${formatDate(item.lastSeenAt)} · ${item.occurrenceCount} time${item.occurrenceCount === 1 ? "" : "s"} so far`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
