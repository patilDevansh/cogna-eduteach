"use client";

/** Stage 7: a lightweight product-and-sum workspace, reversing the structure of expansion rather than treating factorisation as an unrelated algorithm. */
import { useEffect, useState } from "react";
import styles from "./quadratics.module.css";

interface ProductSumWorkspaceProps {
  requiredProduct: number;
  requiredSum: number;
  onSubmit: (attempt: { p: number; q: number; writtenForm: string }) => void;
  disabled?: boolean;
  /** Dev-scenario prefill: bump prefillNonce whenever `prefill` should be (re)applied, e.g. for a second scripted attempt after a first. */
  prefill?: { p: string; q: string; writtenForm: string } | null;
  prefillNonce?: number;
}

export function ProductSumWorkspace({
  requiredProduct,
  requiredSum,
  onSubmit,
  disabled,
  prefill,
  prefillNonce,
}: ProductSumWorkspaceProps) {
  const [pStr, setPStr] = useState("");
  const [qStr, setQStr] = useState("");
  const [writtenForm, setWrittenForm] = useState("");

  useEffect(() => {
    if (!prefill) return;
    setPStr(prefill.p);
    setQStr(prefill.q);
    setWrittenForm(prefill.writtenForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

  const p = Number(pStr);
  const q = Number(qStr);
  const hasNumbers = pStr.trim() !== "" && qStr.trim() !== "" && Number.isInteger(p) && Number.isInteger(q);
  const product = hasNumbers ? p * q : null;
  const sum = hasNumbers ? p + q : null;
  const canSubmit = hasNumbers && writtenForm.trim().length > 0 && !disabled;

  function submit() {
    if (!canSubmit) return;
    onSubmit({ p, q, writtenForm: writtenForm.trim() });
  }

  return (
    <div>
      <p className={styles.faint} style={{ marginBottom: "0.75rem" }}>
        Two numbers that multiply to {requiredProduct}. Two numbers that add to {requiredSum}.
      </p>
      <div className={styles.psGrid}>
        <div className={styles.psField}>
          <label htmlFor="ps-p" className={styles.hint}>
            First number
          </label>
          <input
            id="ps-p"
            className={`${styles.input} ${styles.inputSmall}`}
            value={pStr}
            onChange={(e) => setPStr(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
          />
        </div>
        <div className={styles.psField}>
          <label htmlFor="ps-q" className={styles.hint}>
            Second number
          </label>
          <input
            id="ps-q"
            className={`${styles.input} ${styles.inputSmall}`}
            value={qStr}
            onChange={(e) => setQStr(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
          />
        </div>
        <div className={styles.psField}>
          <span className={styles.hint}>Product</span>
          <span className={`${styles.psReadout} ${product === requiredProduct ? styles.psOk : ""}`}>
            {product === null ? "?" : product}
          </span>
        </div>
        <div className={styles.psField}>
          <span className={styles.hint}>Sum</span>
          <span className={`${styles.psReadout} ${sum === requiredSum ? styles.psOk : ""}`}>{sum === null ? "?" : sum}</span>
        </div>
      </div>

      <div className={styles.field} style={{ marginTop: "1.25rem", maxWidth: "20rem" }}>
        <label htmlFor="ps-form">Write the factored form</label>
        <input
          id="ps-form"
          className={styles.input}
          value={writtenForm}
          onChange={(e) => setWrittenForm(e.target.value)}
          placeholder="e.g. (x+3)(x+5)"
          autoComplete="off"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div className={styles.actions} style={{ marginTop: "1rem" }}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={submit} disabled={!canSubmit}>
          Check
        </button>
      </div>
    </div>
  );
}
