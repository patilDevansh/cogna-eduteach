"use client";

/**
 * Dev-only scenario selector — never linked from the student-facing
 * experience. Launches the real session with `?scenario=<id>`, which the
 * main page uses purely to prefill each stage's input as it's reached; the
 * demoer still clicks Check/Continue themselves, and every prefilled input
 * runs through the exact same validation and diagnosis code a live
 * student's typing would.
 */
import Link from "next/link";
import { SCENARIOS } from "@/lib/quadratics/scenarios";
import styles from "@/components/quadratics/quadratics.module.css";

export default function QuadraticsDevPage() {
  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <span className={styles.wordmark}>
            cogna<span className={styles.dot}>.</span>
          </span>
          <span className={styles.faint}>Dev scenario selector — not part of the student journey</span>
        </div>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Demo paths</p>
          <h1 className={styles.h1} style={{ fontSize: "1.5rem" }}>
            Ten scripted walkthroughs
          </h1>
          <p className={styles.lead} style={{ marginBottom: "1.5rem" }}>
            Each link starts a real session with that path&apos;s inputs pre-filled at every stage — you still click
            Check / Continue yourself, and everything runs through the real deterministic validation and diagnosis
            code.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {SCENARIOS.map((s) => (
              <li key={s.id} style={{ borderTop: "1px solid var(--qz-line)", paddingTop: "0.9rem" }}>
                <Link
                  href={`/prototype/quadratics?scenario=${s.id}`}
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ width: "100%", justifyContent: "flex-start" }}
                >
                  {s.label}
                </Link>
                <p className={styles.faint} style={{ marginTop: "0.4rem" }}>
                  {s.description}
                </p>
              </li>
            ))}
          </ul>
          <p className={styles.faint} style={{ marginTop: "1.5rem" }}>
            Session data is stored locally per anonymous session id. See the{" "}
            <Link href="/prototype/quadratics/research" style={{ color: "var(--qz-accent-deep)" }}>
              research view
            </Link>{" "}
            for the full event timeline and JSON export.
          </p>
        </div>
      </div>
    </div>
  );
}
