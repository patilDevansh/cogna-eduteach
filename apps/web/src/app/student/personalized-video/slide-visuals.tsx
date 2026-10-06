import type { SlideVisual } from "@cogna/shared";
import styles from "./slides.module.css";

/** One beat's picture on a slide. Keyed by the caller so each new picture fades in. */
export function SlideVisualView({ visual }: { visual: SlideVisual }) {
  switch (visual.type) {
    case "expression":
      return (
        <figure className={styles.expression}>
          <span className={styles.math}>{visual.expr}</span>
          {visual.caption && <figcaption>{visual.caption}</figcaption>}
        </figure>
      );
    case "steps":
      return <StepsView steps={visual.steps} caption={visual.caption} />;
    case "mistake":
      return (
        <figure className={styles.compare}>
          <div className={`${styles.answer} ${styles.yours}`}>
            <span className={styles.answerLabel}>Your answer</span>
            <span className={styles.math}>{visual.wrong}</span>
            <span className={styles.verdict}>{visual.wrongKind === "unfinished" ? "Equal, but not finished" : "Not equal"}</span>
          </div>
          <div className={`${styles.answer} ${styles.right}`} style={{ animationDelay: "0.6s" }}>
            <span className={styles.answerLabel}>{visual.task === "factorise" ? "Fully factorised" : "Right answer"}</span>
            <span className={styles.math}>{visual.right}</span>
            <span className={styles.verdict}>✓ Multiplies back to {visual.expr}</span>
          </div>
          {visual.note && <figcaption>{visual.note}</figcaption>}
        </figure>
      );
    case "rule":
      return (
        <figure className={styles.rule}>
          <ol>
            {visual.lines.map((line, i) => (
              <li key={line} style={{ animationDelay: `${i * 0.35}s` }}>
                <span>{i + 1}</span>
                {line}
              </li>
            ))}
          </ol>
        </figure>
      );
  }
}

/** A chain of equal lines, one under the other, appearing in order. */
export function StepsView({ steps, caption }: { steps: string[]; caption?: string }) {
  return (
    <figure className={styles.steps}>
      {steps.map((step, i) => (
        <div key={`${i}-${step}`} className={styles.step} style={{ animationDelay: `${i * 0.45}s` }}>
          <span className={styles.eq} aria-hidden="true">{i === 0 ? "" : "="}</span>
          <span className={styles.math}>{step}</span>
        </div>
      ))}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
