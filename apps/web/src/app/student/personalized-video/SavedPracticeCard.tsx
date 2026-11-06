"use client";

import { useEffect, useRef, useState } from "react";
import type { LessonEvidenceReceipt, LessonEvidenceRequest, LessonPracticeProgress, PracticeAnswer, PracticeItemView } from "@cogna/shared";
import { prettyMath } from "@cogna/lesson-video/player";
import { api, ApiError } from "@/lib/api";
import { practicePendingKey, readPendingPractice, readPracticeDraft } from "@/lib/lesson-evidence-client";
import styles from "./practice.module.css";

type TypedItem = Extract<PracticeItemView, { format: "type-answer" }>;

/** Bounded typed-practice path. Saving acknowledgement is independent from mathematical feedback. */
export function SavedPracticeCard({ assignmentId, studentId, item, learning, onResolved, onNext }: {
  assignmentId: string; studentId: string; item: TypedItem; learning: LessonPracticeProgress;
  onResolved: (outcome: { firstTry: boolean; correct: boolean }) => void; onNext: () => void;
}) {
  const saved = learning.items[item.id];
  const [receipt, setReceipt] = useState<LessonEvidenceReceipt | null>(saved?.latest ?? null);
  const [hint, setHint] = useState<string | null>(saved?.hint ?? null);
  const [hintReceipt, setHintReceipt] = useState<string | null>(null);
  const [text, setText] = useState(saved?.latest?.answer && "text" in saved.latest.answer ? saved.latest.answer.text : "");
  const [pending, setPending] = useState<LessonEvidenceRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(saved?.latest ? "Saved. Your practice is ready to resume." : "");
  const [localRecovery, setLocalRecovery] = useState(true);
  const [reloadRequired, setReloadRequired] = useState(false);
  const active = useRef(false);
  const resolved = useRef(Boolean(saved?.resolved));
  const presented = useRef<Promise<void> | null>(null);
  const presentationId = useRef<string | null>(null);
  const key = practicePendingKey(studentId, assignmentId, item.id, learning.contentVersion);
  const draftKey = `${key}:draft`;
  const checkedText = receipt?.answer && "text" in receipt.answer ? receipt.answer.text : null;
  const edited = checkedText !== null && text !== checkedText;
  const done = Boolean(receipt?.result && (receipt.result.verdict === "CORRECT" || receipt.result.reveal));

  function ensurePresented() {
    if (!presented.current) {
      presentationId.current ??= crypto.randomUUID();
      presented.current = api.recordPracticeEvidence(assignmentId, {
        schemaVersion: 1, eventId: presentationId.current, contentVersion: learning.contentVersion, kind: "PRESENTED", itemId: item.id,
      }).then(() => undefined).catch((error) => { presented.current = null; throw error; });
    }
    return presented.current;
  }
  useEffect(() => {
    try {
      const draft = !done ? readPracticeDraft(sessionStorage, draftKey, saved?.latest?.eventId ?? null) : null;
      if (draft) {
        setText(draft.text);
        setMessage("Draft restored in this tab. Not checked yet.");
      }
      const stored = readPendingPractice(sessionStorage, key);
      if (stored && stored.contentVersion === learning.contentVersion && stored.itemId === item.id) {
        if (stored.eventId === saved?.latest?.eventId) sessionStorage.removeItem(key);
        else {
          setPending(stored);
          if (stored.answer && "text" in stored.answer) setText(stored.answer.text);
          setMessage("Your last request needs confirmation. Retry it before continuing.");
        }
      }
    } catch { setLocalRecovery(false); }
    void ensurePresented().catch(() => { /* no learning or save-success claim from missing exposure */ });
  }, [key]);

  useEffect(() => {
    if (!hint || !hintReceipt) return;
    // Effects run after the hint has committed to the DOM.
    void api.recordPracticeEvidence(assignmentId, { schemaVersion: 1, eventId: `hint-view-${hintReceipt}`, contentVersion: learning.contentVersion, kind: "PRESENTED", itemId: item.id, supportEventId: hintReceipt }).catch(() => undefined);
  }, [hint, hintReceipt, assignmentId, item.id, learning.contentVersion]);

  async function save(event: LessonEvidenceRequest) {
    if (active.current) return;
    active.current = true; setBusy(true); setPending(event); setMessage("Saving your practice…");
    try {
      try { sessionStorage.setItem(key, JSON.stringify({ event, storedAt: Date.now() })); }
      catch { setLocalRecovery(false); }
      await ensurePresented();
      const result = await api.recordPracticeEvidence(assignmentId, event);
      if (result.eventId !== event.eventId || result.contentVersion !== event.contentVersion || result.assignmentId !== assignmentId || result.studentId !== studentId) throw new Error("The saved response did not match this practice. Reload to check your progress.");
      try { sessionStorage.removeItem(key); } catch { /* durable server receipt is still saved */ }
      setPending(null);
      if (result.kind === "HINT_REQUESTED") {
        setHint(result.hint ?? null);
        setHintReceipt(result.eventId);
      } else {
        setReceipt(result);
        try { sessionStorage.removeItem(draftKey); } catch { /* server receipt remains durable */ }
        const ended = result.result?.verdict === "CORRECT" || Boolean(result.result?.reveal);
        if (ended && !resolved.current) {
          resolved.current = true;
          onResolved({ firstTry: result.result?.attempt === 1 && result.assistance === "NONE_RECORDED" && result.result.verdict === "CORRECT", correct: result.result?.verdict === "CORRECT" });
        }
      }
      setMessage(result.kind === "HINT_REQUESTED" ? "Help saved. Try the next step when you’re ready." : "Saved. You can refresh and resume this practice.");
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setReloadRequired(conflict);
      setMessage(conflict ? "Not confirmed saved. Reload your current practice before continuing." : "Not confirmed saved. Your answer is still here. Please retry when your connection is ready.");
    } finally { active.current = false; setBusy(false); }
  }
  function submit(kind: "HINT_REQUESTED" | "ANSWER_SUBMITTED", answer?: PracticeAnswer) {
    if (pending || active.current) return;
    const event: LessonEvidenceRequest = { schemaVersion: 1, eventId: crypto.randomUUID(), contentVersion: learning.contentVersion, kind, itemId: item.id, clientOccurredAt: new Date().toISOString(), ...(answer ? { answer } : {}) };
    void save(event);
  }
  function changeAnswer(value: string) {
    setText(value);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ text: value, baseEventId: receipt?.eventId ?? null, storedAt: Date.now() }));
      setMessage("Draft saved in this tab. Not checked yet.");
    } catch {
      setLocalRecovery(false);
      setMessage("Draft is only on this page. Check and save before refreshing.");
    }
  }

  return <div className={styles.card} data-testid="saved-practice-card" aria-busy={busy}>
    <p className={styles.prompt}>{item.prompt}</p>
    <div className={styles.bigMath}>{prettyMath(item.expression)}</div>
    <form className={styles.typeRow} onSubmit={(event) => { event.preventDefault(); if (text.trim()) submit("ANSWER_SUBMITTED", { text }); }}>
      <input autoCorrect="off" autoCapitalize="off" spellCheck={false} className={styles.input} aria-label="Your answer" maxLength={2000} value={text} disabled={busy || Boolean(pending) || done} onChange={(event) => changeAnswer(event.target.value)} />
      <button className={styles.primary} disabled={busy || Boolean(pending) || done || !text.trim()}>{busy ? "Saving…" : "Check and save"}</button>
    </form>
    <p role="status" aria-live="polite" data-testid="practice-save-status">{message}</p>
    {!localRecovery && <p className={styles.note}>Keep this tab open until saving is confirmed. This browser cannot preserve a pending request after refresh.</p>}
    {pending && !busy && <button className={styles.primary} onClick={() => void save(pending)}>Retry saving</button>}
    {reloadRequired && <button className={styles.primary} onClick={() => window.location.reload()}>Reload current practice</button>}
    {hint && <aside className={styles.worked}><p className={styles.workedLabel}>A helpful step</p><p>{hint}</p></aside>}
    {edited && <p className={styles.note}>Feedback below belongs to your last checked answer. Your current draft has not been checked.</p>}
    {receipt?.result && <p className={styles.feedback} data-verdict={receipt.result.verdict}>{receipt.result.feedback}</p>}
    {receipt?.result && <p className={styles.note}>{receipt.assistance === "ISSUED" ? "Help or feedback was used for this practice." : receipt.assistance === "UNKNOWN" ? "Earlier help history is incomplete for this practice." : "No item help was recorded for this attempt."} Practice is separate from your independent check.</p>}
    {receipt?.result?.reveal && <div className={styles.worked}>{receipt.result.reveal.steps.map((step, index) => <div key={index}>{/[A-Za-z]{3,}/.test(step) ? step : prettyMath(step)}</div>)}</div>}
    {done ? <button className={styles.primary} disabled={busy || Boolean(pending)} onClick={onNext}>Next →</button> : <div className={styles.nextRow}>
      <button type="button" className={styles.stuck} disabled={busy || Boolean(pending)} onClick={() => submit("HINT_REQUESTED")}>Give me a hint</button>
      <button type="button" className={styles.stuck} disabled={busy || Boolean(pending)} onClick={() => submit("ANSWER_SUBMITTED", { stuck: true })}>Show me how</button>
    </div>}
  </div>;
}
