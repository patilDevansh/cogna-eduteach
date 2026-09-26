"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  LotusAdaptiveDecision,
  LotusLiveProgress,
  LotusModelAssessment,
  LotusOverrideAction,
  LotusQuestion,
  LotusQuestionAudit,
  LotusQuestionSelection,
  LotusSessionView,
  LotusStatusResponse,
  LotusStudentResponse,
  LotusSkillEvidence,
  LotusSkillState,
  LotusTopic,
  LotusUnseenPlanEntry,
} from "@cogna/shared";
import { api, getLotusDevModelMode, setLotusDevModelMode } from "@/lib/api";
import { ensureDemoStudentSession, getStudent } from "@/lib/session";
import { getMockEnrollment, type MockStudentEnrollment } from "@/lib/mock-classroom";
import { saveStoredLotusSession } from "@/lib/lotus-demo-store";
import styles from "@/components/lotus.module.css";

const CONFIDENCE_CHOICES = [
  { value: 25, label: "Not sure" },
  { value: 60, label: "Somewhat sure" },
  { value: 90, label: "Very sure" },
] as const;

type ActionStatusFilter = "ALL" | "PENDING" | "IMPLEMENTED" | "DEFERRED" | "REJECTED" | "STALE";

const ACTION_STATUS_FILTERS: Array<{ value: ActionStatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "IMPLEMENTED", label: "Implemented" },
  { value: "DEFERRED", label: "Deferred" },
  { value: "REJECTED", label: "Rejected" },
  { value: "STALE", label: "Stale" },
];

function decisionOutcome(decision: LotusAdaptiveDecision): NonNullable<LotusAdaptiveDecision["outcome"]> {
  return decision.outcome
    ?? (decision.shownAt ? "SHOWN"
      : decision.installedAt ? "INSTALLED"
        : decision.implementation === "QUEUED_FOR_GENERATION" ? "QUEUED"
          : decision.implementation === "NOT_APPLIED" ? "REJECTED"
            : "NO_CHANGE");
}

function matchesActionStatus(audit: LotusQuestionAudit, filter: ActionStatusFilter): boolean {
  if (filter === "ALL") return true;
  const decision = audit.adaptiveDecision;
  if (!decision) return false;
  const outcomes = [decisionOutcome(decision), ...(decision.planEffects ?? []).map((effect) => effect.outcome)];
  switch (filter) {
    case "PENDING": return outcomes.includes("QUEUED");
    case "IMPLEMENTED": return outcomes.includes("INSTALLED") || outcomes.includes("SHOWN");
    case "DEFERRED": return outcomes.includes("DEFERRED");
    case "REJECTED": return outcomes.includes("REJECTED");
    case "STALE": return outcomes.includes("STALE");
    default: return true;
  }
}

function actionLabel(action: LotusAdaptiveDecision["action"]): string {
  return action.replaceAll("_", " ").toLowerCase();
}

function SessionOverview({ audits }: { audits: LotusQuestionAudit[] }) {
  const answered = audits.filter((audit) => audit.response).length;
  const reviewsPending = audits.filter((audit) => audit.analysisStatus === "PENDING").length;
  const reviewsFailed = audits.filter((audit) => audit.analysisStatus === "FAILED").length;
  const decisions = audits.flatMap((audit) => audit.adaptiveDecision ? [audit.adaptiveDecision] : []);
  const latestDecision = decisions.at(-1);
  const outcomes = decisions.flatMap((decision) => [decisionOutcome(decision), ...(decision.planEffects ?? []).map((effect) => effect.outcome)]);
  const changed = outcomes.filter((outcome) => outcome === "INSTALLED" || outcome === "SHOWN").length;
  const waiting = outcomes.filter((outcome) => outcome === "QUEUED" || outcome === "DEFERRED").length;
  const attention = outcomes.filter((outcome) => outcome === "REJECTED" || outcome === "STALE").length;
  const reviewHealth = reviewsFailed > 0
    ? `${reviewsFailed} review${reviewsFailed === 1 ? "" : "s"} failed`
    : reviewsPending > 0
      ? `${reviewsPending} review${reviewsPending === 1 ? "" : "s"} pending`
      : "Reviews up to date";

  return (
    <section className={styles.sessionOverview} aria-label="Session overview">
      <div className={styles.sessionOverviewHeading}>
        <div>
          <span className={styles.eyebrow}>AI Studio overview</span>
          <h3>What Lotus currently knows</h3>
        </div>
        <span>{answered} answered</span>
      </div>
      <div className={styles.sessionOverviewGrid}>
        <div>
          <strong>Latest supported signal</strong>
          <span>{latestDecision?.observedError ?? "Collecting baseline evidence; no planning decision is needed yet."}</span>
        </div>
        <div>
          <strong>Next planned move</strong>
          <span>{latestDecision
            ? `Lotus will ${actionLabel(latestDecision.action)}${latestDecision.requestedPlacement ? ` · ${latestDecision.requestedPlacement}` : ""}.`
            : "Keep the validated coverage plan while evidence develops."}</span>
        </div>
        <div>
          <strong>Analysis health</strong>
          <span>{reviewHealth}</span>
        </div>
        <div>
          <strong>Plan impact</strong>
          <span>{changed} changed · {waiting} waiting · {attention} needs attention</span>
        </div>
      </div>
    </section>
  );
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

/** Formats powers locally as the student types; the server accepts both x² and x^2. */
function formatTypedMath(value: string): string {
  // macOS/browser keyboard layouts may emit U+005E (^), U+02C6 (ˆ), or a
  // dead-key sequence. Treat all visible circumflex variants as exponent
  // markers when a digit follows them.
  return value.replace(/[\^ˆ]([0-9]+)/g, (_, digits: string) =>
    [...digits].map((digit) => SUPERSCRIPT_DIGITS[digit] ?? digit).join(""),
  );
}

/** Makes the caret toolbox behave like an exponent key rather than a plain character. */
function handleMathKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  update: (value: string) => void,
  exponentMode: { current: boolean },
  suppressChange: { current: boolean },
) {
  if (event.key === "ArrowRight") {
    // Right Arrow is the explicit way to leave exponent mode. The browser
    // still performs its normal caret movement after this handler returns.
    exponentMode.current = false;
    return;
  }
  if (event.key === "Dead") {
    // On some keyboard layouts the circumflex is a dead key: the browser
    // waits for the following character before emitting text. Keep exponent
    // mode active so the following digit is still superscript.
    exponentMode.current = true;
    return;
  }
  if (event.key === "^" || event.key === "ˆ") {
    event.preventDefault();
    const field = event.currentTarget;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    update(`${field.value.slice(0, start)}^${field.value.slice(end)}`);
    exponentMode.current = true;
    window.requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + 1, start + 1);
    });
    return;
  }
  if (!/^[0-9]$/.test(event.key)) {
    // Any ordinary symbol starts a new expression segment. Digits are the
    // only keys that continue an exponent run until Right Arrow is pressed.
    if (!event.metaKey && !event.ctrlKey && !event.altKey) exponentMode.current = false;
    return;
  }
  const field = event.currentTarget;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  if (start !== end || start === 0) {
    exponentMode.current = false;
    return;
  }
  const before = field.value.slice(0, start);
  const previous = before.at(-1);
  const exponentRun = exponentMode.current || previous === "^" || previous === "ˆ";
  if (!exponentRun) return;
  event.preventDefault();
  const superscript = SUPERSCRIPT_DIGITS[event.key];
  update(`${field.value.slice(0, start)}${superscript}${field.value.slice(end)}`.replace(new RegExp(`[\\^ˆ]${superscript}`), superscript));
  // This keydown already supplied the value. Some browsers still emit a
  // follow-up input/change event after preventDefault; ignore that one so the
  // same digit cannot be applied twice.
  suppressChange.current = true;
  window.requestAnimationFrame(() => { suppressChange.current = false; });
  window.requestAnimationFrame(() => {
    field.focus();
    const cursor = start + 1;
    field.setSelectionRange(cursor, cursor);
  });
}

function studentFacingPrompt(prompt: string, hasSeparateOptions: boolean): string[] {
  let clean = prompt.trim();
  if (hasSeparateOptions) clean = clean.replace(/\s+A\)\s[\s\S]*$/i, "").trim();
  clean = clean.replace(/\s*Show (?:all |your )?work(?:ing)?\.?$/i, "").trim();
  return clean.split(/(?<=[?.])\s+(?=[A-Z])/).filter(Boolean);
}

function List({ items }: { items: string[] | undefined }) {
  if (!items?.length) return <p className={styles.muted}>None recorded.</p>;
  return (
    <ul className={styles.list}>
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ul>
  );
}

function AssessmentCard({
  name,
  assessment,
  className,
}: {
  name: string;
  assessment: LotusModelAssessment;
  className: string;
}) {
  return (
    <section className={`${styles.section} ${className}`}>
      <h4>{name} · {assessment.mathJudgment}</h4>
      <p>{assessment.conciseRationale}</p>
      <List items={assessment.observations} />
      {assessment.hypotheses?.map((hypothesis, index) => (
        <div key={`${hypothesis.label}-${index}`} style={{ marginTop: "0.75rem" }}>
          <strong style={{ fontSize: "0.82rem" }}>
            {hypothesis.label} · {hypothesis.evidenceState}
          </strong>
          <List items={hypothesis.evidence} />
          {hypothesis.alternatives?.length > 0 && (
            <p style={{ marginTop: "0.35rem", fontSize: "0.82rem" }}>
              Alternative: {hypothesis.alternatives.join("; ")}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function ProposalCard({
  label,
  question,
  selected,
}: {
  label: string;
  question: Omit<LotusQuestion, "id"> | undefined;
  selected?: boolean;
}) {
  return (
    <section className={`${styles.proposalCard} ${selected ? styles.proposalSelected : ""}`}>
      <div className={styles.proposalLabel}>{label}</div>
      {question ? (
        <>
          <p className={styles.proposalPrompt}>{question.prompt}</p>
          <p className={styles.proposalPurpose}>{question.purpose}</p>
        </>
      ) : (
        <p className={styles.proposalPurpose}>No question proposed.</p>
      )}
    </section>
  );
}

/**
 * §11 "Plan and question transparency": shown only for an installed changed
 * item (selection.adaptationTag is only ever set on that item, never on an
 * unchanged coverage question or merely because a recommendation exists),
 * so it never implies a modification that didn't happen.
 */
function adaptationTagLabel(tag: NonNullable<LotusQuestionSelection["adaptationTag"]>): string {
  switch (tag.kind) {
    case "TARGETED_CHECK": return `Targeted check — ${tag.skill}`;
    case "EASIER_PREREQUISITE": return `Easier prerequisite — ${tag.skill}`;
    case "BROADENED_EVIDENCE": return `Broadened evidence — ${tag.skill}`;
    case "COVERAGE_REPLACEMENT": return `Coverage replacement — ${tag.reason}`;
  }
}

function QuestionDecision({ selection }: { selection: LotusQuestionSelection }) {
  const sourceLabel = selection.provenance === "AI_GENERATED_FOR_SESSION"
    ? "AI-generated from a planned skill slot"
    : selection.provenance === "AI_REUSED_FROM_BANK"
      ? "Reused from the AI question bank"
      : selection.selectedFrom === "NONE_EXIT"
        ? "Diagnostic ended"
        : selection.selectedFrom === "REVISED_FOR_INFORMATION_GAIN"
          ? "Revised after repetition check"
          : `Chosen from ${selection.selectedFrom.toLowerCase()}`;
  const provenanceLabel = selection.provenance === "AI_GENERATED_FOR_SESSION"
    ? "New question made for this session"
    : selection.provenance === "AI_REUSED_FROM_BANK"
      ? "Question reused from the AI question bank"
      : selection.provenance === "HARDCODED_SYSTEM"
        ? "This is a hardcoded question already present in our system"
        : undefined;
  return (
    <section className={styles.decisionBox}>
      <div className={styles.decisionHeading}>
        <div>
          <span className={styles.eyebrow}>Next-question decision</span>
          <h4>What each AI proposed—and what Lotus chose</h4>
        </div>
        <span className={selection.informationGain.passed ? styles.gainPass : styles.gainFail}>
          {selection.informationGain.passed ? "Adds evidence" : "Low information gain"}
        </span>
        {selection.mathVerification && selection.mathVerification.status !== "UNVERIFIABLE" && (
          <span
            className={selection.mathVerification.status === "MATCHED" ? styles.gainPass : styles.gainFail}
            title={selection.mathVerification.explanation}
          >
            {selection.mathVerification.status === "MATCHED" ? "Maths independently verified" : "Maths mismatch — rejected"}
          </span>
        )}
      </div>
      {provenanceLabel && (
        <div className={styles.questionProvenance} role="status">
          {provenanceLabel}
          {selection.adaptationTag && (
            <span className={styles.adaptationTag}> · {adaptationTagLabel(selection.adaptationTag)}</span>
          )}
        </div>
      )}
      <div className={styles.proposalGrid}>
        <ProposalCard label="Primary proposed" question={selection.primaryProposal} />
        <ProposalCard label="Challenger proposed" question={selection.challengerProposal} />
        <ProposalCard label={sourceLabel} question={selection.selectedQuestion} selected />
      </div>
      <div className={styles.decisionReason}>
        <strong>Why this was chosen</strong>
        <p>{selection.reason}</p>
        {selection.planningNote && <small className={styles.planningNote}>{selection.planningNote}</small>}
        <small>{selection.informationGain.explanation}</small>
      </div>
    </section>
  );
}

function matchingProvenanceForQuestion(question: LotusQuestion, session: LotusSessionView) {
  const selections = [session.openingAudit?.questionSelection, ...session.audits.map((audit) => audit.questionSelection)].filter(Boolean) as LotusQuestionSelection[];
  const matching = [...selections].reverse().find((selection) => selection.selectedQuestion?.prompt === question.prompt);
  return matching?.provenance;
}

function provenanceLabelForQuestion(question: LotusQuestion, session: LotusSessionView): string {
  const provenance = matchingProvenanceForQuestion(question, session);
  if (provenance === "AI_GENERATED_FOR_SESSION") return "New question made for this session";
  if (provenance === "AI_REUSED_FROM_BANK") return "Question reused from the AI question bank";
  if (provenance === "HARDCODED_SYSTEM") return "This is a hardcoded question already present in our system";
  if (question.answerKey.diagnostics?.origin === "AI") return "New question made for this session";
  return "This is a hardcoded question already present in our system";
}

/** Reused-from-bank is the one provenance worth a glance: it's the only case where this exact item may have already been seen by another student. */
function isReusedFromBank(question: LotusQuestion, session: LotusSessionView): boolean {
  const provenance = matchingProvenanceForQuestion(question, session);
  return provenance ? provenance === "AI_REUSED_FROM_BANK" : question.answerKey.diagnostics?.provenance === "AI_REUSED_FROM_BANK";
}

function DiagnosticDecision({ audit }: { audit: LotusQuestionAudit }) {
  if (!audit.response || !(audit.skillEvidence ?? []).some((e) => e.kind !== "SECURE")) return null;
  const support = audit.skillEvidence?.some((e) => e.kind === "DID_NOT_KNOW");
  return (
    <div className={styles.diagnosticDecision}>
      <strong>Diagnostic decision</strong>
      <span>
        {support
          ? "This is recorded as a support need. Lotus will place an easier prerequisite check in the unseen plan where possible."
          : "This is a suspected signal, not a confirmed gap. Lotus keeps the curriculum moving and schedules a later capable check; a repeat can confirm it, while a suitable correct answer can clear it as a slip."}
      </span>
    </div>
  );
}

/** Shared with the per-turn status strip so the two views of "where did this come from" never disagree. */
function evidenceSourceLabel(audit: LotusQuestionAudit): string {
  return audit.analysisSource === "SUPPORT_SIGNAL"
    ? "Student support signal"
    : audit.analysisSource === "AI_REVIEW"
      ? "AI-reviewed interpretation"
      : "Deterministic maths check";
}

/**
 * The Phase 0 "per-turn status strip"
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §10): what's verified, whether
 * the AI review is queued/running/complete/failed, how long it's taken, and
 * where the interpretation actually came from — all in the turn's summary
 * row, so pending or failed review is never mistaken for a finished one.
 * Only uses data the audit already carries (createdAt, analysisStatus,
 * timingMs, liveProgress) — no fabricated timestamps.
 */
function TurnStatusStrip({
  audit,
  liveProgress,
  isLatest,
}: {
  audit: LotusQuestionAudit;
  liveProgress?: LotusSessionView["liveProgress"];
  isLatest: boolean;
}) {
  if (!audit.response) return null;
  const failed = audit.analysisStatus === "FAILED";
  const queuedMs = audit.analysisQueuedAt && audit.analysisStartedAt
    ? Math.max(0, new Date(audit.analysisStartedAt).getTime() - new Date(audit.analysisQueuedAt).getTime())
    : null;
  const timingSuffix = audit.timingMs
    ? ` in ${(audit.timingMs.total / 1000).toFixed(1)}s${queuedMs !== null ? ` after ${(queuedMs / 1000).toFixed(1)}s queued` : ""}`
    : "";
  const reviewLabel = audit.analysisStatus === "NOT_REQUIRED"
    ? "AI review not required"
    : audit.analysisStatus === "COMPLETE"
      ? `AI review complete${timingSuffix}${audit.analysisLate ? " — evidence only; too late to replan" : ""}`
      : failed
        ? "AI review failed"
      : isLatest && liveProgress
        ? `AI review running (${liveProgress.stage.toLowerCase()})`
        : (() => {
            const queuedSeconds = Math.max(0, Math.round((Date.now() - new Date(audit.createdAt).getTime()) / 1000));
            const position = audit.analysisQueuePosition && audit.analysisQueuePosition > 0
              ? `, position ${audit.analysisQueuePosition}`
              : "";
            const deadline = audit.analysisDeadlineAt
              ? Math.max(0, Math.round((new Date(audit.analysisDeadlineAt).getTime() - Date.now()) / 1000))
              : null;
            return `AI review queued (${queuedSeconds}s${position}${deadline !== null ? `, ${deadline}s until evidence-only` : ""})`;
          })();
  const reviewClass = audit.analysisStatus === "COMPLETE"
    ? styles.statusComplete
    : failed
      ? styles.statusFailed
      : audit.analysisStatus === "NOT_REQUIRED"
        ? styles.statusNeutral
        : styles.statusPending;
  return (
    <div className={styles.turnStatusStrip} role="status">
      <span className={styles.statusChip}>Code verified</span>
      <span className={`${styles.statusChip} ${reviewClass}`}>{reviewLabel}</span>
      <span className={styles.statusChip}>{evidenceSourceLabel(audit)}</span>
    </div>
  );
}

function EvidencePanel({ audit }: { audit: LotusQuestionAudit }) {
  if (!audit.response) return null;
  const source = evidenceSourceLabel(audit);
  const mathsFact = audit.verification?.explanation ?? "No deterministic maths fact was available.";
  const directEvidence = audit.skillEvidence?.length
    ? audit.skillEvidence.map((item) => item.description ?? item.mistake ?? item.skillId)
    : [audit.response.didNotKnow
      ? "The student explicitly selected “I don’t know this yet.”"
      : "No skill-level inference was recorded from this answer alone."];
  const alternatives = audit.analysisSource === "AI_REVIEW"
    ? (audit.gpt?.hypotheses ?? []).flatMap((hypothesis) => hypothesis.alternatives).filter(Boolean).slice(0, 3)
    : [];
  const unknown = audit.analysisStatus === "PENDING"
    ? "The AI review is still running. Lotus has not made an interpretation or final decision."
    : audit.analysisStatus === "FAILED"
      ? audit.analysisFailureReason ?? "The AI review failed before it could make an interpretation."
    : audit.analysisSource === "SUPPORT_SIGNAL"
      ? "Why the student needs support is not known from this response. One support request does not prove a stable gap."
      : alternatives.length
        ? `Lotus is still distinguishing: ${alternatives.join("; ")}`
        : "One response is not enough to establish mastery or a stable gap.";
  return (
    <section className={styles.evidencePanel} aria-label="Evidence calibration">
      <div className={styles.evidencePanelHeading}>
        <div>
          <span className={styles.eyebrow}>Evidence, not a verdict</span>
          <h4>What this response actually tells Lotus</h4>
        </div>
        <span className={styles.evidenceSource}>{source}</span>
      </div>
      <div className={styles.evidencePanelGrid}>
        <div><strong>Mathematical fact</strong><span>{mathsFact}</span></div>
        <div><strong>Direct evidence</strong><span>{directEvidence.join(" ")}</span></div>
        <div><strong>Competing explanations</strong><span>{alternatives.length ? alternatives.join("; ") : "No competing explanation has been claimed."}</span></div>
        <div><strong>Still unknown</strong><span>{unknown}</span></div>
      </div>
    </section>
  );
}

function DecisionPanel({ audit }: { audit: LotusQuestionAudit }) {
  const decision = audit.adaptiveDecision;
  if (!audit.response) return null;
  if (!decision) {
    return (
      <section className={styles.decisionPanel} aria-label="Adaptive decision">
        <span className={styles.eyebrow}>Decision</span>
        <h4>Decision awaiting evidence</h4>
        <p>{audit.analysisStatus === "PENDING"
          ? "Lotus has not made a planning decision while the review is pending."
          : "This historic turn has no structured planning record."}</p>
      </section>
    );
  }
  const action = decision.action.replaceAll("_", " ").toLowerCase();
  return (
    <section className={styles.decisionPanel} aria-label="Adaptive decision">
      <div className={styles.evidencePanelHeading}>
        <div>
          <span className={styles.eyebrow}>Decision</span>
          <h4>What Lotus will do with this evidence</h4>
        </div>
        <span className={styles.evidenceSource}>{decision.action.replaceAll("_", " ")}</span>
      </div>
      <div className={styles.decisionPanelGrid}>
        <div><strong>What Lotus observed</strong><span>{decision.observedError}</span></div>
        <div><strong>Why this action</strong><span>{decision.rationale}</span></div>
        <div><strong>Alternatives considered</strong><span>{decision.alternatives.join(" ")}</span></div>
        <div><strong>Proposed action</strong><span>{`Lotus proposes to ${action}${decision.targetSkill ? ` for ${decision.targetSkill.replaceAll("_", " ").toLowerCase()}` : ""}.`}</span></div>
        <div><strong>Requested placement</strong><span>{decision.requestedPlacement ?? "No replacement slot requested."}</span></div>
        <div><strong>What result would change the diagnosis</strong><span>{decision.expectedInformationGain}</span></div>
        {audit.analysisLate && <div><strong>Late-result safeguard</strong><span>This review was retained as evidence only. Lotus did not rewrite a later question from an obsolete response.</span></div>}
      </div>
      <ActionTimeline decision={decision} />
      {decision.planEffects?.length ? (
        <section className={styles.additionalPlanEffects} aria-label="Additional plan effects">
          <strong>Additional plan effects</strong>
          <ul>
            {decision.planEffects.map((effect) => (
              <li key={`${effect.action}-${effect.targetTurn ?? "none"}`}>
                <span>{effect.outcome.replaceAll("_", " ")}</span>
                <div>
                  <strong>{effect.requestedPlacement ?? actionLabel(effect.action)}</strong>
                  <small>{effect.detail}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ActionTimeline({ decision }: { decision: LotusAdaptiveDecision }) {
  const changesQuestion = decision.action !== "KEEP" && decision.action !== "STOP" && decision.action !== "REMOVE_OR_DEFER";
  const outcome = decisionOutcome(decision);
  const terminal = outcome === "DEFERRED" || outcome === "REJECTED" || outcome === "STALE";
  const outcomeLabel: Record<typeof outcome, string> = {
    NO_CHANGE: "No change needed",
    QUEUED: "Preparing",
    INSTALLED: "Awaiting student",
    SHOWN: "Shown",
    DEFERRED: "Deferred",
    REJECTED: "Rejected",
    STALE: "Stale",
  };
  const steps = [
    { label: "Proposed", state: "done", detail: decision.recommendedAt ? "Evidence was converted into a server-validated planning recommendation." : "This decision was recorded from the available evidence." },
    !changesQuestion
      ? { label: "Plan outcome", state: terminal ? "blocked" : "done", detail: decision.implementationDetail }
      : decision.implementation === "QUEUED_FOR_GENERATION"
        ? { label: "Queued", state: "active", detail: "A replacement is waiting for independent question checks before it can enter the plan." }
        : { label: "Validated", state: decision.validatedAt ? "done" : terminal ? "blocked" : "pending", detail: decision.validatedAt ? "The candidate passed answer, misconception, and duplicate checks." : terminal ? decision.implementationDetail : "Validation status is being recorded." },
    changesQuestion
      ? { label: "Installed", state: decision.installedAt ? "done" : terminal ? "blocked" : "pending", detail: decision.installedAt ? `${decision.requestedPlacement ?? "The requested slot"} was changed in the unseen plan.` : terminal ? "No item was installed." : "A validated item has not yet been installed." }
      : null,
    changesQuestion
      ? { label: "Shown", state: decision.shownAt ? "done" : terminal ? "blocked" : "pending", detail: decision.shownAt ? `${decision.actualPlacement ?? "The installed slot"} was confirmed when the student submitted it.` : "Awaiting confirmation that the student has reached this item." }
      : null,
  ].filter(Boolean) as Array<{ label: string; state: "done" | "active" | "blocked" | "pending"; detail: string }>;
  return (
    <section className={styles.actionTimeline} aria-label="Action lifecycle">
      <div className={styles.actionTimelineHeading}>
        <strong>Action lifecycle</strong>
        <span>{outcomeLabel[outcome]}</span>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step.label} className={styles[`actionTimeline${step.state[0].toUpperCase()}${step.state.slice(1)}`]}>
            <span aria-hidden="true" />
            <div><strong>{step.label}</strong><small>{step.detail}</small></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AuditCard({
  audit,
  index,
  latest,
  opening,
  liveProgress,
}: {
  audit: LotusQuestionAudit;
  index: number;
  latest: boolean;
  opening?: boolean;
  liveProgress?: LotusSessionView["liveProgress"];
}) {
  return (
    <details className={styles.auditCard} open={latest}>
      <summary className={styles.auditSummary}>
        <span className={styles.number}>{opening ? "0" : index}</span>
        <span>
          <strong>{opening ? "Opening question design" : `Question ${index}`}</strong>
          <br />
          <span className={styles.muted} style={{ fontSize: "0.82rem" }}>
            {audit.question.subtopic} · {audit.question.type.replaceAll("_", " ")}
          </span>
        </span>
        <span className={styles.verdictBadge}>{audit.conclusion.verdict.replaceAll("_", " ")}</span>
        <TurnStatusStrip audit={audit} liveProgress={liveProgress} isLatest={latest} />
      </summary>

      <div className={styles.auditBody}>
        <section className={styles.evidenceBox}>
          <h4>{opening ? "Design context" : "Student evidence"}</h4>
          <p className="math-sm" style={{ fontSize: "1rem" }}>{audit.question.prompt}</p>
          {audit.response ? (
            <div style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>
              <div className={styles.answerComparison}>
                <div>
                  <span>Student answer</span>
                  <strong>{audit.response.answer}</strong>
                </div>
                <div>
                  <span>Correct answer</span>
                  <strong>{audit.verification?.correctAnswer || audit.question.answerKey.canonicalAnswer}</strong>
                </div>
                {audit.verification && (
                  <span className={audit.verification.status === "VERIFIED_CORRECT" ? styles.verifiedCorrect : audit.verification.status === "VERIFIED_INCORRECT" ? styles.verifiedIncorrect : styles.verifiedNeutral}>
                    {audit.verification.status.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              <p><strong>Working:</strong> {audit.response.working || (audit.response.didNotKnow ? "Student said they do not know this yet" : "No working entered")}</p>
              <p>
                <strong>Confidence:</strong> {audit.response.confidence}% · <strong>Time:</strong>{" "}
                {Math.round(audit.response.responseTimeMs / 1000)}s
              </p>
              {audit.verification && <p className={styles.verificationNote}>{audit.verification.explanation}</p>}
            </div>
          ) : (
            <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
              Known context only: Grade 8 · CBSE. No learner profile or presumed weakness.
            </p>
          )}
        </section>

        <EvidencePanel audit={audit} />

        {(audit.questionSelection.primaryProposal || audit.questionSelection.challengerProposal) && (
          <QuestionDecision selection={audit.questionSelection} />
        )}
        <DiagnosticDecision audit={audit} />

        {audit.analysisStatus === "PENDING" && (
          <div className={styles.analysisPending} role="status" aria-live="polite">
            <span className={styles.analysisSpinner} aria-hidden="true" />
            <span><strong>AI is analysing this answer</strong><br /><small>It is reviewing the student’s reasoning in the background. The next question is already available.</small></span>
          </div>
        )}

        {(opening || audit.analysisSource === "AI_REVIEW") && audit.analysisStatus === "COMPLETE" && (audit.gpt || audit.debate) && (
          <details className={styles.reasoningDrawer}>
            <summary className={styles.reasoningSummary}>See AI reasoning details</summary>
            <div className={styles.reasoningBody}>
              {audit.gpt && audit.challenger && <div className={styles.modelGrid}>
                <AssessmentCard name="GPT primary thought" assessment={audit.gpt} className={styles.gpt} />
                <AssessmentCard name="GPT challenger thought" assessment={audit.challenger} className={styles.challenger} />
              </div>}

              {audit.debate && <section className={`${styles.section} ${styles.debate}`}>
              <h4>What they argued</h4>
              <p><strong>Agreement</strong></p>
              <List items={audit.debate.agreements} />
              <p style={{ marginTop: "0.65rem" }}><strong>Disagreement</strong></p>
              <List items={audit.debate.disagreements} />
              <p style={{ marginTop: "0.65rem" }}>
                <strong>Concrete example:</strong> {audit.debate.disagreementExample}
              </p>
              {audit.debate.acceptedImprovements?.length > 0 && (
                <>
                  <p style={{ marginTop: "0.65rem" }}><strong>GPT accepted</strong></p>
                  <List items={audit.debate.acceptedImprovements} />
                </>
              )}
              </section>}
            </div>
          </details>
        )}

        <section className={`${styles.section} ${styles.conclusion}`}>
          <div className={styles.auditMeta}>
            <h4>Final conclusion</h4>
            {audit.analysisStatus === "COMPLETE" && (
              <>
                <span className={styles.phaseBadge}>{audit.conclusion.evidenceState}</span>
                <span className={styles.phaseBadge}>{audit.conclusion.action.replaceAll("_", " ")}</span>
              </>
            )}
          </div>
          {audit.analysisStatus === "PENDING" ? (
            <div className={styles.analysisPending} role="status" aria-live="polite">
              <span className={styles.analysisSpinner} aria-hidden="true" />
              <span><strong>AI review still running</strong><br /><small>The instant code check is provisional. Lotus has not made its final error finding or next-question decision yet.</small></span>
            </div>
          ) : audit.analysisStatus === "FAILED" ? (
            <p>{audit.analysisFailureReason ?? "The AI review failed before a model interpretation was available. Lotus retains the deterministic maths fact and does not claim a deeper diagnosis."}</p>
          ) : audit.analysisStatus === "NOT_REQUIRED" ? (
            <p>{audit.analysisSource === "SUPPORT_SIGNAL"
              ? "The student asked for support. Lotus recorded that signal without inventing an AI explanation of their reasoning."
              : "No AI interpretation was required for this turn."}</p>
          ) : (
            <>
              <p>{audit.conclusion.conclusion}</p>
              {audit.conclusion.uncertainty?.length > 0 && (
            <>
              <p style={{ marginTop: "0.65rem" }}><strong>Still uncertain</strong></p>
              <List items={audit.conclusion.uncertainty} />
            </>
              )}
            </>
          )}
        </section>
        <DecisionPanel audit={audit} />
      </div>
    </details>
  );
}

const STAGE_LABEL: Record<LotusLiveProgress["stage"], string> = {
  ASSESSING: "Primary and Challenger are forming independent assessments…",
  DEBATING: "GPT is comparing the two independent assessments…",
  CLOSING: "GPT challenger is auditing the debate and deciding what's next…",
};

/**
 * The in-flight turn, shown while the four model calls behind it are still
 * running. Fields fill in as each stage resolves (see setLiveProgress on the
 * backend) — this never shows anything final; AuditCard replaces it the
 * moment the real audit lands.
 */
function LiveProgressCard({ progress, index }: { progress: LotusLiveProgress; index: number }) {
  return (
    <details className={styles.auditCard} open>
      <summary className={styles.auditSummary}>
        <span className={styles.number}>{index}</span>
        <span>
          <strong>Question {index}</strong>
          <br />
          <span className={styles.muted} style={{ fontSize: "0.82rem" }}>
            {STAGE_LABEL[progress.stage]}
          </span>
        </span>
        <span className={styles.loading}><span className={styles.pulse} /></span>
      </summary>
      <div className={styles.auditBody}>
        {progress.reflectionPrompt && (
          <p className={styles.muted} style={{ fontSize: "0.85rem", fontStyle: "italic" }}>
            {progress.reflectionPrompt}
          </p>
        )}
        {(progress.gpt || progress.debate) && (
          <details className={styles.reasoningDrawer}>
            <summary className={styles.reasoningSummary}>See AI reasoning details</summary>
            <div className={styles.reasoningBody}>
              {progress.gpt && progress.challenger && (
                <div className={styles.modelGrid}>
                  <AssessmentCard name="GPT primary thought" assessment={progress.gpt} className={styles.gpt} />
                  <AssessmentCard name="GPT challenger thought" assessment={progress.challenger} className={styles.challenger} />
                </div>
              )}
              {progress.debate && (
                <section className={`${styles.section} ${styles.debate}`}>
                  <h4>What they argued</h4>
                  <p><strong>Agreement</strong></p>
                  <List items={progress.debate.agreements} />
                  <p style={{ marginTop: "0.65rem" }}><strong>Disagreement</strong></p>
                  <List items={progress.debate.disagreements} />
                </section>
              )}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

const UNSEEN_PURPOSE_LABEL: Record<LotusUnseenPlanEntry["purpose"], string> = {
  COVERAGE: "Coverage",
  TARGETED_CHECK: "Targeted check",
  EASIER_PREREQUISITE: "Easier prerequisite",
  BROADENED_EVIDENCE: "Broadened evidence",
  COVERAGE_REPLACEMENT: "Coverage replacement",
};

/**
 * §11 "Unseen Plan": the next 5–7 unshown slots, their purpose and
 * readiness — never the question text or answer key. Observer-only, fetched
 * on demand rather than polled, and refetched whenever a new answer lands
 * (the plan can only change in response to an answer).
 */
function UnseenPlanPanel({ sessionId, answeredCount }: { sessionId: string; answeredCount: number }) {
  const [entries, setEntries] = useState<LotusUnseenPlanEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getLotusUnseenPlan(sessionId)
      .then((result) => { if (!cancelled) { setEntries(result); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the unseen plan."); });
    return () => { cancelled = true; };
  }, [sessionId, answeredCount]);

  return (
    <details className={styles.auditCard}>
      <summary className={styles.auditSummary}>
        <span className={styles.number}>»</span>
        <span><strong>Unseen plan</strong><br /><span className={styles.muted} style={{ fontSize: "0.82rem" }}>Next {entries?.length ?? "…"} unshown slots — no answer keys</span></span>
      </summary>
      <div className={styles.auditBody}>
        {loadError && <p className={styles.error}>{loadError}</p>}
        {!loadError && !entries && <p className={styles.muted}>Loading…</p>}
        {!loadError && entries?.length === 0 && <p className={styles.muted}>No unshown slots remain.</p>}
        {entries && entries.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
            {entries.map((entry) => (
              <li key={entry.turnsAhead} className={styles.turnStatusStrip}>
                <span className={styles.statusChip}>+{entry.turnsAhead}</span>
                <span className={styles.statusChip}>{entry.skill}</span>
                <span className={styles.statusChip}>{UNSEEN_PURPOSE_LABEL[entry.purpose]}</span>
                <span className={`${styles.statusChip} ${entry.readiness === "READY" ? styles.statusComplete : styles.statusPending}`}>
                  {entry.readiness === "READY" ? "Ready" : "Awaiting generation"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

const SKILL_STATE_LABEL: Record<LotusSkillState, string> = {
  SECURE: "secure",
  SUSPECTED: "one mistake, not confirmed",
  CONFIRMED: "confirmed gap",
  UNTESTED: "not tested",
  NOT_TESTED_DEPENDENCY: "not tested — depends on a gap",
};

const SKILL_EVIDENCE_LABEL: Record<LotusSkillEvidence["kind"], string> = {
  SECURE: "demonstrated securely",
  MISTAKE: "mistake observed",
  UNFINISHED: "method was unfinished",
  DID_NOT_KNOW: "asked for support",
};

/**
 * The final report is intentionally short for the student. This companion is
 * teacher-only: it lets a teacher audit each report state back to the exact
 * question-level evidence, while making it equally obvious when Lotus has no
 * direct evidence and has retained uncertainty instead of guessing.
 */
function ReportEvidenceTrace({
  session,
  audits,
}: {
  session: LotusSessionView;
  audits: LotusQuestionAudit[];
}) {
  const report = session.finalReport;
  if (!report?.skills?.length) return null;

  const traceableSkills = report.skills.map((skill) => {
    const evidence = audits.flatMap((audit, index) => (audit.skillEvidence ?? [])
      .filter((item) => item.skillId === skill.skillId)
      .map((item) => ({ item, questionNumber: index })));
    return { skill, evidence };
  });

  return (
    <section className={styles.reportEvidenceTrace} aria-label="Final report evidence">
      <div className={styles.reportEvidenceTraceHeading}>
        <div>
          <span className={styles.eyebrow}>AI Studio report audit</span>
          <h3>Why Lotus reached each report conclusion</h3>
        </div>
        <span>Teacher only</span>
      </div>
      <p className={styles.reportEvidenceTraceIntro}>
        Each conclusion below is linked to the student response that contributed to it. No listed response means Lotus retained an untested or uncertain state rather than inferring a gap.
      </p>
      <ul className={styles.reportEvidenceTraceList}>
        {traceableSkills.map(({ skill, evidence }) => (
          <li key={skill.skillId}>
            <div className={styles.reportEvidenceTraceSkill}>
              <strong>{skill.name}</strong>
              <span>{SKILL_STATE_LABEL[skill.state]}</span>
            </div>
            {skill.evidence.length > 0 && (
              <p><strong>Report rationale:</strong> {skill.evidence.join(" · ")}</p>
            )}
            {evidence.length > 0 ? (
              <ul className={styles.reportEvidenceTraceItems}>
                {evidence.map(({ item, questionNumber }, itemIndex) => (
                  <li key={`${item.skillId}-${questionNumber}-${itemIndex}`}>
                    <strong>Question {questionNumber}</strong>
                    <span>{SKILL_EVIDENCE_LABEL[item.kind]}{item.source === "ANALYSIS" ? " · AI-reviewed" : " · code-verified"}</span>
                    <small>{item.description ?? item.mistake ?? "This response contributed direct evidence for this skill."}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.reportEvidenceTraceEmpty}>
                No direct student response was used for this skill. Lotus records it as {SKILL_STATE_LABEL[skill.state]}, not as a confirmed gap.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinalReport({
  session,
  teachingHref,
}: {
  session: LotusSessionView;
  teachingHref: string | null;
}) {
  const report = session.finalReport;
  if (!report) return null;
  return (
    <section className={styles.reportCard}>
      <div className={styles.phaseRow}>
        <span className={styles.phaseBadge}>{report.outcome.replaceAll("_", " ")}</span>
        <span className={styles.experimental}>Experimental conclusion</span>
      </div>
      <h1 style={{ marginTop: "0.8rem" }}>Lotus found a starting point</h1>
      <p style={{ marginTop: "0.5rem", fontSize: "1.15rem" }}>{report.startingPoint}</p>
      <div className={styles.reportGrid}>
        <div className={styles.reportBlock}>
          <h3>Observed strengths</h3>
          <List items={report.observedStrengths} />
        </div>
        <div className={styles.reportBlock}>
          <h3>Still uncertain</h3>
          <List items={report.uncertainAreas} />
        </div>
        <div className={styles.reportBlock}>
          <h3>Evidence used</h3>
          <List items={report.evidenceSummary} />
        </div>
        <div className={styles.reportBlock}>
          <h3>Recommended next step</h3>
          <p>{report.recommendedNextStep}</p>
        </div>
      </div>
      <div className={styles.reportBlock} style={{ marginTop: "1rem" }}>
        <h3>Limits of this diagnostic</h3>
        <List items={report.limitations} />
      </div>
      {report.notTested?.length ? (
        <div className={styles.reportBlock} style={{ marginTop: "1rem" }}>
          <h3>Not tested</h3>
          <p>These questions were removed because they need a skill that isn&apos;t secure yet. They don&apos;t count as wrong.</p>
          <List items={report.notTested} />
        </div>
      ) : null}
      {report.skills?.length ? (
        <div className={styles.reportBlock} style={{ marginTop: "1rem" }}>
          <h3>Skill by skill</h3>
          <List items={report.skills.map((skill) => `${skill.name}: ${SKILL_STATE_LABEL[skill.state]}`)} />
        </div>
      ) : null}
      {teachingHref ? (
        <Link className="btn btn-primary" style={{ marginTop: "1rem" }} href={teachingHref}>
          Start your lesson →
        </Link>
      ) : (
        <button className="btn btn-primary" style={{ marginTop: "1rem" }} type="button" disabled>
          Preparing your lesson…
        </button>
      )}
    </section>
  );
}

export default function LotusRoute() {
  return <Suspense fallback={<p>Loading diagnostic…</p>}><LotusPage /></Suspense>;
}

function LotusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoPersona = searchParams.get("demo");
  const classroomAssignmentId = searchParams.get("assignment");
  const topic: LotusTopic = searchParams.get("topic")?.toLowerCase().startsWith("factori") ? "FACTORISATION" : "BRACKETS";
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [classEnrollment, setClassEnrollment] = useState<MockStudentEnrollment | null>(null);
  const [observer, setObserver] = useState(false);
  const [status, setStatus] = useState<LotusStatusResponse | null>(null);
  const [session, setSession] = useState<LotusSessionView | null>(null);
  const [observerSession, setObserverSession] = useState<LotusSessionView | null>(null);
  const [observerError, setObserverError] = useState("");
  const [actionStatusFilter, setActionStatusFilter] = useState<ActionStatusFilter>("ALL");
  const [answer, setAnswer] = useState("");
  const [workingLines, setWorkingLines] = useState(["", "", ""]);
  const [confidence, setConfidence] = useState<number | null>(null);
  // A missing confidence pick nudges the section itself (highlight + shake)
  // rather than printing an error line — incrementing remounts the wrapper
  // below (via `key`) so the CSS animation replays on every blocked attempt,
  // not just the first.
  const [confidenceNudge, setConfidenceNudge] = useState(0);
  const confidenceRef = useRef<HTMLDivElement | null>(null);
  const [didNotKnow, setDidNotKnow] = useState(false);
  // Dev-only: lets a developer point this browser tab at the free, instant
  // fake-model API instead of the live one while iterating on UI, without an
  // engineer manually restarting the API process. Never rendered in
  // production (see the isDevBuild check below); persisted for this tab only
  // so it survives the Start click and every later Lotus API call.
  const [devFakeModel, setDevFakeModel] = useState(false);
  useEffect(() => {
    setDevFakeModel(getLotusDevModelMode() === "fake");
  }, []);
  function toggleDevFakeModel() {
    const next = !devFakeModel;
    setDevFakeModel(next);
    setLotusDevModelMode(next ? "fake" : "real");
  }
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationTimedOut, setPreparationTimedOut] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<LotusQuestion | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<LotusStudentResponse | null>(null);
  const [error, setError] = useState("");
  const [liveProgress, setLiveProgress] = useState<LotusLiveProgress | null>(null);
  const [teachingHref, setTeachingHref] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const activeMathFieldRef = useRef<HTMLInputElement | null>(null);
  const exponentModeRef = useRef(false);
  const suppressMathChangeRef = useRef(false);

  function insertMathToken(token: string) {
    const field = activeMathFieldRef.current;
    if (!field || inputLocked) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const nextValue = formatTypedMath(`${field.value.slice(0, start)}${token}${field.value.slice(end)}`);
    const nextCursor = Math.min(nextValue.length, start + token.length);
    if (field.id === "lotus-answer") {
      setAnswer(nextValue);
      setDidNotKnow(false);
    } else {
      const index = Number(field.dataset.workingIndex);
      if (Number.isInteger(index)) {
        setWorkingLines((lines) => lines.map((line, lineIndex) => lineIndex === index ? nextValue : line));
      }
    }
    exponentModeRef.current = token === "^";
    window.requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(nextCursor, nextCursor);
    });
  }

  useEffect(() => {
    document.title = "Cogna Lotus — Experimental AI Lab";
    const student = getStudent();
    if (!student) {
      router.replace("/student/login");
      return;
    }
    setStudentId(student.studentId);
    setStudentName(student.name);
    setClassEnrollment(getMockEnrollment());
    setObserver(new URLSearchParams(window.location.search).get("observer") === "1");
    api.getLotusStatus().then(setStatus).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not reach the Lotus service.");
    });
    if (classroomAssignmentId) void api.startClassroomAssignment(classroomAssignmentId).catch(() => undefined);
  }, [router, classroomAssignmentId]);

  useEffect(() => {
    if (!session || session.status !== "ACTIVE") return;
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  const audits = useMemo(
    () => session ? [session.openingAudit, ...session.audits] : [],
    [session],
  );
  const observerAudits = useMemo(
    () => observerSession ? [observerSession.openingAudit, ...observerSession.audits] : [],
    [observerSession],
  );
  const filteredObserverAudits = useMemo(
    () => observerAudits.flatMap((audit, index) => matchesActionStatus(audit, actionStatusFilter) ? [{ audit, index }] : []),
    [actionStatusFilter, observerAudits],
  );

  // The student session stays deliberately redacted even when this route is
  // used in an internal demo. AI Studio is fetched separately with a verified
  // teacher credential; a query parameter or UI toggle can never upgrade the
  // student's own network payload.
  useEffect(() => {
    if (!observer || !session) {
      setObserverSession(null);
      setObserverError("");
      return;
    }
    let cancelled = false;
    api.getLotusObserverSession(session.sessionId)
      .then((next) => {
        if (cancelled) return;
        setObserverSession(next);
        setObserverError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setObserverSession(null);
        setObserverError(err instanceof Error ? err.message : "A verified teacher session is required to open AI Studio.");
    });
    return () => { cancelled = true; };
  }, [observer, session?.sessionId, session?.audits.length, session?.status]);

  // A review can finish after the student has already reached the next
  // question. The student-facing session remains deliberately redacted, but
  // an authorised AI Studio must not keep showing the pre-review decision
  // until the child submits again. Poll only while its own durable observer
  // record has pending analysis, and stop as soon as it settles.
  const observerHasPendingAnalysis = observerAudits.some((audit) => audit.analysisStatus === "PENDING");
  useEffect(() => {
    if (!observer || !session || !observerHasPendingAnalysis) return;
    let cancelled = false;
    const refresh = () => {
      void api.getLotusObserverSession(session.sessionId)
        .then((fresh) => {
          if (!cancelled) setObserverSession(fresh);
        })
        .catch((err) => {
          if (!cancelled) setObserverError(err instanceof Error ? err.message : "Could not refresh the authorised observer view.");
        });
    };
    const timer = window.setInterval(refresh, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [observer, observerHasPendingAnalysis, session?.sessionId]);

  function stopPolling() {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setLiveProgress(null);
  }

  // Behind LOTUS_PROGRESSIVE_STREAMING_ENABLED (see /lotus/status). While the
  // POST /answers request is in flight, poll the session so the observer sees
  // the debate arrive stage by stage instead of one blocking wait. Purely
  // additive — if this ever regresses, flip the flag off server-side and
  // this poll simply never starts (status.progressiveStreamingEnabled false).
  function startPolling(sessionId: string, forAnsweredCount: number) {
    if (!status?.progressiveStreamingEnabled) return;
    stopPolling();
    pollTimerRef.current = window.setInterval(() => {
      api
        .getLotusSession(sessionId)
        .then((polled) => {
          const progress = polled.liveProgress;
          if (progress && progress.forAnsweredCount === forAnsweredCount) {
            setLiveProgress(progress);
          }
        })
        .catch(() => undefined);
    }, 1500);
  }

  useEffect(() => stopPolling, []);

  // Deep review can improve a later flexible slot while the child is working.
  // Refresh only unseen items and audits; never replace the question on screen.
  useEffect(() => {
    if (!session || session.status !== "ACTIVE" || busy || pendingSubmission) return;
    const sessionId = session.sessionId;
    const currentQuestionId = session.currentQuestion?.id;
    const timer = window.setInterval(() => {
      void api.getLotusSession(sessionId).then((fresh) => {
        setSession((current) => {
          if (!current || current.sessionId !== sessionId || current.currentQuestion?.id !== currentQuestionId) return current;
          return { ...current, upcomingQuestions: fresh.upcomingQuestions, audits: fresh.audits };
        });
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [session?.sessionId, session?.currentQuestion?.id, session?.status, busy, pendingSubmission]);

  // Factorisation does not expose a question until the first 15 code-validated
  // items are ready. Poll only the safe preparation counter; answer keys remain
  // redacted by the API while the session is active.
  useEffect(() => {
    if (!preparing || !session || session.topic !== "FACTORISATION" || session.status !== "ACTIVE") return;
    const timer = window.setInterval(() => {
      void api.getLotusSession(session.sessionId).then((fresh) => {
        setSession(fresh);
        if (fresh.preparation?.ready) setPreparing(false);
      }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [preparing, session?.sessionId, session?.topic, session?.status]);

  useEffect(() => {
    if (!preparing) return;
    const timer = window.setTimeout(() => {
      // A timeout is only a status update. Factorisation has no hardcoded
      // fallback: keep the student here until the first 15 AI questions are
      // ready and validated.
      setPreparationTimedOut(true);
    }, 180_000);
    return () => window.clearTimeout(timer);
  }, [preparing]);

  // A mini-player used while questions are being prepared should not remain
  // over the full diagnostic once the first question becomes available.
  // After that point, clicking Cogna can intentionally minimise the active
  // session again.
  useEffect(() => {
    if (!preparing && session?.currentQuestion) setMinimized(false);
  }, [preparing]);

  function resetResponse() {
    setAnswer("");
    setWorkingLines(["", "", ""]);
    setConfidence(null);
    setConfidenceNudge(0);
    setDidNotKnow(false);
    setQuestionStartedAt(Date.now());
  }

  function rememberSession(next: LotusSessionView) {
    setPreviewQuestion(null);
    setPendingSubmission(null);
    setSession(next);
    saveStoredLotusSession({ session: next, studentName, enrollment: classEnrollment, savedAt: new Date().toISOString() });
    resetResponse();
    if (next.status === "COMPLETE") {
      void api
        .createPersonalizedVideoAssignment({
          studentId,
          lotusSessionId: next.sessionId,
        })
        .then(async (video) => {
          if (classroomAssignmentId) {
            await api.completeClassroomAssignment(classroomAssignmentId, {
              diagnosticSessionId: next.sessionId,
              videoAssignmentId: video.id,
              result: {
                outcome: next.finalReport?.outcome,
                startingPoint: next.finalReport?.startingPoint,
                observedStrengths: next.finalReport?.observedStrengths,
                uncertainties: next.finalReport?.uncertainAreas,
                audits: next.audits.length,
              },
            });
          }
          const href = `/student/personalized-video?studentId=${encodeURIComponent(studentId)}&video=${encodeURIComponent(video.id)}`;
          setTeachingHref(href);
          router.push(href);
        })
        .catch(() => undefined);
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      // Demo identities live in browser storage. Refresh their signed token at
      // the point of use so a server restart or a previous demo learner cannot
      // leave the browser holding a token for a different student.
      const activeStudent = studentId.startsWith("demo_")
        ? await ensureDemoStudentSession(studentId, studentName, { forceRefresh: true })
        : { studentId };
      const next = await api.startLotusSession(activeStudent.studentId, topic);
      setPreviewQuestion(null);
      setPendingSubmission(null);
      setSession(next);
      setPreparing(topic === "FACTORISATION" && !next.preparation?.ready);
      setMinimized(false);
      setPreparationTimedOut(false);
      saveStoredLotusSession({ session: next, studentName, enrollment: classEnrollment, savedAt: new Date().toISOString() });
      resetResponse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lotus could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!session || (!pendingSubmission && !didNotKnow && !answer.trim())) {
      setError("Enter an answer or choose “I don’t know”.");
      return;
    }
    // Confidence has no honest default: forcing a real tap (rather than a
    // pre-selected button) is what makes the signal usable for distinguishing
    // a slip from a stable gap. Only asked on turns Lotus flagged as
    // evidence-critical (requiresConfidenceProbe) — asking on every single
    // question was producing an unclicked, meaningless default instead of a
    // real signal. Skipped when "I don't know" already gives an explicit
    // low-confidence signal on its own.
    if (!session || (!pendingSubmission && !didNotKnow && question?.requiresConfidenceProbe && confidence === null)) {
      setConfidenceNudge((n) => n + 1);
      confidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // The brackets test ends at 20 minutes, so its staged question would be refused after that. The factorisation test has no time limit.
    const staged = session.topic === "FACTORISATION" || Date.now() - new Date(session.startedAt).getTime() < 20 * 60 * 1000
      ? session.upcomingQuestions?.[0]
      : undefined;
    const submission: LotusStudentResponse = pendingSubmission ?? {
      answer: didNotKnow ? "I don't know" : answer.trim(),
      working: workingLines.map((line) => line.trim()).filter(Boolean).join("\n"),
      confidence: confidence ?? 60,
      responseTimeMs: Date.now() - questionStartedAt,
      didNotKnow,
      submissionId: crypto.randomUUID(),
      questionId: session.currentQuestion?.id,
      nextQuestionId: staged?.id,
    };
    if (!pendingSubmission) {
      setPendingSubmission(submission);
      if (staged) {
        setPreviewQuestion(staged);
        setAdvancing(true);
        window.setTimeout(() => setAdvancing(false), 420);
        resetResponse();
      }
    }
    setBusy(true);
    setError("");
    if (!staged) startPolling(session.sessionId, audits.length);
    try {
      const next = await api.submitLotusAnswer(session.sessionId, studentId, submission);
      rememberSession(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const sessionGone = message.toLowerCase().includes("session not found");
      setError(sessionGone
        ? "This diagnostic session expired because the API was restarted. Start a new diagnostic to continue."
        : message
          ? `Your last answer was not confirmed: ${message}. Retry saving it.`
          : "Your last answer was not confirmed. Retry saving it.");
    } finally {
      stopPolling();
      setBusy(false);
    }
  }

  async function override(action: LotusOverrideAction) {
    if (!session || pendingSubmission) return;
    setBusy(true);
    setError("");
    try {
      const observerNext = await api.overrideLotusSession(session.sessionId, studentId, action);
      setObserverSession(observerNext);
      // Keep the student pane bound to its redacted read, never to the
      // teacher-only response returned by the observer action.
      const studentNext = await api.getLotusSession(session.sessionId);
      rememberSession(studentNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The observer override failed.");
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const question = previewQuestion ?? session?.currentQuestion;
  const shownQuestionNumber = session ? session.audits.length + (previewQuestion ? 2 : 1) : 0;
  // Factorisation always has a 25-question diagnostic. Some later questions
  // may still be generating, so don't derive the total from the currently
  // exposed/prefetched list.
  const totalQuestions = session?.topic === "FACTORISATION"
    ? 25
    : 16;
  const inputLocked = busy || Boolean(pendingSubmission);
  const promptLines = question
    ? studentFacingPrompt(question.prompt, Boolean(question.options?.length))
    : [];

  async function fillDemoResponse() {
    // The answer key no longer ships to the browser while a diagnostic is
    // active, so this asks the server (which still has it) to compute the
    // same demo answer instead of reading it out of `question` directly.
    if (!question || !demoPersona || !session) return;
    setBusy(true);
    setError("");
    try {
      const filled = await api.demoFillLotusResponse(session.sessionId, studentId);
      setAnswer(filled.answer);
      setWorkingLines(filled.working.split("\n").filter(Boolean).slice(0, 6));
      setConfidence(filled.confidence);
      setDidNotKnow(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fill the demo response.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            {session?.status === "ACTIVE" ? (
              <button
                type="button"
                className={`wordmark ${styles.wordmarkButton}`}
                onClick={() => setMinimized((value) => !value)}
                aria-label={minimized ? "Reopen Cogna Lotus diagnostic" : "Minimise Cogna Lotus diagnostic"}
              >
                Cogna<span className="dot">.</span>
              </button>
            ) : (
              <Link href="/student/home" className="wordmark">Cogna<span className="dot">.</span></Link>
            )}
            <span className={styles.lotusName}>Lotus</span>
            <span className={styles.experimental}>Experimental AI Lab</span>
            {devFakeModel && <span className={styles.devModelBadge}>Dev · fake model</span>}
          </div>
          <div className={styles.statusRow}>
            {observer && <span className={styles.observerBadge}>Observer view</span>}
            {session?.status === "ACTIVE" && (
              <span className="time-note">{minutes}:{String(seconds).padStart(2, "0")} · Q{shownQuestionNumber}</span>
            )}
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setObserver((value) => !value)}
            >
              {observer ? "Student view" : "Show AI Lab"}
            </button>
          </div>
        </header>

        {!session ? (
          <div className={styles.layoutStudent}>
            <section className={styles.introCard}>
              <div className={styles.phaseRow}>
                <span className={styles.phaseBadge}>Grade 8 · CBSE</span>
                {classEnrollment && <span className={styles.phaseBadge}>{classEnrollment.className} · Roll {classEnrollment.rollNumber}</span>}
                <span className={styles.phaseBadge}>{topic === "FACTORISATION" ? "Factorisation · up to 25 questions" : "Up to 20 minutes"}</span>
              </div>
              <h1 style={{ marginTop: "1rem" }}>
                {topic === "FACTORISATION" ? "Find where factorisation breaks down." : "Let Cogna Lotus find the right starting point."}
              </h1>
              <p style={{ marginTop: "0.75rem" }}>
                {topic === "FACTORISATION"
                  ? "AI is preparing your personalised diagnostic."
                  : "Cogna has a checked, curriculum-balanced question path ready before you begin. When you submit, the next question appears immediately while two AI reviewers examine your answer and can shape later questions. Conclusions remain experimental research evidence."}
              </p>
              {status && (
                <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
                  Models: {status.models.primary} + {status.models.challenger}
                </p>
              )}
              {error && <div className={styles.error} style={{ marginTop: "1rem" }}>{error}</div>}
              {status && !status.ready && (
                <div className={styles.error} style={{ marginTop: "1rem" }}>
                  Lotus is not ready. Missing: {status.missingConfiguration.join(", ")}.
                </div>
              )}
              {process.env.NODE_ENV !== "production" && (
                <label className={styles.devModelToggle}>
                  <input type="checkbox" checked={devFakeModel} onChange={toggleDevFakeModel} />
                  Dev: use free fake model instead of live (no cost, instant, for UI-only changes)
                </label>
              )}
              <div className={styles.actions} style={{ marginTop: "1.5rem" }}>
                <button className="btn btn-primary" type="button" onClick={start} disabled={busy || !studentId || !status?.ready}>
                  {busy ? "Preparing your questions…" : `Start for ${studentName || "student"}`}
                </button>
                <Link className="btn btn-ghost" href="/student/home">Back home</Link>
              </div>
            </section>
          </div>
        ) : (
          <div className={observer ? styles.layout : styles.layoutStudent}>
            <div className={styles.studentPane}>
            {session.status === "COMPLETE" ? (
              <FinalReport session={session} teachingHref={teachingHref} />
            ) : preparing ? (
              <section className={styles.introCard} aria-live="polite">
                <div className={styles.preparationSpinner} aria-hidden="true"><span /></div>
                <span className={styles.phaseBadge}>AI diagnostic preparation</span>
                <h1 style={{ marginTop: "1rem" }}>Making your diagnostic test</h1>
                <p style={{ marginTop: "0.75rem" }}>
                  Cogna is preparing your diagnostic. You can begin when {session.preparation?.targetQuestions ?? 15} questions are ready; the rest continue in the background.
                </p>
                  <div className={styles.preparationProgress} role="progressbar" aria-valuemin={0} aria-valuemax={session.preparation?.targetQuestions ?? 25} aria-valuenow={session.preparation?.readyQuestions ?? 0}>
                  <span style={{ width: `${Math.min(100, ((session.preparation?.readyQuestions ?? 0) / (session.preparation?.targetQuestions ?? 15)) * 100)}%` }} />
                </div>
                <p className={styles.muted} style={{ marginTop: "0.75rem" }}>
                  {session.preparation?.readyQuestions ?? 0} of {session.preparation?.targetQuestions ?? 15} questions ready · usually takes 3 minutes
                </p>
                {preparationTimedOut && (
                  <p className={styles.muted} style={{ marginTop: "0.5rem" }}>
                    Still preparing—no hardcoded questions will be shown. AI is continuing to write and verify the remaining questions.
                  </p>
                )}
              </section>
            ) : question ? (
              <section className={`${styles.questionCard} ${advancing ? styles.questionAdvancing : ""}`}>
                {advancing && <div className={styles.nextQuestionToast} aria-live="polite">Next question</div>}
                  {preparationTimedOut && (
                    <div className={styles.error} style={{ margin: "1rem 1rem 0" }}>
                      All questions were eventually AI-generated and verified. The diagnostic is now ready.
                    </div>
                  )}
                  <div className={styles.cardTop}>
                    <div className={styles.phaseRow}>
                      <span className={styles.phaseBadge}>{question.phase}</span>
                      <span className={styles.muted}>{question.subtopic}</span>
                      <span
                        className={`${styles.questionProvenance} ${isReusedFromBank(question, session) ? styles.questionProvenanceReused : ""}`}
                        role="status"
                      >
                        {provenanceLabelForQuestion(question, session)}
                      </span>
                    </div>
                    <strong className={styles.questionNumber}>Question {shownQuestionNumber} of {totalQuestions}</strong>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.question}>
                      {promptLines.map((line, index) => (
                        <span key={`${line}-${index}`}>{line}</span>
                      ))}
                    </div>

                    {question.type === "MULTIPLE_CHOICE" && question.options?.length ? (
                      <div className={styles.options}>
                        {question.options.map((option) => (
                          <label className={styles.option} key={option}>
                            <input
                              type="radio"
                              name="lotus-answer"
                              value={option}
                              checked={answer === option}
                              onChange={(event) => { setAnswer(event.target.value); setDidNotKnow(false); }}
                              disabled={inputLocked}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="field">
                        <label htmlFor="lotus-answer">Final answer</label>
                        <div className={styles.mathAnswerShell}>
                          <span aria-hidden="true">=</span>
                          <input
                            id="lotus-answer"
                            className={styles.mathAnswer}
                            value={answer}
                            ref={(field) => { activeMathFieldRef.current = field; }}
                            onFocus={(event) => {
                              // Clicking the toolbox temporarily blurs and
                              // refocuses this same field; preserve exponent
                              // mode in that case. Moving to another math
                              // field starts a fresh normal expression.
                              if (activeMathFieldRef.current !== event.currentTarget) exponentModeRef.current = false;
                              activeMathFieldRef.current = event.currentTarget;
                            }}
                            onKeyDown={(event) => handleMathKeyDown(event, (value) => setAnswer(value), exponentModeRef, suppressMathChangeRef)}
                            onChange={(event) => {
                              if (suppressMathChangeRef.current) { suppressMathChangeRef.current = false; return; }
                              setAnswer(formatTypedMath(event.target.value));
                              setDidNotKnow(false);
                            }}
                            disabled={inputLocked || didNotKnow}
                            placeholder="Type your answer"
                          />
                        </div>
                      </div>
                    )}

                    {question.type !== "MULTIPLE_CHOICE" && (
                      <div className={styles.mathToolbar} aria-label="Math toolbox">
                        <span className={styles.mathToolbarLabel}>Math tools</span>
                        {[
                          ["+", "+"], ["−", "-"], ["×", "×"], ["÷", "÷"],
                          ["(", "("], [")", ")"], ["^", "^"], ["x²", "²"], ["x³", "³"],
                        ].map(([label, token]) => (
                          <button key={label} type="button" onClick={() => insertMathToken(token)} disabled={inputLocked}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {question.asksForWorking && (
                      <div className="field">
                        <label>Show your working, one step at a time</label>
                        <div className={styles.workingLines}>
                          {workingLines.map((line, index) => (
                            <div className={styles.workingLine} key={index}>
                              <span>{index + 1}</span>
                              <input
                                aria-label={`Working step ${index + 1}`}
                                data-working-index={index}
                                value={line}
                                onFocus={(event) => {
                                  if (activeMathFieldRef.current !== event.currentTarget) exponentModeRef.current = false;
                                  activeMathFieldRef.current = event.currentTarget;
                                }}
                                onKeyDown={(event) => handleMathKeyDown(event, (value) => {
                                  setWorkingLines((lines) => lines.map((current, lineIndex) => lineIndex === index ? value : current));
                                }, exponentModeRef, suppressMathChangeRef)}
                                onChange={(event) => {
                                  if (suppressMathChangeRef.current) { suppressMathChangeRef.current = false; return; }
                                  const next = [...workingLines];
                                  next[index] = formatTypedMath(event.target.value);
                                  setWorkingLines(next);
                                }}
                                disabled={inputLocked || didNotKnow}
                                placeholder={index === 0 ? "First step" : "Next step"}
                              />
                            </div>
                          ))}
                        </div>
                        {workingLines.length < 6 && (
                          <button
                            type="button"
                            className={styles.addStep}
                            onClick={() => setWorkingLines((lines) => [...lines, ""])}
                            disabled={inputLocked || didNotKnow}
                          >
                            + Add another step
                          </button>
                        )}
                      </div>
                    )}

                    {question.requiresConfidenceProbe && (
                      <div
                        key={confidenceNudge}
                        ref={confidenceRef}
                        className={`${styles.confidence} ${confidenceNudge > 0 ? styles.confidenceNudge : ""}`}
                      >
                        <span>How sure are you?</span>
                        <div className={styles.confidenceChoices}>
                          {CONFIDENCE_CHOICES.map((choice) => (
                            <button
                              key={choice.value}
                              type="button"
                              className={confidence === choice.value ? styles.confidenceSelected : ""}
                              aria-pressed={confidence === choice.value}
                              onClick={() => setConfidence(choice.value)}
                              disabled={inputLocked}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <label className={styles.dontKnow}>
                      <input
                        type="checkbox"
                        checked={didNotKnow}
                        onChange={(event) => setDidNotKnow(event.target.checked)}
                        disabled={inputLocked}
                      />
                      I don&apos;t know this yet
                    </label>

                    {error && <div className={styles.error}>{error}</div>}
                    {demoPersona && (
                      <button className="btn btn-ghost" type="button" onClick={fillDemoResponse} disabled={inputLocked}>
                        Fill {studentName.split(" ")[0]}’s demo response
                      </button>
                    )}
                    <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
                      {busy ? (
                        <span className={styles.loading}><span className={styles.pulse} />{previewQuestion ? "Saving your answer…" : "Preparing your report…"}</span>
                      ) : pendingSubmission ? "Retry saving previous answer" : "Submit answer"}
                    </button>
                    {busy && liveProgress?.reflectionPrompt && (
                      // Only appears when the slower full analysis is genuinely
                      // running (see setLiveProgress) — a fast-path turn resolves
                      // before this ever has time to show, by design.
                      <p className={styles.muted} style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontStyle: "italic" }}>
                        {liveProgress.reflectionPrompt}
                      </p>
                    )}
                  </div>
                </section>
              ) : null}
            </div>

            {observer && (
              <aside className={styles.observerPane}>
                {observerError ? (
                  <section className={styles.decisionPanel} aria-label="AI Studio access">
                    <span className={styles.eyebrow}>AI Studio</span>
                    <h4>Teacher access required</h4>
                    <p>AI Studio contains live diagnostic hypotheses and is available only through a verified teacher session.</p>
                  </section>
                ) : !observerSession ? (
                  <section className={styles.decisionPanel} aria-label="AI Studio loading">
                    <span className={styles.eyebrow}>AI Studio</span>
                    <h4>Loading authorised observer view</h4>
                    <p>Fetching the durable diagnostic record without changing the student view.</p>
                  </section>
                ) : (
                  <>
                    <div className={styles.observerHeader}>
                      <div className={styles.observerActions}>
                        {observerSession.status === "ACTIVE" && (
                          <>
                            <button type="button" onClick={() => override("REPLACE_QUESTION")} disabled={inputLocked}>
                              Replace question
                            </button>
                            <button type="button" onClick={() => override("END_NOW")} disabled={inputLocked}>
                              End &amp; report
                            </button>
                          </>
                        )}
                        <span className={styles.observerBadge}>Do not show student</span>
                      </div>
                    </div>
                    <SessionOverview audits={observerAudits} />
                    <ReportEvidenceTrace session={observerSession} audits={observerAudits} />
                    {observerSession.topic === "FACTORISATION" && observerSession.status === "ACTIVE" && (
                      <UnseenPlanPanel sessionId={observerSession.sessionId} answeredCount={observerAudits.length} />
                    )}
                    <div className={styles.actionStatusFilters} role="group" aria-label="Decision status">
                      <span>Decision status</span>
                      <div>
                        {ACTION_STATUS_FILTERS.map((filter) => (
                          <button
                            key={filter.value}
                            type="button"
                            aria-pressed={actionStatusFilter === filter.value}
                            onClick={() => setActionStatusFilter(filter.value)}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.timeline}>
                      {filteredObserverAudits.map(({ audit, index }) => (
                        <AuditCard
                          key={`${audit.question.id}-${index}`}
                          audit={audit}
                          opening={index === 0}
                          index={index}
                          latest={index === observerAudits.length - 1}
                          liveProgress={observerSession.liveProgress}
                        />
                      ))}
                      {filteredObserverAudits.length === 0 && (
                        <p className={styles.actionFilterEmpty} role="status">
                          No {ACTION_STATUS_FILTERS.find((filter) => filter.value === actionStatusFilter)?.label.toLowerCase()} decision actions are recorded yet.
                        </p>
                      )}
                      {busy && liveProgress && (actionStatusFilter === "ALL" || actionStatusFilter === "PENDING") && (
                        <LiveProgressCard progress={liveProgress} index={observerAudits.length} />
                      )}
                    </div>
                  </>
                )}
              </aside>
            )}
          </div>
        )}
        {minimized && session?.status === "ACTIVE" && (
          <div className={styles.miniPlayer} role="status" aria-live="polite">
            <div>
              <strong>Cogna Lotus diagnostic</strong>
              <span>{preparing ? "Preparing your questions…" : `Question ${shownQuestionNumber} of ${totalQuestions}`}</span>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setMinimized(false)}>Close mini-player</button>
          </div>
        )}
      </div>
    </main>
  );
}
