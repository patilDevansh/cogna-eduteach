// Live factorisation run against the real API + AI. Usage: node live-factorisation.cjs <studentId> <paceMs> <webUrl>
const fs = require("node:fs");
const path = require("node:path");

const studentId = process.argv[2] || "demo_aarav";
const paceMs = Number(process.argv[3] || 25000);
const WEB = process.argv[4] || "http://localhost:63129";
const API = "http://localhost:3001";
const OUT = path.join(__dirname, `live-${studentId}.json`); // writes next to this script
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

async function main() {
  const minted = await (await fetch(`${WEB}/api/session/student`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId, name: studentId }),
  })).json();
  if (!minted.token) throw new Error(`could not mint a demo token: ${JSON.stringify(minted)}`);
  const headers = { "content-type": "application/json", "x-cogna-role": "student", "x-cogna-student-id": studentId, "x-cogna-student-token": minted.token };
  const call = async (method, url, body) => {
    const res = await fetch(`${API}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json)}`);
    return json;
  };

  const t0 = now();
  let view = await call("POST", "/lotus/sessions", { studentId, topic: "FACTORISATION" });
  const startMs = now() - t0;
  console.log(`started in ${startMs} ms; Q1: ${view.currentQuestion.prompt}; ${view.upcomingQuestions.length} questions already staged`);

  // Every question id the browser has ever been offered, and when it first appeared (fixed ones appear at start; AI ones replace them later).
  const firstSeen = new Map();
  const note = (v) => (v.upcomingQuestions || []).forEach((q) => { if (!firstSeen.has(q.id)) firstSeen.set(q.id, { at: now() - t0, prompt: q.prompt }); });
  note(view);
  const initialIds = new Set((view.upcomingQuestions || []).map((q) => q.id));

  const turns = [];
  let n = 1;
  while (view.status === "ACTIVE") {
    // The student "thinks" for paceMs; the browser polls every 2.5 s like the real page.
    const thinkUntil = now() + paceMs;
    while (now() < thinkUntil) {
      await sleep(2500);
      const polled = await call("GET", `/lotus/sessions/${view.sessionId}`);
      note(polled);
      if (polled.currentQuestion?.id === view.currentQuestion?.id) view = { ...view, upcomingQuestions: polled.upcomingQuestions };
    }
    const fill = await call("GET", `/lotus/sessions/${view.sessionId}/demo-fill?studentId=${studentId}`);
    const staged = view.upcomingQuestions?.[0];
    const shown = view.currentQuestion;
    const s0 = now();
    view = await call("POST", `/lotus/sessions/${view.sessionId}/answers`, {
      studentId, answer: fill.answer, working: fill.working, confidence: fill.confidence,
      responseTimeMs: paceMs, didNotKnow: false, submissionId: `live-${n}-${s0}`,
      questionId: shown.id, nextQuestionId: staged?.id,
    });
    const submitMs = now() - s0;
    note(view);
    const instant = view.status !== "ACTIVE" || view.currentQuestion?.id === staged?.id;
    turns.push({ n, prompt: shown.prompt, answer: fill.answer, submitMs, instant, remaining: view.upcomingQuestions?.length ?? 0 });
    console.log(`Q${n} ${instant ? "instant" : "SWAPPED"} (${submitMs} ms submit) — ${shown.prompt}  ⇒  ${fill.answer}   [${view.upcomingQuestions?.length ?? 0} left]`);
    n += 1;
  }

  const aiReplacements = [...firstSeen.entries()].filter(([id]) => !initialIds.has(id));
  const report = view.finalReport;
  const audits = view.audits.map((a, i) => ({
    n: i + 1,
    prompt: a.question.prompt,
    origin: a.question.answerKey?.diagnostics?.origin,
    skill: a.question.answerKey?.diagnostics?.skillId,
    answer: a.response?.answer,
    verification: a.verification?.status,
    analysis: a.analysisStatus,
    evidence: (a.skillEvidence || []).map((e) => `${e.kind}:${e.skillId}${e.mistake ? `(${e.mistake})` : ""}${e.source === "ANALYSIS" ? "[AI]" : ""}`),
    selection: `${a.questionSelection.selectedFrom} — ${a.questionSelection.reason}`,
    stageMs: a.timingMs?.total,
    firstWrongStep: a.conclusion?.firstWrongStep,
    mistakeDescription: a.conclusion?.mistakeDescription,
  }));
  const summary = {
    studentId, paceMs, startMs, totalMs: now() - t0,
    answered: turns.length,
    instantSubmits: turns.filter((t) => t.instant).length,
    submitMs: { max: Math.max(...turns.map((t) => t.submitMs)), median: turns.map((t) => t.submitMs).sort((a, b) => a - b)[Math.floor(turns.length / 2)] },
    aiQuestionsShown: audits.filter((a) => a.origin === "AI").length,
    fixedQuestionsShown: audits.filter((a) => a.origin === "FALLBACK").length,
    newQuestionIdsOffered: aiReplacements.length,
    firstAiQuestionAtMs: aiReplacements.length ? Math.min(...aiReplacements.map(([, v]) => v.at)) : null,
    report, audits, turns,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\nDONE: ${turns.length} answered, ${summary.instantSubmits} instant, AI-written shown ${summary.aiQuestionsShown}, fixed shown ${summary.fixedQuestionsShown}`);
  console.log(`outcome ${report.outcome}: ${report.startingPoint}`);
  console.log(`written to ${OUT}`);
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
