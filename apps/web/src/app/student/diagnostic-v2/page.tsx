"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  AssistanceLevel,
  DiagnosticV2AttemptView,
  DiagnosticV2DebugView,
  DiagnosticV2ItemOrigin,
  StepValidity,
  SubmitDiagnosticV2StepResponse,
} from "@cogna/shared";
import { api, isUnavailable } from "@/lib/api";
import {
  englishLabelForDiagnosticCode,
  humanizeDiagnosticCodesInText,
} from "@/lib/diagnostic-v2-labels";
import { getStudent } from "@/lib/session";
import styles from "@/components/diagnostic-v2.module.css";

type Phase = "checking" | "intro" | "working" | "complete";

type DiagnosticTrackChoice = "NEGATIVE_DISTRIBUTION" | "FRACTION_LINEAR";

type Attempt = DiagnosticV2AttemptView;

type StepLogEntry = {
  /** What the student typed, or "" for an "I don't know". */
  submittedLine: string;
  response: SubmitDiagnosticV2StepResponse;
};

/**
 * Testing-only rationale for the item currently on screen. Captured from the
 * submit response that advanced to this item (or the opening RULE reason).
 */
type WhyThisQuestion = {
  source: "RULE" | "AI";
  reasoning: string;
  itemKey: string;
  origin?: DiagnosticV2ItemOrigin;
  templateId?: string | null;
  stageId?: string;
};

const OPENING_WHY =
  "Opening item of the fixed entry sequence.";
const RULE_WHY_FALLBACK =
  "Rule sequence: next item in the fixed diagnostic sequence.";

/**
 * Fallback framing only, used when the server sends an assistance level with
 * no text. The server's `assistanceMessage` is preferred and is the only thing
 * allowed to state arithmetic — nothing here ever mentions a number.
 */
function assistanceFallback(level: AssistanceLevel | undefined): string | null {
  switch (level) {
    case "REVIEW_OPPORTUNITY":
      return "Have another look at that line whenever you're ready — you can just write it again.";
    case "GENERAL_PROMPT":
      return "Something in that line is worth a second look.";
    case "LOCATION_HINT":
      return "Look closely at the part of the line that changed from the line above it.";
    case "RULE_PROMPT":
      return "There's a rule in play here that's worth re-checking before you write the next line.";
    case "MICRO_QUESTION":
      return "Let's break this into one smaller step.";
    case "PARTIAL_WORKED_STEP":
      return "We'll take part of this step with you, and you can finish it.";
    case "FULL_EXPLANATION":
      return "Let's go through this one together.";
    default:
      return null;
  }
}

/** AMBIGUOUS/PARSE_FAILED means the checker could not read the line — not that the student was wrong. */
function isUnresolved(validity: StepValidity): boolean {
  return validity === "AMBIGUOUS" || validity === "PARSE_FAILED";
}

function DiagnosticV2Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debugParam = searchParams.get("debug");
  const debugEnabled = debugParam !== null && debugParam !== "0";
  const trackParam = searchParams.get("track");
  const initialTrack: DiagnosticTrackChoice =
    trackParam === "FRACTION_LINEAR"
      ? "FRACTION_LINEAR"
      : trackParam === "NEGATIVE_DISTRIBUTION"
        ? "NEGATIVE_DISTRIBUTION"
        : "FRACTION_LINEAR";

  const [phase, setPhase] = useState<Phase>("checking");
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [sessionTrack, setSessionTrack] =
    useState<DiagnosticTrackChoice>(initialTrack);
  const [sessionId, setSessionId] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  /** Who chose the item currently on screen. The opening item is always the
   * fixed first stage, so it starts as "RULE"; each later item inherits the
   * source from the selector decision that produced it. Shown to the student
   * so an AI-chosen question is never silently indistinguishable from a
   * pre-written one. */
  const [attemptSource, setAttemptSource] = useState<"RULE" | "AI">("RULE");
  /** Debug-only: why the current question was selected (selectorDecision). */
  const [whyThisQuestion, setWhyThisQuestion] = useState<WhyThisQuestion | null>(null);
  const [acceptedLines, setAcceptedLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [lastStep, setLastStep] = useState<StepLogEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepLog, setStepLog] = useState<StepLogEntry[]>([]);
  const [debugView, setDebugView] = useState<DiagnosticV2DebugView | null>(null);
  const [debugNote, setDebugNote] = useState("");

  useEffect(() => {
    document.title = "Step-by-step check — Cogna";
  }, []);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.replace("/student/login");
      return;
    }
    setStudentId(student.studentId);
    setStudentName(student.name);
    setPhase("intro");
  }, [router]);

  const refreshDebugView = useCallback(
    async (id: string) => {
      if (!debugEnabled || !id) return;
      try {
        const view = await api.getDiagnosticV2Session(id);
        setDebugView(view);
        setDebugNote("");
      } catch (err) {
        setDebugNote(
          err instanceof Error ? err.message : "Debug view unavailable.",
        );
      }
    },
    [debugEnabled],
  );

  function friendlyError(err: unknown, fallback: string): string {
    if (isUnavailable(err)) {
      return "We couldn't reach Cogna just now. Ask a grown-up to check the connection, then try again.";
    }
    return err instanceof Error ? err.message : fallback;
  }

  async function startSession() {
    if (!studentId || busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await api.startDiagnosticV2Session(studentId, sessionTrack);
      setSessionId(session.sessionId);
      setAttempt({
        attemptId: session.attemptId,
        itemKey: session.itemKey,
        equationPrompt: session.equationPrompt,
        openingLine: session.openingLine,
      });
      // The opening item is the fixed first stage — never AI-chosen.
      setAttemptSource("RULE");
      setWhyThisQuestion({
        source: "RULE",
        reasoning: OPENING_WHY,
        itemKey: session.itemKey,
        stageId: session.stageId,
        origin: "PRE_WRITTEN",
      });
      setAcceptedLines([]);
      setStepLog([]);
      setLastStep(null);
      setNotice("");
      setDraft("");
      setPhase("working");
      void refreshDebugView(session.sessionId);
    } catch (err) {
      setError(friendlyError(err, "We couldn't start this just now."));
    } finally {
      setBusy(false);
    }
  }

  /** Returns false when the summary couldn't be fetched, so a student who
   * chose to stop early stays on their working instead of losing sight of it. */
  async function loadSummary(id: string): Promise<boolean> {
    void refreshDebugView(id);
    try {
      const summary = await api.getDiagnosticV2Summary(id);
      setSummaryText(summary.childFacingSummary);
      setPhase("complete");
      return true;
    } catch (err) {
      setSummaryText("");
      setError(friendlyError(err, "Your summary isn't ready yet."));
      return false;
    }
  }

  /** `dontKnow` is an explicit action, not a blank line — the API rejects an empty submission that doesn't set it. */
  async function submitLine(submittedLine: string, dontKnow = false) {
    if (!attempt || !sessionId || busy) return;

    // The opening line, not the prompt: the prompt carries instruction wording
    // ("Solve for x:") that the checker would not be able to read.
    const previousLine =
      acceptedLines.length > 0
        ? acceptedLines[acceptedLines.length - 1]
        : attempt.openingLine;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await api.submitDiagnosticV2Step(sessionId, {
        attemptId: attempt.attemptId,
        previousLine,
        submittedLine,
        ...(dontKnow ? { dontKnow: true } : {}),
      });

      const entry: StepLogEntry = { submittedLine, response };
      setStepLog((prev) => [...prev, entry]);
      setLastStep(entry);

      if (response.outcome === "SUBMITTED" && response.validity === "VALID") {
        setAcceptedLines((prev) => [...prev, submittedLine.trim()]);
        setDraft("");
      }

      void refreshDebugView(sessionId);

      if (response.itemComplete && response.nextAttempt) {
        setAttempt(response.nextAttempt);
        // A missing selectorDecision means the rules picked it — the AI path
        // always reports itself, so absence is never ambiguous.
        const source = response.selectorDecision?.source === "AI" ? "AI" : "RULE";
        setAttemptSource(source);
        const reasoning =
          response.selectorDecision?.reasoning?.trim() ||
          (source === "RULE" ? RULE_WHY_FALLBACK : "No selection reasoning returned.");
        setWhyThisQuestion({
          source,
          reasoning,
          itemKey: response.nextAttempt.itemKey,
        });
        setAcceptedLines([]);
        setDraft("");
        setLastStep(null);
        setNotice("That one's finished — here's the next.");
        return;
      }

      if (response.itemComplete || response.sessionStatus !== "ACTIVE") {
        // Nothing left to work on either way — the complete screen handles a
        // summary that isn't ready yet.
        const loaded = await loadSummary(sessionId);
        if (!loaded) setPhase("complete");
      }
    } catch (err) {
      setError(friendlyError(err, "That line didn't send. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function onSubmitStep() {
    if (!draft.trim()) {
      setError("Write the next line of your working, then submit it.");
      return;
    }
    void submitLine(draft.trim());
  }

  async function finishEarly() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError("");
    await loadSummary(sessionId);
    setBusy(false);
    // A failed fetch leaves the student on their working, with the error shown.
  }

  const chrome = (
    <div className={styles.chrome}>
      <Link href="/" className="wordmark">
        cogna<span className="dot">.</span>
      </Link>
      <span className="time-note">No timer, no score — just your working.</span>
    </div>
  );

  function shell(children: React.ReactNode) {
    const why = enrichWhyThisQuestion(whyThisQuestion, debugView);
    return (
      <div className={styles.stage}>
        {chrome}
        <div className={`${styles.panel} phase-in`}>{children}</div>
        {debugEnabled && (
          <DebugPanel
            view={debugView}
            log={stepLog}
            note={debugNote}
            why={why}
          />
        )}
      </div>
    );
  }

  if (phase === "checking") {
    return shell(<p className="muted">Loading…</p>);
  }

  if (phase === "intro") {
    return shell(
      <>
        <p className="eyebrow">Let&apos;s find out what you know</p>
        <h1>Hi{studentName ? `, ${studentName}` : ""}.</h1>
        <p className="lead">
          This one works differently. Instead of typing a final answer, you write
          out your working one line at a time — exactly how you&apos;d do it on
          paper — and submit each line as you go.
        </p>
        <fieldset className={styles.trackPicker}>
          <legend>What should we check?</legend>
          <label className={styles.trackOption}>
            <input
              type="radio"
              name="diagnosticTrack"
              checked={sessionTrack === "FRACTION_LINEAR"}
              onChange={() => setSessionTrack("FRACTION_LINEAR")}
            />
            <span>
              <strong>Equations with fractions</strong>
              <span className={styles.trackHint}>
                Starts with something like <code>x/2 + 3 = 7</code>, then moves
                to clearing denominators — e.g.{" "}
                <code>(x+1)/2 = (x-1)/3 + 1</code>.
              </span>
            </span>
          </label>
          <label className={styles.trackOption}>
            <input
              type="radio"
              name="diagnosticTrack"
              checked={sessionTrack === "NEGATIVE_DISTRIBUTION"}
              onChange={() => setSessionTrack("NEGATIVE_DISTRIBUTION")}
            />
            <span>
              <strong>Brackets &amp; negative signs</strong>
              <span className={styles.trackHint}>
                Linear equations like <code>-2(x - 5) + 3 = 11</code> — the
                original Phase A path.
              </span>
            </span>
          </label>
        </fieldset>
        <p className="lead">
          There&apos;s no timer and no score. If a line doesn&apos;t work out,
          nothing is lost — we just look at it together. If you&apos;re stuck on
          a line, &ldquo;I don&apos;t know&rdquo; is a perfectly good answer.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: "var(--s-6)" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startSession()}
            disabled={busy}
          >
            {busy ? "Getting ready…" : "Start"}
          </button>
          <Link href="/student/home" className="btn btn-ghost">
            Not now
          </Link>
        </div>
      </>,
    );
  }

  if (phase === "complete") {
    return shell(
      <>
        <p className="eyebrow">All done</p>
        <h1>Thanks for working through that.</h1>
        {summaryText ? (
          <div className={styles.summaryBody}>{summaryText}</div>
        ) : (
          <p className="lead">
            Your summary isn&apos;t ready yet — everything you wrote has been
            saved, so nothing is lost.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: "var(--s-6)" }}>
          <Link href="/student/home" className="btn btn-primary">
            Back home
          </Link>
        </div>
      </>,
    );
  }

  const outcome = lastStep?.response;
  const validity = outcome?.outcome === "SUBMITTED" ? outcome.validity : undefined;
  const declined = outcome?.outcome === "DECLINED";
  const assistance =
    outcome?.assistanceMessage ?? assistanceFallback(outcome?.assistanceOffered);

  const enrichedWhy = enrichWhyThisQuestion(whyThisQuestion, debugView);
  const latestHypothesis = debugView?.hypotheses?.at(-1);

  return shell(
    <>
      <p className="eyebrow">One line at a time</p>
      <h1 style={{ fontSize: "var(--text-lg)" }}>Solve this, showing each step</h1>
      <p className={styles.trackBadge} role="status">
        {sessionTrack === "FRACTION_LINEAR"
          ? "Track: equations with fractions (clearing denominators)"
          : "Track: brackets & negative signs"}
      </p>

      {notice && (
        <div className={`${styles.note} ${styles.noteAccepted}`} role="status">
          <strong>{notice}</strong>
        </div>
      )}

      {enrichedWhy && (
        <WhyThisQuestionBox
          why={enrichedWhy}
          placement="inline"
          showMeta={debugEnabled}
        />
      )}

      {attemptSource === "AI" && !enrichedWhy?.reasoning && (
        <p className={styles.aiChip} role="note">
          <span className={styles.aiChipMark} aria-hidden="true">
            AI
          </span>
          <span>This question was chosen for you, based on your last answer.</span>
        </p>
      )}

      {latestHypothesis?.reasoning && (
        <div className={styles.hypothesisBox} role="status">
          <div className={styles.whyHead}>
            <strong>What we think is going on</strong>
            {sourceTag(latestHypothesis.source)}
          </div>
          <p className={styles.whyReasoning}>
            {humanizeDiagnosticCodesInText(latestHypothesis.reasoning)}
          </p>
          {latestHypothesis.childFacingSummary && (
            <p className={styles.noteDetail}>{latestHypothesis.childFacingSummary}</p>
          )}
        </div>
      )}

      <ol className={styles.working}>
        <li className={`${styles.workingLine} ${styles.givenLine}`}>
          <span className={styles.lineTag}>Given</span>
          <span>{attempt?.equationPrompt}</span>
        </li>
        {acceptedLines.map((line, i) => (
          <li
            key={`${i}-${line}`}
            className={`${styles.workingLine} ${styles.acceptedLine} settle`}
          >
            <span className={styles.lineTag}>Line {i + 1}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      <div className={`${styles.entry} field`}>
        <label htmlFor="nextLine">Your next line</label>
        <input
          id="nextLine"
          className={`input ${styles.entryInput}`}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              e.preventDefault();
              onSubmitStep();
            }
          }}
          placeholder="e.g. -2x + 10 + 3 = 11"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      {error && <p className="error">{error}</p>}

      {lastStep && validity === "VALID" && (
        <div className={`${styles.note} ${styles.noteAccepted}`} role="status">
          <strong>That line works — keep going.</strong>
        </div>
      )}

      {outcome?.outcome === "SUBMITTED" && validity === "INVALID" && (
        <div className={`${styles.note} ${styles.noteLookAgain}`} role="status">
          <strong>Let&apos;s look at that line again.</strong>
          {outcome.firstInvalidActionDescription && (
            <p className={styles.noteDetail}>{outcome.firstInvalidActionDescription}</p>
          )}
          {assistance && <p className={styles.noteDetail}>{assistance}</p>}
        </div>
      )}

      {declined && (
        <div className={`${styles.note} ${styles.noteUnresolved}`} role="status">
          <strong>That&apos;s fine — saying so is genuinely useful.</strong>
          {assistance && <p className={styles.noteDetail}>{assistance}</p>}
        </div>
      )}

      {lastStep && validity && isUnresolved(validity) && (
        <div className={`${styles.note} ${styles.noteUnresolved}`} role="status">
          <strong>We couldn&apos;t read that line clearly.</strong>
          <p className={styles.noteDetail}>
            That doesn&apos;t mean it&apos;s wrong — we just can&apos;t check it
            yet. Try writing the same step a different way, or move on.
          </p>
          {assistance && <p className={styles.noteDetail}>{assistance}</p>}
        </div>
      )}

      <div className={styles.actionsRow}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmitStep}
          disabled={busy}
        >
          {busy ? "Checking…" : "Submit step"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void submitLine("", true)}
          disabled={busy}
        >
          I don&apos;t know
        </button>
      </div>

      <div className={styles.quietRow}>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => void finishEarly()}
          disabled={busy}
        >
          Stop here and see my summary
        </button>
      </div>
    </>,
  );
}

/** Steps are numbered by the server, so the panel and the database can never disagree about which line is which. */
function entryLabel(entry: StepLogEntry): string {
  return entry.response.outcome === "SUBMITTED"
    ? `step ${entry.response.stepIndex + 1}`
    : "I don't know";
}

function sourceTag(source: "RULE" | "AI") {
  return (
    <span className={`${styles.tag} ${source === "AI" ? styles.tagAi : styles.tagRule}`}>
      {source === "AI" ? "AI" : "Rule"}
    </span>
  );
}

/**
 * Debug chip: English is the primary visible line; machine code sits under it
 * in smaller muted type so the Why box is readable without hunting.
 */
function CodeTag({
  code,
  className,
  prefix,
}: {
  code: string;
  className?: string;
  /** Optional prefix on the English line, e.g. "next: ". */
  prefix?: string;
}) {
  const english = englishLabelForDiagnosticCode(code);
  return (
    <span className={`${styles.tag} ${styles.tagWithLabel} ${className ?? ""}`}>
      <span className={styles.tagEnglish}>
        {prefix ?? ""}
        {english ?? code}
      </span>
      {english && <span className={styles.tagCode}>{code}</span>}
    </span>
  );
}

/** Merge live selectorDecision with debug session item/stage metadata. */
function enrichWhyThisQuestion(
  why: WhyThisQuestion | null,
  view: DiagnosticV2DebugView | null,
): WhyThisQuestion | null {
  if (!why) return null;
  const item = view?.items?.find((i) => i.itemKey === why.itemKey);
  // Prefer the newest stageHistory entry whose reasoning matches this pick,
  // else the latest non-meta stage (opening / next-item), skipping teach/complete.
  const itemStages = (view?.stageHistory ?? []).filter(
    (e) => e.stageId !== "RULE_PROMPT" && e.stageId !== "COMPLETE",
  );
  const stageEntry =
    [...itemStages].reverse().find((e) => e.reasoning === why.reasoning) ??
    itemStages[itemStages.length - 1];

  const reasoning =
    why.reasoning.trim() ||
    stageEntry?.reasoning?.trim() ||
    (why.source === "RULE" ? RULE_WHY_FALLBACK : "No selection reasoning returned.");

  return {
    ...why,
    reasoning,
    origin: item?.origin ?? why.origin,
    templateId: item?.templateId ?? why.templateId,
    stageId: why.stageId ?? stageEntry?.stageId,
  };
}

function WhyThisQuestionBox({
  why,
  placement,
  showMeta = true,
}: {
  why: WhyThisQuestion;
  placement: "inline" | "panel";
  showMeta?: boolean;
}) {
  const readableReasoning = humanizeDiagnosticCodesInText(why.reasoning);
  return (
    <div
      className={`${styles.whyBox} ${
        placement === "inline" ? styles.whyBoxInline : styles.whyBoxPanel
      }`}
      role="status"
    >
      <div className={styles.whyHead}>
        <strong>Why this question</strong>
        {sourceTag(why.source)}
        {showMeta && why.origin && <CodeTag code={why.origin} />}
      </div>
      <p className={styles.whyReasoning}>{readableReasoning}</p>
      {showMeta && (
        <div className={styles.debugMeta}>
          {why.itemKey && <CodeTag code={why.itemKey} />}
          {why.templateId && <CodeTag code={why.templateId} />}
          {why.stageId && <CodeTag code={why.stageId} />}
        </div>
      )}
    </div>
  );
}

function DebugPanel({
  view,
  log,
  note,
  why,
}: {
  view: DiagnosticV2DebugView | null;
  log: StepLogEntry[];
  note: string;
  why: WhyThisQuestion | null;
}) {
  return (
    <aside className={styles.debug} aria-label="Diagnostic debug view">
      <div className={styles.debugHead}>
        <strong>Debug view</strong>
        <span className="faint">?debug=1 · internal only</span>
      </div>
      {note && <p className="faint" style={{ marginTop: "var(--s-2)" }}>{note}</p>}
      {view && (
        <p className="faint" style={{ marginTop: "var(--s-2)" }}>
          Session {view.sessionId} · {view.status} · stage {view.currentStageId}
          {englishLabelForDiagnosticCode(view.currentStageId)
            ? ` — ${englishLabelForDiagnosticCode(view.currentStageId)}`
            : ""}
        </p>
      )}

      <section className={styles.debugSection}>
        <h3>Why this question (current)</h3>
        {why ? (
          <WhyThisQuestionBox why={why} placement="panel" />
        ) : (
          <p className="faint">
            Complete an item to see the selector&apos;s reason for the next one.
            The opening item is always the fixed entry sequence.
          </p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>Items served (origin)</h3>
        {view && view.items && view.items.length > 0 ? (
          <ul className={styles.debugList}>
            {view.items.map((item, i) => (
              <li key={`${item.itemKey}-${i}`}>
                <div className={styles.debugMeta}>
                  <CodeTag code={item.origin} />
                  <CodeTag code={item.itemKey} />
                  {item.templateId && <CodeTag code={item.templateId} />}
                  <CodeTag code={item.primaryMicroSkillId} />
                  <span className={styles.tag}>{item.status}</span>
                </div>
                <p className={styles.debugReasoning}>{item.equationPrompt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No items recorded yet.</p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>Stage decisions</h3>
        {view && view.stageHistory.length > 0 ? (
          <ul className={styles.debugList}>
            {view.stageHistory.map((entry, i) => (
              <li key={`${entry.stageId}-${i}`}>
                <div className={styles.debugMeta}>
                  {sourceTag(entry.source)}
                  <CodeTag code={entry.stageId} />
                  <span className={styles.tag}>{entry.at}</span>
                </div>
                {entry.reasoning && (
                  <p className={styles.debugReasoning}>
                    {humanizeDiagnosticCodesInText(entry.reasoning)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No stage decisions recorded yet.</p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>Next-item selection (per submitted step)</h3>
        {log.some((entry) => entry.response.selectorDecision) ? (
          <ul className={styles.debugList}>
            {log
              .filter((entry) => entry.response.selectorDecision)
              .map((entry, i) => (
                <li key={`selector-${i}`}>
                  <div className={styles.debugMeta}>
                    {sourceTag(entry.response.selectorDecision!.source)}
                    <span className={styles.tag}>{entryLabel(entry)}</span>
                    {entry.response.nextAttempt && (
                      <CodeTag
                        code={entry.response.nextAttempt!.itemKey}
                        prefix="next: "
                      />
                    )}
                  </div>
                  {entry.response.selectorDecision!.reasoning ? (
                    <p className={styles.debugReasoning}>
                      {humanizeDiagnosticCodesInText(
                        entry.response.selectorDecision!.reasoning,
                      )}
                    </p>
                  ) : (
                    <p className={styles.debugReasoning}>
                      {entry.response.selectorDecision!.source === "RULE"
                        ? RULE_WHY_FALLBACK
                        : "No selection reasoning returned."}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="faint">No selector decision returned yet.</p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>&ldquo;I don&apos;t know&rdquo; (no step row — evidence only)</h3>
        {view && view.declines.length > 0 ? (
          <ul className={styles.debugList}>
            {view.declines.map((decline, i) => (
              <li key={`decline-${i}`}>
                <div className={styles.debugMeta}>
                  <span className={`${styles.tag} ${styles.tagRule}`}>SKIPPED</span>
                  <CodeTag code={decline.itemKey} />
                  <CodeTag code={decline.microSkillId} />
                  <span className={styles.tag}>{decline.assistanceLevel}</span>
                  <span className={styles.tag}>{decline.at}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No declines in this session.</p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>Steps and verification source</h3>
        {view && view.steps.length > 0 ? (
          <ul className={styles.debugList}>
            {view.steps.map((step) => (
              <li key={step.id ?? `${step.attemptId}-${step.stepIndex}`}>
                <div className={styles.debugLine}>
                  {step.previousLine} → {step.submittedLine || "(no line submitted)"}
                </div>
                <div className={styles.debugMeta}>
                  <span className={styles.tag}>{step.validity}</span>
                  <span
                    className={`${styles.tag} ${
                      step.verificationSource === "AI_FALLBACK"
                        ? styles.tagAi
                        : styles.tagRule
                    }`}
                  >
                    {step.verificationSource}
                  </span>
                  <span className={styles.tag}>{step.attemptedTransformation}</span>
                  <span className={styles.tag}>{step.assistanceLevel}</span>
                  {step.primaryMicroSkillId && (
                    <CodeTag code={step.primaryMicroSkillId} />
                  )}
                  {step.topicId && <span className={styles.tag}>{step.topicId}</span>}
                  {step.competencyFamilyId && (
                    <span className={styles.tag}>{step.competencyFamilyId}</span>
                  )}
                  {step.contextModifierIds.map((id) => (
                    <span key={id} className={styles.tag}>
                      {id}
                    </span>
                  ))}
                </div>
                {step.firstInvalidActionDescription && (
                  <p className={styles.debugReasoning}>
                    {step.firstInvalidActionDescription}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : log.length > 0 ? (
          <ul className={styles.debugList}>
            {log.map((entry, i) => (
              <li key={`local-${i}`}>
                <div className={styles.debugLine}>
                  {entry.submittedLine || "(no line — I don't know)"}
                </div>
                <div className={styles.debugMeta}>
                  {entry.response.outcome === "SUBMITTED" ? (
                    <>
                      <span className={styles.tag}>{entry.response.validity}</span>
                      <span
                        className={`${styles.tag} ${
                          entry.response.verificationSource === "AI_FALLBACK"
                            ? styles.tagAi
                            : styles.tagRule
                        }`}
                      >
                        {entry.response.verificationSource}
                      </span>
                      <span className={styles.tag}>
                        {entry.response.attemptedTransformation}
                      </span>
                    </>
                  ) : (
                    <span className={styles.tag}>DECLINED · not verified</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No steps submitted yet.</p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>Hypotheses</h3>
        {view && view.hypotheses.length > 0 ? (
          <ul className={styles.debugList}>
            {view.hypotheses.map((h, i) => (
              <li key={`${h.microSkillId}-${i}`}>
                <div className={styles.debugMeta}>
                  {sourceTag(h.source)}
                  <CodeTag code={h.microSkillId} />
                  <span className={styles.tag}>{h.hypothesisLabel}</span>
                  <span className={styles.tag}>
                    confidence {h.confidence.toFixed(2)}
                  </span>
                </div>
                <p className={styles.debugReasoning}>
                  {humanizeDiagnosticCodesInText(h.reasoning)}
                </p>
                {h.childFacingSummary && <p>{h.childFacingSummary}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No hypotheses yet.</p>
        )}
      </section>

      <section className={styles.debugSection}>
        <h3>Micro-skill states</h3>
        {view && view.microSkillStates.length > 0 ? (
          <ul className={styles.debugList}>
            {view.microSkillStates.map((state) => (
              <li key={state.microSkillId}>
                <div className={styles.debugMeta}>
                  <CodeTag code={state.microSkillId} />
                  <span className={styles.tag}>{state.status}</span>
                  <span className={styles.tag}>
                    evidence {state.evidenceCount}
                  </span>
                  <span className={styles.tag}>
                    independent {state.independentSuccessCount}/
                    {state.independentSuccessCount + state.independentFailureCount}
                  </span>
                  <span className={styles.tag}>
                    assisted correct {state.assistedSuccessCount}
                  </span>
                </div>
                {state.observedContextStrengths.length > 0 && (
                  <p className="faint">
                    strengths: {state.observedContextStrengths.join(", ")}
                  </p>
                )}
                {state.observedContextGaps.length > 0 && (
                  <p className="faint">
                    gaps: {state.observedContextGaps.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No micro-skill state yet.</p>
        )}
      </section>
    </aside>
  );
}

export default function DiagnosticV2Page() {
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
      <DiagnosticV2Content />
    </Suspense>
  );
}
