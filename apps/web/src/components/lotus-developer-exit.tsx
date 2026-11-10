"use client";

import { useEffect, useRef } from "react";
import type { LotusDeveloperExitPrompt } from "@cogna/shared";
import styles from "./lotus-developer-exit.module.css";

const REASONS: Record<LotusDeveloperExitPrompt["reason"], string> = {
  TIME_LIMIT: "Time limit reached",
  STARTING_POINT_FOUND: "Learning starting point found",
  FLOOR_EXIT_PARALYSIS: "Stopped early: the first questions were too hard right now",
  PLAN_COMPLETE: "Question plan complete",
  NO_READY_QUESTION: "No further checked question is ready",
};

export function LotusDeveloperExit({ prompt, busy, error, onChoose }: {
  prompt: LotusDeveloperExitPrompt;
  busy: boolean;
  error: string;
  onChoose: (choice: "FINISH" | "CONTINUE") => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="developer-exit-heading" aria-describedby="developer-exit-message" onCancel={(event) => event.preventDefault()}>
    <span className={styles.eyebrow}>Developer decision</span>
    <h2 id="developer-exit-heading">Lotus has reached a stopping point</h2>
    <p className={styles.reason}>{REASONS[prompt.reason]}</p>
    <p id="developer-exit-message">{prompt.message}</p>
    <p>Your answer is saved. {prompt.answeredQuestions} questions have been answered.</p>
    <p>{prompt.canContinue
      ? `Finish and open the report, or stay in the test and continue to question ${prompt.nextQuestionNumber}.`
      : "There are no further checked questions available to continue this plan."}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" className="btn btn-ghost" disabled={busy || !prompt.canContinue} onClick={() => onChoose("CONTINUE")}>Stay in test</button>
      <button type="button" className="btn btn-primary" autoFocus disabled={busy} onClick={() => onChoose("FINISH")}>{busy ? "Saving choice…" : "Finish test"}</button>
    </div>
  </dialog>;
}
