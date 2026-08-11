/** Typesets a controlled expression string (never raw student input) — adds operator spacing and turns "^2" into a real superscript. Built from plain React nodes, no HTML injection. */
import React from "react";

function addOperatorSpacing(expr: string): string {
  return expr
    .replace(/([A-Za-z0-9)])([+-])(?!\s)/g, "$1 $2 ")
    .replace(/\s+/g, " ")
    .trim();
}

interface DisplayToken {
  text: string;
  sup?: boolean;
}

function tokenize(expr: string): DisplayToken[] {
  const spaced = addOperatorSpacing(expr);
  const tokens: DisplayToken[] = [];
  let i = 0;
  while (i < spaced.length) {
    if (spaced[i] === "^") {
      let j = i + 1;
      while (j < spaced.length && spaced[j] >= "0" && spaced[j] <= "9") j++;
      tokens.push({ text: spaced.slice(i + 1, j), sup: true });
      i = j;
      continue;
    }
    let j = i;
    while (j < spaced.length && spaced[j] !== "^") j++;
    tokens.push({ text: spaced.slice(i, j) });
    i = j;
  }
  return tokens;
}

export function MathExpr({ expr, className }: { expr: string; className?: string }) {
  const tokens = tokenize(expr);
  return (
    <span className={className}>
      {tokens.map((t, idx) => (t.sup ? <sup key={idx}>{t.text}</sup> : <React.Fragment key={idx}>{t.text}</React.Fragment>))}
    </span>
  );
}
