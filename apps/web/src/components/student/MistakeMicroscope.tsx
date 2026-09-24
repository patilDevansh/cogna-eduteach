"use client";

import React, { useState } from "react";
import styles from "./mistake-microscope.module.css";

export interface MistakeDetails {
  hypothesisId: string;
  hypothesisName: string;
  problemPrompt: string;
  studentInvalidLine: string;
  correctTransformation: string;
  highlightSnippet: string;
  explanation: string;
  probeQuestion: string;
  probeOptions: Array<{ id: string; text: string; isCorrect: boolean; feedback: string }>;
  transferProblem: {
    prompt: string;
    expectedSteps: string[];
    finalAnswer: string;
  };
}

interface MistakeMicroscopeProps {
  details: MistakeDetails;
  onProbeResolved: () => void;
}

export function MistakeMicroscope({ details, onProbeResolved }: MistakeMicroscopeProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isResolved, setIsResolved] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleOptionSelect(optionId: string, isCorrect: boolean, feedbackText: string) {
    setSelectedOption(optionId);
    setFeedback(feedbackText);
    if (isCorrect) {
      setIsResolved(true);
    }
  }

  return (
    <div className={styles.microscopeCard}>
      <div className={styles.badgeRow}>
        <span className={styles.microscopeBadge}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Mistake Microscope · Step Breakdown
        </span>
        <span className={styles.quietTag}>1-Minute Fix</span>
      </div>

      <h2 className={styles.heading}>Here is the exact step that changed the answer</h2>
      <p className={styles.subheading}>
        You set up the equation correctly. Let’s look closely at what happened on line 1:
      </p>

      {/* Comparison Grid */}
      <div className={styles.contrastGrid}>
        <div className={styles.errorSide}>
          <div className={styles.sideLabel}>WHAT WAS ENTERED</div>
          <div className={styles.equationBox}>
            <span className={styles.prevLine}>{details.problemPrompt}</span>
            <span className={styles.arrow}>→</span>
            <span className={styles.invalidLine}>{details.studentInvalidLine}</span>
          </div>
          <div className={styles.errorNote}>
            <strong>What happened:</strong> {details.explanation}
          </div>
        </div>

        <div className={styles.correctSide}>
          <div className={styles.sideLabel}>CORRECT BALANCE</div>
          <div className={styles.equationBox}>
            <span className={styles.prevLine}>{details.problemPrompt}</span>
            <span className={styles.arrow}>→</span>
            <span className={styles.validLine}>{details.correctTransformation}</span>
          </div>
          <div className={styles.correctNote}>
            <strong>The rule:</strong> Every term inside the bracket must be multiplied.
          </div>
        </div>
      </div>

      {/* Active Discriminating Probe Question */}
      <div className={styles.probeSection}>
        <div className={styles.probeHeader}>
          <span className={styles.probeNumber}>Quick Check</span>
          <span className={styles.probeQuestionText}>{details.probeQuestion}</span>
        </div>

        <div className={styles.optionsList}>
          {details.probeOptions.map((opt) => {
            const isSelected = selectedOption === opt.id;
            const btnClass = `${styles.optionBtn} ${
              isSelected ? (opt.isCorrect ? styles.optCorrect : styles.optIncorrect) : ""
            }`;

            return (
              <button
                key={opt.id}
                type="button"
                className={btnClass}
                onClick={() => handleOptionSelect(opt.id, opt.isCorrect, opt.feedback)}
              >
                <span className={styles.optionRadio}>{isSelected ? (opt.isCorrect ? "✓" : "✕") : ""}</span>
                <span className={styles.optionText}>{opt.text}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className={`${styles.feedbackBanner} ${isResolved ? styles.fbSuccess : styles.fbRetry}`}>
            {feedback}
          </div>
        )}
      </div>

      {/* Action Footer */}
      {isResolved && (
        <div className={styles.actionFooter}>
          <p className={styles.footerNote}>
            ✓ <strong>Great observation!</strong> Now let’s test this on a fresh, independent problem with no hints.
          </p>
          <button type="button" className={styles.tryTransferBtn} onClick={onProbeResolved}>
            Try Independent Problem →
          </button>
        </div>
      )}
    </div>
  );
}
