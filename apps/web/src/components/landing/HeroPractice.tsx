"use client";

import { useState } from "react";
import { Maths } from "@/components/maths";
import styles from "@/app/landing.module.css";

const RIGHT = "3x + 12 = 21";
const CHOICES = ["3x + 7 = 21", RIGHT, "x + 4 = 21"];

/** The landing hero: a real practice moment the visitor can solve, tilting in 3D under the mouse. */
export function HeroPractice() {
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);

  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--px", ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
    event.currentTarget.style.setProperty("--py", ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
  }

  function settle(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--px", "0");
    event.currentTarget.style.setProperty("--py", "0");
  }

  function pick(choice: string) {
    if (choice === RIGHT) setSolved(true);
    else setWrong((list) => [...list, choice]);
  }

  return (
    <div className={styles.stage} onPointerMove={tilt} onPointerLeave={settle}>
      <section className={styles.practice} aria-label="Try a practice question">
        <div className={styles.practiceTop}>
          <span>Question 4 of 8</span>
          <span className={styles.bar}><i /></span>
        </div>
        <p className={styles.prompt}>Solve for <Maths>x</Maths></p>
        <ol className={styles.lines}>
          <li><Maths>3(x + 4) = 21</Maths></li>
          <li className={`${styles.flagged} ${solved ? styles.struck : ""}`}>
            <Maths>3x + 4 = 21</Maths>
            <span className={styles.flag}>{solved ? "Fixed" : "Check this line"}</span>
          </li>
          {solved && <li className={styles.fixed}><Maths>{RIGHT}</Maths></li>}
        </ol>

        {!solved && (
          <div className={styles.ask}>
            <p id="hero-ask">What should line 2 be?</p>
            <div className={styles.choices} role="group" aria-labelledby="hero-ask">
              {CHOICES.map((choice) => {
                const nope = wrong.includes(choice);
                return (
                  <button
                    key={choice}
                    type="button"
                    className={`${styles.choice} ${nope ? styles.nope : ""}`}
                    disabled={nope}
                    onClick={() => pick(choice)}
                  >
                    <Maths>{choice}</Maths>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div aria-live="polite">
          {solved ? (
            <div className={`${styles.hint} ${styles.hintDone}`}>
              <strong>That&apos;s it</strong>
              <span>The 3 multiplies everything inside the bracket, so 3 × 4 = 12.</span>
              <button type="button" className={styles.again} onClick={() => { setSolved(false); setWrong([]); }}>
                Try it again
              </button>
            </div>
          ) : wrong.length > 0 ? (
            <div className={styles.hint} key={wrong.length}>
              <strong>Hint</strong>
              <span>The 3 multiplies everything inside the bracket, the 4 as well.</span>
            </div>
          ) : null}
        </div>
      </section>

      <div className={`${styles.float} ${styles.caught} ${solved ? styles.caughtDone : ""}`} aria-hidden="true">
        <span className={styles.dot} />
        {solved ? "Fixed at line 2 · bracket expansion" : "Caught at line 2 · bracket expansion"}
      </div>
      <div className={`${styles.float} ${styles.ready}`} aria-hidden="true">
        <span>Grade 8 · Section A</span>
        <strong>{solved ? 28 : 27} of 34</strong>
        <em>ready to move on</em>
        <span className={`${styles.miniBar} ${solved ? styles.miniUp : ""}`}><i /></span>
      </div>
    </div>
  );
}
