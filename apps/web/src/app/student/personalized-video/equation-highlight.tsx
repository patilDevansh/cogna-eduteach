import React from "react";
import type { EquationStep } from "@cogna/shared";
import styles from "./personalized-video.module.css";

function renderStepText(step: EquationStep, delayMs: number): React.ReactNode {
  const ranges = step.highlight;
  if (!ranges?.length) return step.text;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach(([start, end], index) => {
    if (start > cursor) nodes.push(step.text.slice(cursor, start));
    nodes.push(
      <span key={index} className={styles.equationHighlight} style={{ animationDelay: `${delayMs}ms` }}>
        {step.text.slice(start, end)}
      </span>,
    );
    cursor = end;
  });
  if (cursor < step.text.length) nodes.push(step.text.slice(cursor));
  return nodes;
}

/**
 * Renders a scene's equation steps joined by " → ", same as the plain
 * .map(text).join(" → ") this replaces — but wraps each step's authored
 * highlight ranges (EquationStep.highlight) in a chip that pops in, with a
 * small stagger per step so the eye is drawn through the sequence in order
 * rather than everything appearing at once.
 */
export function renderEquationSteps(steps: EquationStep[]): React.ReactNode {
  return steps.map((step, index) => (
    <React.Fragment key={index}>
      {index > 0 && " → "}
      {renderStepText(step, index * 150)}
    </React.Fragment>
  ));
}
