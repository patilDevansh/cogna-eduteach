"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  LotusModelAssessment,
  LotusOverrideAction,
  LotusQuestion,
  LotusQuestionAudit,
  LotusQuestionSelection,
  LotusSessionView,
  LotusStatusResponse,
} from "@cogna/shared";
import { api } from "@/lib/api";
import { getStudent } from "@/lib/session";
import { getMockEnrollment, type MockStudentEnrollment } from "@/lib/mock-classroom";
import { saveStoredLotusSession } from "@/lib/lotus-demo-store";
import styles from "@/components/lotus.module.css";

const CONFIDENCE_CHOICES = [
  { value: 25, label: "Not sure" },
  { value: 60, label: "Somewhat sure" },
  { value: 90, label: "Very sure" },
] as const;

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

function QuestionDecision({ selection }: { selection: LotusQuestionSelection }) {
  const sourceLabel = selection.selectedFrom === "NONE_EXIT"
    ? "Diagnostic ended"
    : selection.selectedFrom === "REVISED_FOR_INFORMATION_GAIN"
      ? "Revised after repetition check"
      : `Chosen from ${selection.selectedFrom.toLowerCase()}`;
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
      </div>
      <div className={styles.proposalGrid}>
        <ProposalCard label="Primary proposed" question={selection.primaryProposal} />
        <ProposalCard label="Challenger proposed" question={selection.challengerProposal} />
        <ProposalCard label={sourceLabel} question={selection.selectedQuestion} selected />
      </div>
      <div className={styles.decisionReason}>
        <strong>Why this was chosen</strong>
        <p>{selection.reason}</p>
        <small>{selection.informationGain.explanation}</small>
      </div>
    </section>
  );
}

function AuditCard({
  audit,
  index,
  latest,
  opening,
}: {
  audit: LotusQuestionAudit;
  index: number;
  latest: boolean;
  opening?: boolean;
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
              <p><strong>Working:</strong> {audit.response.working || "No working entered"}</p>
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

        <QuestionDecision selection={audit.questionSelection} />

        <div className={styles.modelGrid}>
          <AssessmentCard name="GPT primary thought" assessment={audit.gpt} className={styles.gpt} />
          <AssessmentCard name="GPT challenger thought" assessment={audit.challenger} className={styles.challenger} />
        </div>

        <section className={`${styles.section} ${styles.debate}`}>
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
        </section>

        <section className={`${styles.section} ${styles.conclusion}`}>
          <div className={styles.auditMeta}>
            <h4>Final conclusion</h4>
            <span className={styles.phaseBadge}>{audit.conclusion.evidenceState}</span>
            <span className={styles.phaseBadge}>{audit.conclusion.action.replaceAll("_", " ")}</span>
          </div>
          <p>{audit.conclusion.conclusion}</p>
          {audit.conclusion.uncertainty?.length > 0 && (
            <>
              <p style={{ marginTop: "0.65rem" }}><strong>Still uncertain</strong></p>
              <List items={audit.conclusion.uncertainty} />
            </>
          )}
        </section>
      </div>
    </details>
  );
}

function FinalReport({ session }: { session: LotusSessionView }) {
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
      <Link className="btn btn-primary" style={{ marginTop: "1rem" }} href="/student/lotus/learn">
        Start the learning path Lotus selected →
      </Link>
    </section>
  );
}

export default function LotusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoPersona = searchParams.get("demo");
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
  const [error, setError] = useState("");

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
  }, [router]);

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

  function resetResponse() {
    setAnswer("");
    setWorkingLines(["", "", ""]);
    setConfidence(60);
    setDidNotKnow(false);
    setQuestionStartedAt(Date.now());
  }

  function rememberSession(next: LotusSessionView) {
    setSession(next);
    saveStoredLotusSession({ session: next, studentName, enrollment: classEnrollment, savedAt: new Date().toISOString() });
    resetResponse();
    if (next.status === "COMPLETE") {
      void api
        .createPersonalizedVideoAssignment({
          studentId,
          lotusSessionId: next.sessionId,
        })
        .catch(() => undefined);
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const next = await api.startLotusSession(studentId);
      setSession(next);
      saveStoredLotusSession({ session: next, studentName, enrollment: classEnrollment, savedAt: new Date().toISOString() });
      resetResponse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lotus could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!session || (!didNotKnow && !answer.trim())) {
      setError("Enter an answer or choose “I don’t know”.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api.submitLotusAnswer(session.sessionId, studentId, {
        answer: didNotKnow ? "I don't know" : answer.trim(),
        working: workingLines.map((line) => line.trim()).filter(Boolean).join("\n"),
        confidence,
        responseTimeMs: Date.now() - questionStartedAt,
        didNotKnow,
      });
      rememberSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The two-model review failed.");
    } finally {
      setBusy(false);
    }
  }

  async function override(action: LotusOverrideAction) {
    if (!session) return;
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
  const question = session?.currentQuestion;
  const promptLines = question
    ? studentFacingPrompt(question.prompt, Boolean(question.options?.length))
    : [];

  function fillDemoResponse() {
    if (!question || !demoPersona) return;
    const canonical = question.answerKey.canonicalAnswer;
    let demoAnswer = canonical;
    const context = `${question.subtopic} ${question.prompt}`;
    const shouldShowDifficulty =
      (demoPersona === "aarav" && /negative|sign|bracket|distribut/i.test(context)) ||
      (demoPersona === "meena" && /equation|balance|bracket|distribut/i.test(context)) ||
      (demoPersona === "rohan" && Boolean(session && session.audits.length === 2));
    if (shouldShowDifficulty) {
      if (question.options?.length) demoAnswer = question.options.find((option) => option !== canonical) ?? canonical;
      else if (/^-?\d+(?:\.\d+)?$/.test(canonical.trim())) demoAnswer = String(Number(canonical) + 1);
      else if (canonical.includes("+")) demoAnswer = canonical.replace("+", "-");
      else if (canonical.includes("-")) demoAnswer = canonical.replace("-", "+");
      else demoAnswer = `${canonical} + 1`;
    }
    setAnswer(demoAnswer);
    const worked = question.answerKey.workedSolution ?? [];
    setWorkingLines((worked.length ? worked : ["I worked this out independently."]).slice(0, 6));
    setConfidence(demoPersona === "aadya" ? 90 : shouldShowDifficulty ? 60 : 90);
    setDidNotKnow(false);
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <Link href="/student/home" className="wordmark">Cogna<span className="dot">.</span></Link>
            <span className={styles.lotusName}>Lotus</span>
            <span className={styles.experimental}>Experimental AI Lab</span>
          </div>
          <div className={styles.statusRow}>
            {observer && <span className={styles.observerBadge}>Observer view</span>}
            {session?.status === "ACTIVE" && (
              <span className="time-note">{minutes}:{String(seconds).padStart(2, "0")} · Q{session.audits.length + 1}</span>
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
                <span className={styles.phaseBadge}>Up to 20 minutes</span>
              </div>
              <h1 style={{ marginTop: "1rem" }}>Let Cogna Lotus find the right starting point.</h1>
              <p style={{ marginTop: "0.75rem" }}>
                Two separate GPT agents will independently read each answer, challenge each other, and decide what to ask next. Arithmetic answers are checked before the AIs interpret what the response means. Conclusions remain experimental research evidence.
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
                  {busy ? "The two GPT agents are choosing…" : `Start for ${studentName || "student"}`}
                </button>
                <Link className="btn btn-ghost" href="/student/home">Back home</Link>
              </div>
            </section>
          </div>
        ) : (
          <div className={observer ? styles.layout : styles.layoutStudent}>
            <div className={styles.studentPane}>
              {session.status === "COMPLETE" ? (
                <FinalReport session={session} />
              ) : question ? (
                <section className={styles.questionCard}>
                  <div className={styles.cardTop}>
                    <div className={styles.phaseRow}>
                      <span className={styles.phaseBadge}>{question.phase}</span>
                      <span className={styles.muted}>{question.subtopic}</span>
                    </div>
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
                              disabled={busy}
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
                            onChange={(event) => { setAnswer(event.target.value); setDidNotKnow(false); }}
                            disabled={busy || didNotKnow}
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
                                value={line}
                                onChange={(event) => {
                                  const next = [...workingLines];
                                  next[index] = event.target.value;
                                  setWorkingLines(next);
                                }}
                                disabled={busy || didNotKnow}
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
                            disabled={busy || didNotKnow}
                          >
                            + Add another step
                          </button>
                        )}
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
                            disabled={busy}
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
                        disabled={busy}
                      />
                      I don&apos;t know this yet
                    </label>

                    {error && <div className={styles.error}>{error}</div>}
                    {demoPersona && (
                      <button className="btn btn-ghost" type="button" onClick={fillDemoResponse} disabled={busy}>
                        Fill {studentName.split(" ")[0]}’s demo response
                      </button>
                    )}
                    <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
                      {busy ? (
                        <span className={styles.loading}><span className={styles.pulse} />The two GPT agents are reviewing…</span>
                      ) : "Submit answer"}
                    </button>
                  </div>
                </section>
              ) : null}
            </div>

            {observer && (
              <aside className={styles.observerPane}>
                <div className={styles.observerHeader}>
                  <div>
                    <h2>AI deliberation</h2>
                    <p>Structured assessment rationale—not private chain-of-thought.</p>
                  </div>
                  <div className={styles.observerActions}>
                    {session.status === "ACTIVE" && (
                      <>
                        <button type="button" onClick={() => override("REPLACE_QUESTION")} disabled={busy}>
                          Replace question
                        </button>
                        <button type="button" onClick={() => override("END_NOW")} disabled={busy}>
                          End &amp; report
                        </button>
                      </>
                    )}
                    <span className={styles.observerBadge}>Do not show student</span>
                  </div>
                </div>
                <div className={styles.timeline}>
                  {audits.map((audit, index) => (
                    <AuditCard
                      key={`${audit.question.id}-${index}`}
                      audit={audit}
                      opening={index === 0}
                      index={index}
                      latest={index === audits.length - 1}
                    />
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
