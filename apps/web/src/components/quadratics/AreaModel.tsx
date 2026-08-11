"use client";

/**
 * Interactive four-region area model for (x+p)(x+q) — Stage 6. The
 * animation is the argument, not decoration: each region is a genuine
 * partial product the student fills in and validates against, and the
 * "combine" step visibly merges the two middle regions into one term,
 * building x^2 + (p+q)x + pq in front of the student rather than
 * revealing it. At most two short prompts, ~60–90 seconds.
 */
import { useState } from "react";
import { normalize, areEquivalent } from "@/lib/quadratics/poly";
import styles from "./quadratics.module.css";
import { MathExpr } from "./MathExpr";

interface AreaModelProps {
  p: number;
  q: number;
  onComplete: () => void;
}

type CellKey = "xx" | "xq" | "px" | "pq";

function expectedTerm(key: CellKey, p: number, q: number): string {
  switch (key) {
    case "xx":
      return "x^2";
    case "xq":
      return q === 1 ? "x" : `${q}x`;
    case "px":
      return p === 1 ? "x" : `${p}x`;
    case "pq":
      return `${p * q}`;
  }
}

export function AreaModel({ p, q, onComplete }: AreaModelProps) {
  const [filled, setFilled] = useState<Record<CellKey, string>>({ xx: "", xq: "", px: "", pq: "" });
  const [checked, setChecked] = useState<Record<CellKey, boolean | null>>({ xx: null, xq: null, px: null, pq: null });
  const [combined, setCombined] = useState(false);
  const [continuedShown, setContinuedShown] = useState(false);

  const allCorrect = (["xx", "xq", "px", "pq"] as CellKey[]).every((k) => checked[k] === true);
  const linear = p + q;
  const constant = p * q;

  function checkCell(key: CellKey) {
    const value = filled[key];
    if (!value.trim()) {
      setChecked((c) => ({ ...c, [key]: null }));
      return;
    }
    const ok = areEquivalent(value, expectedTerm(key, p, q));
    setChecked((c) => ({ ...c, [key]: ok }));
  }

  function cellClass(key: CellKey): string {
    if (checked[key] === true) return `${styles.psReadout} ${styles.psOk}`;
    return styles.psReadout;
  }

  const qLabel = q < 0 ? `${q}` : `+${q}`;
  const pLabel = p < 0 ? `${p}` : `+${p}`;

  return (
    <div className={styles.areaWrap}>
      {!allCorrect && (
        <p className={styles.areaPrompt}>What belongs in this part? Fill in all four, one at a time.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "3rem repeat(2, minmax(6.5rem, 1fr))", gap: "0.5rem", alignItems: "center" }}>
        <div />
        <div className={styles.center} style={{ fontFamily: "var(--qz-font-math)", fontWeight: 700 }}>x</div>
        <div className={styles.center} style={{ fontFamily: "var(--qz-font-math)", fontWeight: 700 }}>{qLabel}</div>

        <div className={styles.center} style={{ fontFamily: "var(--qz-font-math)", fontWeight: 700 }}>x</div>
        <AreaCell keyId="xx" filled={filled} setFilled={setFilled} checkCell={checkCell} cellClass={cellClass} />
        <AreaCell keyId="xq" filled={filled} setFilled={setFilled} checkCell={checkCell} cellClass={cellClass} />

        <div className={styles.center} style={{ fontFamily: "var(--qz-font-math)", fontWeight: 700 }}>{pLabel}</div>
        <AreaCell keyId="px" filled={filled} setFilled={setFilled} checkCell={checkCell} cellClass={cellClass} />
        <AreaCell keyId="pq" filled={filled} setFilled={setFilled} checkCell={checkCell} cellClass={cellClass} />
      </div>

      {allCorrect && !combined && (
        <div className={`${styles.center} ${styles.settle}`} style={{ marginTop: "0.5rem" }}>
          <p className={styles.areaPrompt}>Which parts can be combined?</p>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setCombined(true)}>
            Combine {q === 1 ? "x" : `${q}x`} + {p === 1 ? "x" : `${p}x`} → {linear}x
          </button>
        </div>
      )}

      {combined && (
        <div className={`${styles.center} ${styles.settle}`} style={{ marginTop: "0.75rem" }}>
          <p className={styles.faint}>So the four parts become:</p>
          <div className={styles.math} style={{ marginTop: "0.3rem" }}>
            <MathExpr expr={`x^2 ${linear < 0 ? "-" : "+"} ${Math.abs(linear)}x ${constant < 0 ? "-" : "+"} ${Math.abs(constant)}`} />
          </div>
          {!continuedShown ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ marginTop: "1rem" }}
              onClick={() => setContinuedShown(true)}
            >
              Continue
            </button>
          ) : null}
        </div>
      )}

      {continuedShown && (
        <div className={styles.center}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onComplete}>
            Back to the problem
          </button>
        </div>
      )}
    </div>
  );
}

function AreaCell({
  keyId,
  filled,
  setFilled,
  checkCell,
  cellClass,
}: {
  keyId: CellKey;
  filled: Record<CellKey, string>;
  setFilled: (updater: (prev: Record<CellKey, string>) => Record<CellKey, string>) => void;
  checkCell: (key: CellKey) => void;
  cellClass: (key: CellKey) => string;
}) {
  return (
    <input
      className={`${styles.input} ${cellClass(keyId)}`}
      style={{ textAlign: "center" }}
      value={filled[keyId]}
      onChange={(e) => {
        const v = e.target.value;
        setFilled((prev) => ({ ...prev, [keyId]: v }));
      }}
      onBlur={() => checkCell(keyId)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          checkCell(keyId);
        }
      }}
      placeholder="?"
      aria-label={`Region ${keyId}`}
      autoComplete="off"
    />
  );
}
