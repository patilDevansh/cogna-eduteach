"use client";

/**
 * PracticeSession — the phase machine.
 *
 * Strictly decision-driven: the screen renders whichever phase the last
 * Decision named (SHOW_QUESTION / SHOW_HINT / SHOW_EXPLANATION /
 * SUGGEST_BREAK / END_SESSION). The component never chooses a teaching move
 * itself; it only asks the orchestrator and renders what comes back.
 */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Confidence,
  Decision,
  continueAfterExplanation,
  endSessionEarly,
  recordConfidence,
  requestHint,
  resumeAfterBreak,
  startSession,
  submitAnswer,
} from "@/lib/api";
import { CheckMark, GentleMark, ProgressDots, Wordmark } from "@/components/ui";
import styles from "./practice.module.css";

type Mode = "baseline" | "adaptive";

interface Feedback {
  correct: boolean;
  message: string;
  askConfidence: boolean;
}

const SESSION_MINUTES = 15;

export default function PracticeSession({
  mode,
  totalQuestions,
  onFinished,
}: {
  mode: Mode;
  totalQuestions: number;
  onFinished?: () => void;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingNext, setPendingNext] = useState<Decision | null>(null);
  const [confidenceSent, setConfidenceSent] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [minutesLeft, setMinutesLeft] = useState(SESSION_MINUTES);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    let alive = true;
    startSession(mode).then((d) => {
      if (alive) setDecision(d);
    });
    const t = setInterval(() => {
      const gone = (Date.now() - startRef.current) / 60000;
      setMinutesLeft(Math.max(0, Math.round(SESSION_MINUTES - gone)));
    }, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode]);

  useEffect(() => {
    if (decision?.uiAction === "SHOW_QUESTION") {
      setHints([]);
      setAnswer("");
      setFeedback(null);
      setPendingNext(null);
      setConfidenceSent(false);
      // focus after phase transition settles
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [decision]);

  useEffect(() => {
    if (decision?.uiAction === "END_SESSION" && onFinished) onFinished();
  }, [decision, onFinished]);

  const applyDecision = useCallback((d: Decision) => {
    if (d.uiAction === "SHOW_HINT" && d.hint) {
      setHints((h) => [...h, d.hint!.text]);
      return;
    }
    setFeedback(null);
    setPendingNext(null);
    setDecision(d);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !decision?.question || !answer.trim()) return;
    setBusy(true);
    const result = await submitAnswer({ questionId: decision.question.id, answer });
    setBusy(false);
    setAnswered((n) => n + 1);
    setFeedback({ ...result.feedback, askConfidence: result.askConfidence });
    setPendingNext(result.next);
  }

  async function handleSkip() {
    if (busy || !decision?.question) return;
    setBusy(true);
    const result = await submitAnswer({
      questionId: decision.question.id,
      answer: "",
      skipped: true,
    });
    setBusy(false);
    setAnswered((n) => n + 1);
    applyDecision(result.next);
  }

  async function handleHint() {
    if (busy || !decision?.question) return;
    setBusy(true);
    const d = await requestHint(decision.question.id);
    setBusy(false);
    applyDecision(d);
    inputRef.current?.focus();
  }

  async function handleConfidence(c: Confidence) {
    if (!decision?.question) return;
    setConfidenceSent(true);
    await recordConfidence(decision.question.id, c);
  }

  function goNext() {
    if (pendingNext) applyDecision(pendingNext);
  }

  if (!decision) {
    return (
      <div className={styles.stage}>
        <p className="muted phase-in">Setting things up…</p>
      </div>
    );
  }

  /* ------------------------------- END_SESSION ------------------------------ */
  if (decision.uiAction === "END_SESSION" && decision.summary) {
    const s = decision.summary;
    return (
      <div className={styles.stage}>
        <div className={`${styles.panel} phase-in stack-4`}>
          <p className="eyebrow">Session complete</p>
          <h1 style={{ fontSize: "var(--text-2xl)" }}>Good work today.</h1>
          <p style={{ fontSize: "var(--text-lg)" }}>{s.encouragement}</p>
          <div className={styles.summaryFacts}>
            <p>
              You tried <strong>{s.questionsTried}</strong> questions and solved{" "}
              <strong>{s.solvedWithoutHelp}</strong> without any help.
            </p>
            <p className="muted">
              You practised: {s.conceptsPracticed.join(" · ")}
            </p>
          </div>
          <p className="muted">{s.nextStep}</p>
          <div className={styles.summaryActions}>
            <Link href="/student/revision" className="btn btn-primary">
              See what’s next
            </Link>
            <Link href="/" className="btn btn-quiet">
              Done for now
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ SUGGEST_BREAK ----------------------------- */
  if (decision.uiAction === "SUGGEST_BREAK" && decision.breakSuggestion) {
    return (
      <BreakPhase
        message={decision.breakSuggestion.message}
        seconds={decision.breakSuggestion.suggestedSeconds}
        onResume={async () => {
          const d = await resumeAfterBreak();
          applyDecision(d);
        }}
      />
    );
  }

  /* ----------------------------- SHOW_EXPLANATION --------------------------- */
  if (decision.uiAction === "SHOW_EXPLANATION" && decision.explanation) {
    const ex = decision.explanation;
    return (
      <div className={styles.stage}>
        <SessionChrome answered={answered} total={totalQuestions} minutesLeft={minutesLeft} onEnd={endEarly} />
        <div className={`${styles.panel} phase-in stack-4`} key="explanation">
          <p className="eyebrow">Let’s look at this together</p>
          <h1 style={{ fontSize: "var(--text-xl)" }}>{ex.title}</h1>
          <ol className={styles.explainSteps}>
            {ex.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <button
            className="btn btn-primary btn-lg"
            onClick={async () => {
              setBusy(true);
              const d = await continueAfterExplanation();
              setBusy(false);
              applyDecision(d);
            }}
            disabled={busy}
          >
            Got it — next question
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------- SHOW_QUESTION / HINT ------------------------- */
  const q = decision.question!;
  return (
    <div className={styles.stage}>
      <SessionChrome answered={answered} total={totalQuestions} minutesLeft={minutesLeft} onEnd={endEarly} />

      <div className={`${styles.panel} phase-in`} key={q.id}>
        <p className="eyebrow">{q.conceptLabel}</p>
        <p className={`math worked-line ${styles.question}`}>{q.prompt}</p>

        {hints.length > 0 && (
          <div className={styles.hints} aria-live="polite">
            {hints.map((h, i) => (
              <p key={i} className="settle">
                <span className={styles.hintTag}>Hint {i + 1}</span> {h}
              </p>
            ))}
          </div>
        )}

        {!feedback ? (
          <form onSubmit={handleSubmit} className={styles.answerRow}>
            <label htmlFor="answer" className="sr-only" style={{ position: "absolute", left: -9999 }}>
              Your answer for x
            </label>
            <span className="math-sm" aria-hidden="true">
              x =
            </span>
            <input
              id="answer"
              ref={inputRef}
              className={`input ${styles.answerInput}`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="?"
            />
            <button className="btn btn-primary" disabled={busy || !answer.trim()}>
              Check
            </button>
          </form>
        ) : (
          <div className="stack-4" aria-live="polite">
            <div
              className={`feedback settle ${feedback.correct ? "feedback-correct" : "feedback-incorrect"}`}
            >
              {feedback.correct ? <CheckMark /> : <GentleMark />}
              <div>
                <strong>{feedback.correct ? "Correct" : "Not quite"}</strong>
                {feedback.message}
              </div>
            </div>

            {feedback.askConfidence && !confidenceSent && (
              <div className={styles.confidence}>
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  How did that one feel?
                </p>
                <div className={styles.confidenceRow}>
                  <button className="btn btn-ghost" onClick={() => handleConfidence("sure")}>
                    I was sure
                  </button>
                  <button className="btn btn-ghost" onClick={() => handleConfidence("somewhat")}>
                    Fairly sure
                  </button>
                  <button className="btn btn-ghost" onClick={() => handleConfidence("guessed")}>
                    I guessed
                  </button>
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-lg" onClick={goNext} autoFocus>
              Continue
            </button>
          </div>
        )}

        {!feedback && (
          <div className={styles.quietRow}>
            <button className="btn btn-quiet" onClick={handleHint} disabled={busy}>
              Give me a hint
            </button>
            <button className="btn btn-quiet" onClick={handleSkip} disabled={busy}>
              Skip this one
            </button>
          </div>
        )}
      </div>
    </div>
  );

  async function endEarly() {
    const d = await endSessionEarly();
    applyDecision(d);
  }
}

/* ------------------------------ small pieces ------------------------------ */

function SessionChrome({
  answered,
  total,
  minutesLeft,
  onEnd,
}: {
  answered: number;
  total: number;
  minutesLeft: number;
  onEnd: () => void;
}) {
  return (
    <div className={styles.chrome}>
      <Wordmark size="1.1rem" />
      <div className="progress-row">
        <ProgressDots done={answered} total={total} current />
        <span className="time-note">
          {minutesLeft > 1 ? `about ${minutesLeft} min left` : "wrapping up soon"}
        </span>
      </div>
      <button className="btn btn-quiet" onClick={onEnd}>
        Finish early
      </button>
    </div>
  );
}

function BreakPhase({
  message,
  seconds,
  onResume,
}: {
  message: string;
  seconds: number;
  onResume: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`${styles.stage} ${styles.breakStage}`}>
      <div className={`phase-in center stack-6`} style={{ maxWidth: "26rem" }}>
        <div className={`${styles.breathCircle} breathe`} aria-hidden="true" />
        <div className="stack-2">
          <h1 style={{ fontSize: "var(--text-xl)" }}>Time for a short break</h1>
          <p className="muted">{message}</p>
        </div>
        <p className="faint" aria-live="off">
          {left > 0 ? `${left}s — no rush` : "Whenever you’re ready"}
        </p>
        <button className="btn btn-primary btn-lg" onClick={onResume}>
          I’m ready to continue
        </button>
      </div>
    </div>
  );
}
