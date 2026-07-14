/**
 * Cogna API client.
 *
 * The UI is strictly decision-driven: every response from the orchestrator
 * arrives as { uiAction, learningIntent, ...payload } and the practice screen
 * renders whatever phase the decision names. The UI never invents its own
 * teaching moves.
 *
 * When NEXT_PUBLIC_COGNA_API_URL is set, calls go to the real backend using
 * the same contract. Without it (local demo), a small in-browser orchestrator
 * below produces decisions from the APPROVED content bank so every screen is
 * fully usable offline. No math is ever generated at runtime.
 */

import {
  ApprovedQuestion,
  BASELINE_IDS,
  CONCEPT_LABELS_STUDENT,
  ConceptId,
  QUESTION_BANK,
  getQuestion,
} from "./content";

/* ----------------------------- contract types ---------------------------- */

export type UiAction =
  | "SHOW_QUESTION"
  | "SHOW_EXPLANATION"
  | "SHOW_HINT"
  | "END_SESSION"
  | "SUGGEST_BREAK";

export type LearningIntent =
  | "ESTABLISH_BASELINE"
  | "BUILD_FLUENCY"
  | "CHECK_PATTERN"
  | "REINFORCE_CONCEPT"
  | "ENCOURAGE_INDEPENDENCE"
  | "REDUCE_FATIGUE"
  | "CONSOLIDATE";

export interface QuestionView {
  id: string;
  prompt: string;
  conceptLabel: string; // already student-safe
}

export interface Decision {
  uiAction: UiAction;
  learningIntent: LearningIntent;
  question?: QuestionView;
  hint?: { level: number; total: number; text: string };
  explanation?: { title: string; steps: string[] };
  breakSuggestion?: { message: string; suggestedSeconds: number };
  summary?: StudentSessionSummary;
}

export interface SubmitResult {
  feedback: {
    correct: boolean;
    message: string; // student-safe, pre-approved phrasing
  };
  askConfidence: boolean;
  next: Decision;
}

export interface StudentSessionSummary {
  questionsTried: number;
  solvedWithoutHelp: number;
  conceptsPracticed: string[]; // student-safe labels
  encouragement: string;
  nextStep: string;
}

export type Confidence = "sure" | "somewhat" | "guessed";

/* --------------------------------- parent -------------------------------- */

export interface StudentRecord {
  id: string;
  name: string;
  grade: string;
  accessCode: string;
  lastPracticed: string | null; // ISO date
}

export interface ParentSessionSummary {
  studentName: string;
  date: string;
  minutes: number;
  questionsTried: number;
  observations: string[]; // what happened — factual
  inference: { text: string; certainty: "early" | "gathering" | "consistent" } | null;
  nextPractice: string;
}

export interface WeeklyUpdate {
  studentName: string;
  weekOf: string;
  sessions: number;
  minutes: number;
  workedOn: string[];
  improvements: string[];
  patternsChecking: { text: string; certainty: string }[];
  revisionPlan: string[];
  howToHelp: string;
  uncertaintyNote: string;
}

/* ------------------------------ demo storage ------------------------------ */

const API_URL = process.env.NEXT_PUBLIC_COGNA_API_URL;

const DEMO_ACCESS_CODE = "MATH42";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/* ------------------------- demo session orchestrator ---------------------- */

interface SessionState {
  mode: "baseline" | "adaptive";
  startedAt: number;
  askedIds: string[];
  currentId: string | null;
  hintLevel: number; // hints revealed for current question
  results: {
    id: string;
    correct: boolean;
    skipped: boolean;
    hintsUsed: number;
    conceptId: ConceptId;
  }[];
  breakTaken: boolean;
  pendingBreak: boolean;
  ended: boolean;
}

const SESSION_LIMIT_MS = 15 * 60 * 1000;
const BREAK_AFTER = 4; // suggest a break after this many answers
const MAX_QUESTIONS = { baseline: 5, adaptive: 8 };

let session: SessionState | null = null;

function conceptLabel(c: ConceptId) {
  return CONCEPT_LABELS_STUDENT[c];
}

function toView(q: ApprovedQuestion): QuestionView {
  return { id: q.id, prompt: q.prompt, conceptLabel: conceptLabel(q.conceptId) };
}

function wrongStreakOn(state: SessionState, conceptId: ConceptId) {
  return state.results.filter((r) => r.conceptId === conceptId && !r.correct && !r.skipped).length;
}

function pickNextQuestion(state: SessionState): ApprovedQuestion | null {
  if (state.mode === "baseline") {
    const nextId = BASELINE_IDS.find((id) => !state.askedIds.includes(id));
    return nextId ? getQuestion(nextId) : null;
  }
  // Adaptive: prefer the concept with most recent trouble; step difficulty gently.
  const last = state.results[state.results.length - 1];
  const remaining = QUESTION_BANK.filter((q) => !state.askedIds.includes(q.id));
  if (remaining.length === 0) return null;

  if (last && !last.correct) {
    const sameConceptEasier = remaining
      .filter((q) => q.conceptId === last.conceptId)
      .sort((a, b) => a.difficulty - b.difficulty)[0];
    if (sameConceptEasier) return sameConceptEasier;
  }
  const targetDifficulty = last && last.correct && last.hintsUsed === 0 ? 3 : 2;
  const sorted = remaining.sort(
    (a, b) => Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty)
  );
  return sorted[0];
}

function buildSummary(state: SessionState): StudentSessionSummary {
  const tried = state.results.length;
  const solo = state.results.filter((r) => r.correct && r.hintsUsed === 0).length;
  const concepts = Array.from(new Set(state.results.map((r) => conceptLabel(r.conceptId))));
  const struggled = state.results.some((r) => !r.correct);
  return {
    questionsTried: tried,
    solvedWithoutHelp: solo,
    conceptsPracticed: concepts,
    encouragement:
      solo >= Math.max(1, Math.floor(tried / 2))
        ? "You solved most of these on your own — that is real progress."
        : struggled
          ? "Some of these were tricky, and you kept going. That is exactly how practice works."
          : "Steady, careful work today. Nicely done.",
    nextStep:
      struggled
        ? "Next time we will warm up with one pattern that needs another check."
        : "Next time we will try a slightly bigger challenge.",
  };
}

function decideAfterAnswer(state: SessionState): Decision {
  const now = Date.now();
  const overTime = now - state.startedAt > SESSION_LIMIT_MS;
  const maxQ = MAX_QUESTIONS[state.mode];

  if (overTime || state.results.length >= maxQ) {
    state.ended = true;
    return {
      uiAction: "END_SESSION",
      learningIntent: "CONSOLIDATE",
      summary: buildSummary(state),
    };
  }

  if (!state.breakTaken && state.results.length === BREAK_AFTER && state.mode === "adaptive") {
    state.pendingBreak = true;
    return {
      uiAction: "SUGGEST_BREAK",
      learningIntent: "REDUCE_FATIGUE",
      breakSuggestion: {
        message: "Let’s take a short break. A minute away helps the next problems feel easier.",
        suggestedSeconds: 60,
      },
    };
  }

  // If the student just got one wrong, teach that exact question step-by-step
  // (baseline stays purely diagnostic — no teaching mid-baseline).
  const last = state.results[state.results.length - 1];
  if (state.mode === "adaptive" && last && !last.correct && !last.skipped && state.currentId) {
    const q = getQuestion(state.currentId);
    return {
      uiAction: "SHOW_EXPLANATION",
      learningIntent:
        wrongStreakOn(state, q.conceptId) >= 2 ? "CHECK_PATTERN" : "REINFORCE_CONCEPT",
      explanation: q.explanation,
    };
  }

  const next = pickNextQuestion(state);
  if (!next) {
    state.ended = true;
    return { uiAction: "END_SESSION", learningIntent: "CONSOLIDATE", summary: buildSummary(state) };
  }
  state.currentId = next.id;
  state.hintLevel = 0;
  state.askedIds.push(next.id);
  return {
    uiAction: "SHOW_QUESTION",
    learningIntent: state.mode === "baseline" ? "ESTABLISH_BASELINE" : "BUILD_FLUENCY",
    question: toView(next),
  };
}

/* ------------------------------ student API ------------------------------- */

export async function verifyAccessCode(code: string): Promise<{ ok: boolean; studentName?: string }> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/student/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    return r.json();
  }
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const students = load<StudentRecord[]>("cogna_students", defaultStudents());
  const match = students.find((s) => s.accessCode === normalized) ||
    (normalized === DEMO_ACCESS_CODE ? { name: "Aarav" } : null);
  return match ? { ok: true, studentName: (match as { name: string }).name } : { ok: false };
}

export async function startSession(mode: "baseline" | "adaptive"): Promise<Decision> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    return r.json();
  }
  session = {
    mode,
    startedAt: Date.now(),
    askedIds: [],
    currentId: null,
    hintLevel: 0,
    results: [],
    breakTaken: false,
    pendingBreak: false,
    ended: false,
  };
  const first = pickNextQuestion(session)!;
  session.currentId = first.id;
  session.askedIds.push(first.id);
  return {
    uiAction: "SHOW_QUESTION",
    learningIntent: mode === "baseline" ? "ESTABLISH_BASELINE" : "BUILD_FLUENCY",
    question: toView(first),
  };
}

export async function submitAnswer(input: {
  questionId: string;
  answer: string;
  skipped?: boolean;
}): Promise<SubmitResult> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/session/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return r.json();
  }
  if (!session) throw new Error("No active session");
  const q = getQuestion(input.questionId);
  const skipped = Boolean(input.skipped);
  const numeric = Number(input.answer.trim().replace(/^x\s*=\s*/i, ""));
  const correct = !skipped && Number.isFinite(numeric) && numeric === q.answer;

  session.results.push({
    id: q.id,
    correct,
    skipped,
    hintsUsed: session.hintLevel,
    conceptId: q.conceptId,
  });

  const message = skipped
    ? "No problem — we’ll come back to this kind of question another time."
    : correct
      ? session.hintLevel > 0
        ? "Correct — and you used the hint well."
        : "Correct. Solved on your own."
      : "Not quite — this one is worth a closer look together.";

  return {
    feedback: { correct, message },
    askConfidence: !skipped && correct,
    next: decideAfterAnswer(session),
  };
}

export async function recordConfidence(questionId: string, confidence: Confidence): Promise<void> {
  if (API_URL) {
    await fetch(`${API_URL}/session/confidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, confidence }),
    });
    return;
  }
  // Demo: confidence feeds the learner model server-side; locally it is a no-op.
}

export async function requestHint(questionId: string): Promise<Decision> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/session/hint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    });
    return r.json();
  }
  if (!session) throw new Error("No active session");
  const q = getQuestion(questionId);
  const level = Math.min(session.hintLevel + 1, q.hints.length);
  session.hintLevel = level;
  return {
    uiAction: "SHOW_HINT",
    learningIntent: "ENCOURAGE_INDEPENDENCE",
    hint: { level, total: q.hints.length, text: q.hints[level - 1] },
  };
}

export async function continueAfterExplanation(): Promise<Decision> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/session/continue`, { method: "POST" });
    return r.json();
  }
  if (!session) throw new Error("No active session");
  const next = pickNextQuestion(session);
  if (!next || session.ended) {
    session.ended = true;
    return { uiAction: "END_SESSION", learningIntent: "CONSOLIDATE", summary: buildSummary(session) };
  }
  session.currentId = next.id;
  session.hintLevel = 0;
  session.askedIds.push(next.id);
  return {
    uiAction: "SHOW_QUESTION",
    learningIntent: "REINFORCE_CONCEPT",
    question: toView(next),
  };
}

export async function resumeAfterBreak(): Promise<Decision> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/session/resume`, { method: "POST" });
    return r.json();
  }
  if (!session) throw new Error("No active session");
  session.breakTaken = true;
  session.pendingBreak = false;
  const next = pickNextQuestion(session);
  if (!next) {
    session.ended = true;
    return { uiAction: "END_SESSION", learningIntent: "CONSOLIDATE", summary: buildSummary(session) };
  }
  session.currentId = next.id;
  session.hintLevel = 0;
  session.askedIds.push(next.id);
  return { uiAction: "SHOW_QUESTION", learningIntent: "BUILD_FLUENCY", question: toView(next) };
}

export async function endSessionEarly(): Promise<Decision> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/session/end`, { method: "POST" });
    return r.json();
  }
  if (!session) throw new Error("No active session");
  session.ended = true;
  return { uiAction: "END_SESSION", learningIntent: "CONSOLIDATE", summary: buildSummary(session) };
}

/* ------------------------------- parent API ------------------------------- */

function defaultStudents(): StudentRecord[] {
  return [
    {
      id: "s_aarav",
      name: "Aarav",
      grade: "Grade 8 · CBSE",
      accessCode: DEMO_ACCESS_CODE,
      lastPracticed: new Date(Date.now() - 22 * 3600 * 1000).toISOString(),
    },
  ];
}

export async function parentLogin(email: string): Promise<{ ok: boolean; name: string }> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/parent/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return r.json();
  }
  save("cogna_parent", { email, name: "Priya" });
  return { ok: true, name: "Priya" };
}

export async function listStudents(): Promise<StudentRecord[]> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/parent/students`);
    return r.json();
  }
  const students = load<StudentRecord[]>("cogna_students", defaultStudents());
  save("cogna_students", students);
  return students;
}

export async function addStudent(name: string, grade: string): Promise<StudentRecord> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/parent/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, grade }),
    });
    return r.json();
  }
  const students = load<StudentRecord[]>("cogna_students", defaultStudents());
  const record: StudentRecord = {
    id: `s_${Math.random().toString(36).slice(2, 8)}`,
    name,
    grade,
    accessCode: generateCode(),
    lastPracticed: null,
  };
  students.push(record);
  save("cogna_students", students);
  return record;
}

export async function regenerateAccessCode(studentId: string): Promise<string> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/parent/students/${studentId}/code`, { method: "POST" });
    const data = await r.json();
    return data.accessCode;
  }
  const students = load<StudentRecord[]>("cogna_students", defaultStudents());
  const s = students.find((s) => s.id === studentId);
  if (!s) throw new Error("Student not found");
  s.accessCode = generateCode();
  save("cogna_students", students);
  return s.accessCode;
}

function generateCode() {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I/L/O — easy to read aloud
  const digits = "23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 2; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

export async function getSessionSummaryForParent(studentId: string): Promise<ParentSessionSummary> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/parent/students/${studentId}/summary`);
    return r.json();
  }
  const students = await listStudents();
  const s = students.find((s) => s.id === studentId);
  return {
    studentName: s?.name ?? "Your child",
    date: new Date(Date.now() - 22 * 3600 * 1000).toISOString(),
    minutes: 14,
    questionsTried: 8,
    observations: [
      "Completed a full 14-minute practice session and took the suggested one-minute break.",
      "Solved 5 of 8 questions without hints, including two questions with brackets.",
      "Asked for a hint on both questions where x appears with a minus sign, and reached the answer after the first hint each time.",
    ],
    inference: {
      text: "A pattern we are checking: when a minus sign sits in front of x, the first step sometimes goes in the wrong direction. Evidence so far comes from two questions, so we are still gathering evidence.",
      certainty: "gathering",
    },
    nextPractice:
      "Next short practice: three warm-up questions where x has a minus sign, before moving on. About 10 minutes.",
  };
}

export async function getWeeklyUpdate(studentId: string): Promise<WeeklyUpdate> {
  if (API_URL) {
    const r = await fetch(`${API_URL}/parent/students/${studentId}/weekly`);
    return r.json();
  }
  const students = await listStudents();
  const s = students.find((s) => s.id === studentId);
  return {
    studentName: s?.name ?? "Your child",
    weekOf: new Date().toISOString(),
    sessions: 4,
    minutes: 52,
    workedOn: [
      "Keeping both sides of an equation balanced",
      "Two-step equations (undoing addition, then multiplication)",
      "Multiplying across brackets",
    ],
    improvements: [
      "Two-step equations that needed hints last week are now solved independently.",
      "Bracket questions are being opened correctly on the first try more often than not.",
    ],
    patternsChecking: [
      {
        text: "When a minus sign sits directly in front of x (as in 7 − x = 2), the first step sometimes flips the wrong way. We have seen this in a handful of questions across two sessions.",
        certainty: "Still gathering evidence — we will know more after the next two sessions.",
      },
    ],
    revisionPlan: [
      "A short warm-up on minus-sign questions at the start of the next two sessions.",
      "One bracket question per session to keep that progress settled.",
    ],
    howToHelp:
      "If it comes up naturally, ask them to talk you through one problem out loud — saying the first step aloud (“first I add x to both sides”) is where the minus-sign pattern tends to show itself, gently.",
    uncertaintyNote:
      "These observations come from a small number of questions. Patterns at this stage are things we are checking, not conclusions — the picture usually becomes clearer over two to three weeks of short sessions.",
  };
}
