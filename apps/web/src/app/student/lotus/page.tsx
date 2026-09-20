"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  LotusLiveProgress,
  LotusModelAssessment,
  LotusOverrideAction,
  LotusQuestion,
  LotusQuestionAudit,
  LotusQuestionSelection,
  LotusSessionView,
  LotusStatusResponse,
  LotusStudentResponse,
  LotusSkillState,
  LotusTopic,
  LotusUnseenPlanEntry,
} from "@cogna/shared";
import { api } from "@/lib/api";
import { ensureDemoStudentSession, getStudent } from "@/lib/session";
import { getMockEnrollment, type MockStudentEnrollment } from "@/lib/mock-classroom";
import { saveStoredLotusSession } from "@/lib/lotus-demo-store";
import styles from "@/components/lotus.module.css";

const CONFIDENCE_CHOICES = [
  { value: 25, label: "Not sure" },
  { value: 60, label: "Somewhat sure" },
  { value: 90, label: "Very sure" },
] as const;

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

function provenanceLabelForQuestion(question: LotusQuestion, session: LotusSessionView): string {
  const selections = [session.openingAudit?.questionSelection, ...session.audits.map((audit) => audit.questionSelection)].filter(Boolean) as LotusQuestionSelection[];
  const matching = [...selections].reverse().find((selection) => selection.selectedQuestion?.prompt === question.prompt);
  if (matching?.provenance === "AI_GENERATED_FOR_SESSION") return "New question made for this session";
  if (matching?.provenance === "AI_REUSED_FROM_BANK") return "Question reused from the AI question bank";
  if (matching?.provenance === "HARDCODED_SYSTEM") return "This is a hardcoded question already present in our system";
  if (question.answerKey.diagnostics?.origin === "AI") return "New question made for this session";
  return "This is a hardcoded question already present in our system";
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
  const reviewLabel = audit.analysisStatus === "NOT_REQUIRED"
    ? "AI review not required"
    : audit.analysisStatus === "COMPLETE"
      ? `AI review complete${audit.timingMs ? ` in ${(audit.timingMs.total / 1000).toFixed(1)}s` : ""}`
      : failed
        ? "AI review failed"
        : isLatest && liveProgress
          ? `AI review running (${liveProgress.stage.toLowerCase()})`
          : (() => {
            const queuedSeconds = Math.max(0, Math.round((Date.now() - new Date(audit.createdAt).getTime()) / 1000));
            return `AI review queued (${queuedSeconds}s)`;
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
        <div><strong>Action implementation</strong><span>{`${decision.implementation.replaceAll("_", " ")}: ${decision.implementationDetail}`}</span></div>
        <div><strong>What result would change the diagnosis</strong><span>{decision.expectedInformationGain}</span></div>
      </div>
    </section>
  );
}

function actionImplementation(audit: LotusQuestionAudit): { implemented: boolean; explanation: string } {
  if (audit.adaptiveDecision) {
    const decision = audit.adaptiveDecision;
    return {
      // QUEUED_FOR_GENERATION means the governed plan action is real and
      // durable, although its checked item is not ready to serve yet.
      implemented: decision.implementation !== "NOT_APPLIED",
      explanation: decision.implementationDetail,
    };
  }
  const selection = audit.questionSelection;
  const action = audit.conclusion.action;
  if (action === "ASK") {
    if (selection.selectedFrom === "NONE_EXIT" || !selection.selectedQuestion) {
      return { implemented: false, explanation: "The AI asked for another question, but no next question was installed." };
    }
    if (selection.planningNote?.toLowerCase().includes("no question was swapped")) {
      return { implemented: false, explanation: "The AI requested a changed diagnostic action, but the already-staged curriculum question was kept." };
    }
    return { implemented: true, explanation: "A new next-question action was applied to the unseen plan." };
  }
  const ended = selection.selectedFrom === "NONE_EXIT" || !selection.selectedQuestion;
  return ended
    ? { implemented: true, explanation: "The AI’s exit decision was applied; no further question was selected." }
    : { implemented: false, explanation: "The AI requested an exit, but Lotus selected another question instead." };
}

function actionDetails(audit: LotusQuestionAudit, implementation: { implemented: boolean; explanation: string }) {
  const conclusion = audit.conclusion;
  const selection = audit.questionSelection;
  const evidence = audit.response
    ? `Answer: ${audit.response.answer || "No answer"}. ${audit.response.working ? `Working: ${audit.response.working}.` : "No working was provided."}`
    : "No student response was recorded.";
  const detectedError = conclusion.mistakeDescription?.trim() ||
    (audit.verification?.status === "VERIFIED_CORRECT"
      ? "No concrete error was detected in this response; Lotus is checking whether the correct method is reliable."
      : conclusion.evidenceState === "INSUFFICIENT"
        ? "No specific error was established from this response."
        : conclusion.conclusion);
  const uncertainty = conclusion.uncertainty?.filter(Boolean).slice(0, 2) ?? [];
  const why = uncertainty.length > 0
    ? `${conclusion.conclusion} ${uncertainty.join(" ")}`
    : conclusion.conclusion;
  const action = conclusion.action === "ASK"
    ? selection.selectedQuestion
      ? `Ask a fresh question to check the same skill: “${selection.selectedQuestion.prompt}”`
      : selection.planningNote || selection.reason || "Ask another diagnostic question."
    : conclusion.exitDiagnostic
      ? "End the diagnostic because the available evidence supports stopping."
      : `Continue the diagnostic with the selected action: ${conclusion.action.replaceAll("_", " ")}.`;
  const placement = selection.planningNote ||
    (selection.selectedQuestion
      ? `Selected from ${selection.selectedFrom.toLowerCase().replaceAll("_", " ")}.`
      : "No question was selected.");
  const followUp = uncertainty.length > 0
    ? uncertainty.join(" ")
    : "A repeat of the same skill on a fresh item will show whether this is a stable gap or a one-off slip.";

  return { evidence, detectedError, why, action, placement, followUp, implementation };
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

        <QuestionDecision selection={audit.questionSelection} />
        <DiagnosticDecision audit={audit} />

        {audit.analysisStatus === "PENDING" && (
          <div className={styles.analysisPending} role="status" aria-live="polite">
            <span className={styles.analysisSpinner} aria-hidden="true" />
            <span><strong>AI is analysing this answer</strong><br /><small>It is reviewing the student’s reasoning in the background. The next question is already available.</small></span>
          </div>
        )}

        {(opening || audit.analysisSource === "AI_REVIEW") && audit.analysisStatus === "COMPLETE" && <>
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
        </>}

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
          {audit.analysisStatus === "COMPLETE" && audit.analysisSource === "AI_REVIEW" && audit.response && (() => {
            const implementation = actionImplementation(audit);
            const details = actionDetails(audit, implementation);
            return (
              <div className={`${styles.actionImplementation} ${implementation.implemented ? styles.actionImplemented : styles.actionNotImplemented}`}>
                <div className={styles.actionDetail}>
                  <strong>Evidence used</strong>
                  <span>{details.evidence}</span>
                </div>
                <div className={styles.actionDetail}>
                  <strong>What error was detected?</strong>
                  <span>{details.detectedError}</span>
                </div>
                <div className={styles.actionDetail}>
                  <strong>Why is Lotus taking this action?</strong>
                  <span>{details.why}</span>
                </div>
                <div className={styles.actionDetail}>
                  <strong>What action is Lotus taking?</strong>
                  <span>{details.action}</span>
                </div>
                <div className={styles.actionDetail}>
                  <strong>Where is this action being placed?</strong>
                  <span>{details.placement}</span>
                </div>
                <div className={styles.actionDetail}>
                  <strong>What would confirm the diagnosis?</strong>
                  <span>{details.followUp}</span>
                </div>
                <div className={styles.actionResult}>
                  <strong>Action implemented: {implementation.implemented ? "YES" : "NO"}</strong>
                  <span>{implementation.explanation}</span>
                </div>
              </div>
            );
          })()}
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

function FinalReport({
  session,
  classroomAssignmentId,
}: {
  session: LotusSessionView;
  classroomAssignmentId?: string | null;
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
      <Link
        className="btn btn-primary"
        style={{ marginTop: "1rem" }}
        href={classroomAssignmentId ? "/student/classroom/live" : "/student/lotus/learn"}
      >
        {classroomAssignmentId ? "Return to the classroom queue →" : "Start the learning path Lotus selected →"}
      </Link>
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
  const [answer, setAnswer] = useState("");
  const [workingLines, setWorkingLines] = useState(["", "", ""]);
  const [confidence, setConfidence] = useState(60);
  const [didNotKnow, setDidNotKnow] = useState(false);
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
    setConfidence(60);
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
        .then((video) => classroomAssignmentId ? api.completeClassroomAssignment(classroomAssignmentId, {
          diagnosticSessionId: next.sessionId,
          videoAssignmentId: video.id,
          result: {
            outcome: next.finalReport?.outcome,
            startingPoint: next.finalReport?.startingPoint,
            observedStrengths: next.finalReport?.observedStrengths,
            uncertainties: next.finalReport?.uncertainAreas,
            audits: next.audits.length,
          },
        }) : undefined)
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
    // The brackets test ends at 20 minutes, so its staged question would be refused after that. The factorisation test has no time limit.
    const staged = session.topic === "FACTORISATION" || Date.now() - new Date(session.startedAt).getTime() < 20 * 60 * 1000
      ? session.upcomingQuestions?.[0]
      : undefined;
    const submission: LotusStudentResponse = pendingSubmission ?? {
      answer: didNotKnow ? "I don't know" : answer.trim(),
      working: workingLines.map((line) => line.trim()).filter(Boolean).join("\n"),
      confidence,
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
      const next = await api.overrideLotusSession(session.sessionId, studentId, action);
      rememberSession(next);
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
              <FinalReport session={session} classroomAssignmentId={classroomAssignmentId} />
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
                      <span className={styles.questionProvenance} role="status">{provenanceLabelForQuestion(question, session)}</span>
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

                    <div className={styles.confidence}>
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
                <div className={styles.observerHeader}>
                  <div className={styles.observerActions}>
                    {session.status === "ACTIVE" && (
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
                {session.topic === "FACTORISATION" && session.status === "ACTIVE" && (
                  <UnseenPlanPanel sessionId={session.sessionId} answeredCount={audits.length} />
                )}
                <div className={styles.timeline}>
                  {audits.map((audit, index) => (
                    <AuditCard
                      key={`${audit.question.id}-${index}`}
                      audit={audit}
                      opening={index === 0}
                      index={index}
                      latest={index === audits.length - 1}
                      liveProgress={session.liveProgress}
                    />
                  ))}
                  {busy && liveProgress && <LiveProgressCard progress={liveProgress} index={audits.length} />}
                </div>
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
