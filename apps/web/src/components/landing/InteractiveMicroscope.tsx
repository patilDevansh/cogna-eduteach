"use client";

import { useState } from "react";
import { Maths } from "@/components/maths";
import styles from "./interactive-microscope.module.css";

interface ExampleCase {
  id: string;
  name: string;
  equation: string;
  concept: string;
  steps: Array<{
    text: string;
    label: string;
    isBroken?: boolean;
    note?: string;
  }>;
  breakdown: {
    title: string;
    enteredMath: string;
    enteredNote: string;
    correctMath: string;
    correctNote: string;
    ruleTitle: string;
    ruleText: string;
  };
}

const CASES: ExampleCase[] = [
  {
    id: "brackets",
    name: "Bracket expansion",
    equation: "3(x + 4) = 21",
    concept: "Distributive property",
    steps: [
      { text: "3(x + 4) = 21", label: "Given equation" },
      { text: "3x + 4 = 21", label: "Break on line 1", isBroken: true },
      { text: "3x = 17", label: "Compounded consequence" },
    ],
    breakdown: {
      title: "Line 1 · Incomplete distribution",
      enteredMath: "3(x + 4) → 3x + 4",
      enteredNote: "The 3 multiplied x, but missed the +4 inside the bracket.",
      correctMath: "3(x + 4) → 3x + 12",
      correctNote: "3 is multiplied by every term: 3·x + 3·4 = 3x + 12.",
      ruleTitle: "The rule",
      ruleText: "A bracket factor multiplies the entire sum inside, not just the leading variable.",
    },
  },
  {
    id: "signs",
    name: "Negative signs",
    equation: "−2(y − 5) = 16",
    concept: "Sign preservation",
    steps: [
      { text: "−2(y − 5) = 16", label: "Given equation" },
      { text: "−2y − 10 = 16", label: "Break on line 1", isBroken: true },
      { text: "−2y = 26", label: "Compounded consequence" },
    ],
    breakdown: {
      title: "Line 1 · Second sign dropped",
      enteredMath: "−2 × (−5) → −10",
      enteredNote: "The negative was preserved on y, but dropped when expanding the second term.",
      correctMath: "−2 × (−5) → +10",
      correctNote: "Negative multiplied by negative gives positive 10: −2y + 10 = 16.",
      ruleTitle: "The rule",
      ruleText: "When multiplying signed factors, (−a) × (−b) = +ab.",
    },
  },
  {
    id: "balance",
    name: "Two-sided balance",
    equation: "5x − 7 = 2x + 8",
    concept: "Maintaining equality",
    steps: [
      { text: "5x − 7 = 2x + 8", label: "Given equation" },
      { text: "3x = 1", label: "Break on line 1", isBroken: true },
      { text: "x = 1/3", label: "Compounded consequence" },
    ],
    breakdown: {
      title: "Line 1 · Constant balance error",
      enteredMath: "8 − 7 → 1",
      enteredNote: "Subtracted 2x from both sides, but subtracted 7 instead of adding 7 to cancel −7.",
      correctMath: "8 + 7 → 15",
      correctNote: "To eliminate −7 on the left, add 7 to both sides: 3x = 15 → x = 5.",
      ruleTitle: "The rule",
      ruleText: "Inverse operations undo terms: add to cancel subtraction across the equal sign.",
    },
  },
];

/** "a → b": each side stays whole, so a narrow box breaks the line only at the arrow. */
function Rewrite({ text }: { text: string }) {
  const [from, to] = text.split(" → ");
  return (
    <span className={styles.contrastMath}>
      <Maths>{from ?? text}</Maths>
      {to !== undefined && <> → <Maths>{to}</Maths></>}
    </span>
  );
}

export function InteractiveMicroscope() {
  const [activeCaseId, setActiveCaseId] = useState<string>("brackets");
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(1);

  const activeCase = CASES.find((c) => c.id === activeCaseId) ?? CASES[0]!;

  function selectCase(id: string) {
    setActiveCaseId(id);
    setSelectedStepIndex(1); // Default to the broken step
  }

  return (
    <section className={`shell ${styles.container}`} aria-label="Interactive Mistake Microscope preview">
      <div className={styles.header}>
        <div className={styles.badge}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Mistake microscope
        </div>
        <span className={styles.hint}>Pick a line to look at it closely</span>
      </div>

      <div className={styles.tabs} role="tablist">
        {CASES.map((c) => {
          const isActive = c.id === activeCaseId;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => selectCase(c.id)}
            >
              <span>{c.name}</span>
              <Maths className={styles.tabMath}>{c.equation}</Maths>
            </button>
          );
        })}
      </div>

      <div className={styles.body}>
        {/* Left: Steps */}
        <div className={styles.stepList}>
          <div className={styles.stepTitle}>Each line, checked</div>
          {activeCase.steps.map((step, idx) => {
            const isSelected = idx === selectedStepIndex;
            return (
              <button
                key={step.text}
                type="button"
                className={`${styles.stepCard} ${step.isBroken ? styles.stepCardBroken : ""} ${
                  isSelected ? styles.stepCardActive : ""
                }`}
                onClick={() => setSelectedStepIndex(idx)}
              >
                <Maths>{step.text}</Maths>
                <span
                  className={`${styles.stepLabel} ${step.isBroken ? styles.stepLabelBroken : ""} ${
                    isSelected ? styles.stepLabelActive : ""
                  }`}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Microscope Lens */}
        <div className={styles.microscopePanel}>
          <div className={styles.panelHeading}>
            <div className={styles.panelTitle}>{activeCase.breakdown.title}</div>
          </div>

          <div className={styles.contrastRow}>
            <div className={`${styles.contrastBox} ${styles.contrastBoxBroken}`}>
              <span className={`${styles.contrastTag} ${styles.contrastTagBroken}`}>What the student wrote</span>
              <Rewrite text={activeCase.breakdown.enteredMath} />
              <span className={styles.contrastDesc}>{activeCase.breakdown.enteredNote}</span>
            </div>

            <div className={`${styles.contrastBox} ${styles.contrastBoxCorrect}`}>
              <span className={`${styles.contrastTag} ${styles.contrastTagCorrect}`}>The correct step</span>
              <Rewrite text={activeCase.breakdown.correctMath} />
              <span className={styles.contrastDesc}>{activeCase.breakdown.correctNote}</span>
            </div>
          </div>

          <div className={styles.ruleBox}>
            <div className={styles.ruleLabel}>{activeCase.breakdown.ruleTitle}</div>
            <div className={styles.ruleText}>{activeCase.breakdown.ruleText}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
