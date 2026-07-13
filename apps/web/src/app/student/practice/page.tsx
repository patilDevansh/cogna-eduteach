"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PracticeNextResponse, QuestionPayload } from "@cogna/shared";
import { api, newEventId } from "@/lib/api";
import { getStudent, clearStudent } from "@/lib/session";

type Phase =
  | "loading"
  | "question"
  | "confidence"
  | "feedback"
  | "explanation"
  | "ended";

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
  } | null>(null);
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

  const questionShownAt = useRef<number>(Date.now());
  const firstInputAt = useRef<number | null>(null);
  const pendingEventId = useRef<string | null>(null);
  const pendingPayload = useRef<Parameters<typeof api.submitAnswer>[0] | null>(null);

  const question = current?.payload as QuestionPayload | undefined;

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
      questionShownAt.current = Date.now();
      setPhase(
        session.next.decision.uiAction === "END_SESSION" ? "ended" : "question",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setPhase("loading");
    }
  }, [mode, router]);

  useEffect(() => {
    startSession();
  }, [startSession]);

  function onAnswerChange(value: string) {
    if (!firstInputAt.current) firstInputAt.current = Date.now();
    setAnswerChanged(true);
    setAnswer(value);
  }

  async function requestHint() {
    if (!question || !sessionId || !studentId) return;

    try {
      const result = await api.requestHint({
        eventId: newEventId(),
        eventType: "HINT_REQUESTED",
        studentId,
        sessionId,
        questionId: question.id,
        questionVersion: question.version,
      });
      const hint = result.hint ?? result.payload;
      setHints((prev) => [...prev, hint]);
      setHintCount((c) => c + 1);
      setHighestHintLevel(hint.level);
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
    setPhase("confidence");
  }

  async function submitAnswer(conf: number | null) {
    if (!question || !sessionId || !studentId) return;

    setSubmitting(true);
    setError("");

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

      setGradeResult({ grade: result.grade, isCorrect: result.isCorrect });

      if (result.next?.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        setPhase("ended");
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
    try {
      const result = await api.submitAnswer(pendingPayload.current);
      pendingEventId.current = null;
      pendingPayload.current = null;
      setGradeResult({ grade: result.grade, isCorrect: result.isCorrect });
      if (result.next?.decision.uiAction === "SHOW_EXPLANATION") {
        setCurrent(result.next);
        setPhase("explanation");
      } else {
        setCurrent(result.next ?? null);
        setPhase("feedback");
      }
      setError("");
    } catch (err) {
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
      setPhase("ended");
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
      });

      if (result.next?.decision.uiAction === "END_SESSION") {
        const end = await api.endSession(sessionId);
        setSummary({
          questionCount: end.questionCount,
          summaryReportId: end.summaryReportId,
        });
        setPhase("ended");
        return;
      }

      resetQuestionState(result.next ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    }
  }

  function resetQuestionState(next: PracticeNextResponse | null) {
    setCurrent(next);
    setAnswer("");
    setConfidence(null);
    setGradeResult(null);
    setHints([]);
    setHintCount(0);
    setHighestHintLevel(0);
    setAnswerChanged(false);
    firstInputAt.current = null;
    questionShownAt.current = Date.now();
    setPhase(next?.decision.uiAction === "END_SESSION" ? "ended" : "question");
  }

  async function endSessionEarly() {
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
  }

  function signOut() {
    clearStudent();
    router.push("/");
  }

  if (phase === "loading") {
    return (
      <div className="card">
        <p>Starting session…</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="card">
        <h1>Great work, {studentName}!</h1>
        <p className="lead">
          You answered {summary?.questionCount ?? 0} questions this session.
        </p>
        {summary?.summaryReportId && (
          <p className="lead" style={{ fontSize: "0.85rem" }}>
            Session saved.
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => router.push("/student/baseline")}
          >
            Practice again
          </button>
          <button type="button" className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (phase === "explanation" && current) {
    const explanation = current.payload as { content: string; checkForUnderstanding?: string };
    return (
      <div className="card">
        <h1>Let&apos;s review</h1>
        <div className="explanation-box">
          <p>{explanation?.content}</p>
          {explanation?.checkForUnderstanding && (
            <p style={{ marginTop: "0.75rem", fontStyle: "italic" }}>
              {explanation.checkForUnderstanding}
            </p>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <button
          type="button"
          className="btn btn-primary"
          onClick={continueAfterExplanation}
        >
          Continue
        </button>
      </div>
    );
  }

  if (phase === "confidence") {
    return (
      <div className="card">
        <h1>How confident were you?</h1>
        <p className="lead">Rate 1 (not sure) to 5 (very sure), or skip.</p>
        <div className="confidence-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`confidence-btn ${confidence === n ? "selected" : ""}`}
              onClick={() => setConfidence(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={() => submitAnswer(confidence)}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={submitting}
            onClick={() => submitAnswer(null)}
          >
            Skip
          </button>
          {pendingPayload.current && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={retrySubmit}
              disabled={submitting}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "feedback") {
    return (
      <div className="card">
        <h1>{gradeResult?.isCorrect ? "Nice!" : "Not quite"}</h1>
        <div
          className={`grade-feedback ${gradeResult?.isCorrect ? "correct" : "incorrect"}`}
        >
          {gradeResult?.isCorrect
            ? "Your answer is correct."
            : "Let's keep practicing — you'll get another question."}
        </div>
        <button type="button" className="btn btn-primary" onClick={continueAfterFeedback}>
          Next question
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
        {mode === "BASELINE" ? "Baseline" : "Practice"}
      </p>

      {question ? (
        <>
          <div className="question-stem">{question.stem}</div>

          {hints.map((h) => (
            <div key={h.level} className="hint-box">
              <strong>Hint {h.level}:</strong> {h.content}
            </div>
          ))}

          <label htmlFor="answer">Your answer</label>
          <input
            id="answer"
            type="text"
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            placeholder="e.g. 16 or x=16"
            autoComplete="off"
          />

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitForConfidence}
              disabled={submitting}
            >
              Submit answer
            </button>
            {(question.hintLadder?.length ?? 0) > highestHintLevel && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={requestHint}
                disabled={submitting}
              >
                Hint
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={endSessionEarly}
            >
              End session
            </button>
          </div>
        </>
      ) : (
        <p>No question available.</p>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="card"><p>Loading…</p></div>}>
      <PracticeContent />
    </Suspense>
  );
}
