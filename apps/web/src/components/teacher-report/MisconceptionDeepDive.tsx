"use client";

import React from "react";
import type { TeacherReportData, StudentReportItem } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

interface MisconceptionDeepDiveProps {
  data: TeacherReportData;
  onSelectStudent: (student: StudentReportItem) => void;
}

export function MisconceptionDeepDive({ data, onSelectStudent }: MisconceptionDeepDiveProps) {
  const { mainDifficulty, students } = data;
  const { stepExample } = mainDifficulty;

  const affectedStudents = students.filter((s) =>
    stepExample.studentIds.includes(s.id),
  );

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>The Main Class Difficulty</h2>
          <span className={styles.subnote}>
            Anatomy of the exact mathematical step where students hesitated
          </span>
        </div>
        <span className={styles.chipWarning}>
          {mainDifficulty.studentCount} Students Observed
        </span>
      </div>

      <div className={styles.misconceptionCard}>
        {/* Worked Mistake Comparison */}
        <div className={styles.workedMistakeBox}>
          <h4>Step Comparison · {stepExample.canonicalProblem}</h4>

          <div className={styles.stepComparison}>
            <div className={`${styles.stepColumn} ${styles.stepObserved}`}>
              <span className={styles.stepLabel}>Common Observed Error</span>
              <div className={styles.stepMath}>{stepExample.observedStep}</div>
            </div>

            <div className={`${styles.stepColumn} ${styles.stepCorrect}`}>
              <span className={styles.stepLabel}>Correct Transformation</span>
              <div className={styles.stepMath}>{stepExample.correctStep}</div>
            </div>
          </div>

          <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)", margin: 0, lineHeight: 1.45 }}>
            <strong>Diagnosis:</strong> {stepExample.explanation}
          </p>
        </div>

        {/* Teacher Prompt for Boardwork */}
        <div className={styles.teacherPromptBox}>
          <strong>Suggested Classroom Phrasing</strong>
          {stepExample.teacherPrompt}
        </div>

        {/* Secondary Issue Callout */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", background: "var(--bg)", padding: "var(--s-3) var(--s-4)", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--caution)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Secondary Issue ({mainDifficulty.secondaryCount} students)
          </span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)" }}>
            {mainDifficulty.secondaryIssue}
          </span>
        </div>

        {/* Affected Students list */}
        <div className={styles.affectedStudentsArea}>
          <span className={styles.lbl}>Affected students (click to view individual working):</span>
          <div className={styles.studentPillList}>
            {affectedStudents.map((st) => (
              <button
                key={st.id}
                type="button"
                className={styles.studentChip}
                onClick={() => onSelectStudent(st)}
              >
                <span>{st.name}</span>
                <span style={{ fontFamily: "var(--font-math)", fontSize: "0.68rem", color: "var(--ink-faint)" }}>
                  {st.rollNumber}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
