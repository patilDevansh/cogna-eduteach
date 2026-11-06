"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LearnerSupport } from "@/components/learning/LearnerSupport";
import Link from "next/link";
import type { PracticeNextResponse, QuestionPayload } from "@cogna/shared";
import {
  api,
  breakMinutesFromDecision,
  newEventId,
  SESSION_LIMIT_MS,
} from "@/lib/api";
import { getStudent, clearStudent } from "@/lib/session";
import { useInteractionObservation } from "@/lib/use-interaction-observation";
import { readRecovery, writeRecovery, recoveryKey } from "@/lib/learner-recovery";
import { useDraftCheckpoints } from "@/lib/use-draft-checkpoints";
import styles from "@/components/practice.module.css";

type Phase =
  | "loading"
  | "question"
  | "confidence"
  | "feedback"
  | "explanation"
  | "break"
  | "ended"
  | "handoff"
  | "recovery-error";

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
  const [hintLoading, setHintLoading] = useState(false);
  const [highestHintLevel, setHighestHintLevel] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [supportPaused, setSupportPaused] = useState(false);
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

  const booted = useRef(false);
  const recoveryReady = useRef(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [blockedRecovery, setBlockedRecovery] = useState<"saved" | "stale" | null>(null);
  const questionShownAt = useRef<number>(Date.now());
  const firstInputAt = useRef<number | null>(null);
  const pendingEventId = useRef<string | null>(null);
  const pendingPayload = useRef<Parameters<typeof api.submitAnswer>[0] | null>(null);
  const submissionLock = useRef(false);

  const question = current?.payload as QuestionPayload | undefined;
  const BASELINE_TARGET = 12;
  type Recovery = { sessionId: string; current: PracticeNextResponse; phase: Phase; answer: string; confidence: number | null; gradeResult: typeof gradeResult; hints: typeof hints; hintCount: number; highestHintLevel: number; startedAt: number; shownAt: number; firstInputAt: number | null; answerChanged: boolean; pending: Parameters<typeof api.submitAnswer>[0] | null };
  function persistRecovery(overrides: Partial<Recovery> = {}) {
    if (!studentId || !sessionId || !current || !recoveryReady.current || phase === "loading") return;
    try {
      if (phase === "ended" || phase === "handoff") { if(pendingPayload.current || !gradeResult && answer.trim())return; sessionStorage.removeItem(recoveryKey("EXERCISE", studentId, mode)); return; }
      writeRecovery(recoveryKey("EXERCISE", studentId, mode), { sessionId, current, phase, answer, confidence, gradeResult, hints, hintCount, highestHintLevel, startedAt: sessionStartedAt ?? Date.now(), shownAt: questionShownAt.current, firstInputAt: firstInputAt.current, answerChanged, pending: pendingPayload.current, ...overrides });
    } catch { setRecoveryMessage("This browser cannot keep a draft after refresh. Keep this page open until your answer is confirmed."); }
  }
  useEffect(() => { persistRecovery(); }, [studentId, sessionId, current, phase, answer, confidence, gradeResult, hints, hintCount, highestHintLevel, submitting]);
  const interaction = useInteractionObservation("EXERCISE", question?.id, question?.version ?? null, "TYPED_ANSWER", (phase === "question" || phase === "confidence") && !supportPaused, sessionId);
  const draftCheckpoints = useDraftCheckpoints("EXERCISE", studentId, sessionId, question?.id, question?.version ?? null, phase === "question" && !submitting && !submitFailed && !supportPaused, questionShownAt.current);

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
      let cached: Recovery | null = null;
      try { cached = readRecovery<Recovery>(recoveryKey("EXERCISE", student.studentId, mode)); } catch { setRecoveryMessage("Draft recovery is unavailable in this browser."); }
      if (cached?.sessionId && typeof cached.answer === "string" && cached.answer.length <= 10000 && Array.isArray(cached.hints) && Number.isFinite(cached.startedAt) && Number.isFinite(cached.shownAt) && cached.current?.decision && cached.current?.payload && (cached.confidence === null || Number.isInteger(cached.confidence) && cached.confidence >= 1 && cached.confidence <= 5) && (!cached.pending || cached.pending.studentId === student.studentId && cached.pending.sessionId === cached.sessionId && cached.pending.questionId === (cached.current.payload as QuestionPayload).id && typeof cached.pending.eventId === "string") && ["question", "confidence", "feedback", "explanation"].includes(cached.phase)) {
        const server = await api.getLearningSession(cached.sessionId);
        const replay = cached.pending && server.attempts.some(a => a.eventId === cached.pending?.eventId && a.questionId === cached.pending?.questionId);
        const superseded = cached.pending && server.attempts.some(a => a.questionId === cached.pending?.questionId && a.eventId !== cached.pending?.eventId);
        if (replay || superseded) {
          setSessionId(cached.sessionId); setAnswer(cached.answer); setPhase("recovery-error");
          setBlockedRecovery(replay ? "saved" : "stale");
          // A saved answer's next step can still succeed: keep the frozen request so Try again resends the same event.
          if (replay) { setCurrent(cached.current); setSessionStartedAt(cached.startedAt); pendingPayload.current = cached.pending; pendingEventId.current = cached.pending?.eventId ?? null; }
          setError(replay ? "We couldn't load your next step just now. Try again, or come back later." : "This answer was not saved because this question already has a different submitted answer.");
          setRecoveryMessage(replay ? "Nothing is lost: your answer is in your learning record." : "Your typed answer is retained in this browser. Check the learning record for the saved answer.");
          return;
        }
        const cachedItem = cached.current.payload as QuestionPayload;
        const supportKey = recoveryKey("SUPPORT",student.studentId,`EXERCISE:${cached.sessionId}:${cachedItem.id}:${cachedItem.version}`);
        let supportPending: any = null;
        try { supportPending = readRecovery<any>(supportKey); } catch { /* canonical mismatch remains explicit */ }
        if(supportPending?.pending?.kind === "SUPPORT_CHECK" && supportPending.pending.eventId === server.currentDelivery?.decisionId && server.studentId === student.studentId && server.status === "ACTIVE") {
          await api.recordLearnerObservation(supportPending.pending);
          writeRecovery(recoveryKey("PREVIOUS_EXERCISE_DRAFT",student.studentId,`${cached.sessionId}:${cachedItem.id}:${cachedItem.version}`),cached);
          writeRecovery(supportKey,{...supportPending,pending:undefined,checkAttempted:true});
          setSessionId(cached.sessionId);setCurrent(server.currentDelivery);setPhase("question");setAnswer("");setConfidence(null);setGradeResult(null);setHints([]);setHintCount(0);setHighestHintLevel(0);setSessionStartedAt(cached.startedAt);questionShownAt.current=Date.now();firstInputAt.current=null;pendingPayload.current=null;pendingEventId.current=null;recoveryReady.current=true;setRecoveryMessage("Your requested practice check was confirmed. The earlier draft is retained locally.");return;
        }
        const issuedItem = server.currentDelivery?.payload as QuestionPayload | undefined;
        const sameItem = server.currentDelivery?.decision.uiAction === cached.current.decision.uiAction && issuedItem?.id === cachedItem?.id && issuedItem?.version === cachedItem?.version;
        if (server.studentId === student.studentId && server.status === "ACTIVE" && (sameItem || replay)) {
          setSessionId(cached.sessionId); setCurrent(replay ? cached.current : server.currentDelivery); setPhase(cached.phase);
          setAnswer(cached.answer); setConfidence(cached.confidence);
          const checked = server.attempts.at(-1)?.storedResponse as {grade:string;isCorrect:boolean;attemptId:string}|undefined;
          setGradeResult(checked ? {grade:checked.grade,isCorrect:checked.isCorrect,attemptId:checked.attemptId} : null);
          const issued = (server.issuedHints ?? []).filter(h=>h.questionId===cachedItem.id);
          const highest = issued.reduce((n,h)=>Math.max(n,h.level??0),0);
          const ladder=(server.currentDelivery?.payload as QuestionPayload)?.hintLadder ?? [];
          setHints(issued.length ? Array.from({length:highest},(_,i)=>({level:i+1,content:ladder[i]??"Previously issued help"})) : []);
          setHintCount(issued.length); setHighestHintLevel(highest);
          setSessionStartedAt(cached.startedAt); questionShownAt.current = cached.shownAt; firstInputAt.current = cached.firstInputAt;
          setAnswerChanged(cached.answerChanged); pendingPayload.current = cached.pending; pendingEventId.current = cached.pending?.eventId ?? null;
          setSubmitFailed(Boolean(cached.pending)); recoveryReady.current = true;
          setRecoveryMessage(cached.pending ? "Your previous answer needs confirmation. Retry saving it." : "Draft restored in this tab. Unchecked work is not a server save.");
          return;
        }
      }
      if (cached?.sessionId) {
        setAnswer(typeof cached.answer === "string" ? cached.answer : "");
        setError("Saved work no longer matches the server's current session. Your local work is retained.");
        setRecoveryMessage("Reload to retry confirmation, or explicitly start a new session from Home.");
        setPhase("recovery-error");return;
      }
      recoveryReady.current = true;
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
      setPhase("recovery-error");
    }
  }, [mode, router]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void startSession();
  }, [startSession]);

  useEffect(() => {
    document.title =
      mode === "BASELINE" ? "Baseline — Cogna" : "Practice — Cogna";
  }, [mode]);

  useEffect(() => {
    if (!sessionStartedAt || phase === "ended" || phase === "handoff" || submitFailed || pendingPayload.current) return;

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
  }, [sessionStartedAt, phase, sessionId, endSessionEarly, submitFailed]);

  function formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  function onAnswerChange(value: string) {
    if (!firstInputAt.current) firstInputAt.current = Date.now();
    if (answer.trim() && value !== answer) setAnswerChanged(true);
    interaction.input(value);
    draftCheckpoints.record(value);
    setAnswer(value);
    persistRecovery({ answer: value, answerChanged: Boolean(answer.trim() && value !== answer) || answerChanged, firstInputAt: firstInputAt.current });
    if (error) setError("");
  }

  async function requestHint() {
    if (hintLoading || submitting || submitFailed) return null;
    if (!question || !sessionId || !studentId) return null;
    if ((question.hintLadder?.length ?? 0) <= highestHintLevel) return null;

    setHintLoading(true);
    const hintEventId = newEventId();
    try {
      const result = await api.requestHint({
        eventId: hintEventId,
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
      return hintEventId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hint unavailable");
      return null;
    } finally { setHintLoading(false); }
  }

  function submitForConfidence() {
    if (hintLoading || supportPaused) return;
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
    if (submissionLock.current) return;
    if (pendingPayload.current) { await retrySubmit(); return; }
    if (!question || !sessionId || !studentId) return;
    submissionLock.current = true;
    const clickedAt = Date.now();
    const submittedAnswer = answer.trim();
    const answerContext = interaction.snapshot({ status: conf === null ? "NOT_ASKED" : "REPORTED_BEFORE_ANSWER", value: conf, scale: "ONE_TO_FIVE" });
    setSubmitting(true);
    setError("");
    setSubmitFailed(false);

    const eventId = pendingEventId.current ?? newEventId();
    pendingEventId.current = eventId;

    const payload = {
      eventId,
      eventType: "ANSWER_SUBMITTED" as const,
      studentId,
      sessionId,
      questionId: question.id,
      questionVersion: question.version,
      submittedAnswer,
      timeToFirstResponseMs:
        (firstInputAt.current ?? questionShownAt.current) - questionShownAt.current,
      totalTimeMs: clickedAt - questionShownAt.current,
      idleTimeMs: 0,
      attemptNumber: 1,
      hintCount,
      highestHintLevel,
      selfRatedConfidence: conf,
      answerChangedBeforeSubmit: answerChanged,
      clientTimestamp: new Date(clickedAt).toISOString(),
      interactionContext: answerContext,
    };
    pendingPayload.current = payload;
    persistRecovery({ pending: payload });

    try {
      try { await draftCheckpoints.flushBeforeSubmit(); } catch { /* Answer submission remains available if evidence capture fails. */ }
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
      if (!await reconcileFailedAnswer(err, payload)) {
        setSubmitFailed(true);
        setError(err instanceof Error ? `${err.message} — tap Retry to resubmit with the same event.` : "Submit failed");
      }
    } finally {
      submissionLock.current = false;
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
      setBlockedRecovery(null);
      setRecoveryMessage("");
      recoveryReady.current = true;
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
      if (!await reconcileFailedAnswer(err, pendingPayload.current)) {
        setSubmitFailed(true);
        setError(err instanceof Error ? err.message : "Retry failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function reconcileFailedAnswer(error: unknown, payload: Parameters<typeof api.submitAnswer>[0] | null): Promise<boolean> {
    if (!payload || !sessionId) return false;
    try {
      const server = await api.getLearningSession(sessionId);
      const saved = server.attempts.some(a => a.eventId === payload.eventId && a.questionId === payload.questionId);
      const superseded = server.attempts.some(a => a.questionId === payload.questionId && a.eventId !== payload.eventId);
      if (!saved && !superseded && !(error instanceof Error && /current question changed|issued question changed/i.test(error.message))) return false;
      recoveryReady.current = false;
      setBlockedRecovery(saved ? "saved" : "stale");
      setPhase("recovery-error");
      setSubmitFailed(false);
      setError(saved ? "We couldn't load your next step just now. Try again, or come back later." : "This answer was not saved because the question changed or already has another submitted answer.");
      setRecoveryMessage(saved ? "Nothing is lost: your answer is in your learning record." : "Your typed answer is retained in this browser. Check the learning record for the saved answer.");
      return true;
    } catch { return false; }
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

  if (phase === "recovery-error") {
    return shell(<>
      <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>{blockedRecovery === "saved" ? "Your answer was saved" : blockedRecovery === "stale" ? "This question was already answered" : "Your work needs confirmation"}</h1>
      {question?.stem && <p><strong>Question:</strong> {question.stem}</p>}
      <p role="alert">{error}</p>
      <p>{recoveryMessage || "Your local draft has not been replaced."}</p>
      {answer && <details open><summary>Your typed answer — retained here, not applied to another question</summary><p style={{ marginTop: "var(--s-2)", fontWeight: 700 }}>{answer}</p></details>}
      <div className="actions" style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
        {blockedRecovery === "saved" && pendingPayload.current && <button type="button" className="btn btn-primary" disabled={submitting} onClick={()=>void retrySubmit()}>{submitting ? "Trying again…" : "Try again"}</button>}
        {blockedRecovery ? <Link className={blockedRecovery === "saved" && pendingPayload.current ? "btn btn-ghost" : "btn btn-primary"} href="/student/learning-history">View learning record</Link> : <><button type="button" onClick={()=>window.location.reload()}>Retry session recovery</button><button type="button" onClick={()=>{try{sessionStorage.removeItem(recoveryKey("EXERCISE",studentId,mode));}catch{}window.location.reload();}}>Discard this local draft and start a new session</button></>}
        <Link className="btn btn-ghost" href="/student/home">Back home</Link>
      </div>
    </>);
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
      {recoveryMessage && <p role="status">{recoveryMessage}</p>}
      {question && sessionId && <LearnerSupport key={`${sessionId}:${question.id}:${question.version}`} studentId={studentId} identity={{source:"EXERCISE",sessionId,questionId:question.id,questionVersion:question.version}} onHint={mode === "ADAPTIVE_PRACTICE" ? requestHint : undefined} onPause={setSupportPaused} onPracticeCheck={mode === "ADAPTIVE_PRACTICE" && !submitting && !submitFailed ? async () => { const confirmed=await api.getLearningSession(sessionId); if(confirmed.status!=="ACTIVE"||!confirmed.currentDelivery)throw new Error("Could not confirm the issued check");resetQuestionState(confirmed.currentDelivery); } : undefined} />}
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
                disabled={submitting || submitFailed || hintLoading || supportPaused}
                className={`input ${styles.answerInput}`}
                type="text"
                value={answer}
                onChange={(e) => onAnswerChange(e.target.value)}
                onBlur={() => draftCheckpoints.flush()}
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
              disabled={submitting || hintLoading || supportPaused}
            >
              {submitFailed ? "Retry saving" : "Check"}
            </button>
            {(question.hintLadder?.length ?? 0) > highestHintLevel && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void requestHint()}
                disabled={submitting || hintLoading || submitFailed}
              >
                Get a hint
              </button>
            )}
            <button
              type="button"
              className="btn-quiet"
              onClick={() => void skipQuestion()}
              disabled={submitting || hintLoading || submitFailed}
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
