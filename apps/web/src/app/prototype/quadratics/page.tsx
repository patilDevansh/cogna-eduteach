"use client";

/**
 * COGNA's first diagnostic learning prototype — quadratic expressions
 * (expansion, area model, factorisation, transfer). One continuous
 * session; diagnosis happens in the background via classifyExpansionAttempt/
 * classifyFactorAttempt (see lib/quadratics/diagnosis.ts) — nothing here
 * decides pass/fail by pattern-matching the UI itself.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "@/components/quadratics/quadratics.module.css";
import { MathExpr } from "@/components/quadratics/MathExpr";
import { AreaModel } from "@/components/quadratics/AreaModel";
import { ProductSumWorkspace } from "@/components/quadratics/ProductSumWorkspace";
import { areEquivalent, formatPoly } from "@/lib/quadratics/poly";
import {
  classifyExpansionAttempt,
  classifyFactorAttempt,
  expandedPoly,
  needsIntervention,
  needsProbe,
  recordMainAttempt,
  recordProbeAttempt,
  looksLikeSignIssue,
} from "@/lib/quadratics/diagnosis";
import {
  MAIN_PROBLEM,
  PROBE_PROBLEM,
  TRANSFER_PROBLEM,
  WARMUP_1,
  WARMUP_2,
  getScenario,
  type Scenario,
  type ScenarioId,
} from "@/lib/quadratics/scenarios";
import { initialTracker, studentPhaseFor, type StageId, type CompletionMode, type ConfidenceLevel, type DiagnosisTracker, type FactorHypothesis, type TransferOutcome } from "@/lib/quadratics/types";
import { newAnonymousSessionId, makeEvent, appendEvent } from "@/lib/quadratics/session-log";

const STUDENT_NAME = "Arun";
const PATH_STEPS: { label: string; stages: StageId[] }[] = [
  { label: "Warm-up", stages: ["WELCOME", "CONFIDENCE", "WARMUP_1", "WARMUP_2"] },
  { label: "Expansion", stages: ["MAIN_EXPANSION", "PROBE"] },
  { label: "Build it backwards", stages: ["AREA_MODEL", "FACTORISATION"] },
  { label: "New example", stages: ["TRANSFER", "SUMMARY"] },
];

function badgeClass(mode: CompletionMode): string {
  if (mode === "INDEPENDENT") return `${styles.summaryBadge} ${styles.badgeIndependent}`;
  if (mode === "SUPPORTED") return `${styles.summaryBadge} ${styles.badgeSupported}`;
  return `${styles.summaryBadge} ${styles.badgeFuture}`;
}
function badgeLabel(mode: CompletionMode): string {
  if (mode === "INDEPENDENT") return "Independent";
  if (mode === "SUPPORTED") return "With support";
  return "Check again soon";
}

function QuadraticsSessionInner() {
  const searchParams = useSearchParams();
  const scenarioParam = searchParams.get("scenario") as ScenarioId | null;
  const [scenario] = useState<Scenario | null>(() => {
    if (!scenarioParam) return null;
    try {
      return getScenario(scenarioParam);
    } catch {
      return null;
    }
  });
  const stepCursorRef = useRef(0);

  const [sessionId] = useState(() => newAnonymousSessionId());
  const [stage, setStage] = useState<StageId>("WELCOME");
  const stageEnteredAt = useRef<number>(Date.now());

  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);

  const [warmup1Answer, setWarmup1Answer] = useState("");
  const [warmup1Done, setWarmup1Done] = useState(false);
  const [warmup1Feedback, setWarmup1Feedback] = useState<string | null>(null);

  const [warmup2Answer, setWarmup2Answer] = useState("");
  const [warmup2Done, setWarmup2Done] = useState(false);
  const [warmup2Feedback, setWarmup2Feedback] = useState<string | null>(null);

  const [mainWorkLines, setMainWorkLines] = useState("");
  const [tracker, setTracker] = useState<DiagnosisTracker>(initialTracker());

  const [probeAnswer, setProbeAnswer] = useState("");

  const [interventionSeenThisSession, setInterventionSeenThisSession] = useState(false);

  const [factorPrefill, setFactorPrefill] = useState<{ p: string; q: string; writtenForm: string } | null>(null);
  const [factorPrefillNonce, setFactorPrefillNonce] = useState(0);
  const [factorFeedback, setFactorFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [factorOutcome, setFactorOutcome] = useState<FactorHypothesis | null>(null);

  const [transferPart, setTransferPart] = useState<"EXPAND" | "FACTOR">("EXPAND");
  const [transferWorkLines, setTransferWorkLines] = useState("");
  const [transferOutcome, setTransferOutcome] = useState<TransferOutcome | null>(null);
  const [transferFactorPrefill, setTransferFactorPrefill] = useState<{ p: string; q: string; writtenForm: string } | null>(null);
  const [transferFactorPrefillNonce, setTransferFactorPrefillNonce] = useState(0);
  const [transferFactorOutcome, setTransferFactorOutcome] = useState<FactorHypothesis | null>(null);

  function goStage(next: StageId) {
    stageEnteredAt.current = Date.now();
    setStage(next);
  }

  const applyNextScenarioStep = useCallback(() => {
    if (!scenario) return;
    const step = scenario.steps[stepCursorRef.current];
    if (!step) return;
    stepCursorRef.current += 1;
    if (step.kind === "ANSWER") {
      if (step.target === "WARMUP_1") setWarmup1Answer(step.input);
      else if (step.target === "WARMUP_2") setWarmup2Answer(step.input);
      else if (step.target === "PROBE") setProbeAnswer(step.input);
    } else if (step.kind === "WORKED_LINES") {
      if (step.target === "MAIN_EXPANSION") setMainWorkLines(step.lines.join("\n"));
      else if (step.target === "TRANSFER_EXPANSION") setTransferWorkLines(step.lines.join("\n"));
    } else if (step.kind === "FACTOR_ATTEMPT") {
      const prefillObj = { p: String(step.p), q: String(step.q), writtenForm: step.writtenForm };
      if (step.target === "FACTORISATION") {
        setFactorPrefill(prefillObj);
        setFactorPrefillNonce((n) => n + 1);
      } else {
        setTransferFactorPrefill(prefillObj);
        setTransferFactorPrefillNonce((n) => n + 1);
      }
    }
    // STUCK: nothing to prefill — the demoer clicks "I'm stuck" themselves.
  }, [scenario]);

  function recordEvent(fields: {
    questionId: string;
    questionStage: StageId;
    presentedExpression: string;
    representationType: "SYMBOLIC" | "AREA_MODEL" | "PRODUCT_SUM";
    rawStudentInput: string;
    normalizedInput: string | null;
    stepValidity: "VALID" | "INVALID" | "UNPARSEABLE" | "N/A";
    helpUsed: boolean;
    probeShown: boolean;
    internalHypothesis: string | null;
    evidenceState: DiagnosisTracker["evidenceState"] | null;
    interventionShown: boolean;
    supportedOrIndependent: CompletionMode | null;
    transferOutcome: TransferOutcome | null;
  }) {
    const event = makeEvent({
      anonymousSessionId: sessionId,
      responseTimeMs: Date.now() - stageEnteredAt.current,
      ...fields,
    } as Parameters<typeof makeEvent>[0]);
    appendEvent(sessionId, event);
  }

  // ---------- Stage 1: welcome ----------
  if (stage === "WELCOME") {
    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Session</p>
        <h1 className={styles.h1}>Hi {STUDENT_NAME}, ready for a short algebra session?</h1>
        <p className={styles.lead}>Today: building and breaking apart expressions. About 15 minutes.</p>
        <div className={styles.actions} style={{ marginTop: "1.5rem" }}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => goStage("CONFIDENCE")}>
            Start learning
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Stage 1b: confidence ----------
  if (stage === "CONFIDENCE") {
    const options: { level: ConfidenceLevel; label: string }[] = [
      { level: "NOT_SURE", label: "Not sure yet" },
      { level: "A_LITTLE", label: "A little confident" },
      { level: "CONFIDENT", label: "Confident" },
      { level: "VERY_CONFIDENT", label: "Very confident" },
    ];
    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Before we start</p>
        <h1 className={styles.h1}>How are you feeling about algebra today?</h1>
        <div className={styles.chipRow} style={{ marginTop: "1.25rem" }}>
          {options.map((o) => (
            <button
              key={o.level}
              type="button"
              className={`${styles.chip} ${confidence === o.level ? styles.chipActive : ""}`}
              onClick={() => setConfidence(o.level)}
              aria-pressed={confidence === o.level}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className={styles.actions} style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!confidence}
            onClick={() => {
              recordEvent({
                questionId: "confidence-check",
                questionStage: "CONFIDENCE",
                presentedExpression: "How are you feeling about algebra today?",
                representationType: "SYMBOLIC",
                rawStudentInput: confidence ?? "",
                normalizedInput: null,
                stepValidity: "N/A",
                helpUsed: false,
                probeShown: false,
                internalHypothesis: null,
                evidenceState: null,
                interventionShown: false,
                supportedOrIndependent: null,
                transferOutcome: null,
              });
              goStage("WARMUP_1");
              applyNextScenarioStep();
            }}
          >
            Continue
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Stage 2: warm-ups ----------
  if (stage === "WARMUP_1" || stage === "WARMUP_2") {
    const isFirst = stage === "WARMUP_1";
    const problem = isFirst ? WARMUP_1 : WARMUP_2;
    const answer = isFirst ? warmup1Answer : warmup2Answer;
    const setAnswer = isFirst ? setWarmup1Answer : setWarmup2Answer;
    const done = isFirst ? warmup1Done : warmup2Done;
    const feedback = isFirst ? warmup1Feedback : warmup2Feedback;
    const setFeedback = isFirst ? setWarmup1Feedback : setWarmup2Feedback;
    const setDone = isFirst ? setWarmup1Done : setWarmup2Done;

    function check() {
      const ok = areEquivalent(answer, problem.expected);
      recordEvent({
        questionId: isFirst ? "warmup-1" : "warmup-2",
        questionStage: stage,
        presentedExpression: problem.presented,
        representationType: "SYMBOLIC",
        rawStudentInput: answer,
        normalizedInput: null,
        stepValidity: ok ? "VALID" : "INVALID",
        helpUsed: false,
        probeShown: false,
        internalHypothesis: null,
        evidenceState: null,
        interventionShown: false,
        supportedOrIndependent: null,
        transferOutcome: null,
      });
      if (ok) {
        setFeedback(isFirst ? "That works. You multiplied both terms." : "Nice.");
        setDone(true);
      } else {
        setFeedback("Not quite — take another look.");
      }
    }

    function continueNext() {
      if (isFirst) {
        goStage("WARMUP_2");
      } else {
        goStage("MAIN_EXPANSION");
      }
      applyNextScenarioStep();
    }

    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Warm up</p>
        <div className={styles.math} style={{ margin: "0.75rem 0 1.25rem" }}>
          <MathExpr expr={problem.presented} />
        </div>
        {!done ? (
          <>
            <div className={styles.field} style={{ maxWidth: "18rem" }}>
              <label htmlFor="warmup-answer">Your answer</label>
              <input
                id="warmup-answer"
                className={styles.input}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    check();
                  }
                }}
                autoComplete="off"
              />
            </div>
            {feedback && <p className={styles.faint} style={{ marginTop: "0.6rem" }}>{feedback}</p>}
            <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={check}>
                Check
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.lead}>{feedback} Ready for the next one?</p>
            <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={continueNext}>
                Continue
              </button>
            </div>
          </>
        )}
      </Shell>
    );
  }

  // ---------- Stage 3: main expansion ----------
  if (stage === "MAIN_EXPANSION") {
    function advanceAfterMain(t: DiagnosisTracker) {
      if (t.hypothesis === "NONE" || t.hypothesis === null) {
        goStage("FACTORISATION");
      } else if (needsProbe(t)) {
        goStage("PROBE");
      } else if (needsIntervention(t)) {
        goStage("AREA_MODEL");
      } else {
        goStage("FACTORISATION");
      }
      applyNextScenarioStep();
    }

    function check() {
      const lines = mainWorkLines.split("\n").map((l) => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      const c = classifyExpansionAttempt(last, MAIN_PROBLEM);
      const nextTracker = recordMainAttempt(tracker, c.hypothesis);
      recordEvent({
        questionId: "main-expansion",
        questionStage: "MAIN_EXPANSION",
        presentedExpression: MAIN_PROBLEM.presented,
        representationType: "SYMBOLIC",
        rawStudentInput: mainWorkLines,
        normalizedInput: c.normalizedInput,
        stepValidity: c.stepValidity,
        helpUsed: false,
        probeShown: false,
        internalHypothesis: c.hypothesis === "NONE" ? null : c.hypothesis,
        evidenceState: nextTracker.evidenceState,
        interventionShown: false,
        supportedOrIndependent: null,
        transferOutcome: null,
      });
      setTracker(nextTracker);
      advanceAfterMain(nextTracker);
    }

    function stuck() {
      const nextTracker = recordMainAttempt(tracker, "STRATEGY_SELECTION_DIFFICULTY");
      recordEvent({
        questionId: "main-expansion",
        questionStage: "MAIN_EXPANSION",
        presentedExpression: MAIN_PROBLEM.presented,
        representationType: "SYMBOLIC",
        rawStudentInput: "",
        normalizedInput: null,
        stepValidity: "UNPARSEABLE",
        helpUsed: true,
        probeShown: false,
        internalHypothesis: "STRATEGY_SELECTION_DIFFICULTY",
        evidenceState: nextTracker.evidenceState,
        interventionShown: false,
        supportedOrIndependent: null,
        transferOutcome: null,
      });
      setTracker(nextTracker);
      advanceAfterMain(nextTracker);
    }

    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Explore</p>
        <div className={styles.math} style={{ margin: "0.75rem 0 1.25rem" }}>
          <MathExpr expr={MAIN_PROBLEM.presented} />
        </div>
        <p className={styles.faint}>Expand and simplify. Work in stages if that helps — one line at a time.</p>
        <div className={styles.field} style={{ marginTop: "0.75rem" }}>
          <label htmlFor="main-work">Your working</label>
          <textarea
            id="main-work"
            className={`${styles.input} ${styles.workLines}`}
            value={mainWorkLines}
            onChange={(e) => setMainWorkLines(e.target.value)}
            placeholder={"x(x+5)+3(x+5)\nx^2+5x+3x+15\nx^2+8x+15"}
          />
        </div>
        <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={check} disabled={!mainWorkLines.trim()}>
            Check
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={stuck}>
            I&apos;m stuck
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Stage 5: probe ----------
  if (stage === "PROBE") {
    function check() {
      const c = classifyExpansionAttempt(probeAnswer, PROBE_PROBLEM);
      const nextTracker = recordProbeAttempt(tracker, c.hypothesis);
      recordEvent({
        questionId: "probe",
        questionStage: "PROBE",
        presentedExpression: PROBE_PROBLEM.presented,
        representationType: "SYMBOLIC",
        rawStudentInput: probeAnswer,
        normalizedInput: c.normalizedInput,
        stepValidity: c.stepValidity,
        helpUsed: false,
        probeShown: true,
        internalHypothesis: c.hypothesis === "NONE" ? null : c.hypothesis,
        evidenceState: nextTracker.evidenceState,
        interventionShown: false,
        supportedOrIndependent: null,
        transferOutcome: null,
      });
      setTracker(nextTracker);
      if (needsIntervention(nextTracker)) {
        goStage("AREA_MODEL");
      } else {
        goStage("FACTORISATION");
      }
      applyNextScenarioStep();
    }

    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Explore</p>
        <p className={styles.lead}>Try this quick one.</p>
        <div className={styles.math} style={{ margin: "0.75rem 0 1.25rem" }}>
          <MathExpr expr={PROBE_PROBLEM.presented} />
        </div>
        <div className={styles.field} style={{ maxWidth: "18rem" }}>
          <label htmlFor="probe-answer">Your answer</label>
          <input
            id="probe-answer"
            className={styles.input}
            value={probeAnswer}
            onChange={(e) => setProbeAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                check();
              }
            }}
            autoComplete="off"
          />
        </div>
        <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={check} disabled={!probeAnswer.trim()}>
            Check
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Stage 6: area model intervention ----------
  if (stage === "AREA_MODEL") {
    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Build</p>
        <h1 className={styles.h1} style={{ fontSize: "1.3rem" }}>
          Let&apos;s look at this one differently.
        </h1>
        <p className={styles.lead} style={{ marginBottom: "1.25rem" }}>
          A rectangle with sides <MathExpr expr="x+3" /> and <MathExpr expr="x+5" />.
        </p>
        <AreaModel
          p={MAIN_PROBLEM.factors.p}
          q={MAIN_PROBLEM.factors.q}
          onComplete={() => {
            setInterventionSeenThisSession(true);
            recordEvent({
              questionId: "area-model",
              questionStage: "AREA_MODEL",
              presentedExpression: MAIN_PROBLEM.presented,
              representationType: "AREA_MODEL",
              rawStudentInput: "completed",
              normalizedInput: null,
              stepValidity: "N/A",
              helpUsed: true,
              probeShown: false,
              internalHypothesis: tracker.hypothesis,
              evidenceState: tracker.evidenceState,
              interventionShown: true,
              supportedOrIndependent: "SUPPORTED",
              transferOutcome: null,
            });
            goStage("FACTORISATION");
            applyNextScenarioStep();
          }}
        />
      </Shell>
    );
  }

  // ---------- Stage 7: factorisation ----------
  if (stage === "FACTORISATION") {
    const target = expandedPoly(MAIN_PROBLEM);

    function submit(attempt: { p: number; q: number; writtenForm: string }) {
      const outcome = classifyFactorAttempt(attempt, target, interventionSeenThisSession);
      recordEvent({
        questionId: "factorisation",
        questionStage: "FACTORISATION",
        presentedExpression: formatPoly(target),
        representationType: "PRODUCT_SUM",
        rawStudentInput: `p=${attempt.p}, q=${attempt.q}, form=${attempt.writtenForm}`,
        normalizedInput: null,
        stepValidity: outcome === "INDEPENDENT_SUCCESS" || outcome === "SUPPORTED_SUCCESS" ? "VALID" : "INVALID",
        helpUsed: interventionSeenThisSession,
        probeShown: false,
        internalHypothesis: outcome,
        evidenceState: null,
        interventionShown: false,
        supportedOrIndependent: outcome === "SUPPORTED_SUCCESS" ? "SUPPORTED" : outcome === "INDEPENDENT_SUCCESS" ? "INDEPENDENT" : null,
        transferOutcome: null,
      });

      if (outcome === "SUM_CONDITION_MISSED") {
        setFactorFeedback({ ok: false, message: "That pair multiplies to the right number — but check what they add to." });
      } else if (outcome === "SYMBOLIC_CONSTRUCTION_UNRELIABLE") {
        setFactorFeedback({ ok: false, message: "Those are the right numbers — now write them as two brackets multiplied together." });
      } else if (outcome === "FACTOR_FLUENCY_DIFFICULTY") {
        setFactorFeedback({ ok: false, message: "Not quite that pair. Try two different numbers." });
      } else {
        setFactorFeedback({ ok: true, message: "That's the factored form." });
        setFactorOutcome(outcome);
      }
    }

    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Build</p>
        <p className={styles.lead}>Can you rebuild the two side lengths?</p>
        <div className={styles.math} style={{ margin: "0.75rem 0 1.25rem" }}>
          <MathExpr expr={formatPoly(target)} />
        </div>
        {!factorOutcome ? (
          <>
            <ProductSumWorkspace
              requiredProduct={target[0] ?? 0}
              requiredSum={target[1] ?? 0}
              onSubmit={submit}
              prefill={factorPrefill}
              prefillNonce={factorPrefillNonce}
            />
            {factorFeedback && !factorFeedback.ok && (
              <p className={styles.faint} style={{ marginTop: "0.75rem" }}>
                {factorFeedback.message}
              </p>
            )}
          </>
        ) : (
          <>
            <p className={styles.lead}>{factorFeedback?.message}</p>
            <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  goStage("TRANSFER");
                  setTransferPart("EXPAND");
                  applyNextScenarioStep();
                }}
              >
                Try this one on your own
              </button>
            </div>
          </>
        )}
      </Shell>
    );
  }

  // ---------- Stage 8: independent transfer ----------
  if (stage === "TRANSFER") {
    if (transferPart === "EXPAND") {
      function check() {
        const lines = transferWorkLines.split("\n").map((l) => l.trim()).filter(Boolean);
        const last = lines[lines.length - 1] ?? "";
        const c = classifyExpansionAttempt(last, TRANSFER_PROBLEM);
        const target = expandedPoly(TRANSFER_PROBLEM);
        const outcome: TransferOutcome = c.stepValidity === "VALID" ? "SUCCESS" : c.stepValidity === "UNPARSEABLE" ? "NOT_ATTEMPTED" : "DIFFICULTY";
        recordEvent({
          questionId: "transfer-expansion",
          questionStage: "TRANSFER",
          presentedExpression: TRANSFER_PROBLEM.presented,
          representationType: "SYMBOLIC",
          rawStudentInput: transferWorkLines,
          normalizedInput: c.normalizedInput,
          stepValidity: c.stepValidity,
          helpUsed: false,
          probeShown: false,
          internalHypothesis: looksLikeSignIssue(c.normalizedInput ? c.normalizedInput.split(",").map(Number) : [], target)
            ? "sign-issue"
            : c.hypothesis === "NONE"
              ? null
              : c.hypothesis,
          evidenceState: null,
          interventionShown: false,
          supportedOrIndependent: null,
          transferOutcome: outcome,
        });
        setTransferOutcome(outcome);
        setTransferPart("FACTOR");
        applyNextScenarioStep();
      }

      return (
        <Shell stage={stage} scenario={scenario}>
          <p className={styles.eyebrow}>Try independently</p>
          <p className={styles.lead}>Try this one on your own.</p>
          <div className={styles.math} style={{ margin: "0.75rem 0 1.25rem" }}>
            <MathExpr expr={TRANSFER_PROBLEM.presented} />
          </div>
          <div className={styles.field}>
            <label htmlFor="transfer-work">Your working</label>
            <textarea
              id="transfer-work"
              className={`${styles.input} ${styles.workLines}`}
              value={transferWorkLines}
              onChange={(e) => setTransferWorkLines(e.target.value)}
            />
          </div>
          <div className={styles.actions} style={{ marginTop: "1.25rem" }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={check} disabled={!transferWorkLines.trim()}>
              Check
            </button>
          </div>
        </Shell>
      );
    }

    // transferPart === "FACTOR"
    const target = expandedPoly(TRANSFER_PROBLEM);
    function submitFactor(attempt: { p: number; q: number; writtenForm: string }) {
      const outcome = classifyFactorAttempt(attempt, target, false);
      recordEvent({
        questionId: "transfer-factor",
        questionStage: "TRANSFER",
        presentedExpression: formatPoly(target),
        representationType: "PRODUCT_SUM",
        rawStudentInput: `p=${attempt.p}, q=${attempt.q}, form=${attempt.writtenForm}`,
        normalizedInput: null,
        stepValidity: outcome === "INDEPENDENT_SUCCESS" ? "VALID" : "INVALID",
        helpUsed: false,
        probeShown: false,
        internalHypothesis: outcome,
        evidenceState: null,
        interventionShown: false,
        supportedOrIndependent: outcome === "INDEPENDENT_SUCCESS" ? "INDEPENDENT" : null,
        transferOutcome: outcome === "INDEPENDENT_SUCCESS" ? "SUCCESS" : "DIFFICULTY",
      });
      setTransferFactorOutcome(outcome);
      goStage("SUMMARY");
      applyNextScenarioStep();
    }

    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Try independently</p>
        {transferOutcome === "SUCCESS" ? (
          <p className={styles.lead}>You used the same structure in a new expression.</p>
        ) : (
          <p className={styles.lead}>The structure is starting to make sense, but the signs need another look.</p>
        )}
        <p className={styles.faint} style={{ margin: "0.5rem 0 1.25rem" }}>
          Can you rebuild the two side lengths?
        </p>
        <ProductSumWorkspace
          requiredProduct={target[0] ?? 0}
          requiredSum={target[1] ?? 0}
          onSubmit={submitFactor}
          prefill={transferFactorPrefill}
          prefillNonce={transferFactorPrefillNonce}
        />
      </Shell>
    );
  }

  // ---------- Stage 9: summary ----------
  if (stage === "SUMMARY") {
    const items: { text: string; badge: CompletionMode }[] = [
      { text: "You expanded expressions with two brackets.", badge: interventionSeenThisSession ? "SUPPORTED" : "INDEPENDENT" },
    ];
    if (interventionSeenThisSession) {
      items.push({ text: "You connected the four parts of a rectangle to four algebraic products.", badge: "SUPPORTED" });
    }
    if (factorOutcome) {
      items.push({
        text: "You rebuilt factors from an expanded expression.",
        badge: factorOutcome === "SUPPORTED_SUCCESS" ? "SUPPORTED" : "INDEPENDENT",
      });
    }
    if (transferOutcome) {
      items.push({
        text: "You tried the same idea with negative numbers.",
        badge: transferOutcome === "SUCCESS" && transferFactorOutcome === "INDEPENDENT_SUCCESS" ? "INDEPENDENT" : "NEEDS_FUTURE_CHECK",
      });
    }
    items.push({ text: "We'll check this again in a future session.", badge: "NEEDS_FUTURE_CHECK" });

    return (
      <Shell stage={stage} scenario={scenario}>
        <p className={styles.eyebrow}>Session complete</p>
        <h1 className={styles.h1}>Nice work today, {STUDENT_NAME}.</h1>
        <ul className={styles.summaryList}>
          {items.map((item, i) => (
            <li key={i}>
              <span className={badgeClass(item.badge)}>{badgeLabel(item.badge)}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
        <div className={styles.actions} style={{ marginTop: "1.75rem" }}>
          <Link href="/prototype/quadratics" className={`${styles.btn} ${styles.btnPrimary}`}>
            Finish for today
          </Link>
          <Link href="/prototype/quadratics" className={`${styles.btn} ${styles.btnGhost}`}>
            Keep practising
          </Link>
        </div>
      </Shell>
    );
  }

  return null;
}

function Shell({ stage, scenario, children }: { stage: StageId; scenario: Scenario | null; children: React.ReactNode }) {
  const phase = studentPhaseFor(stage);
  const currentPathIndex = PATH_STEPS.findIndex((s) => s.stages.includes(stage));
  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <span className={styles.wordmark}>
            cogna<span className={styles.dot}>.</span>
          </span>
          <div className={styles.topbarMeta}>
            <span className={styles.faint}>Expressions and Factors</span>
            <span className={styles.phaseTag}>{phase}</span>
            {scenario && <span className={styles.phaseTag} style={{ background: "var(--qz-caution-wash)", color: "var(--qz-caution)" }}>DEV: {scenario.label}</span>}
            <Link href="/" className={styles.exitLink}>
              Exit
            </Link>
          </div>
        </div>
        <div className={styles.layout}>
          <div className={`${styles.card} ${styles.phaseIn}`}>{children}</div>
          <aside className={styles.pathPanel}>
            <h2>Today&apos;s path</h2>
            {PATH_STEPS.map((s, i) => (
              <div
                key={s.label}
                className={`${styles.pathStep} ${i < currentPathIndex ? styles.pathDone : ""} ${i === currentPathIndex ? styles.pathNow : ""}`}
              >
                <span className={styles.pathDot} />
                {s.label}
              </div>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function QuadraticsSessionPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem" }}>Loading…</div>}>
      <QuadraticsSessionInner />
    </Suspense>
  );
}
