"use client";

import React from "react";
import type { TeacherReportData } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

interface EvidenceQualityModalProps {
  data: TeacherReportData;
  isOpen: boolean;
  onClose: () => void;
}

export function EvidenceQualityModal({ data, isOpen, onClose }: EvidenceQualityModalProps) {
  if (!isOpen) return null;

  const { evidenceAudit } = data;

  return (
    <div
      className={styles.modalScrim}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={styles.modalContent}
        role="dialog"
        aria-modal="true"
        aria-label="Cogna Evidence & Reliability Audit"
      >
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.badgeClass}>Evidence Integrity & Audit</span>
            <h3 style={{ marginTop: "var(--s-2)" }}>How Cogna Evaluates Evidence</h3>
            <p>Transparency into verification rules and statistical safeguards</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
          <div style={{ background: "var(--accent-wash)", border: "1px solid rgba(14, 107, 84, 0.2)", borderRadius: "var(--radius)", padding: "var(--s-3)" }}>
            <strong style={{ display: "block", color: "var(--accent-deep)", fontSize: "var(--text-sm)" }}>Evidence integrity: High</strong>
            <span style={{ color: "var(--ink-soft)", fontSize: "var(--text-xs)" }}>Cogna preserved usable work and excluded one conflicting input.</span>
          </div>
          <div style={{ background: "#fff6dd", border: "1px solid #ecd28c", borderRadius: "var(--radius)", padding: "var(--s-3)" }}>
            <strong style={{ display: "block", color: "#8d610d", fontSize: "var(--text-sm)" }}>Conclusion confidence: Moderate</strong>
            <span style={{ color: "var(--ink-soft)", fontSize: "var(--text-xs)" }}>Four students still need fresh evidence. High integrity does not make every conclusion certain.</span>
          </div>
        </div>

        {/* Verification Metrics */}
        <div className={styles.kpiRow} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--s-3)" }}>
          <div className={styles.kpi}>
            <span className={styles.num}>{evidenceAudit.independentLinesVerified}</span>
            <span className={styles.lbl}>Independent Lines Verified</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.num}>{evidenceAudit.assistedHintsDelivered}</span>
            <span className={styles.lbl}>Scaffold Hints Used</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.num} style={{ color: "#a32215" }}>{evidenceAudit.excludedConflictsCount}</span>
            <span className={styles.lbl}>Excluded Input Conflict</span>
          </div>
        </div>

        {/* Verification Rules */}
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: "var(--s-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          <strong style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--accent-deep)", letterSpacing: "0.08em" }}>
            Evidence Standards Honored
          </strong>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "var(--s-2)", fontSize: "var(--text-xs)", color: "var(--ink)" }}>
            <li>
              <strong>Deterministic Algebraic Verifier:</strong> Mathematical steps are parsed via formal grammar checks, not probabilistic guesses.
            </li>
            <li>
              <strong>No Definite Claims on Single Missteps:</strong> A single wrong line is treated as an isolated slip unless consistent pattern evidence is observed across multiple items.
            </li>
            <li>
              <strong>Input Conflict Quarantine:</strong> When contradictory actions occur (e.g. entering a correct line but selecting &quot;I don&apos;t know&quot;), the attempt is quarantined from gap conclusions.
            </li>
            <li>
              <strong>No Teacher Surveillance:</strong> This report is engineered to support instructional planning, not to calculate teacher ratings or administrative KPIs.
            </li>
          </ul>
        </div>

        {/* Current Limitations */}
        <div>
          <strong style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--ink-faint)", letterSpacing: "0.08em" }}>
            Declared Evidence Boundaries
          </strong>
          <ul style={{ margin: "var(--s-2) 0 0", paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "var(--s-2)", fontSize: "var(--text-xs)", color: "var(--ink-soft)" }}>
            {evidenceAudit.evidenceLimitations.map((lim, idx) => (
              <li key={idx}>{lim}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
