"use client";

import React from "react";
import type { TeacherReportData } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

interface CognitiveDepthLadderProps {
  data: TeacherReportData;
}

export function CognitiveDepthLadder({ data }: CognitiveDepthLadderProps) {
  const { comprehension, classInfo } = data;
  const total = classInfo.totalStudents;

  const familiarPct = Math.round((comprehension.familiarCount / total) * 100);
  const independentPct = Math.round((comprehension.independentCount / total) * 100);
  const transferPct = Math.round((comprehension.transferCount / total) * 100);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Cognitive Depth Ladder</h2>
          <span className={styles.subnote}>
            From assisted recall to independent problem-solving and transfer
          </span>
        </div>
      </div>

      <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)", margin: 0, lineHeight: 1.45 }}>
        A student solving a familiar example with hints does not guarantee independent mastery.
        Cogna verifies comprehension across three cognitive depths:
      </p>

      <ul className={styles.ladderList}>
        {/* Stage 1: Familiar Forms */}
        <li className={styles.ladderItem}>
          <div className={styles.ladderTop}>
            <div className={styles.ladderStageName}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--accent-wash)", color: "var(--accent-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700 }}>
                1
              </span>
              <span>Familiar Scaffolded Forms</span>
            </div>
            <span className={styles.ladderCount}>
              {comprehension.familiarCount} of {total} ({familiarPct}%)
            </span>
          </div>
          <div className={styles.ladderTrack}>
            <div className={styles.ladderFill} style={{ width: `${familiarPct}%`, opacity: 0.6 }} />
          </div>
          <p className={styles.ladderDesc}>
            Students solved standard single-bracket equations (e.g. 3(x + 4) = 27) with optional hint ladder available.
          </p>
        </li>

        {/* Stage 2: Independent Working */}
        <li className={styles.ladderItem} style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className={styles.ladderTop}>
            <div className={styles.ladderStageName}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700 }}>
                2
              </span>
              <span>Independent Execution (Zero Hints)</span>
            </div>
            <span className={styles.ladderCount} style={{ color: "var(--accent)" }}>
              {comprehension.independentCount} of {total} ({independentPct}%)
            </span>
          </div>
          <div className={styles.ladderTrack}>
            <div className={styles.ladderFill} style={{ width: `${independentPct}%` }} />
          </div>
          <p className={styles.ladderDesc}>
            Students completed algebraic line transformations independently without requesting prompts or hint ladders.
          </p>
        </li>

        {/* Stage 3: Fresh Transfer */}
        <li className={styles.ladderItem} style={{ borderLeft: "3px solid var(--accent-deep)" }}>
          <div className={styles.ladderTop}>
            <div className={styles.ladderStageName}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--accent-deep)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700 }}>
                3
              </span>
              <span>Fresh Transfer to Novel Forms</span>
            </div>
            <span className={styles.ladderCount} style={{ color: "var(--accent-deep)" }}>
              {comprehension.transferCount} of {total} ({transferPct}%)
            </span>
          </div>
          <div className={styles.ladderTrack}>
            <div className={styles.ladderFill} style={{ width: `${transferPct}%`, background: "var(--accent-deep)" }} />
          </div>
          <p className={styles.ladderDesc}>
            Applied balance principles to multi-term problems not directly shown during yesterday&apos;s direct instruction.
          </p>
        </li>
      </ul>

      <div className={styles.pedagogicalDistinctionNote}>
        <strong>Assessment Safeguard Note:</strong>
        <p style={{ margin: "2px 0 0" }}>
          Multi-day retention has not yet been measured for this topic. Cogna will automatically schedule a 3-minute check on Day 4 to verify whether these gains persist.
        </p>
      </div>
    </div>
  );
}
