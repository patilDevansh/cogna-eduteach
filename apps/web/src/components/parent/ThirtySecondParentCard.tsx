"use client";

import React from "react";
import Link from "next/link";
import styles from "./parent-card.module.css";

interface ParentCardProps {
  studentName?: string;
  grade?: number;
  sessionDate?: string;
}

export function ThirtySecondParentCard({
  studentName = "Aarav",
  grade = 8,
  sessionDate = "Today (12-minute session)",
}: ParentCardProps) {
  return (
    <div className={styles.container}>
      {/* 30-Second Header */}
      <div className={styles.headerRow}>
        <div>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>30-SECOND PARENT BRIEF</span>
            <span className={styles.gradeTag}>Grade {grade} · Linear Equations</span>
          </div>
          <h1 className={styles.title}>{studentName}&apos;s Algebra Progress</h1>
          <p className={styles.subtitle}>Evidence-backed summary from {sessionDate}</p>
        </div>
        <div className={styles.headerAction}>
          <Link href="/student/mission" className={styles.tryStudentMissionBtn}>
            Try 10-Min Student Mission →
          </Link>
        </div>
      </div>

      {/* The 4-Pillar 30-Second Grid */}
      <div className={styles.grid}>
        {/* 1. What Improved Today */}
        <div className={`${styles.card} ${styles.cardSuccess}`}>
          <div className={styles.cardHeader}>
            <span className={styles.iconSuccess}>✓</span>
            <span className={styles.cardKicker}>1. WHAT IMPROVED TODAY</span>
          </div>
          <h3 className={styles.cardTitle}>Bracket Distribution Rule</h3>
          <p className={styles.cardBody}>
            {studentName} mastered expanding brackets with multipliers (<code>a(x + b) → ax + ab</code>).
            Solved <code>4(x + 3) = 28 → x = 4</code> completely on their own with <strong>0 hints</strong>.
          </p>
          <div className={styles.verifiedTag}>✓ Independent proof verified</div>
        </div>

        {/* 2. The 1 Fragile Idea */}
        <div className={`${styles.card} ${styles.cardFocus}`}>
          <div className={styles.cardHeader}>
            <span className={styles.iconFocus}>🔍</span>
            <span className={styles.cardKicker}>2. THE ONE FRAGILE STEP</span>
          </div>
          <h3 className={styles.cardTitle}>Balancing Negative Constants</h3>
          <p className={styles.cardBody}>
            When solving equations like <code>4x - 6 = 2x + 8</code>, {studentName} correctly moved the variable,
            but subtracted 6 instead of adding 6 to undo the <code>-6</code>.
          </p>
          <div className={styles.focusTag}>Practising next session</div>
        </div>

        {/* 3. Independent Before & After Proof */}
        <div className={`${styles.card} ${styles.cardProof} ${styles.span2}`}>
          <div className={styles.cardHeader}>
            <span className={styles.iconProof}>⚖️</span>
            <span className={styles.cardKicker}>3. INDEPENDENT PROOF (BEFORE VS AFTER)</span>
          </div>
          <h3 className={styles.cardTitle}>Before & After 1-Minute Mistake Microscope</h3>

          <div className={styles.proofComparisonGrid}>
            <div className={styles.proofCol}>
              <div className={styles.proofColHeader}>INITIAL ATTEMPT (BEFORE)</div>
              <div className={styles.mathEquationBox}>
                <span>3(x + 4) = 21</span>
                <span className={styles.mathArrow}>→</span>
                <span className={styles.mathInvalid}>3x + 4 = 21</span>
              </div>
              <p className={styles.proofDesc}>
                Missed multiplying the 4 by 3. The Mistake Microscope isolated the <code>3 × 4 = 12</code> step.
              </p>
            </div>

            <div className={styles.proofCol}>
              <div className={styles.proofColHeader}>INDEPENDENT TRANSFER (AFTER)</div>
              <div className={styles.mathEquationBox}>
                <span>4(x + 3) = 28</span>
                <span className={styles.mathArrow}>→</span>
                <span className={styles.mathValid}>4x + 12 = 28 → x = 4</span>
              </div>
              <p className={styles.proofDesc}>
                Solved a fresh, structurally different problem unaided in 3 valid lines.
              </p>
            </div>
          </div>
        </div>

        {/* 4. One Action for Home */}
        <div className={`${styles.card} ${styles.cardAction} ${styles.span2}`}>
          <div className={styles.cardHeader}>
            <span className={styles.iconAction}>💬</span>
            <span className={styles.cardKicker}>4. ONE CALM ACTION FOR HOME</span>
          </div>
          <div className={styles.actionContent}>
            <div>
              <h3 className={styles.cardTitle}>No extra homework sheets needed</h3>
              <p className={styles.cardBody}>
                If you would like to reinforce this over dinner, ask {studentName} one casual question:
                <br />
                <em>&ldquo;If you have −6 on one side of an equation, what is the inverse operation to undo it?&rdquo;</em>
                <br />
                <span className={styles.answerHint}>(Answer: Add 6 to both sides).</span>
              </p>
            </div>
            <div className={styles.retentionPill}>
              <div className={styles.retentionDay}>Next Check</div>
              <div className={styles.retentionDate}>Thursday (2 mins)</div>
              <div className={styles.retentionNote}>Automatic retention check</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trust & Scientific Restraint Footnote */}
      <footer className={styles.footer}>
        <p>
          <strong>Scientific Restraint:</strong> Cogna never scores personality, intelligence, or speed.
          Every conclusion is backed by step-level algebraic evidence and confirmed by independent transfer.
        </p>
      </footer>
    </div>
  );
}
