"use client";

import React from "react";
import type { StudentReportItem } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

interface StudentDetailModalProps {
  student: StudentReportItem | null;
  onClose: () => void;
}

export function StudentDetailModal({ student, onClose }: StudentDetailModalProps) {
  if (!student) return null;

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
        aria-label={`Student evidence for ${student.name}`}
      >
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
              <span className={styles.badgeClass}>{student.rollNumber}</span>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  background:
                    student.readiness === "ready"
                      ? "var(--accent-wash)"
                      : student.readiness === "reinforcement"
                      ? "var(--caution-wash)"
                      : "var(--bg)",
                  color:
                    student.readiness === "ready"
                      ? "var(--accent-deep)"
                      : student.readiness === "reinforcement"
                      ? "var(--caution)"
                      : "var(--ink-soft)",
                }}
              >
                {student.readiness === "ready"
                  ? "Ready to Progress"
                  : student.readiness === "reinforcement"
                  ? "Targeted Reinforcement"
                  : "More Evidence Needed"}
              </span>
            </div>
            <h3 style={{ marginTop: "var(--s-2)" }}>{student.name}</h3>
            <p>Individual diagnostic evidence log & verified algebraic working</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Special Case: Input Conflict Excluded State */}
        {student.isInputConflict && student.conflictDetails && (
          <div className={styles.conflictExplanationBox}>
            <h4>⚠️ Input Conflict — Excluded from Learner Conclusions</h4>
            <p>
              <strong>Observed Action:</strong> {student.conflictDetails.actionTaken}
            </p>
            <p>
              <strong>Entered Content:</strong> {student.conflictDetails.enteredAnswer}
            </p>
            <p style={{ marginTop: "4px" }}>
              <strong>Pedagogical Safeguard:</strong> {student.conflictDetails.exclusionReason}
            </p>
          </div>
        )}

        {/* Diagnostic Summary & Follow-up */}
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
          <div>
            <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
              Current evidence-based indication
            </span>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ink)", fontWeight: 600, marginTop: "2px" }}>
              {student.candidateLearningNeed ?? "Solid independent understanding with successful transfer."}
            </div>
            {student.errorPatternSummary && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--caution)", margin: "4px 0 0" }}>
                {student.attempts.length >= 2 ? "Repeated error:" : "Observed error (one opportunity):"} {student.errorPatternSummary}
              </p>
            )}
          </div>

          <div>
            <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "var(--ink-faint)", letterSpacing: "0.06em" }}>
              Recommended Teacher Follow-up
            </span>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)", margin: "2px 0 0", lineHeight: 1.45 }}>
              {student.recommendedFollowUp}
            </p>
          </div>

          <div style={{ display: "flex", gap: "var(--s-4)", fontSize: "var(--text-xs)", color: "var(--ink-faint)", flexWrap: "wrap" }}>
            <span>
              Conclusion confidence: <strong>{student.attempts.length < 2 && student.candidateLearningNeed ? "LIMITED" : student.uncertaintyRating === "low" ? "HIGH" : student.uncertaintyRating === "moderate" ? "MODERATE" : "LOW"}</strong>
            </span>
            <span>
              Next evidence need: <strong>{student.attempts.length < 2 && student.candidateLearningNeed ? "FRESH CONFIRMATION" : "NONE URGENT"}</strong>
            </span>
          </div>
        </div>

        {/* Step-by-Step Algebraic Working Log */}
        <div>
          <h4 style={{ fontSize: "var(--text-sm)", color: "var(--ink)", margin: "0 0 var(--s-3)" }}>
            Recorded mathematical evidence ({student.attempts.length} {student.attempts.length === 1 ? "attempt" : "attempts"})
          </h4>

          {student.attempts.length === 0 ? (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)", fontStyle: "italic" }}>
              No detailed step-by-step logs recorded for this diagnostic session (short session or baseline probe).
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
              {student.attempts.map((att, attIdx) => (
                <div key={attIdx} className={styles.studentAttemptCard}>
                  <div className={styles.attemptHeader}>
                    <div>
                      <strong style={{ fontSize: "var(--text-sm)", color: "var(--ink)" }}>{att.questionTitle}</strong>
                      <div style={{ fontFamily: "var(--font-math)", fontSize: "var(--text-xs)", color: "var(--ink-soft)" }}>
                        {att.questionPrompt}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: att.isCorrect ? "var(--success-wash)" : "var(--caution-wash)",
                        color: att.isCorrect ? "var(--success)" : "var(--caution)",
                      }}
                    >
                      {att.isCorrect ? "Correct" : "Needs Review"} ({Math.round(att.timeMs / 1000)}s)
                    </span>
                  </div>

                  <ul className={styles.stepLogList}>
                    {att.steps.map((step, sIdx) => (
                      <li key={sIdx} className={`${styles.stepLogRow} ${!step.valid ? styles.stepInvalid : ""}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: step.valid ? "var(--success)" : "var(--caution)" }}>
                            Step {step.stepIndex} {step.valid ? "✓ Valid line" : "✗ Error line"}
                          </span>
                          {step.transformationType && (
                            <span className={styles.stepTransformationTag}>
                              {step.transformationType}
                            </span>
                          )}
                        </div>

                        <div style={{ fontFamily: "var(--font-math)", fontSize: "var(--text-sm)", margin: "3px 0" }}>
                          <span style={{ color: "var(--ink-faint)" }}>{step.previousLine}</span>
                          <span style={{ margin: "0 6px", color: "var(--ink-soft)" }}>→</span>
                          <span style={{ fontWeight: 600, color: step.valid ? "var(--accent-deep)" : "var(--caution)" }}>
                            {step.submittedLine}
                          </span>
                        </div>

                        {step.diagnosticNote && (
                          <div className={styles.stepDiagNote}>
                            <strong>Evidence interpretation:</strong> {step.diagnosticNote}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
