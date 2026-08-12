"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  AssistanceLevel,
  DiagnosticV2AttemptView,
  DiagnosticV2DebugView,
  DiagnosticV2ItemOrigin,
  DiagnosticV2SummaryOverview,
  StepValidity,
  SubmitDiagnosticV2StepResponse,
} from "@cogna/shared";
import { api, isUnavailable } from "@/lib/api";
import {
  englishLabelForDiagnosticCode,
  humanizeDiagnosticCodesInText,
} from "@/lib/diagnostic-v2-labels";
import { getStudent, saveStudent } from "@/lib/session";
import { topicProgressForStage } from "@/lib/diagnostic-v2-progress";
import { MathLine, MathText } from "@/components/math-line";
import { DiagnosticV2SummaryPanel } from "@/components/diagnostic-v2-summary";
import styles from "@/components/diagnostic-v2.module.css";

type Phase = "checking" | "intro" | "working" | "complete";

type DiagnosticTrackChoice =
  | "NEGATIVE_DISTRIBUTION"
  | "FRACTION_LINEAR"
  | "IDENTITY_DIFF_SQUARES"
  | "FACTOR_MONIC_TRINOMIAL"
  | "QUAD_ZERO_PRODUCT"
  | "COMBINED_ALGEBRA";

type Attempt = DiagnosticV2AttemptView;

type StudentIdentity = { studentId: string; name: string };

// React development mode mounts effects twice. Keep one in-flight demo login
// across that immediate remount, then clear it after a real route exit so the
// next opening of the full diagnostic gets a new student identity.
let demoRunLoginPromise: Promise<StudentIdentity> | null = null;
let demoRunResetTimer: ReturnType<typeof setTimeout> | null = null;

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

const DEBUG_PROTOTYPE_VIEW = {
  sessionId: "prototype-session",
  status: "ACTIVE",
  currentStageId: "NEG_DIST_MAIN",
  stageHistory: [],
  items: [{ itemKey: "ENTRY_TWO_STEP", equationPrompt: "3(x + 2) = 18", origin: "PRE_WRITTEN", templateId: "TPL_ENTRY_TWO_STEP", primaryMicroSkillId: "LIN_DISTRIBUTE_POS", status: "COMPLETE" }],
  steps: [
    { id: "prototype-step-1", attemptId: "prototype-attempt", stepIndex: 0, previousLine: "3(x + 2) = 18", submittedLine: "3x + 2 = 18", validity: "INVALID", verificationSource: "DETERMINISTIC", attemptedTransformation: "DISTRIBUTE", firstInvalidActionCode: "INCOMPLETE_DISTRIBUTION", firstInvalidActionDescription: "The 3 was multiplied by x but not by 2: the constant should change from 2 to 6.", primaryMicroSkillId: "LIN_DISTRIBUTE_POS", topicId: "LINEAR_EQUATIONS", competencyFamilyId: "DISTRIBUTION", contextModifierIds: [], assistanceLevel: "RULE_PROMPT", provenance: { input: { previousLine: "3(x + 2) = 18", submittedLine: "3x + 2 = 18", verifierVersion: "linear-bracket-verifier-v1", resolvedGrammar: "linear-bracket", resolvedFromStageId: "ENTRY_TWO_STEP" }, ruleAnalysis: { normalizedPreviousLine: "3x + 6 = 18", normalizedSubmittedLine: "3x + 2 = 18", previousSolution: "x = 4", submittedSolution: "x = 16/3", outcome: "DECIDED", validity: "INVALID", transformation: "DISTRIBUTE", firstInvalidActionCode: "INCOMPLETE_DISTRIBUTION", firstInvalidActionDescription: "3 × x was applied, but 3 × 2 was not: expected +6, observed +2." }, handedToAi: { lastStepSummary: "Invalid expansion: 3(x + 2) became 3x + 2.", skillLines: ["LIN_DISTRIBUTE_POS: 0 successes, 1 independent failure this session", "Evidence: 3(x + 2) → 3x + 2"] }, aiGraderFallback: null } },
  ],
  declines: [],
  hypotheses: [{ microSkillId: "LIN_DISTRIBUTE_POS", hypothesisLabel: "Incomplete distribution", confidence: 0.72, reasoning: "On 1 current-session attempt, the multiplier reached the variable but not the constant.", source: "RULE", childFacingSummary: "Check that the number outside a bracket multiplies every term inside.", sessionIndependentFailureCount: 1, lifetimeIndependentFailureCount: 1 }],
  microSkillStates: [{ microSkillId: "LIN_DISTRIBUTE_POS", status: "EMERGING", evidenceCount: 1, independentSuccessCount: 0, independentFailureCount: 1, assistedSuccessCount: 0, observedContextStrengths: [], observedContextGaps: ["positive brackets"], sessionEvidenceCount: 1, sessionIndependentSuccessCount: 0, sessionIndependentFailureCount: 1, sessionAssistedSuccessCount: 0 }],
  selections: [{ rulePick: { itemKey: "NEG_DIST_MAIN", stageId: "NEG_DIST_MAIN", origin: "PRE_WRITTEN", routeReason: "One incomplete-distribution error was observed, so the rules selected a near-transfer item with a negative multiplier." }, candidates: [{ index: 0, itemKey: "NEG_DIST_MAIN", prompt: "-2(x - 5) + 3 = 11", origin: "PRE_WRITTEN", templateId: null, primaryMicroSkillId: "LIN_DISTRIBUTE_NEG", legalityReason: "Approved bank item; targets the prerequisite with one context change.", isRulePick: true }, { index: 1, itemKey: "NEG_DIST_TEMPLATE_04", prompt: "-3(x + 4) = 6", origin: "TEMPLATE_RENDERED", templateId: "TPL_NEG_DISTRIBUTION", primaryMicroSkillId: "LIN_DISTRIBUTE_NEG", legalityReason: "Approved template and deterministic answer key available.", isRulePick: false }], aiDecision: { choice: "EXISTING", chosenIndex: 0, templateId: null, targetMicroSkillId: "LIN_DISTRIBUTE_NEG", confidence: 0.81, reasoning: "Selected candidate 1 because the single observed error was incomplete distribution. It keeps the same operation while changing the sign context; there is not enough evidence to author a new item.", agreedWithRule: true, latencyMs: 184 }, servedItemKey: "NEG_DIST_MAIN", servedSource: "AI" }],
} satisfies DiagnosticV2DebugView;

const MICRO_SKILL_MANAGEMENT_GROUPS = [
  {
    name: "Linear equations",
    groups: [
      { name: "Equality & inverse operations", ids: ["LIN_REMOVE_CONSTANT", "LIN_REMOVE_COEFFICIENT"] },
      { name: "Simplifying before isolating", ids: ["LIN_COMBINE_LIKE"] },
      { name: "Solving different forms", ids: ["LIN_SOLVE_TWO_STEP", "LIN_SOLVE_VARIABLE_BOTH"] },
      { name: "Checking solutions", ids: ["LIN_CHECK_SOLUTION"] },
    ],
  },
  {
    name: "Brackets, signs & fractions",
    groups: [
      { name: "Signed-number arithmetic", ids: ["FND_SIGN_MUL_DIV"] },
      { name: "Fractions", ids: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"] },
      { name: "Distributing & clearing", ids: ["LIN_DISTRIBUTE_POS", "LIN_DISTRIBUTE_NEG", "LIN_CLEAR_FRACTIONS", "LIN_SOLVE_FRACTIONS"] },
    ],
  },
  {
    name: "Algebraic identities",
    groups: [
      { name: "Reading algebra", ids: ["ALG_IDENTIFY_STRUCTURE"] },
      { name: "Working with expressions", ids: ["EXP_EXPAND_BINOMIALS"] },
      { name: "Recognising identities", ids: ["ID_DIFF_SQUARES", "ID_VERIFY_EXPANSION"] },
    ],
  },
  {
    name: "Factorisation",
    groups: [
      { name: "Trinomial factorisation", ids: ["FAC_READ_ABC_SIGNS", "FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL", "FAC_COMPUTE_AC", "FAC_SPLIT_MIDDLE", "FAC_NONMONIC_GROUP"] },
      { name: "Checking factors", ids: ["FAC_VERIFY_EXPAND"] },
    ],
  },
  {
    name: "Quadratics",
    groups: [
      { name: "Preparing the equation", ids: ["QUAD_STANDARD_FORM", "QUAD_FACTOR_EXPRESSION"] },
      { name: "Finding & checking roots", ids: ["QUAD_ZERO_PRODUCT", "QUAD_CREATE_BRANCHES", "QUAD_SOLVE_UNIT_FACTOR", "QUAD_VERIFY_ROOTS"] },
    ],
  },
] as const;

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

function normalizeSubmittedMathLine(line: string): string {
  let normalized = line.trim();
  while (/[\]},.;:]$/.test(normalized)) normalized = normalized.slice(0, -1).trimEnd();
  return normalized;
}

function DiagnosticV2Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debugParam = searchParams.get("debug");
  const debugEnabled = debugParam !== null && debugParam !== "0";
  const prototypeEnabled = searchParams.get("prototype") === "1";
  const trackParam = searchParams.get("track");
  const initialTrack: DiagnosticTrackChoice =
    trackParam === "COMBINED_ALGEBRA"
      ? "COMBINED_ALGEBRA"
      : trackParam === "FRACTION_LINEAR"
        ? "FRACTION_LINEAR"
        : trackParam === "NEGATIVE_DISTRIBUTION"
          ? "NEGATIVE_DISTRIBUTION"
          : "COMBINED_ALGEBRA";

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
  /** 1-based count of items seen this sitting, shown to the student as
   * "Question N" — incremented whenever a new item replaces the current one. */
  const [questionNumber, setQuestionNumber] = useState(1);
  /** Demo-only: one conventional next line, shown as greyed-out placeholder
   * text. Server sends it for the dev student only; a real student gets
   * undefined and the generic placeholder. Never prefilled, never enforced. */
  const [demoHint, setDemoHint] = useState<string | undefined>(undefined);
  /** Debug-only: why the current question was selected (selectorDecision). */
  const [whyThisQuestion, setWhyThisQuestion] = useState<WhyThisQuestion | null>(null);
  const [acceptedLines, setAcceptedLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [lastStep, setLastStep] = useState<StepLogEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [summaryOverview, setSummaryOverview] =
    useState<DiagnosticV2SummaryOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepLog, setStepLog] = useState<StepLogEntry[]>([]);
  const [debugView, setDebugView] = useState<DiagnosticV2DebugView | null>(prototypeEnabled ? DEBUG_PROTOTYPE_VIEW : null);
  const [debugNote, setDebugNote] = useState("");
  const [debugOpen, setDebugOpen] = useState(debugEnabled);

  useEffect(() => {
    document.title = "Step-by-step check — Cogna";
  }, []);

  useEffect(() => {
    if (prototypeEnabled) {
      setStudentId("prototype-student");
      setStudentName("Maya");
      setSessionId("prototype-session");
      setAttempt({ attemptId: "prototype-attempt", itemKey: "ENTRY_TWO_STEP", equationPrompt: "3(x + 2) = 18", openingLine: "3(x + 2) = 18", stageId: "ENTRY_TWO_STEP" });
      setPhase("working");
      return;
    }
    const student = getStudent();
    if (!student) {
      router.replace("/student/login");
      return;
    }
    let cancelled = false;
    async function loadStudentForThisRun() {
      let activeStudent = student!;
      const isDemo = activeStudent.studentId === "dev_student_001" || activeStudent.studentId.startsWith("demo_");
      if (isDemo) {
        if (demoRunResetTimer) {
          clearTimeout(demoRunResetTimer);
          demoRunResetTimer = null;
        }
        demoRunLoginPromise ??= api.health().then((health) => api.studentLogin(health.devAccessCode));
        activeStudent = await demoRunLoginPromise;
        saveStudent(activeStudent);
      }
      if (cancelled) return;
      setStudentId(activeStudent.studentId);
      setStudentName(activeStudent.name);
      setPhase("intro");
    }
    void loadStudentForThisRun().catch((err) => {
      if (!cancelled) setError(friendlyError(err, "A fresh demo student could not be created."));
    });
    return () => {
      cancelled = true;
      demoRunResetTimer = setTimeout(() => {
        demoRunLoginPromise = null;
        demoRunResetTimer = null;
      }, 0);
    };
  }, [prototypeEnabled, router]);

  const refreshDebugView = useCallback(
    async (id: string) => {
      if (!id) return;
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
    [],
  );

  useEffect(() => {
    if (!debugOpen) return;
    if (sessionId && !prototypeEnabled) void refreshDebugView(sessionId);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDebugOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [debugOpen, prototypeEnabled, refreshDebugView, sessionId]);

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
      const track = sessionTrack;
      const session = await api.startDiagnosticV2Session(studentId, track);
      const expectedOpening =
        track === "FRACTION_LINEAR"
          ? "ENTRY_FRAC_SIMPLE"
          : track === "IDENTITY_DIFF_SQUARES"
            ? "ENTRY_EXPAND_BINOMIAL"
            : track === "FACTOR_MONIC_TRINOMIAL"
              ? "ENTRY_FACTOR_EXPAND"
              : track === "QUAD_ZERO_PRODUCT"
                ? "ENTRY_QUAD_STANDARD"
                : "ENTRY_TWO_STEP"; // NEGATIVE_DISTRIBUTION + COMBINED_ALGEBRA
      if (session.itemKey !== expectedOpening) {
        setError(
          `Track mismatch: asked for ${track} but server opened ${session.itemKey} (${session.equationPrompt}). Refresh and try again.`,
        );
        return;
      }
      setSessionId(session.sessionId);
      setAttempt({
        attemptId: session.attemptId,
        itemKey: session.itemKey,
        equationPrompt: session.equationPrompt,
        openingLine: session.openingLine,
        stageId: session.stageId,
      });
      setDemoHint(session.demoNextLineHint);
      // The opening item is the fixed first stage — never AI-chosen.
      setAttemptSource("RULE");
      setWhyThisQuestion({
        source: "RULE",
        reasoning:
          track === "COMBINED_ALGEBRA"
            ? "Opening item of the combined algebra diagnostic (starts with brackets / negative distribution)."
            : track === "FRACTION_LINEAR"
              ? "Opening item of the fraction-linear diagnostic track."
              : track === "IDENTITY_DIFF_SQUARES"
                ? "Opening item of the difference-of-squares identities track."
                : track === "FACTOR_MONIC_TRINOMIAL"
                  ? "Opening item of the factorisation track."
                  : track === "QUAD_ZERO_PRODUCT"
                    ? "Opening item of the quadratic zero-product track."
                    : OPENING_WHY,
        itemKey: session.itemKey,
        stageId: session.stageId,
        origin: "PRE_WRITTEN",
      });
      setAcceptedLines([]);
      setStepLog([]);
      setLastStep(null);
      setNotice("");
      setDraft("");
      setQuestionNumber(1);
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
      setSummaryOverview(summary.overview ?? null);
      setPhase("complete");
      return true;
    } catch (err) {
      setSummaryText("");
      setSummaryOverview(null);
      setError(friendlyError(err, "Your summary isn't ready yet."));
      return false;
    }
  }

  /** `dontKnow` is an explicit action, not a blank line — the API rejects an empty submission that doesn't set it. */
  async function submitLine(submittedLine: string, dontKnow = false) {
    if (!attempt || !sessionId || busy) return;

    // Keep the browser's accepted-line state byte-for-byte aligned with the
    // API. Without this, a harmless trailing `]` can be removed by the server
    // but retained locally, causing the next request to cite a stale line.
    const normalizedSubmittedLine = normalizeSubmittedMathLine(submittedLine);

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
        submittedLine: normalizedSubmittedLine,
        ...(dontKnow ? { dontKnow: true } : {}),
      });

      const entry: StepLogEntry = { submittedLine: normalizedSubmittedLine, response };
      setStepLog((prev) => [...prev, entry]);
      setLastStep(entry);

      if (response.outcome === "SUBMITTED" && response.validity === "VALID") {
        setAcceptedLines((prev) => [...prev, normalizedSubmittedLine]);
        setDraft("");
      }

      void refreshDebugView(sessionId);

      // Mid-item the hint follows the line the next step is checked against;
      // on a new item it comes with that item instead.
      setDemoHint(
        response.nextAttempt?.demoNextLineHint ?? response.demoNextLineHint,
      );

      if (response.itemComplete && response.nextAttempt) {
        setAttempt(response.nextAttempt);
        setQuestionNumber((n) => n + 1);
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

  const studentInitials = studentName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  const chrome = (
    <div className={styles.chrome}>
      <div className={styles.chromeLeft}>
        <Link href="/" className={`wordmark ${styles.wordmarkWithLogo}`}>
          <span className={styles.logoMark} aria-hidden="true">C</span>
          Cogna<span className="dot">.</span>
        </Link>
        {studentName && (
          <span className={styles.studentPill}>
            <span className={styles.studentAvatar} aria-hidden="true">
              {studentInitials || "S"}
            </span>
            <span className={styles.studentPillName}>{studentName}</span>
          </span>
        )}
      </div>
      <div className={styles.chromeActions}>
        <span className="time-note">No timer, no score — just your working.</span>
        <button
          type="button"
          className={styles.debugTrigger}
          aria-expanded={debugOpen}
          aria-controls="diagnostic-debug-drawer"
          onClick={() => setDebugOpen(true)}
        >
          <span className={styles.debugTriggerDot} aria-hidden="true" />
          Debug view
        </button>
      </div>
    </div>
  );

  function shell(children: React.ReactNode) {
    const why = enrichWhyThisQuestion(whyThisQuestion, debugView);
    return (
      <div className={styles.stage}>
        {chrome}
        <div className={`${styles.panel} phase-in`}>{children}</div>
        {debugOpen && (
          <DebugPanel
            view={debugView}
            log={stepLog}
            note={debugNote}
            why={why}
            onClose={() => setDebugOpen(false)}
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
              checked={sessionTrack === "COMBINED_ALGEBRA"}
              onChange={() => setSessionTrack("COMBINED_ALGEBRA")}
            />
            <span>
              <strong>Algebra check (first two topics)</strong>
              <span className={styles.trackHint}>
                One session: linear equations and brackets → fractions.
              </span>
            </span>
          </label>
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
                Starts with something like <span className={styles.inlineMath}><MathLine text="x/2 + 3 = 7" /></span>, then moves
                to clearing denominators — e.g.{" "}
                <span className={styles.inlineMath}><MathLine text="(x+1)/2 = (x-1)/3 + 1" /></span>.
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
        <DiagnosticV2SummaryPanel
          summaryText={summaryText}
          overview={summaryOverview}
          evidence={debugView}
        />
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
  const isTranscriptionSlip =
    outcome?.outcome === "SUBMITTED" &&
    outcome.firstInvalidActionCode === "COPIED_UNCHANGED_SIDE";

  const enrichedWhy = enrichWhyThisQuestion(whyThisQuestion, debugView);
  const topicProgress =
    sessionTrack === "COMBINED_ALGEBRA" ? topicProgressForStage(attempt?.stageId) : null;
  const trackBadgeText =
    sessionTrack === "FRACTION_LINEAR"
      ? "Track: equations with fractions (clearing denominators)"
      : sessionTrack === "IDENTITY_DIFF_SQUARES"
        ? "Track: difference of squares (identities)"
        : sessionTrack === "FACTOR_MONIC_TRINOMIAL"
          ? "Track: factorising trinomials"
          : sessionTrack === "QUAD_ZERO_PRODUCT"
            ? "Track: quadratics via zero-product"
            : "Track: brackets & negative signs";

  return shell(
    <>
      <p className="eyebrow">One line at a time</p>
      <div className={styles.qBadgeRow}>
        <span className={styles.qBadge}>Question {questionNumber}</span>
        <span className={styles.qTopic}>
          {topicProgress
            ? `Topic ${topicProgress.topicIndex + 1} of ${topicProgress.topicCount} — ${topicProgress.topicName}`
            : trackBadgeText}
        </span>
        {topicProgress && (
          <div className={styles.qDots} aria-hidden="true">
            {Array.from({ length: topicProgress.topicCount }, (_, i) => (
              <span
                key={i}
                className={
                  i < topicProgress.topicIndex
                    ? styles.qDotDone
                    : i === topicProgress.topicIndex
                      ? styles.qDotNow
                      : styles.qDotUpcoming
                }
              />
            ))}
          </div>
        )}
      </div>
      <h1 style={{ fontSize: "var(--text-lg)" }}>Solve this, showing each step</h1>

      {notice && (
        <div className={`${styles.note} ${styles.noteAccepted}`} role="status">
          <strong>{notice}</strong>
        </div>
      )}

      {attemptSource === "AI" && !enrichedWhy?.reasoning && (
        <p className={styles.aiChip} role="note">
          <span className={styles.aiChipMark} aria-hidden="true">
            AI
          </span>
          <span>This question was chosen for you, based on your last answer.</span>
        </p>
      )}

      <ol className={styles.working}>
        <li className={`${styles.workingLine} ${styles.givenLine}`}>
          <span className={styles.lineTag}>Given</span>
          {attempt?.equationPrompt ? (
            <MathLine text={attempt.equationPrompt} />
          ) : null}
        </li>
        {acceptedLines.map((line, i) => (
          <li
            key={`${i}-${line}`}
            className={`${styles.workingLine} ${styles.acceptedLine} settle`}
          >
            <span className={styles.lineTag}>Line {i + 1}</span>
            <MathLine text={line} />
          </li>
        ))}
      </ol>

      <div className={`${styles.entry} field`}>
        <label htmlFor="nextLine">
          Your next line
          {demoHint && (
            <span className={styles.demoHintTag}> demo hint · press Tab to fill</span>
          )}
        </label>
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
            if (e.key === "Tab" && demoHint && draft.trim() === "") {
              e.preventDefault();
              setDraft(demoHint);
              if (error) setError("");
              return;
            }
            if (e.key === "Enter" && !busy) {
              e.preventDefault();
              onSubmitStep();
            }
          }}
          placeholder={demoHint ?? "e.g. -2x + 10 + 3 = 11"}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        {draft.includes("/") && (
          <div className={styles.fracPreview} aria-live="polite">
            <span className={styles.fracPreviewLabel}>Reads as</span>
            <MathLine text={draft} />
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {lastStep && validity === "VALID" && (
        <div className={`${styles.note} ${styles.noteAccepted}`} role="status">
          <strong>That line works — keep going.</strong>
        </div>
      )}

      {outcome?.outcome === "SUBMITTED" && validity === "INVALID" && (
        <div
          className={`${styles.note} ${styles.noteLookAgain} ${isTranscriptionSlip ? styles.slipShake : ""}`}
          role="status"
        >
          <strong>
            {outcome.firstInvalidActionCode === "MISSING_FRACTION_SLASH"
              ? "Looks like a missing fraction bar."
              : isTranscriptionSlip
                ? "The algebra step works — check what you copied."
              : "Let's look at that line again."}
          </strong>
          {outcome.firstInvalidActionDescription && (
            <p className={styles.noteDetail}><MathText text={outcome.firstInvalidActionDescription} /></p>
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
      <p className={styles.whyReasoning}><MathText text={readableReasoning} /></p>
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

type DebugTabKey =
  | "steps"
  | "why"
  | "items"
  | "stages"
  | "selection"
  | "declines"
  | "hypotheses"
  | "skills";

/** Debug steps carry `attemptId` but not a question ordinal, and items[] carries
 * no join key back to steps[] — so the only reliable way to group steps by
 * question is watching for `stepIndex` resetting to 0, which the server
 * guarantees happens exactly once per new item. */
function annotateStepsWithQuestionNumber(
  steps: DiagnosticV2DebugView["steps"],
): Array<DiagnosticV2DebugView["steps"][number] & { questionNumber: number }> {
  let q = 0;
  return steps.map((step, i) => {
    if (i === 0 || step.stepIndex === 0) q += 1;
    return { ...step, questionNumber: q };
  });
}

function originEnglish(origin: string): string {
  switch (origin) {
    case "PRE_WRITTEN":
      return "From the fixed question bank";
    case "TEMPLATE_RENDERED":
      return "Freshly generated from a template";
    case "AI_AUTHORED":
      return "Written by the AI, then checked deterministically";
    default:
      return origin;
  }
}

function MicroSkillName({ code }: { code: string }) {
  const name = englishLabelForDiagnosticCode(code) ?? code;
  return (
    <span className={styles.microSkillName} tabIndex={0} data-code={code} aria-label={`${name}, code ${code}`}>
      {name}
    </span>
  );
}

function MicroSkillCode({ code }: { code: string }) {
  const name = englishLabelForDiagnosticCode(code) ?? code;
  return <code className={styles.microSkillCode} tabIndex={0} data-name={name} aria-label={`${code}, ${name}`}>{code}</code>;
}

function parseSkillEvidenceLine(line: string) {
  const prototypeMatch = line.match(/^([A-Z][A-Z0-9_]+):\s*(\d+)\s+success(?:es)?,\s*(\d+)\s+(?:independent\s+)?failure(?:s)?/i);
  if (prototypeMatch) return { code: prototypeMatch[1]!, scope: "this session", successes: Number(prototypeMatch[2]), failures: Number(prototypeMatch[3]) };
  const liveMatch = line.match(/^([A-Z][A-Z0-9_]+)\s+\[([^\]]+)\].*?right alone\s+(\d+).*?wrong alone\s+(\d+)/i);
  return liveMatch ? { code: liveMatch[1]!, scope: liveMatch[2]!, successes: Number(liveMatch[3]), failures: Number(liveMatch[4]) } : null;
}

function managementStatus(status: string | undefined): { label: string; tone: string } {
  switch (status) {
    case "RELIABLE": return { label: "Reliable", tone: styles.managementReliable };
    case "LIKELY_GAP": return { label: "Weak", tone: styles.managementWeak };
    case "EMERGING":
    case "DEVELOPING": return { label: "Emerging", tone: styles.managementEmerging };
    default: return { label: "Not assessed", tone: styles.managementUnknown };
  }
}

function DebugPanel({
  view,
  log,
  note,
  why,
  onClose,
}: {
  view: DiagnosticV2DebugView | null;
  log: StepLogEntry[];
  note: string;
  why: WhyThisQuestion | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"analysis" | "selection" | "learning" | "management">("selection");
  const [selectedEvidenceCode, setSelectedEvidenceCode] = useState<string | null>(null);

  const annotatedSteps = view ? annotateStepsWithQuestionNumber(view.steps) : [];
  const questionGroups = annotatedSteps.reduce<Array<{ questionNumber: number; steps: typeof annotatedSteps }>>(
    (groups, step) => {
      const current = groups.at(-1);
      if (!current || current.questionNumber !== step.questionNumber) {
        groups.push({ questionNumber: step.questionNumber, steps: [step] });
      } else {
        current.steps.push(step);
      }
      return groups;
    },
    [],
  );

  const tabs = [
    { key: "selection" as const, label: `Question picking (${view?.selections?.length ?? 0})` },
    { key: "analysis" as const, label: `Answer analysis (${view?.steps.length ?? log.length})` },
    { key: "learning" as const, label: "Learning picture" },
    { key: "management" as const, label: "Micro-skill management" },
  ];
  const allStudentStatuses = view?.microSkillStates.map((state) => state.status) ?? [];
  const subjectStatus = allStudentStatuses.includes("LIKELY_GAP")
    ? "LIKELY_GAP"
    : allStudentStatuses.includes("EMERGING") || allStudentStatuses.includes("DEVELOPING")
      ? "EMERGING"
      : allStudentStatuses.includes("RELIABLE")
        ? "RELIABLE"
        : "UNKNOWN";
  const subjectDisplay = managementStatus(subjectStatus);

  return (
    <div className={styles.debugScrim} role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <aside
        id="diagnostic-debug-drawer"
        className={styles.debug}
        role="dialog"
        aria-modal="true"
        aria-label="Diagnostic debug view"
      >
        <div className={styles.debugHead}>
          <div>
            <p className={styles.debugEyebrow}>Internal inspector</p>
            <h2>Debug view</h2>
            {view && (
              <p className={styles.debugSession}>
                Session {view.status.toLowerCase()} · {view.items.length} question{view.items.length === 1 ? "" : "s"}
                · {view.steps.length} submitted step{view.steps.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <button type="button" className={styles.debugClose} onClick={onClose} aria-label="Close debug view">
            Close <span aria-hidden="true">×</span>
          </button>
        </div>
        {note && <p className={styles.debugAlert}>{note}</p>}

        <div className={styles.debugTabs} role="tablist">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
              className={`${styles.debugTab} ${activeTab === tab.key ? styles.debugTabActive : ""}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.debugBody}>
          {!view && !note && <p className={styles.debugEmpty}>Start the diagnostic to see live evidence here.</p>}

          {activeTab === "analysis" && view && (
            <section aria-label="Answer analysis">
              <div className={styles.debugIntro}>
                <strong>Follow each answer through the system</strong>
                <span>Input → rule analysis → AI handoff → optional grading fallback</span>
              </div>
              {questionGroups.length ? questionGroups.map((group, groupIndex) => {
                const item = view.items[group.questionNumber - 1];
                const invalidCount = group.steps.filter((step) => step.validity === "INVALID").length;
                return (
                  <details className={styles.questionAccordion} key={group.questionNumber} open={groupIndex === questionGroups.length - 1}>
                    <summary>
                      <span className={styles.questionNumber}>Q{group.questionNumber}</span>
                      <span className={styles.questionSummaryText}>
                        <strong><MathLine text={item?.equationPrompt ?? `Question ${group.questionNumber}`} /></strong>
                        <small>{group.steps.length} step{group.steps.length === 1 ? "" : "s"} · {invalidCount} flagged</small>
                      </span>
                      <span className={styles.accordionChevron} aria-hidden="true">⌄</span>
                    </summary>
                    <div className={styles.questionSteps}>
                      {group.steps.map((step) => {
                        const p = step.provenance;
                        return (
                          <article className={styles.analysisCard} key={step.id}>
                            <div className={styles.analysisCardHead}>
                              <strong>Step {step.stepIndex + 1}</strong>
                              <span className={`${styles.resultPill} ${step.validity === "VALID" ? styles.resultValid : styles.resultInvalid}`}>{step.validity}</span>
                              <span className={styles.sourcePill}>{step.verificationSource === "AI_FALLBACK" ? "AI graded" : "Rules graded"}</span>
                            </div>
                            <div className={styles.mathEvidence}><MathLine text={step.previousLine} /><span>→</span><MathLine text={step.submittedLine} /></div>
                            <div className={styles.analysisGrid}>
                              <div className={styles.analysisSection}>
                                <span className={styles.analysisIndex}>1</span>
                                <div><h3>Data fed to the rules</h3>
                                  <table className={styles.debugDataTable}><tbody>
                                    <tr><th scope="row">Previous line</th><td><MathLine text={p?.input.previousLine ?? step.previousLine} /></td></tr>
                                    <tr><th scope="row">Student answer</th><td><MathLine text={p?.input.submittedLine ?? step.submittedLine} /></td></tr>
                                    <tr><th scope="row">Grammar</th><td>{p?.input.resolvedGrammar ?? "Not recorded"}</td></tr>
                                  </tbody></table>
                                </div>
                              </div>
                              <div className={styles.analysisSection}>
                                <span className={styles.analysisIndex}>2</span>
                                <div><h3>What the rules analysed</h3>
                                  {p ? <><p>Compared <MathLine text={p.ruleAnalysis.normalizedPreviousLine ?? "unparsed"} /> with <MathLine text={p.ruleAnalysis.normalizedSubmittedLine ?? "unparsed"} />.</p><p><strong>{p.ruleAnalysis.outcome === "ABSTAINED" ? "Rules could not decide" : `${p.ruleAnalysis.validity}: ${p.ruleAnalysis.transformation}`}</strong></p>{p.ruleAnalysis.firstInvalidActionDescription && <p className={styles.evidenceCallout}><MathText text={p.ruleAnalysis.firstInvalidActionDescription} /></p>}{p.ruleAnalysis.parseError && <p className={styles.evidenceCallout}><MathText text={`Parse evidence: ${p.ruleAnalysis.parseError}`} /></p>}</> : <p>Detailed rule provenance was not recorded for this step.</p>}
                                </div>
                              </div>
                              <div className={styles.analysisSection}>
                                <span className={styles.analysisIndex}>3</span>
                                <div><h3>What the rules gave the AI</h3>
                                  {(() => {
                                    const state = view.microSkillStates.find((candidate) => candidate.microSkillId === step.primaryMicroSkillId);
                                    const exactHypothesis = [...view.hypotheses].reverse().find((candidate) => candidate.stepId === step.id);
                                    const legacyHypothesis = exactHypothesis ? undefined : [...view.hypotheses].reverse().find((candidate) => !candidate.stepId && candidate.attemptId === step.attemptId && candidate.microSkillId === step.primaryMicroSkillId);
                                    const hypothesis = exactHypothesis ?? legacyHypothesis;
                                    const transcriptionSlip = step.firstInvalidActionCode === "COPIED_UNCHANGED_SIDE";
                                    const interpreterEvidence = <>
                                      <p className={styles.interpreterSubheading}><strong>Evidence sent to the step interpreter</strong></p>
                                      <div className={styles.interpreterHandoffFacts}>
                                        <span>Exact change</span><MathLine text={`${step.previousLine} → ${step.submittedLine}`} />
                                        <span>Rule result</span><strong>{transcriptionSlip ? "LIKELY TRANSCRIPTION SLIP" : `${step.validity} · ${step.attemptedTransformation}`}</strong>
                                        <span>Rule-side grouping</span>{transcriptionSlip ? <span>No skill penalty — checking/copy accuracy only</span> : <span>Counts and exact evidence only; the AI chooses the micro-skill.</span>}
                                        <span>This session</span><span>{state?.sessionIndependentSuccessCount ?? 0} independent successes · {state?.sessionIndependentFailureCount ?? 0} independent failures · {state?.sessionAssistedSuccessCount ?? 0} assisted successes</span>
                                      </div>
                                      {step.firstInvalidActionDescription && <p className={styles.evidenceCallout}><MathText text={step.firstInvalidActionDescription} /></p>}
                                      {hypothesis
                                        ? <div className={styles.interpreterResult}><div><strong>Interpreter result</strong><span className={`${styles.sourcePill} ${hypothesis.source === "AI" ? styles.tagAi : styles.tagRule}`}>{hypothesis.source === "AI" ? "Accepted AI" : "Rule fallback"}</span></div><p><strong>Micro-skill: </strong><MicroSkillName code={hypothesis.microSkillId} /></p><p><MathText text={hypothesis.reasoning} /></p><small>{Math.round(hypothesis.confidence * 100)}% confidence</small></div>
                                        : transcriptionSlip
                                          ? <p className={styles.noAi}>No AI skill inference was requested. The rules found that the algebra operation was correct and isolated the changed, untouched value as a likely copying slip; this step does not change any micro-skill score.</p>
                                          : <p className={styles.noAi}>No interpreter record exists for this historical step. This does not mean the selector received nothing; it means no step-level interpretation was persisted.</p>}
                                    </>;
                                    if (!p?.handedToAi) return interpreterEvidence;
                                    const skillRows = p.handedToAi.skillLines.map(parseSkillEvidenceLine).filter((row): row is NonNullable<typeof row> => row !== null);
                                    const evidenceLines = p.handedToAi.skillLines.filter((line) => line.startsWith("Evidence:"));
                                    return <>{interpreterEvidence}<div className={styles.selectorHandoffDivider}><strong>Package sent to the next-question selector</strong><span>This is separate from the interpreter result above.</span></div><p>{p.handedToAi.lastStepSummary}</p>
                                      {skillRows[0] && <p className={styles.handoffSkillName}><MicroSkillName code={skillRows[0].code} /></p>}
                                      {skillRows.length > 0 && <table className={`${styles.debugDataTable} ${styles.skillEvidenceTable}`}>
                                        <thead><tr><th scope="col">Code</th><th scope="col">Scope</th><th scope="col">Successes</th><th scope="col">Failures</th></tr></thead>
                                        <tbody>{skillRows.map((row) => <tr key={row.code}><td><button type="button" className={styles.evidenceDrilldownButton} onClick={() => setSelectedEvidenceCode(row.code)}><MicroSkillCode code={row.code} /></button></td><td>{row.scope}</td><td><button type="button" className={styles.evidenceCountButton} onClick={() => setSelectedEvidenceCode(row.code)}>{row.successes}</button></td><td><button type="button" className={styles.evidenceCountButton} onClick={() => setSelectedEvidenceCode(row.code)}>{row.failures}</button></td></tr>)}</tbody>
                                      </table>}
                                      {evidenceLines.map((line) => <p className={styles.handoffEvidence} key={line}><MathText text={line} /></p>)}
                                    </>;
                                  })()}
                                </div>
                              </div>
                              <div className={styles.analysisSection}>
                                <span className={styles.analysisIndex}>4</span>
                                <div><h3>AI grading fallback</h3>
                                  {p?.aiGraderFallback ? <><p><strong>Why it ran:</strong> <MathText text={p.aiGraderFallback.whyItRan} /></p><p><strong>Decision:</strong> {p.aiGraderFallback.validity ?? "No decision"} · confidence {p.aiGraderFallback.confidence?.toFixed(2) ?? "not returned"}</p>{p.aiGraderFallback.reasoning && <p><MathText text={p.aiGraderFallback.reasoning} /></p>}</> : <p className={styles.noAi}>Not used — the deterministic rules reached a decision.</p>}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                );
              }) : <p className={styles.debugEmpty}>No submitted steps yet.</p>}
            </section>
          )}

          {activeTab === "selection" && view && (
            <section aria-label="Question picking">
              {why && <div className={styles.currentPick}><span>Currently served</span><strong>{originEnglish(why.origin ?? "PRE_WRITTEN")}</strong>{view.items.at(-1) && <MathLine text={view.items.at(-1)!.equationPrompt} />}</div>}
              {view.selections?.length ? view.selections.map((selection, i) => {
                const servedItem = view.items[i + 1];
                const readableServedName = englishLabelForDiagnosticCode(selection.servedItemKey)
                  ?? englishLabelForDiagnosticCode(servedItem?.primaryMicroSkillId ?? "")
                  ?? (servedItem ? originEnglish(servedItem.origin) : "Generated algebra question");
                return (
                <details className={styles.selectionCard} key={`${selection.servedItemKey}-${i}`} open={i === view.selections!.length - 1}>
                  <summary><span className={styles.questionNumber}>Q{i + 2}</span><div><small>Final question served</small><h3>{readableServedName}</h3>{servedItem && <span className={styles.servedQuestionPrompt}><MathLine text={servedItem.equationPrompt} /></span>}<code>{selection.servedItemKey}</code></div><span className={styles.sourcePill}>{selection.servedSource}</span><span className={styles.accordionChevron} aria-hidden="true">⌄</span></summary>
                  <div className={styles.selectionFlow}>
                    <section><span className={styles.analysisIndex}>1</span><h4>Why the rules chose this</h4>
                      <table className={styles.debugDataTable}><tbody>
                        <tr><th scope="row">Selected</th><td>{englishLabelForDiagnosticCode(selection.rulePick.itemKey) ?? selection.rulePick.itemKey}</td></tr>
                        <tr><th scope="row">Code</th><td><code>{selection.rulePick.itemKey}</code></td></tr>
                        <tr><th scope="row">Source</th><td>{originEnglish(selection.rulePick.origin)}</td></tr>
                      </tbody></table>
                      {selection.verificationGate && <div className={styles.verificationGateCard}>
                        <strong>Neutral verification evidence bar: {selection.verificationGate.eligible ? "PASSED" : "NOT PASSED"}</strong>
                        <p>{selection.verificationGate.reason}</p>
                        <dl>
                          <div><dt>Independent division opportunities</dt><dd>{selection.verificationGate.independentOpportunities} / 3 required</dd></div>
                          <div><dt>Incorrect quotients</dt><dd>{selection.verificationGate.quotientFailures} / 2 required</dd></div>
                          <div><dt>Distinct questions</dt><dd>{selection.verificationGate.distinctQuestions} / 2 required</dd></div>
                          <div><dt>Contradictory success evidence</dt><dd>{selection.verificationGate.independentSuccesses + selection.verificationGate.contradictoryStrengthEvidence}</dd></div>
                        </dl>
                        <small>Cogna records an inconsistent response pattern only. It does not infer that the student answered incorrectly deliberately.</small>
                      </div>}
                      <p className={styles.selectionReason}>{selection.rulePick.routeReason}</p>
                    </section>
                    <section><span className={styles.analysisIndex}>2</span><h4>Shortlist sent to AI</h4><p>{selection.candidates.length} legal candidate{selection.candidates.length === 1 ? "" : "s"}:</p><ol className={styles.candidateList}>{selection.candidates.map((candidate) => <li key={`${candidate.index}-${candidate.itemKey}`} className={candidate.isRulePick ? styles.ruleCandidate : ""}><strong>{candidate.index + 1}. <MathLine text={candidate.prompt} /></strong><span>{originEnglish(candidate.origin)} · {candidate.itemKey}</span><small>{candidate.legalityReason}</small></li>)}</ol></section>
                    <section><span className={styles.analysisIndex}>3</span><h4>Why the AI chose this</h4>{selection.aiDecision ? <><p className={styles.decisionHeadline}>{selection.aiDecision.choice === "EXISTING" ? "Selected an existing question" : selection.aiDecision.choice === "GENERATE" ? "Generated from a template" : "Authored a new question"}</p><p className={styles.selectionReason}><MathText text={humanizeDiagnosticCodesInText(selection.aiDecision.reasoning)} /></p><div className={styles.decisionFacts}><span>confidence {selection.aiDecision.confidence?.toFixed(2) ?? "—"}</span><span>{selection.aiDecision.agreedWithRule ? "agreed with rule pick" : "changed the rule pick"}</span></div>{selection.aiDecision.discardedReason && <p className={styles.evidenceCallout}><MathText text={`Rejected by safety gate: ${selection.aiDecision.discardedReason}`} /></p>}</> : <><p className={styles.aiRejectedHeadline}>AI reasoning not accepted → going to rule-based fallback</p>{selection.aiFallback?.rejectedReasoning && <div className={styles.rejectedReasoning}><strong>Rejected AI reasoning</strong><p><MathText text={humanizeDiagnosticCodesInText(selection.aiFallback.rejectedReasoning)} /></p></div>}<p className={styles.evidenceCallout}><strong>Exact fallback reason:</strong> {selection.aiFallback?.reason ?? "Not recorded for this older decision."}{selection.aiFallback?.latencyMs != null ? ` (${selection.aiFallback.latencyMs} ms)` : ""}</p>{selection.aiFallback?.forbiddenTerm && <p className={styles.forbiddenTermCallout}><strong>Forbidden term:</strong> <code>{selection.aiFallback.forbiddenTerm}</code></p>}</>}</section>
                  </div>
                  <div className={styles.servedExplanation}><strong>Why this question was ultimately served</strong><p>{selection.servedSource === "AI" && selection.aiDecision ? `The AI decision passed validation and was allowed to serve. ${selection.aiDecision.agreedWithRule ? "It confirmed the rule-based pick." : "It changed the rule-based pick to a different legal candidate."}` : "No AI decision was eligible to serve, so Cogna used the deterministic rule-based pick."}</p></div>
                </details>
              );}) : <p className={styles.debugEmpty}>The opening question is fixed. Complete it to see the next-question decision trail.</p>}
            </section>
          )}

          {activeTab === "learning" && view && (
            <section aria-label="Learning picture">
              <div className={styles.debugIntro}><strong>Session learning picture</strong><span>Rule evidence and AI interpretation are kept separate.</span></div>
              {(() => {
                const validSteps = annotatedSteps.filter((step) => step.validity === "VALID");
                const invalidSteps = annotatedSteps.filter((step) => step.validity === "INVALID");
                const unresolvedSteps = annotatedSteps.filter((step) => step.validity === "AMBIGUOUS" || step.validity === "PARSE_FAILED");
                const aiHypotheses = view.hypotheses.filter((h) => h.source === "AI");
                const latestAiBySkill = [...aiHypotheses].reduce<Map<string, typeof aiHypotheses[number]>>((map, h) => map.set(h.microSkillId, h), new Map());
                return <>
                  <div className={styles.sessionSummaryGrid}>
                    <article className={styles.sessionSummaryCard}>
                      <span className={`${styles.tag} ${styles.tagRule}`}>RULE BASED</span>
                      <h3>What the rules think is going on in this session</h3>
                      <p>The rules analysed <strong>{annotatedSteps.length}</strong> submitted steps across <strong>{questionGroups.length}</strong> questions: <strong>{validSteps.length}</strong> valid, <strong>{invalidSteps.length}</strong> invalid, and <strong>{unresolvedSteps.length}</strong> unresolved.</p>
                      {invalidSteps.length > 0 ? <div className={styles.evidenceExamples}>{invalidSteps.map((step) => <div key={step.id}><MathLine text={`${step.previousLine} → ${step.submittedLine}`} /></div>)}</div> : <p className={styles.noAi}>No rule-verified errors in this session yet.</p>}
                    </article>
                    <article className={styles.sessionSummaryCard}>
                      <span className={`${styles.tag} ${styles.tagAi}`}>AI BASED</span>
                      <h3>What the AI thinks is going on in this session</h3>
                      {latestAiBySkill.size > 0 ? <ul className={styles.aiSummaryList}>{[...latestAiBySkill.values()].map((h) => <li key={h.microSkillId}><strong><MicroSkillName code={h.microSkillId} /></strong><p><MathText text={humanizeDiagnosticCodesInText(h.reasoning)} /></p><span>{Math.round(h.confidence * 100)}% confidence</span></li>)}</ul> : <p className={styles.noAi}>No accepted AI learning interpretation has been recorded yet.</p>}
                    </article>
                  </div>
                  <div className={styles.questionLearningList}>
                    <h3>Question-by-question learning picture</h3>
                    {questionGroups.map((group, index) => {
                      const item = view.items[group.questionNumber - 1];
                      const invalid = group.steps.filter((step) => step.validity === "INVALID");
                      const valid = group.steps.filter((step) => step.validity === "VALID");
                      const attemptIds = new Set(group.steps.map((step) => step.attemptId));
                      const questionAi = aiHypotheses.filter((h) => h.attemptId && attemptIds.has(h.attemptId));
                      return <details className={styles.questionAccordion} key={group.questionNumber} open={index === questionGroups.length - 1}>
                        <summary><span className={styles.questionNumber}>Q{group.questionNumber}</span><span className={styles.questionSummaryText}><strong><MathLine text={item?.equationPrompt ?? `Question ${group.questionNumber}`} /></strong><small>{valid.length} valid · {invalid.length} flagged</small></span><span className={styles.accordionChevron} aria-hidden="true">⌄</span></summary>
                        <div className={styles.questionLearningBody}>
                          <article><span className={`${styles.tag} ${styles.tagRule}`}>RULE BASED</span><h4>What the rules observed</h4><p>{group.steps.length} steps analysed: {valid.length} valid and {invalid.length} invalid.</p>{invalid.length > 0 ? invalid.map((step) => <div className={styles.questionEvidence} key={step.id}><MathLine text={`${step.previousLine} → ${step.submittedLine}`} />{step.firstInvalidActionDescription && <p><MathText text={step.firstInvalidActionDescription} /></p>}</div>) : <p className={styles.noAi}>No rule-verified error in this question.</p>}</article>
                          <article><span className={`${styles.tag} ${styles.tagAi}`}>AI BASED</span><h4>What the AI inferred from this question</h4>{questionAi.length > 0 ? questionAi.map((h) => <div className={styles.questionAiFinding} key={`${h.stepId ?? h.attemptId}-${h.microSkillId}`}><strong><MicroSkillName code={h.microSkillId} /></strong><p><MathText text={humanizeDiagnosticCodesInText(h.reasoning)} /></p><span>{Math.round(h.confidence * 100)}% confidence</span></div>) : <p className={styles.noAi}>No AI inference was generated for this question. Legacy inferences without a question link are shown only in the session summary.</p>}</article>
                        </div>
                      </details>;
                    })}
                  </div>
                </>;
              })()}
              <div className={styles.skillGrid}>{view.microSkillStates.map((state) => <article className={styles.skillDebugCard} key={state.microSkillId}><h3>{englishLabelForDiagnosticCode(state.microSkillId) ?? state.microSkillId}</h3><div><strong>{state.sessionEvidenceCount ?? 0}</strong> session evidence · <strong>{state.evidenceCount}</strong> lifetime</div><p>{state.independentSuccessCount} independent success · {state.independentFailureCount} independent failure · {state.assistedSuccessCount} assisted</p><CodeTag code={state.status} /></article>)}</div>
            </section>
          )}

          {activeTab === "management" && view && (
            <section aria-label="Micro-skill management">
              <div className={styles.debugIntro}>
                <strong>Algebra micro-skill management</strong>
                <span>Live curriculum status for this student</span>
              </div>
              <nav className={styles.managementHierarchy} aria-label="Micro-skill hierarchy">
                <span>Algebra</span><span aria-hidden="true">→</span>
                <span>Topic</span><span aria-hidden="true">→</span>
                <span>Competency family / subtopic</span><span aria-hidden="true">→</span>
                <span>Micro-skill</span>
              </nav>
              <div className={styles.managementLegend} aria-label="Status legend">
                {[
                  { label: "Reliable", tone: styles.managementReliable },
                  { label: "Emerging", tone: styles.managementEmerging },
                  { label: "Weak", tone: styles.managementWeak },
                  { label: "Not assessed", tone: styles.managementUnknown },
                ].map((item) => <span className={`${styles.managementStatus} ${item.tone}`} key={item.label}>{item.label}</span>)}
              </div>
              <div className={styles.managementSubject}>
                <header><div><span className={styles.managementLevel}>Subject</span><h3>Algebra</h3></div><span className={`${styles.managementStatus} ${subjectDisplay.tone}`}>{subjectDisplay.label}</span></header>
                <div className={styles.managementTopics}>
                  {MICRO_SKILL_MANAGEMENT_GROUPS.map((topic) => {
                    const topicStates = topic.groups.flatMap((group) => group.ids).map((id) => view.microSkillStates.find((state) => state.microSkillId === id)?.status);
                    const topicStatus = topicStates.includes("LIKELY_GAP") ? "LIKELY_GAP" : topicStates.includes("EMERGING") || topicStates.includes("DEVELOPING") ? "EMERGING" : topicStates.includes("RELIABLE") ? "RELIABLE" : "UNKNOWN";
                    const topicDisplay = managementStatus(topicStatus);
                    return <details className={styles.managementTopic} key={topic.name} open={topic.name === "Brackets, signs & fractions"}>
                      <summary><div><span className={styles.managementLevel}>Topic</span><strong>{topic.name}</strong></div><span className={`${styles.managementStatus} ${topicDisplay.tone}`}>{topicDisplay.label}</span><span className={styles.accordionChevron} aria-hidden="true">⌄</span></summary>
                      <div className={styles.managementSubtopics}>
                        {topic.groups.map((group) => {
                          const states = group.ids.map((id) => view.microSkillStates.find((state) => state.microSkillId === id)?.status);
                          const groupStatus = states.includes("LIKELY_GAP") ? "LIKELY_GAP" : states.includes("EMERGING") || states.includes("DEVELOPING") ? "EMERGING" : states.includes("RELIABLE") ? "RELIABLE" : "UNKNOWN";
                          const groupDisplay = managementStatus(groupStatus);
                          return <div className={styles.managementSubtopic} key={group.name}>
                            <div className={styles.managementSubtopicHead}><div><span className={styles.managementLevel}>Competency family / subtopic</span><h4>{group.name}</h4></div><span className={`${styles.managementStatus} ${groupDisplay.tone}`}>{groupDisplay.label}</span></div>
                            <ul>{group.ids.map((id) => {
                              const studentState = view.microSkillStates.find((state) => state.microSkillId === id);
                              const display = managementStatus(studentState?.status);
                              return <li key={id}><button type="button" className={styles.managementSkillButton} onClick={() => setSelectedEvidenceCode(id)}><div><span className={styles.managementLevel}>Micro-skill</span><MicroSkillName code={id} /></div><span className={`${styles.managementStatus} ${display.tone}`}>{display.label}</span></button></li>;
                            })}</ul>
                          </div>;
                        })}
                      </div>
                    </details>;
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
        {selectedEvidenceCode && (() => {
          const matching = annotatedSteps.filter((step) => step.primaryMicroSkillId === selectedEvidenceCode);
          const failures = matching.filter((step) => step.validity === "INVALID");
          const state = view?.microSkillStates.find((candidate) => candidate.microSkillId === selectedEvidenceCode);
          const statusDisplay = managementStatus(state?.status);
          const skillHypotheses = view?.hypotheses.filter((hypothesis) => hypothesis.microSkillId === selectedEvidenceCode) ?? [];
          const latestAi = [...skillHypotheses].reverse().find((hypothesis) => hypothesis.source === "AI");
          return <div className={styles.evidencePopupScrim} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEvidenceCode(null); }}>
            <section className={styles.evidencePopup} role="dialog" aria-modal="true" aria-label={`Evidence for ${selectedEvidenceCode}`}>
              <header><div><span>Micro-skill evidence</span><h3><MicroSkillName code={selectedEvidenceCode} /></h3><MicroSkillCode code={selectedEvidenceCode} /></div><div className={styles.evidencePopupActions}><span className={`${styles.managementStatus} ${statusDisplay.tone}`}>{statusDisplay.label}</span><button type="button" onClick={() => setSelectedEvidenceCode(null)} aria-label="Close evidence details">Close ×</button></div></header>
              <p><strong>{matching.length}</strong> recorded step{matching.length === 1 ? "" : "s"} in this test · <strong className={styles.evidenceFailureText}>{failures.length} failure{failures.length === 1 ? "" : "s"}</strong></p>
              {state && <div className={styles.statusEvidenceSummary}><strong>Why the rules assigned {statusDisplay.label}</strong><p>{state.sessionIndependentSuccessCount ?? 0} independent success{(state.sessionIndependentSuccessCount ?? 0) === 1 ? "" : "es"}, {state.sessionIndependentFailureCount ?? 0} independent failure{(state.sessionIndependentFailureCount ?? 0) === 1 ? "" : "s"}, and {state.sessionAssistedSuccessCount ?? 0} assisted success{(state.sessionAssistedSuccessCount ?? 0) === 1 ? "" : "es"} in this session.</p></div>}
              <div className={styles.statusAiExplanation}><span className={`${styles.tag} ${styles.tagAi}`}>AI BASED</span><strong>Why the AI interprets this status this way</strong>{latestAi ? <><p><MathText text={humanizeDiagnosticCodesInText(latestAi.reasoning)} /></p><small>{Math.round(latestAi.confidence * 100)}% confidence</small></> : <p>No accepted AI interpretation has been recorded for this skill yet.</p>}</div>
              {matching.length > 0 ? <ol className={styles.evidenceOccurrenceList}>{matching.map((step) => <li key={step.id} className={step.validity === "INVALID" ? styles.evidenceOccurrenceFailure : styles.evidenceOccurrenceSuccess}><div><strong>Question {step.questionNumber}, Step {step.stepIndex + 1}</strong><span>{step.validity}</span></div><MathLine text={`${step.previousLine} → ${step.submittedLine}`} />{step.validity === "INVALID" && <p><MathText text={step.firstInvalidActionDescription ?? "The rules marked this transformation invalid."} /></p>}</li>)}</ol> : <p>No step in this test is linked to this micro-skill. Any larger total shown was historical data from the reused demo account.</p>}
            </section>
          </div>;
        })()}
      </aside>
    </div>
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
