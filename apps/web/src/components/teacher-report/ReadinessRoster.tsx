"use client";

import React, { useState } from "react";
import type { TeacherReportData, StudentReportItem, ReadinessCategory } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

interface ReadinessRosterProps {
  data: TeacherReportData;
  activeFilter: ReadinessCategory | "all";
  onFilterChange: (filter: ReadinessCategory | "all") => void;
  onSelectStudent: (student: StudentReportItem) => void;
}

export function ReadinessRoster({
  data,
  activeFilter,
  onFilterChange,
  onSelectStudent,
}: ReadinessRosterProps) {
  const { students, readinessSummary } = data;

  const filteredStudents = students.filter((s) => {
    if (activeFilter === "all") return true;
    return s.readiness === activeFilter;
  });

  return (
    <section className={styles.rosterSection} aria-label="Student roster and readiness groups">
      <div className={styles.rosterHeader}>
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", color: "var(--ink)", margin: 0 }}>
            Student Readiness & Diagnostic Groups
          </h2>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)", margin: "3px 0 0" }}>
            Click any student row to inspect verified step-by-step algebraic working
          </p>
        </div>

        {/* Tab Filters */}
        <div className={styles.tabButtons} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "all"}
            className={`${styles.tabBtn} ${activeFilter === "all" ? styles.activeTab : ""}`}
            onClick={() => onFilterChange("all")}
          >
            <span>All Students</span>
            <span className={styles.tabCountBadge}>{students.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "ready"}
            className={`${styles.tabBtn} ${activeFilter === "ready" ? styles.activeTab : ""}`}
            onClick={() => onFilterChange("ready")}
          >
            <span className={`${styles.segDot} ${styles.dotReady}`} />
            <span>Ready to Progress</span>
            <span className={styles.tabCountBadge}>{readinessSummary.readyCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "reinforcement"}
            className={`${styles.tabBtn} ${activeFilter === "reinforcement" ? styles.activeTab : ""}`}
            onClick={() => onFilterChange("reinforcement")}
          >
            <span className={`${styles.segDot} ${styles.dotReinforce}`} />
            <span>Targeted Support</span>
            <span className={styles.tabCountBadge}>{readinessSummary.reinforcementCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "probe"}
            className={`${styles.tabBtn} ${activeFilter === "probe" ? styles.activeTab : ""}`}
            onClick={() => onFilterChange("probe")}
          >
            <span className={`${styles.segDot} ${styles.dotProbe}`} />
            <span>More Evidence</span>
            <span className={styles.tabCountBadge}>{readinessSummary.probeCount}</span>
          </button>
        </div>
      </div>

      {/* Student Rows */}
      <div className={styles.rosterTable}>
        {filteredStudents.map((st) => (
          <div key={st.id} className={styles.rosterRow}>
            {/* Student Info */}
            <div className={styles.studentMeta}>
              <span className={styles.studentName}>{st.name}</span>
              <span className={styles.studentRoll}>Roll: {st.rollNumber}</span>
            </div>

            {/* Demonstrated Skills */}
            <div>
              <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "3px" }}>
                Demonstrated Skills
              </div>
              <div className={styles.demonstratedPills}>
                {st.demonstratedSkills.map((sk, idx) => (
                  <span key={idx} className={styles.skillPill}>
                    {sk}
                  </span>
                ))}
              </div>
            </div>

            {/* Candidate Learning Need */}
            <div>
              <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "3px" }}>
                Current Diagnostic Status
              </div>
              {st.isInputConflict ? (
                <div className={styles.conflictBadge}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 5v4M8 11.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Input conflict — excluded
                </div>
              ) : st.candidateLearningNeed ? (
                <span className={`${styles.learningNeedText} ${styles.learningNeedCaution}`}>
                  {st.candidateLearningNeed}
                </span>
              ) : (
                <span className={styles.learningNeedText} style={{ color: "var(--accent)" }}>
                  ✓ Independent & Transfer Ready
                </span>
              )}
            </div>

            {/* Inspect Action */}
            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                className={styles.inspectBtn}
                onClick={() => onSelectStudent(st)}
              >
                Inspect Working →
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
