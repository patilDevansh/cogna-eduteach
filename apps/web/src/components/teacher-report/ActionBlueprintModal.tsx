"use client";

import React from "react";
import type { TeacherReportData } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

interface ActionBlueprintModalProps {
  data: TeacherReportData;
  isOpen: boolean;
  onClose: () => void;
}

export function ActionBlueprintModal({ data, isOpen, onClose }: ActionBlueprintModalProps) {
  if (!isOpen) return null;

  const { readinessSummary, mainDifficulty } = data;
  const revisionNeeded = readinessSummary.reinforcementCount > 0;

  return (
    <div
      className={styles.modalScrim}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`${styles.modalContent} ${styles.revisionModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Cogna suggested revision"
      >
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.badgeClass}>Cogna&apos;s suggested response</span>
            <h3 style={{ marginTop: "var(--s-2)" }}>
              {revisionNeeded ? "Your 10-minute revision" : "Tips for your next lesson"}
            </h3>
            <p>
              {revisionNeeded
                ? `${readinessSummary.reinforcementCount} students need this bridge before moving forward.`
                : "No class-wide revision is indicated by the current evidence."}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close revision plan">
            ✕
          </button>
        </div>

        {revisionNeeded ? (
          <>
            <div className={styles.revisionTwoColumn}>
              <section className={styles.revisionGapCard}>
                <span className={styles.expansionLabel}>Where understanding broke</span>
                <h4>{mainDifficulty.title}</h4>
                <ul>
                  <li>The first variable-balancing step was usually correct.</li>
                  <li>When removing <strong>−6</strong>, students used <strong>8 − 6</strong> instead of <strong>8 + 6</strong>.</li>
                  <li>Reinforce: use the same operation on both sides.</li>
                </ul>
              </section>

              <section className={styles.revisionRunCard}>
                <span className={styles.expansionLabel}>Shape the revision</span>
                <ol className={styles.revisionSteps}>
                  <li><strong>3 min · Model</strong><span>Circle the operation applied to both sides.</span></li>
                  <li><strong>4 min · Students try</strong><span>Solve the practice problem independently.</span></li>
                  <li><strong>3 min · Check</strong><span>Progress, support, or collect fresh evidence.</span></li>
                </ol>
              </section>
            </div>

            <section className={styles.singlePracticeCard}>
              <div>
                <span className={styles.expansionLabel}>One practice problem</span>
                <p>Solve for x</p>
              </div>
              <strong>5x + 3 = 2x + 15</strong>
              <span>Teacher check: x = 4</span>
            </section>
          </>
        ) : (
          <section className={styles.noRevisionCard}>
            <ul>
              <li>Begin with one retrieval question from yesterday before introducing the new topic.</li>
              <li>Keep students with incomplete evidence on a short, low-pressure check.</li>
              <li>Use a changed-form question later in the lesson to test transfer, not just familiar execution.</li>
            </ul>
          </section>
        )}

        <p className={styles.revisionControlNote}>Suggested—not prescribed. The teacher remains in control.</p>
      </section>
    </div>
  );
}
