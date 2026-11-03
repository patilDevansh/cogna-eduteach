"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ModuleRunView } from "@/lib/api";
import { getStudent } from "@/lib/session";

type PendingAction = { eventId: string; expectedRevision: number; action: Record<string, unknown> };
const activeKey = (studentId: string) => `cogna_module_learning_active_v1_${studentId}`;
const startKey = (studentId: string) => `cogna_module_learning_start_request_v1_${studentId}`;
const pendingKey = (runId: string) => `cogna_module_learning_pending_v1_${runId}`;
const draftKey = (runId: string, itemId: string) => `cogna_module_learning_draft_v1_${runId}_${itemId}`;

export default function ModuleLearningPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<ModuleRunView[]>([]);
  const [run, setRun] = useState<ModuleRunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const presentedAt = useRef(Date.now());

  const refresh = useCallback(async (runId?: string) => {
    const studentId = getStudent()?.studentId;
    if (!studentId) throw new Error("Sign in as a student to open your module work.");
    const available = await api.moduleRuns();
    setRuns(available);
    const requested = runId ?? new URLSearchParams(window.location.search).get("run") ?? localStorage.getItem(activeKey(studentId));
    if (requested) {
      const current = await api.moduleRun(requested);
      setRun(current);
      localStorage.setItem(activeKey(studentId), current.identity.runId);
    }
  }, []);

  useEffect(() => {
    if (!getStudent()?.token) { router.replace("/student/login"); return; }
    refresh().catch(err => setError(err instanceof Error ? err.message : "Could not load module work.")).finally(() => setLoading(false));
  }, [refresh, router]);

  useEffect(() => {
    if (!run) return;
    const key = run.question?.id;
    setAnswer(key ? localStorage.getItem(draftKey(run.identity.runId, key)) ?? "" : "");
    try {
      const saved = localStorage.getItem(pendingKey(run.identity.runId));
      setPending(saved ? JSON.parse(saved) as PendingAction : null);
    } catch { setPending(null); }
    presentedAt.current = Date.now();
  }, [run?.identity.runId, run?.state.revision, run?.question?.id]);

  async function start() {
    setBusy(true); setError(null);
    try {
      const studentId = getStudent()?.studentId;
      if (!studentId) throw new Error("Sign in as a student to start this module.");
      const id = localStorage.getItem(startKey(studentId)) ?? crypto.randomUUID();
      localStorage.setItem(startKey(studentId), id);
      const created = await api.startSelfModule(id);
      localStorage.removeItem(startKey(studentId));
      localStorage.setItem(activeKey(studentId), created.identity.runId);
      setRun(created);
      setRuns(previous => [created, ...previous.filter(item => item.identity.runId !== created.identity.runId)]);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not start the module."); }
    finally { setBusy(false); }
  }

  async function send(action: Record<string, unknown>, retry?: PendingAction) {
    if (!run) return;
    const op = retry ?? { eventId: crypto.randomUUID(), expectedRevision: run.state.revision, action };
    localStorage.setItem(pendingKey(run.identity.runId), JSON.stringify(op));
    setPending(op); setBusy(true); setError(null);
    try {
      const updated = await api.moduleAction(run.identity.runId, op.eventId, op.expectedRevision, op.action);
      localStorage.removeItem(pendingKey(run.identity.runId));
      setPending(null);
      if (op.action.kind === "ANSWER" && typeof op.action.itemId === "string") localStorage.removeItem(draftKey(run.identity.runId, op.action.itemId));
      setRun(updated);
      setRuns(previous => previous.map(item => item.identity.runId === updated.identity.runId ? updated : item));
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Could not save."} Your current answer is kept in this browser. Retry saving before moving on.`);
    } finally { setBusy(false); }
  }

  function chooseRun(selected: ModuleRunView) {
    const studentId = getStudent()?.studentId;
    if (!studentId || selected.identity.studentId !== studentId) return;
    localStorage.setItem(activeKey(studentId), selected.identity.runId);
    setRun(selected); setError(null);
  }

  const card = { background: "#fff", border: "1px solid #d8e5dd", borderRadius: 18, padding: 24, boxShadow: "0 10px 30px rgba(8,43,31,.06)" } as const;
  return <main style={{ minHeight: "100vh", background: "#f3f7f2", color: "#123428", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 780, margin: "0 auto", display: "grid", gap: 20 }}>
      <header><p style={{ color: "#146c54", fontWeight: 700 }}>COGNA · LEARN A MODULE</p><h1 style={{ fontSize: "clamp(2rem, 5vw, 3.4rem)", margin: "6px 0" }}>Factorisation, one step at a time</h1><p>Learn a method, try it, get help where you need it, then solve a fresh question on your own.</p></header>
      {loading && <section style={card}>Loading your module work…</section>}
      {error && <section role="alert" style={{ ...card, borderColor: "#c06436", background: "#fff8ef" }}>{error}</section>}
      {!loading && runs.length > 0 && <section style={card}><h2>Your module work</h2><div style={{ display: "grid", gap: 8 }}>{runs.map(item => <button key={item.identity.runId} type="button" onClick={() => chooseRun(item)} style={{ textAlign: "left", padding: 12, borderRadius: 10, border: item.identity.runId === run?.identity.runId ? "2px solid #146c54" : "1px solid #d8e5dd", background: "white", cursor: "pointer" }}>{item.identity.source === "TEACHER_ASSIGNED" ? "Assigned by your teacher" : "My own learning"} · {item.state.stage.replaceAll("_", " ").toLowerCase()} · {item.state.workflow.toLowerCase()}</button>)}</div></section>}
      {!loading && !runs.some(item => item.identity.source === "SELF_DIRECTED" && item.state.workflow === "ACTIVE") && <button type="button" onClick={start} disabled={busy} style={{ justifySelf: "start", border: 0, borderRadius: 12, padding: "12px 18px", color: "white", background: "#146c54", fontWeight: 700, cursor: "pointer" }}>{runs.some(item => item.identity.source === "SELF_DIRECTED") ? "Start a new factorisation run" : "Start my own factorisation module"}</button>}
      {run && <section style={card}>
        <p style={{ color: "#146c54", fontWeight: 700 }}>{run.identity.source === "TEACHER_ASSIGNED" ? "TEACHER ASSIGNMENT" : "MY OWN LEARNING"} · {run.state.stage.replaceAll("_", " ")}</p>
        {run.state.teacherPaused && <p>Your teacher has paused this assignment. Your progress is saved.</p>}
        {run.state.paused && !run.state.teacherPaused && <><p>Paused. Your current step is saved.</p><button disabled={busy} onClick={() => send({ kind: "RESUME" })}>Resume</button></>}
        {!run.state.paused && !run.state.teacherPaused && <>
          {run.asset && <><h2>{run.asset.staticSlides[0]?.title}</h2><p>Take your time with each step. The equations and explanation remain available if animation or narration is unavailable.</p>{run.asset.staticSlides.map(slide => <div key={slide.step} style={{ borderLeft: "4px solid #148063", padding: "8px 16px", margin: "14px 0", background: "#f7faf6" }}><strong>Step {slide.step}: {slide.title}</strong>{slide.equations.map((equation, index) => <p key={index} style={{ fontSize: 22, fontWeight: 700, overflowWrap: "anywhere" }}>{equation}</p>)}<p>{slide.explanation}</p></div>)}<button disabled={busy || !!pending} onClick={() => send({ kind: "PRESENTED", segmentId: run.asset!.segmentId, representation: "STATIC_TEXT", elapsedMs: Date.now() - presentedAt.current })}>Continue after reading</button></>}
          {run.question && <><h2>{run.question.independent ? "Try this independently" : run.state.stage === "PREREQUISITE_CHECK" ? "Check one earlier idea" : "Try this question"}</h2><p style={{ fontSize: 20 }}>{run.question.prompt}</p>{run.question.independent && <p>This is a fresh check without hints. Work in your notebook if you like.</p>}{run.question.options ? <div style={{ display: "grid", gap: 8 }}>{run.question.options.map(option => <button key={option} type="button" disabled={busy || !!pending} onClick={() => { setAnswer(option); localStorage.setItem(draftKey(run.identity.runId, run.question!.id), option); }} style={{ padding: 10, textAlign: "left", background: answer === option ? "#daf2e8" : "white", border: "1px solid #9bbdaf", borderRadius: 8 }}>{option}</button>)}</div> : <input aria-label="Your answer" value={answer} onChange={event => { setAnswer(event.target.value); localStorage.setItem(draftKey(run.identity.runId, run.question!.id), event.target.value); }} placeholder="Type your answer" style={{ width: "100%", padding: 12, fontSize: 20, border: "1px solid #9bbdaf", borderRadius: 8 }} />}
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}><button type="button" disabled={busy || !!pending || !answer.trim()} onClick={() => send({ kind: "ANSWER", itemId: run.question!.id, answer, elapsedMs: Date.now() - presentedAt.current })}>Check and save</button>{!run.question.independent && <button type="button" disabled={busy || !!pending} onClick={() => send({ kind: "REQUEST_HELP" })}>I need another explanation</button>}</div></>}
          {run.state.lastResult && <p>Last saved answer: {run.state.lastResult.verdict === "CORRECT" ? "correct" : "needs another look"}. {run.state.lastResult.assistance === "NONE" ? "Independent check" : "Learning practice"}.</p>}
          {run.state.workflow === "COMPLETE" && <><h2>Module complete</h2><p>Your independent check was {run.state.independentResult?.verdict === "CORRECT" ? "correct" : "not yet correct"}. That result is saved separately from the lesson practice.</p></>}
          {run.state.workflow === "UNRESOLVED" && <><h2>More support is needed</h2><p>Cogna saved the difficulty and stopped repeating this path. Your teacher can help, or you can return later.</p></>}
          {run.state.workflow === "ACTIVE" && <button type="button" disabled={busy || !!pending} onClick={() => send({ kind: "PAUSE" })} style={{ marginTop: 18 }}>Pause and save my place</button>}
        </>}
        {pending && <button type="button" disabled={busy} onClick={() => send(pending.action, pending)} style={{ marginTop: 16 }}>Retry saving this step</button>}
      </section>}
    </div>
  </main>;
}
