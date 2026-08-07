"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { PracticeNextResponse, QuestionPayload } from "@cogna/shared";
import {
  api,
  breakMinutesFromDecision,
  newEventId,
  SESSION_LIMIT_MS,
} from "@/lib/api";
import { getStudent, clearStudent } from "@/lib/session";
import styles from "@/components/practice.module.css";

type Phase =
  | "loading"
  | "question"
  | "confidence"
  | "feedback"
  | "explanation"
  | "break"
  | "ended"
  | "handoff";

type BreakInfo = {
  minutes: number;
  message: string;
};

function PracticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") ?? "BASELINE") as
    | "BASELINE"
    | "ADAPTIVE_PRACTICE";

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [current, setCurrent] = useState<PracticeNextResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [gradeResult, setGradeResult] = useState<{
    grade: string;
    isCorrect: boolean;
    attemptId?: string;
  } | null>(null);
  const [confidenceTap, setConfidenceTap] = useState<"guess" | "hunch" | "worked-unsure" | "sure" | null>(null);
  const [hints, setHints] = useState<Array<{ level: number; content: string }>>([]);
  const [hintCount, setHintCount] = useState(0);
  const [highestHintLevel, setHighestHintLevel] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<{
    questionCount: number;
    summaryReportId: string;
  } | null>(null);
  const [answerChanged, setAnswerChanged] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [handoffMessage, setHandoffMessage] = useState("");
  const [breakInfo, setBreakInfo] = useState<BreakInfo | null>(null);
  const [breakSuggestedThisSession, setBreakSuggestedThisSession] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [baselineQuestionIndex, setBaselineQuestionIndex] = useState(0);

  const questionShownAt = useRef<number>(Date.now());
  const firstInputAt = useRef<number | null>(null);
  const pendingEventId = useRef<string | null>(null);
  const pendingPayload = useRef<Parameters<typeof api.submitAnswer>[0] | null>(null);

  const question = current?.payload as QuestionPayload | undefined;
  const BASELINE_TARGET = 12;

  function questionLabel(count: number): string {
    return count === 1 ? "question" : "questions";
  }

  function phaseFromDecision(next: PracticeNextResponse | null | undefined): Phase {
    const action = next?.decision?.uiAction;
    if (action === "END_SESSION") return "ended";
    if (action === "SHOW_EXPLANATION") return "explanation";
    // SUGGEST_BREAK is handled via applyBreakFromNext — never land here bare.
    return "question";
  }

  function applyBreakFromNext(next: PracticeNextResponse | null | undefined): boolean {
    if (next?.decision?.uiAction !== "SUGGEST_BREAK") return false;
    if (breakSuggestedThisSession) return false;
    const payload = next.payload as
      | { breakMinutes?: number; message?: string; continueAllowed?: boolean }
      | undefined;
    const minutes =
      typeof payload?.breakMinutes === "number" && payload.breakMinutes > 0
        ? payload.breakMinutes
        : breakMinutesFromDecision(next.decision);
    const message =
      (typeof payload?.message === "string" && payload.message.trim()) ||
      next.studentMessage ||
      "Let's take a short break and come back fresh.";
    setBreakInfo({ minutes, message });
    setBreakSuggestedThisSession(true);
    setCurrent(next);
    setPhase("break");
    return true;
  }

  async function skipSoftBreakAndContinue(
    fallback: PracticeNextResponse | null | undefined,
  ) {
    try {
      const next = await api.getNext(sessionId, studentId);
      if (next.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        setPhase("ended");
        return;
      }
      if (next.decision.uiAction === "SHOW_EXPLANATION") {
        setCurrent(next);
        setPhase("explanation");
        return;
      }
      resetQuestionState(
        next.decision.uiAction === "SUGGEST_BREAK"
          ? { ...next, decision: { ...next.decision, uiAction: "SHOW_QUESTION" } }
          : next,
      );
    } catch {
      if (fallback) resetQuestionState(fallback);
      else setPhase("question");
    }
  }

  const endSessionEarly = useCallback(async () => {
    try {
      const end = await api.endSession(sessionId);
      setSummary({
        questionCount: end.questionCount,
        summaryReportId: end.summaryReportId,
      });
      setPhase("ended");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    }
  }, [sessionId]);

  const startAdaptiveHandoff = useCallback(async () => {
    if (!studentId) return;

    setPhase("loading");
    setError("");
    setHandoffMessage("Starting adaptive practice…");

    try {
      const session = await api.createSession(studentId, "ADAPTIVE_PRACTICE");
      setSessionId(session.sessionId);
      setCurrent(session.next);
      setSessionStartedAt(Date.now());
      setBreakSuggestedThisSession(false);
      setBreakInfo(null);
      questionShownAt.current = Date.now();
      if (session.next.decision.uiAction === "SUGGEST_BREAK") {
        const payload = session.next.payload as
          | { breakMinutes?: number; message?: string }
          | undefined;
        setBreakInfo({
          minutes:
            typeof payload?.breakMinutes === "number" && payload.breakMinutes > 0
              ? payload.breakMinutes
              : breakMinutesFromDecision(session.next.decision),
          message:
            (typeof payload?.message === "string" && payload.message.trim()) ||
            session.next.studentMessage ||
            "Let's take a short break and come back fresh.",
        });
        setBreakSuggestedThisSession(true);
        setPhase("break");
      } else {
        setPhase(phaseFromDecision(session.next));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start adaptive practice",
      );
      setPhase("ended");
    }
  }, [studentId]);

  const startSession = useCallback(async () => {
    const student = getStudent();
    if (!student) {
      router.replace("/student/login");
      return;
    }

    setStudentId(student.studentId);
    setStudentName(student.name);

    try {
      const session = await api.createSession(student.studentId, mode);
      setSessionId(session.sessionId);
      setCurrent(session.next);
      setSessionStartedAt(Date.now());
      setBreakSuggestedThisSession(false);
      setBreakInfo(null);
      setBaselineQuestionIndex(mode === "BASELINE" ? 1 : 0);
      questionShownAt.current = Date.now();
      if (session.next.decision.uiAction === "SUGGEST_BREAK") {
        const payload = session.next.payload as
          | { breakMinutes?: number; message?: string }
          | undefined;
        setBreakInfo({
          minutes:
            typeof payload?.breakMinutes === "number" && payload.breakMinutes > 0
              ? payload.breakMinutes
              : breakMinutesFromDecision(session.next.decision),
          message:
            (typeof payload?.message === "string" && payload.message.trim()) ||
            session.next.studentMessage ||
            "Let's take a short break and come back fresh.",
        });
        setBreakSuggestedThisSession(true);
        setPhase("break");
      } else {
        setPhase(phaseFromDecision(session.next));
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("API unavailable")
          ? "We're having trouble connecting. Ask a grown-up to make sure practice is running, then try again."
          : "Something went wrong starting your session. Please try again.",
      );
      setPhase("loading");
    }
  }, [mode, router]);

  useEffect(() => {
    startSession();
  }, [startSession]);

  useEffect(() => {
    document.title =
      mode === "BASELINE" ? "Baseline — Cogna" : "Practice — Cogna";
  }, [mode]);

  useEffect(() => {
    if (!sessionStartedAt || phase === "ended" || phase === "handoff") return;

    const tick = () => {
      const elapsed = Date.now() - sessionStartedAt;
      setElapsedMs(elapsed);
      if (elapsed >= SESSION_LIMIT_MS && sessionId) {
        void endSessionEarly();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sessionStartedAt, phase, sessionId, endSessionEarly]);

  function formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  function onAnswerChange(value: string) {
    if (!firstInputAt.current) firstInputAt.current = Date.now();
    setAnswerChanged(true);
    setAnswer(value);
    if (error) setError("");
  }

  async function requestHint() {
    if (!question || !sessionId || !studentId) return;
    if ((question.hintLadder?.length ?? 0) <= highestHintLevel) return;

    try {
      const result = await api.requestHint({
        eventId: newEventId(),
        eventType: "HINT_REQUESTED",
        studentId,
        sessionId,
        questionId: question.id,
        questionVersion: question.version,
        clientTimestamp: new Date().toISOString(),
      });
      const hint = result.hint ?? result.payload;
      setHints((prev) => {
        if (prev.some((h) => h.level === hint.level)) return prev;
        return [...prev, hint];
      });
      setHintCount((c) => c + 1);
      setHighestHintLevel((prev) => Math.max(prev, hint.level));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hint unavailable");
    }
  }

  function submitForConfidence() {
    if (!answer.trim()) {
      setError("Please enter an answer.");
      return;
    }
    setError("");
    if (mode === "ADAPTIVE_PRACTICE") {
      // No blocking confidence screen in regular practice — a passive proxy
      // (response time vs. this student's own pace, hints, edits) covers it,
      // with an optional one-tap chip fused into the feedback screen instead.
      void submitAnswer(null);
      return;
    }
    setPhase("confidence");
  }

  async function submitAnswer(conf: number | null) {
    if (!question || !sessionId || !studentId) return;

    setSubmitting(true);
    setError("");
    setSubmitFailed(false);

    const now = Date.now();
    const eventId = pendingEventId.current ?? newEventId();
    pendingEventId.current = eventId;

    const payload = {
      eventId,
      eventType: "ANSWER_SUBMITTED" as const,
      studentId,
      sessionId,
      questionId: question.id,
      questionVersion: question.version,
      submittedAnswer: answer.trim(),
      timeToFirstResponseMs:
        (firstInputAt.current ?? questionShownAt.current) - questionShownAt.current,
      totalTimeMs: now - questionShownAt.current,
      idleTimeMs: 0,
      attemptNumber: 1,
      hintCount,
      highestHintLevel,
      selfRatedConfidence: conf,
      answerChangedBeforeSubmit: answerChanged,
      clientTimestamp: new Date().toISOString(),
    };

    pendingPayload.current = payload;

    try {
      const result = await api.submitAnswer(payload);
      pendingEventId.current = null;
      pendingPayload.current = null;
      setSubmitFailed(false);

      setGradeResult({ grade: result.grade, isCorrect: result.isCorrect, attemptId: result.attemptId });
      setConfidenceTap(null);

      if (result.next?.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        if (mode === "BASELINE" && end.questionCount >= 12) {
          setPhase("handoff");
          return;
        }
        setPhase("ended");
        return;
      }

      if (applyBreakFromNext(result.next)) {
        return;
      }

      if (result.next?.decision.uiAction === "SUGGEST_BREAK") {
        await skipSoftBreakAndContinue(result.next);
        return;
      }

      if (result.next?.decision.uiAction === "SHOW_EXPLANATION") {
        setCurrent(result.next);
        setPhase("explanation");
        return;
      }

      setCurrent(result.next ?? null);
      setPhase("feedback");
    } catch (err) {
      setSubmitFailed(true);
      setError(
        err instanceof Error
          ? `${err.message} — tap Retry to resubmit with the same event.`
          : "Submit failed",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function retrySubmit() {
    if (!pendingPayload.current) return;
    setSubmitting(true);
    setSubmitFailed(false);
    try {
      const result = await api.submitAnswer(pendingPayload.current);
      pendingEventId.current = null;
      pendingPayload.current = null;
      setGradeResult({ grade: result.grade, isCorrect: result.isCorrect, attemptId: result.attemptId });
      setConfidenceTap(null);
      if (result.next?.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        setPhase("ended");
      } else if (applyBreakFromNext(result.next)) {
        // break phase set
      } else if (result.next?.decision.uiAction === "SUGGEST_BREAK") {
        await skipSoftBreakAndContinue(result.next);
      } else if (result.next?.decision.uiAction === "SHOW_EXPLANATION") {
        setCurrent(result.next);
        setPhase("explanation");
      } else {
        setCurrent(result.next ?? null);
        setPhase("feedback");
      }
      setError("");
    } catch (err) {
      setSubmitFailed(true);
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function continueAfterFeedback() {
    if (!current?.decision) return;

    if (current.decision.uiAction === "END_SESSION") {
      const end = await api.endSession(sessionId);
      setSummary({
        questionCount: end.questionCount,
        summaryReportId: end.summaryReportId,
      });
      if (mode === "BASELINE" && end.questionCount >= 12) {
        setPhase("handoff");
        return;
      }
      setPhase("ended");
      return;
    }

    if (current.decision.uiAction === "SUGGEST_BREAK") {
      if (applyBreakFromNext(current)) return;
      await skipSoftBreakAndContinue(current);
      return;
    }

    resetQuestionState(current);
  }

  async function continueAfterExplanation() {
    try {
      const result = await api.explanationViewed({
        eventId: newEventId(),
        eventType: "EXPLANATION_VIEWED",
        studentId,
        sessionId,
        conceptId: current?.decision.parameters.conceptId,
        misconceptionId: current?.decision.parameters.targetMisconception,
        clientTimestamp: new Date().toISOString(),
      });

      if (result.next?.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        if (mode === "BASELINE" && end.questionCount >= 12) {
          setPhase("handoff");
          return;
        }
        setPhase("ended");
        return;
      }

      if (applyBreakFromNext(result.next)) {
        return;
      }

      if (result.next?.decision.uiAction === "SUGGEST_BREAK") {
        await skipSoftBreakAndContinue(result.next);
        return;
      }

      resetQuestionState(result.next ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    }
  }

  async function continueAfterBreak() {
    setBreakInfo(null);
    setError("");
    await skipSoftBreakAndContinue(null);
  }

  function resetQuestionState(next: PracticeNextResponse | null) {
    setCurrent(next);
    setAnswer("");
    setConfidence(null);
    setGradeResult(null);
    setConfidenceTap(null);
    setHints([]);
    setHintCount(0);
    setHighestHintLevel(0);
    setAnswerChanged(false);
    setSubmitFailed(false);
    firstInputAt.current = null;
    questionShownAt.current = Date.now();
    if (mode === "BASELINE" && next && phaseFromDecision(next) === "question") {
      setBaselineQuestionIndex((n) => n + 1);
    }
    setPhase(phaseFromDecision(next));
  }

  async function skipQuestion() {
    if (!question || !sessionId || !studentId || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const result = await api.skipQuestion({
        eventId: newEventId(),
        eventType: "QUESTION_SKIPPED",
        studentId,
        sessionId,
        questionId: question.id,
        questionVersion: question.version,
        clientTimestamp: new Date().toISOString(),
      });

      if (result.next?.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        if (mode === "BASELINE" && end.questionCount >= 12) {
          setPhase("handoff");
          return;
        }
        setPhase("ended");
        return;
      }

      if (applyBreakFromNext(result.next)) {
        return;
      }

      if (result.next?.decision.uiAction === "SUGGEST_BREAK") {
        await skipSoftBreakAndContinue(result.next);
        return;
      }

      resetQuestionState(result.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip question");
    } finally {
      setSubmitting(false);
    }
  }

  function signOut() {
    clearStudent();
    router.push("/");
  }

  const chrome = (
    <div className={styles.chrome}>
      <Link href="/" className="wordmark">
        Cogna<span className="dot">.</span>
      </Link>
      <button type="button" className="btn-quiet" onClick={signOut}>
        Pause and sign out
      </button>
    </div>
  );

  function shell(children: React.ReactNode, extraStageClass?: string) {
    return (
      <div className={`${styles.stage} ${extraStageClass ?? ""}`}>
        {chrome}
        <div className={`${styles.panel} phase-in`}>{children}</div>
      </div>
    );
  }

  if (phase === "loading") {
    return shell(
      <>
        <p className="muted">
          {handoffMessage || "Getting your practice ready…"}
        </p>
        {error && <p className="error">{error}</p>}
      </>,
    );
  }

  if (phase === "handoff") {
    return shell(
      <>
        <p className="eyebrow">Baseline complete</p>
        <h1>Nicely done, {studentName}.</h1>
        <p className="lead">
          You worked through {summary?.questionCount ?? 12}{" "}
          {questionLabel(summary?.questionCount ?? 12)}. Next up: practice that
          adjusts to what you&apos;re ready for.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: "var(--s-6)" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startAdaptiveHandoff()}
          >
            Continue to practice
          </button>
          <Link href="/student/revision" className="btn btn-ghost">
            View practice plan
          </Link>
        </div>
      </>,
    );
  }

  if (phase === "break") {
    return shell(
      <div className="center">
        <p className="eyebrow">Short break</p>
        <div className={`${styles.breathCircle} breathe`} aria-hidden="true" style={{ marginTop: "var(--s-4)" }} />
        <p className="lead" style={{ marginTop: "var(--s-5)" }} role="status">
          {breakInfo?.message ?? "Let's take a short break and come back fresh."}
        </p>
        <p className="faint" style={{ marginTop: "var(--s-2)" }}>
          About {breakInfo?.minutes ?? 3} minute
          {(breakInfo?.minutes ?? 3) === 1 ? "" : "s"} is plenty — stretch, sip
          water, and come back when you&apos;re ready. No rush.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ justifyContent: "center", marginTop: "var(--s-6)" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void continueAfterBreak()}
          >
            I&apos;m ready — continue
          </button>
          <button type="button" className="btn-quiet" onClick={endSessionEarly}>
            End session instead
          </button>
        </div>
      </div>,
      styles.breakStage,
    );
  }

  if (phase === "ended") {
    return shell(
      <>
        <p className="eyebrow">Session complete</p>
        <h1>Great work, {studentName}.</h1>
        <div className={styles.summaryFacts} style={{ marginTop: "var(--s-4)" }}>
          <p>
            You worked through {summary?.questionCount ?? 0}{" "}
            {questionLabel(summary?.questionCount ?? 0)} this session.
          </p>
          {summary?.summaryReportId && <p className="faint">Your progress was saved.</p>}
          {handoffMessage && mode === "ADAPTIVE_PRACTICE" && (
            <p className="faint">{handoffMessage}</p>
          )}
        </div>
        <div className={styles.summaryActions} style={{ marginTop: "var(--s-6)" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              router.push(
                mode === "BASELINE"
                  ? "/student/practice?mode=ADAPTIVE_PRACTICE"
                  : "/student/home",
              )
            }
          >
            Practice again
          </button>
          <Link href="/student/revision" className="btn btn-ghost">
            View practice plan
          </Link>
          <button type="button" className="btn-quiet" onClick={signOut}>
            Sign out
          </button>
        </div>
      </>,
    );
  }

  if (phase === "explanation" && current) {
    const explanation = current.payload as { content: string; checkForUnderstanding?: string };
    return shell(
      <>
        <p className="eyebrow">Let's look at this together</p>
        <h1 style={{ fontSize: "var(--text-lg)" }}>A quick review</h1>
        <div className="help-note" style={{ marginTop: "var(--s-4)" }}>
          <p>{explanation?.content}</p>
          {explanation?.checkForUnderstanding && (
            <p style={{ marginTop: "var(--s-3)", fontStyle: "italic" }}>
              {explanation.checkForUnderstanding}
            </p>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: "var(--s-5)" }}
          onClick={continueAfterExplanation}
        >
          Continue
        </button>
      </>,
    );
  }

  if (phase === "confidence") {
    return shell(
      <>
        <p className="eyebrow">Before we check it</p>
        <h1 style={{ fontSize: "var(--text-lg)" }}>How sure do you feel about that one?</h1>
        <p className="lead">
          1 means just guessing, 5 means very sure. There&apos;s no wrong answer here.
        </p>
        <div className={styles.confidenceRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`btn ${confidence === n ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setConfidence(n)}
              aria-pressed={confidence === n}
            >
              {n}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: "var(--s-5)" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || confidence === null}
            onClick={() => {
              if (confidence === null) return;
              void submitAnswer(confidence);
            }}
          >
            {submitting ? "Checking…" : "Check my answer"}
          </button>
          <button
            type="button"
            className="btn-quiet"
            disabled={submitting}
            onClick={() => void submitAnswer(null)}
          >
            Skip this
          </button>
          {submitFailed && pendingPayload.current && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void retrySubmit()}
              disabled={submitting}
            >
              Retry
            </button>
          )}
        </div>
      </>,
    );
  }

  async function tapConfidence(level: "guess" | "hunch" | "worked-unsure" | "sure") {
    if (!gradeResult?.attemptId || !studentId || confidenceTap) return;
    setConfidenceTap(level);
    const value =
      level === "sure" ? 5 : level === "worked-unsure" ? 3 : level === "hunch" ? 2 : 1;
    try {
      await api.updateAttemptConfidence(gradeResult.attemptId, studentId, value);
    } catch {
      // Optional, non-blocking signal — nothing to surface to the student if this fails.
    }
  }

  if (phase === "feedback") {
    const isCorrect = gradeResult?.isCorrect;
    return shell(
      <>
        <div className={`feedback ${isCorrect ? "feedback-correct" : "feedback-incorrect"} settle`}>
          {isCorrect ? (
            <svg className="check-draw" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
              <path d="M8 14.5l4 4 8-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
              <path d="M14 8v7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="14" cy="19" r="1.4" fill="currentColor" />
            </svg>
          )}
          <div>
            <strong>{isCorrect ? "Nice work — that's right." : "Not quite that one."}</strong>
            <span>
              {isCorrect
                ? "On to the next."
                : "That's completely normal while you're learning this — you'll get another chance to practice it."}
            </span>
          </div>
        </div>

        {mode === "ADAPTIVE_PRACTICE" && gradeResult?.attemptId && (
          <div style={{ marginTop: "var(--s-4)" }}>
            <p className="faint" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--s-2)" }}>
              How did you get that one? (optional)
            </p>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              {(
                [
                  ["guess", "I just picked one"],
                  ["hunch", "I had a hunch"],
                  ["worked-unsure", "I worked it out, but not sure"],
                  ["sure", "I'm sure — I checked it"],
                ] as const
              ).map(([level, label]) => (
                <button
                  key={level}
                  type="button"
                  className={confidenceTap === level ? "btn btn-primary" : "btn btn-ghost"}
                  style={{ padding: "0.5rem 0.9rem", minHeight: "auto", fontSize: "var(--text-sm)" }}
                  onClick={() => void tapConfidence(level)}
                  disabled={Boolean(confidenceTap)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: "var(--s-5)" }}
          onClick={continueAfterFeedback}
        >
          Next question
        </button>
      </>,
    );
  }

  const isEquationStem = question ? /^(solve for x:|compute:)/i.test(question.stem) : false;

  return shell(
    <>
      <div className={styles.quietRow} style={{ borderTop: "none", paddingTop: 0, justifyContent: "space-between" }}>
        {mode === "BASELINE" ? (
          <div className="progress-row">
            <span className="time-note">
              Question {Math.min(baselineQuestionIndex, BASELINE_TARGET)} of {BASELINE_TARGET}
            </span>
            <div className="progress-dots" aria-hidden="true">
              {Array.from({ length: BASELINE_TARGET }, (_, i) => {
                const n = i + 1;
                const cls =
                  n < baselineQuestionIndex ? "done" : n === baselineQuestionIndex ? "now" : "";
                return <span key={n} className={cls} />;
              })}
            </div>
          </div>
        ) : (
          <span className="time-note">Practice · take your time</span>
        )}
        {sessionStartedAt && (
          <span className="time-note" aria-live="polite">
            {formatElapsed(elapsedMs)} / 15:00
          </span>
        )}
      </div>

      {question ? (
        <>
          <div className={`${styles.question} worked-line ${isEquationStem ? "math" : ""}`} style={isEquationStem ? undefined : { fontSize: "var(--text-lg)", fontFamily: "var(--font-display)" }}>
            {question.stem}
          </div>

          {hints.length > 0 && (
            <div className={styles.hints}>
              {hints.map((h) => (
                <div key={h.level}>
                  <span className={styles.hintTag}>Hint {h.level}</span>
                  {h.content}
                </div>
              ))}
            </div>
          )}

          <div className={styles.answerRow}>
            <div className="field" style={{ flex: 1, minWidth: "10rem" }}>
              <label htmlFor="answer">Your answer</label>
              <input
                id="answer"
                className={`input ${styles.answerInput}`}
                type="text"
                value={answer}
                onChange={(e) => onAnswerChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submitting) {
                    e.preventDefault();
                    submitForConfidence();
                  }
                }}
                placeholder="e.g. 16 or x=16"
                autoComplete="off"
              />
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="actions" style={{ marginTop: "var(--s-5)" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitForConfidence}
              disabled={submitting}
            >
              Check
            </button>
            {(question.hintLadder?.length ?? 0) > highestHintLevel && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void requestHint()}
                disabled={submitting}
              >
                Get a hint
              </button>
            )}
            <button
              type="button"
              className="btn-quiet"
              onClick={() => void skipQuestion()}
              disabled={submitting}
            >
              Skip this one
            </button>
          </div>
          <div className={styles.quietRow}>
            <button type="button" className="btn-quiet" onClick={endSessionEarly}>
              End session
            </button>
          </div>
        </>
      ) : (
        <div className="center" style={{ padding: "var(--s-6) 0" }}>
          <p className="lead">No question right now.</p>
          <p className="muted">You can end the session and try again later — that's okay.</p>
          <div className="actions" style={{ justifyContent: "center", marginTop: "var(--s-4)" }}>
            <button type="button" className="btn btn-primary" onClick={endSessionEarly}>
              End session
            </button>
          </div>
        </div>
      )}
    </>,
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className={styles.stage}>
          <div className={`${styles.panel} phase-in`}>
            <p className="muted">Loading…</p>
          </div>
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}
