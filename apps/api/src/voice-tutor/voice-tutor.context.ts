import type { AccessActor } from "../access/cogna-access";
import type { TutorHelpKey, TutorHelpStore } from "../learning-evidence/tutor-help";
import { moduleItemForTutor } from "../module-learning/module-learning.state";
import { checkSpokenMaths, type MathsFacts } from "./voice-tutor.maths";
import type { VoiceTutorScreen } from "./voice-tutor.rules";

/**
 * What the tutor is allowed to see, decided on the server from the records, never from the page.
 *
 * The page only names WHERE the student is (a practice question, a lesson run). The question's words,
 * its reviewed hints and its answer are read here, and so is whether help on it may be given:
 *  - practice: the session must be the student's own and still running. Help is given on its current
 *    question (recorded first, so the answer counts as helped: learning-evidence/tutor-help.ts) or on
 *    a question already answered in it (nothing left to record); never in baseline practice;
 *  - lessons: only on supported practice and return questions; a check question pauses the tutor;
 *  - anywhere else (no place named, or one that doesn't check out): general talk. It pauses while the
 *    student has a baseline, a Lotus check-in or a lesson check open, and counts as help on an open
 *    practice question even though the tutor can't see that question.
 * A page that claims more (a made-up question, "help allowed") changes nothing.
 */

export type VoiceTutorRef =
  | { kind: "PRACTICE"; sessionId: string; questionId: string; questionVersion: number }
  | { kind: "MODULE"; runId: string };

export interface TutorContext {
  screen: VoiceTutorScreen;
  facts: MathsFacts;
  /** Something is open that the student must do alone: the tutor says this instead, with no model call. */
  paused?: string;
  /** Open practice questions this turn counts as help on. Recorded before the model is asked; no record, no reply. */
  record?: TutorHelpKey[];
}

export const CHECK_PAUSE = "This question is a check on your own, so I'll stay quiet. I can help again after you answer.";
export const BASELINE_PAUSE = "This is your starting check, so I'll stay quiet. Talk to me again in practice.";
export const OPEN_BASELINE_PAUSE = "Your starting check is still open, so I'll stay quiet until you finish it.";
export const OPEN_LOTUS_PAUSE = "Your check-in is still open, so I'll stay quiet until you finish it.";
export const OPEN_LESSON_CHECK_PAUSE = "A check in your lesson is waiting for your own answer, so I'll stay quiet until you've answered it.";
/** Lesson stages whose questions are practice the tutor may help with; every other question steers the lesson. */
export const TUTOR_HELP_STAGES = new Set(["SUPPORTED_PRACTICE", "RETURN"]);
/**
 * How recent open work must be to count as open now. Abandoned sessions stay ACTIVE in the records,
 * and one left behind last week must not silence the tutor for good.
 */
export const OPEN_WORK_WINDOW_MS = 12 * 60 * 60 * 1000;
/** At most this many running practice sessions are checked for an open question in general talk. */
const OPEN_PRACTICE_SESSIONS = 3;

const id = (v: unknown, max = 120): string | null => (typeof v === "string" && /^[\w:.-]{1,120}$/.test(v) && v.length <= max ? v : null);

export function readRef(raw: unknown): VoiceTutorRef | null {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (v.kind === "PRACTICE") {
    const sessionId = id(v.sessionId), questionId = id(v.questionId);
    const questionVersion = Number(v.questionVersion);
    if (!sessionId || !questionId || !Number.isInteger(questionVersion) || questionVersion < 1) return null;
    return { kind: "PRACTICE", sessionId, questionId, questionVersion };
  }
  if (v.kind === "MODULE") {
    const runId = id(v.runId);
    return runId ? { kind: "MODULE", runId } : null;
  }
  return null;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

/** Reviewed hints the model may build on: never one that already holds the answer (it would only be tempted to say it). */
function safeHints(hints: string[], question: string, answers: string[]): string[] {
  return hints.filter((h) => !checkSpokenMaths(h, [], { grounded: [question, h], answers, question }).problems.some((p) => p.startsWith("gives away the answer")));
}

/** The subset of the database the tutor reads (and the tutor-help event it writes), so tests can pass a fake. */
export interface TutorRecords {
  learningSession: {
    findUnique(args: unknown): Promise<{ studentId: string; sessionMode: string; status: string } | null>;
    findMany(args: unknown): Promise<Array<{ id: string; sessionMode: string }>>;
  };
  question: { findUnique(args: unknown): Promise<{ stem: string; options: unknown; hintLadder: unknown; acceptedAnswers: unknown } | null> };
  attempt: { findFirst(args: unknown): Promise<{ id: string } | null> };
  rawEvent: {
    findUnique(args: unknown): Promise<{ payload?: unknown; eventType?: string; studentId?: string } | null>;
    findMany(args: unknown): Promise<Array<{ sessionId?: string | null; payload: unknown }>>;
    upsert: TutorHelpStore["rawEvent"]["upsert"];
  };
  lotusSessionRecord: { findFirst(args: unknown): Promise<{ id: string } | null> };
}

export interface TutorRuns {
  getRun(actor: AccessActor, runId: string): Promise<{
    state: { stage: string; workflow: string; paused: boolean; teacherPaused: boolean };
    asset: { staticSlides: Array<{ title: string; explanation: string; equations: string[] }> } | null;
    question: { id: string; prompt: string; options: string[] | null; independent: boolean } | null;
  }>;
}

/** No question in view: the tutor talks about learning in general, and may only use small counting numbers. */
export function generalContext(base: VoiceTutorScreen): TutorContext {
  return {
    screen: { surface: base.surface, title: base.title, studentFirstName: base.studentFirstName, helpOnQuestion: false },
    facts: { grounded: [], answers: [] },
  };
}

/** The question a practice session is showing now, from its current-delivery record; null for anything else. */
function currentQuestion(payload: unknown): { id: string; version: number } | null {
  const next = (payload as { next?: { decision?: { uiAction?: unknown }; payload?: { id?: unknown; version?: unknown } } } | null)?.next;
  if (next?.decision?.uiAction !== "SHOW_QUESTION" || typeof next.payload?.id !== "string") return null;
  const version = Number(next.payload.version);
  return Number.isInteger(version) ? { id: next.payload.id, version } : null;
}

/**
 * A practice question the page names. Null when it doesn't check out (not this student's session, the
 * session has ended, or the question is neither current nor answered there): the caller then uses general talk.
 */
export async function practiceContext(db: TutorRecords, studentId: string, ref: Extract<VoiceTutorRef, { kind: "PRACTICE" }>, base: VoiceTutorScreen): Promise<TutorContext | null> {
  const general = generalContext({ ...base, surface: "PRACTICE" });
  const session = await db.learningSession.findUnique({ where: { id: ref.sessionId }, select: { studentId: true, sessionMode: true, status: true } });
  if (!session || session.studentId !== studentId || session.status !== "ACTIVE") return null;
  if (session.sessionMode === "BASELINE") return { ...general, paused: BASELINE_PAUSE };
  const q = await db.question.findUnique({
    where: { id_version: { id: ref.questionId, version: ref.questionVersion } },
    select: { stem: true, options: true, hintLadder: true, acceptedAnswers: true },
  });
  if (!q) return null;
  const [answered, delivery, hintEvents] = await Promise.all([
    db.attempt.findFirst({ where: { studentId, sessionId: ref.sessionId, questionId: ref.questionId, questionVersion: ref.questionVersion }, select: { id: true } }),
    db.rawEvent.findUnique({ where: { eventId: `current-delivery-${ref.sessionId}` } }),
    db.rawEvent.findMany({ where: { studentId, sessionId: ref.sessionId, eventType: "HINT_REQUESTED" }, select: { payload: true } }),
  ]);
  const current = currentQuestion(delivery?.payload);
  const isCurrent = current?.id === ref.questionId && current.version === ref.questionVersion;
  if (!answered && !isCurrent) return null;
  const levels = hintEvents
    .map((e) => (e.payload && typeof e.payload === "object" ? (e.payload as Record<string, unknown>) : {}))
    .filter((p) => p.questionId === ref.questionId && Number(p.questionVersion) === ref.questionVersion)
    .map((p) => Number(p.hintLevel) || 1);
  const highest = levels.length ? Math.max(...levels) : 0;
  const issued = strings(q.hintLadder).slice(0, highest);
  const answers = strings(q.acceptedAnswers);
  const options = strings(q.options);
  return {
    screen: {
      ...general.screen,
      question: q.stem,
      options: options.length ? options : undefined,
      approvedHints: safeHints(issued, q.stem, answers),
      helpOnQuestion: true,
    },
    facts: { grounded: [q.stem, ...options, ...issued], answers, question: q.stem },
    // An answered question has nothing left to record; the current one counts as helped from now on.
    record: answered ? undefined : [{ studentId, sessionId: ref.sessionId, questionId: ref.questionId, questionVersion: ref.questionVersion }],
  };
}

/** A lesson run with a check waiting for the student's own answer, from its latest saved state. */
function openLessonCheck(events: Array<{ sessionId?: string | null; payload: unknown }>): boolean {
  const latest = new Map<string, { revision: number; stage: string; workflow: string; itemId: unknown }>();
  for (const event of events) {
    const state = (event.payload as { state?: { revision?: unknown; stage?: unknown; workflow?: unknown; itemId?: unknown } } | null)?.state;
    if (!event.sessionId || !state || !Number.isInteger(state.revision) || typeof state.stage !== "string") continue;
    const seen = latest.get(event.sessionId);
    if (!seen || seen.revision < Number(state.revision)) {
      latest.set(event.sessionId, { revision: Number(state.revision), stage: state.stage, workflow: String(state.workflow), itemId: state.itemId });
    }
  }
  return [...latest.values()].some((s) => s.workflow === "ACTIVE" && !!s.itemId && !TUTOR_HELP_STAGES.has(s.stage));
}

/**
 * General talk (no place named, or one that didn't check out). It must not become a helper nobody
 * records: it pauses while a baseline, a Lotus check-in or a lesson check is open, and a running
 * practice session's open question counts as helped, even though the tutor can't see that question.
 */
export async function generalMode(db: TutorRecords, studentId: string, base: VoiceTutorScreen, now = Date.now()): Promise<TutorContext> {
  const general = generalContext(base);
  const since = new Date(now - OPEN_WORK_WINDOW_MS);
  const [sessions, lotus, lessonEvents] = await Promise.all([
    db.learningSession.findMany({
      where: { studentId, status: "ACTIVE", startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, sessionMode: true },
    }),
    db.lotusSessionRecord.findFirst({ where: { studentId, status: "ACTIVE", updatedAt: { gte: since } }, select: { id: true } }),
    db.rawEvent.findMany({
      where: { studentId, eventType: { startsWith: "MODULE_" }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { sessionId: true, payload: true },
    }),
  ]);
  if (sessions.some((s) => s.sessionMode === "BASELINE")) return { ...general, paused: OPEN_BASELINE_PAUSE };
  if (lotus) return { ...general, paused: OPEN_LOTUS_PAUSE };
  if (openLessonCheck(lessonEvents)) return { ...general, paused: OPEN_LESSON_CHECK_PAUSE };
  const record: TutorHelpKey[] = [];
  for (const session of sessions.slice(0, OPEN_PRACTICE_SESSIONS)) {
    const delivery = await db.rawEvent.findUnique({ where: { eventId: `current-delivery-${session.id}` } });
    const open = currentQuestion(delivery?.payload);
    if (!open) continue;
    const answered = await db.attempt.findFirst({ where: { studentId, sessionId: session.id, questionId: open.id, questionVersion: open.version }, select: { id: true } });
    if (!answered) record.push({ studentId, sessionId: session.id, questionId: open.id, questionVersion: open.version });
  }
  return record.length ? { ...general, record } : general;
}

export async function moduleContext(runs: TutorRuns, actor: AccessActor, ref: Extract<VoiceTutorRef, { kind: "MODULE" }>, base: VoiceTutorScreen): Promise<TutorContext> {
  const general = generalContext({ ...base, surface: "LESSON" });
  const view = await runs.getRun(actor, ref.runId); // checks the run is this student's
  const slides = view.asset?.staticSlides ?? [];
  const steps = slides.map((s) => `${s.title}. ${s.explanation}${s.equations.length ? ` (${s.equations.join("; ")})` : ""}`);
  const screen: VoiceTutorScreen = { ...general.screen, steps: steps.length ? steps : undefined };
  const grounded = [...steps];
  if (view.state.workflow !== "ACTIVE" || view.state.paused || view.state.teacherPaused || !view.question) {
    return { screen, facts: { grounded, answers: [] } };
  }
  const item = moduleItemForTutor(view.question.id);
  if (!item) return { screen, facts: { grounded, answers: [] } };
  const facts: MathsFacts = { grounded: [...grounded, item.prompt, item.expression ?? "", ...(item.options ?? [])], answers: [item.canonicalAnswer], question: item.prompt };
  if (view.question.independent || !TUTOR_HELP_STAGES.has(view.state.stage)) return { screen, facts, paused: CHECK_PAUSE };
  return {
    screen: { ...screen, question: item.prompt, options: item.options ?? undefined, approvedHints: safeHints(item.hints, item.prompt, [item.canonicalAnswer]), helpOnQuestion: true },
    facts: { ...facts, grounded: [...facts.grounded, ...safeHints(item.hints, item.prompt, [item.canonicalAnswer])] },
  };
}
