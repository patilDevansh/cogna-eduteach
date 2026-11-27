"use client";

import { useLayoutEffect, useRef } from "react";
import { carry, tokenize } from "@cogna/lesson-video/player";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const TRAVEL = 720;
const ENTER: Keyframe[] = [
  { opacity: 0, transform: "translateY(8px)", filter: "blur(6px)" },
  { opacity: 1, transform: "none", filter: "blur(0)" },
];

/**
 * Worked steps where each line is born from the one above it: a term that is
 * still there lifts off the previous line and travels down to its new place,
 * and only what is new comes into focus. The last line gets the ruled line.
 * The text is ordinary text throughout, so it reads and copies normally.
 * Styles: `.carry` in globals.css.
 */
export function CarrySteps({ steps, equals = false, stepMs = 950 }: { steps: string[]; /** Put "=" before every line after the first. */ equals?: boolean; stepMs?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const lines = steps.map(tokenize);
  const signature = steps.join("\n");

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = [...el.children] as HTMLElement[];
    // Measure everything in its final place first, then start each term from where it came from.
    const rects = rows.map((row) => new Map([...row.querySelectorAll<HTMLElement>("[data-i]")].map((t) => [t.dataset.i!, t.getBoundingClientRect()])));
    const running: Animation[] = [];
    rows.forEach((row, r) => {
      const delay = r * stepMs;
      const late = delay + (r > 0 ? TRAVEL * 0.45 : 0);
      const eq = row.querySelector<HTMLElement>(".carry-eq");
      if (eq) running.push(eq.animate(ENTER, { duration: 420, delay, easing: EASE, fill: "backwards" }));
      for (const tok of row.querySelectorAll<HTMLElement>("[data-i]")) {
        const to = rects[r]!.get(tok.dataset.i!)!;
        const from = tok.dataset.from ? rects[r - 1]?.get(tok.dataset.from) : undefined;
        running.push(
          from
            ? tok.animate({ translate: [`${from.left - to.left}px ${from.top - to.top}px`, "0px 0px"], opacity: [0, 1, 1, 1, 1] }, { duration: TRAVEL, delay, easing: EASE, fill: "backwards" })
            : tok.animate(ENTER, { duration: 420, delay: late, easing: EASE, fill: "backwards" }),
        );
      }
    });
    return () => running.forEach((a) => a.cancel());
  }, [signature, stepMs]);

  return (
    <div ref={root} className="carry" style={{ ["--carry-end" as string]: `${(steps.length - 1) * stepMs + TRAVEL * 0.8}ms` }}>
      {lines.map((tokens, r) => {
        const sources = r > 0 ? carry(lines[r - 1]!, tokens) : [];
        return (
          <div key={r} className="carry-line" data-last={steps.length > 1 && r === steps.length - 1 ? "" : undefined}>
            {equals && r > 0 && <span className="carry-eq">=</span>}
            {tokens.map((tok, i) =>
              tok.trim() === "" ? (
                tok
              ) : (
                <span key={i} data-i={i} data-from={(sources[i] ?? -1) >= 0 ? sources[i] : undefined}>
                  {/^[A-Za-z]$/.test(tok) ? <i>{tok}</i> : tok}
                </span>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
