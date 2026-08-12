"use client";

import type { ReactNode } from "react";
import styles from "@/components/diagnostic-v2.module.css";

/**
 * Display-only rendering of slash-ASCII algebra lines as stacked fractions.
 * Input / API continue to use plain strings like `(x + 1)/2`.
 */

type Piece =
  | { kind: "text"; value: string }
  | { kind: "frac"; num: string; den: string };

/**
 * Match the one-level fraction forms used by the diagnostic renderer.
 *
 * Keep this expression deliberately non-recursive. `MathText` also receives
 * whole AI explanations, and the previous nested parenthesis matcher could
 * backtrack exponentially on a long sentence with an unmatched `(`. Opening
 * the debug panel then blocked the browser's main thread and could crash the
 * tab. Diagnostic equations only require `(x + 1)/2`, `x/2`, and numeric
 * equivalents, so a single parenthesis level is both sufficient and linear.
 */
const FRAC_RE =
  /(\([^()\r\n]*\)|[A-Za-z]\w*|\d+)\s*\/\s*(\([^()\r\n]*\)|[A-Za-z]\w*|\d+)/g;

function tokenize(line: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of line.matchAll(FRAC_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      pieces.push({ kind: "text", value: line.slice(last, index) });
    }
    pieces.push({ kind: "frac", num: match[1]!.trim(), den: match[2]!.trim() });
    last = index + match[0].length;
  }
  if (last < line.length) {
    pieces.push({ kind: "text", value: line.slice(last) });
  }
  if (pieces.length === 0) {
    pieces.push({ kind: "text", value: line });
  }
  return pieces;
}

/** Prose-safe variant for feedback/reasoning that may contain embedded maths. */
export function MathText({ text }: { text: string }) {
  return <span className={styles.mathLine}>{renderPieces(tokenize(text))}</span>;
}

function stripOuterParens(s: string): string {
  if (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") {
        depth--;
        if (depth === 0 && i < s.length - 1) return s;
      }
    }
    if (depth === 0) return s.slice(1, -1);
  }
  return s;
}

function renderPieces(pieces: Piece[]): ReactNode[] {
  return pieces.map((p, i) => {
    if (p.kind === "text") {
      return (
        <span key={i} className={styles.mathText}>
          {p.value}
        </span>
      );
    }
    return (
      <span key={i} className={styles.frac} title={`${p.num}/${p.den}`}>
        <span className={styles.fracNum}>{stripOuterParens(p.num)}</span>
        <span className={styles.fracBar} aria-hidden="true" />
        <span className={styles.fracDen}>{stripOuterParens(p.den)}</span>
      </span>
    );
  });
}

/** Split "Solve for x:  …" so the instruction stays plain and the equation stacks. */
export function MathLine({ text }: { text: string }) {
  const colon = text.match(/^(Solve for [A-Za-z]\s*:\s*)(.+)$/i);
  if (colon) {
    return (
      <span className={styles.mathLine}>
        <span className={styles.mathText}>{colon[1]}</span>
        {renderPieces(tokenize(colon[2]!.trim()))}
      </span>
    );
  }
  return <span className={styles.mathLine}>{renderPieces(tokenize(text))}</span>;
}
