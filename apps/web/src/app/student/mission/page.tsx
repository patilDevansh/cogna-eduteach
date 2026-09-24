"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MistakeMicroscope, MistakeDetails } from "@/components/student/MistakeMicroscope";
import styles from "./mission.module.css";

type MissionPhase =
  | "briefing"
  | "warmup_q1"
  | "diagnostic_q2"
  | "mistake_microscope"
  | "independent_transfer"
  | "mission_won";

const SAMPLE_MISTAKE: MistakeDetails = {
  hypothesisId: "INCOMPLETE_DISTRIBUTION",
  hypothesisName: "Incomplete Bracket Distribution",
  problemPrompt: "3(x + 4) = 21",
  studentInvalidLine: "3x + 4 = 21",
  correctTransformation: "3x + 12 = 21",
  highlightSnippet: "3 × 4 = 12",
  explanation: "The 3 outside was multiplied by x, but was not multiplied by the 4 inside the brackets.",
  probeQuestion: "When you expand 3(x + 4), what must the constant term (3 × 4) become?",
  probeOptions: [
    { id: "opt_12", text: "12 (because 3 × 4 = 12)", isCorrect: true, feedback: "Exactly! The multiplier outside multiplies every term inside the bracket." },
    { id: "opt_4", text: "4 (keep the 4 as is)", isCorrect: false, feedback: "Notice that 3 is outside the brackets, so it must multiply both x AND 4." },
    { id: "opt_7", text: "7 (because 3 + 4 = 7)", isCorrect: false, feedback: "Brackets mean multiplication, not addition: 3 × 4 = 12." },
  ],
  transferProblem: {
    prompt: "4(x + 3) = 28",
    expectedSteps: ["4x + 12 = 28", "4x = 16", "x = 4"],
    finalAnswer: "x = 4",
  },
};

export default function StudentMissionPage() {
  const [phase, setPhase] = useState<MissionPhase>("briefing");
  const [stepInput, setStepInput] = useState("");
  const [q1StepIndex, setQ1StepIndex] = useState(0);
  const [transferStepIndex, setTransferStepIndex] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Q1 Submit handler
  function handleQ1Submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = stepInput.replace(/\s+/g, "").toLowerCase();
    if (q1StepIndex === 0) {
      if (clean === "2x=12" || clean === "2x=17-5") {
        setQ1StepIndex(1);
        setStepInput("");
        setFeedbackMsg("✓ Valid step line. Now isolate x.");
      } else {
        setFeedbackMsg("Hint: Subtract 5 from both sides: 17 - 5 = 12");
      }
    } else if (q1StepIndex === 1) {
      if (clean === "x=6" || clean === "x=12/2") {
        setFeedbackMsg(null);
        setStepInput("");
        setPhase("diagnostic_q2");
      } else {
        setFeedbackMsg("Hint: Divide 12 by 2.");
      }
    }
  }

  // Q2 Submit handler
  function handleQ2Submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = stepInput.replace(/\s+/g, "").toLowerCase();
    if (clean === "3x+4=21" || clean === "3x+4") {
      // Trigger mistake microscope!
      setFeedbackMsg(null);
      setStepInput("");
      setPhase("mistake_microscope");
    } else if (clean === "3x+12=21") {
      // If student got it right without error, advance
      setPhase("independent_transfer");
    } else {
      setFeedbackMsg("Try expanding the bracket 3(x + 4), or type '3x + 4 = 21' to test the Mistake Microscope.");
    }
  }

  // Transfer Submit handler
  function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = stepInput.replace(/\s+/g, "").toLowerCase();
    if (transferStepIndex === 0) {
      if (clean === "4x+12=28" || clean === "4x=16") {
        setTransferStepIndex(1);
        setStepInput("");
        setFeedbackMsg("✓ Perfect bracket distribution: 4 × x + 4 × 3 = 4x + 12.");
      } else {
        setFeedbackMsg("Remember: multiply 4 by both x and 3.");
      }
    } else if (transferStepIndex === 1) {
      if (clean === "4x=16") {
        setTransferStepIndex(2);
        setStepInput("");
        setFeedbackMsg("✓ Subtracted 12 from both sides.");
      } else if (clean === "x=4") {
        setFeedbackMsg(null);
        setPhase("mission_won");
      } else {
        setFeedbackMsg("Subtract 12 from 28 to isolate 4x.");
      }
    } else if (transferStepIndex === 2) {
      if (clean === "x=4") {
        setFeedbackMsg(null);
        setPhase("mission_won");
      } else {
        setFeedbackMsg("Divide 16 by 4.");
      }
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <Link href="/" className={styles.brand}>Cogna<span className={styles.dot}>.</span></Link>
          <span className={styles.headerTag}>Grade 8 Algebra Rescue</span>
        </div>
        <div className={styles.statusPill}>
          <span className={styles.liveDot} />
          {phase === "briefing" && "Ready to start"}
          {phase === "warmup_q1" && "Step 1 of 3 · Warm-up"}
          {phase === "diagnostic_q2" && "Step 2 of 3 · Core Check"}
          {phase === "mistake_microscope" && "Step 2 · Mistake Microscope"}
          {phase === "independent_transfer" && "Step 3 of 3 · Independent Transfer"}
          {phase === "mission_won" && "Mission Complete"}
        </div>
      </header>

      {/* Main View Area */}
      <main className={styles.main}>
        {/* 1. Briefing */}
        {phase === "briefing" && (
          <div className={styles.card}>
            <div className={styles.cardBadge}>10-MINUTE MISSION</div>
            <h1 className={styles.title}>Master Equations with Brackets & Signs</h1>
            <p className={styles.subtitle}>
              No timers, no marks, no confusing tests. We will check a couple of quick lines, isolate any tricky steps together, and make sure you can solve fresh equations completely alone.
            </p>

            <div className={styles.missionHighlights}>
              <div className={styles.highlightItem}>
                <span className={styles.hIcon}>🎯</span>
                <div>
                  <strong>Target Goal</strong>
                  <p>Solve equations like <code>3(x + 4) = 21</code> with zero hesitation.</p>
                </div>
              </div>
              <div className={styles.highlightItem}>
                <span className={styles.hIcon}>🔍</span>
                <div>
                  <strong>Step Inspection</strong>
                  <p>If a step goes off track, we look at the exact reason immediately.</p>
                </div>
              </div>
              <div className={styles.highlightItem}>
                <span className={styles.hIcon}>⚡</span>
                <div>
                  <strong>Independent Proof</strong>
                  <p>Finish with a new problem to prove you own the method.</p>
                </div>
              </div>
            </div>

            <button type="button" className={styles.startBtn} onClick={() => setPhase("warmup_q1")}>
              Start 10-Minute Mission →
            </button>
          </div>
        )}

        {/* 2. Warm-Up Q1 */}
        {phase === "warmup_q1" && (
          <div className={styles.card}>
            <div className={styles.stepCounter}>Question 1 of 3 · Warm-up</div>
            <h2 className={styles.qHeading}>Solve this two-step equation</h2>

            <div className={styles.equationBoard}>
              <span className={styles.boardLabel}>EQUATION</span>
              <span className={styles.boardMath}>2x + 5 = 17</span>
            </div>

            <div className={styles.workedHistory}>
              <div className={styles.workedLine}>
                <span className={styles.lineNum}>Line 0:</span>
                <code>2x + 5 = 17</code>
              </div>
              {q1StepIndex >= 1 && (
                <div className={styles.workedLine}>
                  <span className={styles.lineNum}>Line 1:</span>
                  <code className={styles.validCode}>2x = 12</code>
                </div>
              )}
            </div>

            <form onSubmit={handleQ1Submit} className={styles.form}>
              <label htmlFor="stepInput" className={styles.inputLabel}>
                {q1StepIndex === 0 ? "Your first step (isolate 2x):" : "Your final step (solve for x):"}
              </label>
              <div className={styles.inputRow}>
                <input
                  id="stepInput"
                  type="text"
                  className={styles.mathInput}
                  placeholder={q1StepIndex === 0 ? "e.g. 2x = 12" : "e.g. x = 6"}
                  value={stepInput}
                  onChange={(e) => setStepInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className={styles.submitBtn}>
                  Check Step →
                </button>
              </div>
            </form>

            {feedbackMsg && <div className={styles.feedbackAlert}>{feedbackMsg}</div>}
          </div>
        )}

        {/* 3. Diagnostic Q2 */}
        {phase === "diagnostic_q2" && (
          <div className={styles.card}>
            <div className={styles.stepCounter}>Question 2 of 3 · Core Check</div>
            <h2 className={styles.qHeading}>Solve this equation with brackets</h2>

            <div className={styles.equationBoard}>
              <span className={styles.boardLabel}>EQUATION</span>
              <span className={styles.boardMath}>3(x + 4) = 21</span>
            </div>

            <form onSubmit={handleQ2Submit} className={styles.form}>
              <label htmlFor="stepInputQ2" className={styles.inputLabel}>
                Your first step (expand the brackets):
              </label>
              <div className={styles.inputRow}>
                <input
                  id="stepInputQ2"
                  type="text"
                  className={styles.mathInput}
                  placeholder="e.g. 3x + 12 = 21"
                  value={stepInput}
                  onChange={(e) => setStepInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className={styles.submitBtn}>
                  Check Step →
                </button>
              </div>
            </form>

            <div className={styles.demoHelperRow}>
              <span className={styles.demoHelpText}>Demo quick action:</span>
              <button
                type="button"
                className={styles.simErrorBtn}
                onClick={() => {
                  setStepInput("3x + 4 = 21");
                  setPhase("mistake_microscope");
                }}
              >
                Simulate Common Step Error (3x + 4 = 21)
              </button>
            </div>

            {feedbackMsg && <div className={styles.feedbackAlert}>{feedbackMsg}</div>}
          </div>
        )}

        {/* 4. Mistake Microscope */}
        {phase === "mistake_microscope" && (
          <MistakeMicroscope
            details={SAMPLE_MISTAKE}
            onProbeResolved={() => {
              setPhase("independent_transfer");
              setStepInput("");
              setTransferStepIndex(0);
              setFeedbackMsg(null);
            }}
          />
        )}

        {/* 5. Independent Transfer Problem */}
        {phase === "independent_transfer" && (
          <div className={styles.card}>
            <div className={styles.transferBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              INDEPENDENT TRANSFER CHECK · NO HINTS
            </div>
            <h2 className={styles.qHeading}>Solve this new problem completely on your own</h2>
            <p className={styles.subtext}>
              This is a fresh problem with different numbers to verify that you own the bracket rule.
            </p>

            <div className={styles.equationBoard}>
              <span className={styles.boardLabel}>NEW EQUATION</span>
              <span className={styles.boardMath}>4(x + 3) = 28</span>
            </div>

            <div className={styles.workedHistory}>
              <div className={styles.workedLine}>
                <span className={styles.lineNum}>Given:</span>
                <code>4(x + 3) = 28</code>
              </div>
              {transferStepIndex >= 1 && (
                <div className={styles.workedLine}>
                  <span className={styles.lineNum}>Step 1:</span>
                  <code className={styles.validCode}>4x + 12 = 28</code>
                </div>
              )}
              {transferStepIndex >= 2 && (
                <div className={styles.workedLine}>
                  <span className={styles.lineNum}>Step 2:</span>
                  <code className={styles.validCode}>4x = 16</code>
                </div>
              )}
            </div>

            <form onSubmit={handleTransferSubmit} className={styles.form}>
              <label htmlFor="stepInputTransfer" className={styles.inputLabel}>
                {transferStepIndex === 0 && "Step 1: Expand 4(x + 3):"}
                {transferStepIndex === 1 && "Step 2: Isolate 4x:"}
                {transferStepIndex === 2 && "Step 3: Solve for x:"}
              </label>
              <div className={styles.inputRow}>
                <input
                  id="stepInputTransfer"
                  type="text"
                  className={styles.mathInput}
                  placeholder={
                    transferStepIndex === 0
                      ? "e.g. 4x + 12 = 28"
                      : transferStepIndex === 1
                      ? "e.g. 4x = 16"
                      : "e.g. x = 4"
                  }
                  value={stepInput}
                  onChange={(e) => setStepInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className={styles.submitBtn}>
                  Submit Independent Step →
                </button>
              </div>
            </form>

            {feedbackMsg && <div className={styles.feedbackAlert}>{feedbackMsg}</div>}
          </div>
        )}

        {/* 6. Mission Won */}
        {phase === "mission_won" && (
          <div className={styles.card}>
            <div className={styles.winIcon}>🎉</div>
            <div className={styles.cardBadge}>MISSION ACCOMPLISHED</div>
            <h1 className={styles.title}>You mastered bracket distribution today!</h1>
            <p className={styles.subtitle}>
              You identified the exact step where brackets multiply constants, corrected it on the spot, and solved a fresh independent equation (<code>4(x + 3) = 28 → x = 4</code>) completely unaided.
            </p>

            <div className={styles.proofSummaryBox}>
              <div className={styles.proofTitle}>INDEPENDENT EVIDENCE VERIFIED</div>
              <div className={styles.proofLine}>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Demonstrated Rule:</strong> Multiplying all terms inside brackets (<code>a(x + b) → ax + ab</code>)
                </div>
              </div>
              <div className={styles.proofLine}>
                <span className={styles.checkIcon}>✓</span>
                <div>
                  <strong>Transfer Proof:</strong> Solved <code>4(x + 3) = 28</code> in 3 independent steps with 0 hints.
                </div>
              </div>
              <div className={styles.proofLine}>
                <span className={styles.checkIcon}>📅</span>
                <div>
                  <strong>Delayed Retention Check:</strong> Scheduled for Thursday (2-minute check).
                </div>
              </div>
            </div>

            <div className={styles.winActionRow}>
              <Link href="/parent/students/demo-student" className={styles.primaryLinkBtn}>
                View 30-Second Parent Evidence Card →
              </Link>
              <Link href="/" className={styles.secondaryLinkBtn}>
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
