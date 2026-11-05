/**
 * Cogna's long-term memory of how a student thinks.
 *
 * A Lotus test builds a detailed picture of one student (each skill's state, the exact mistakes, the
 * student's own wrong answers, slips, "I don't know") and a lesson's final check shows whether teaching
 * worked. Until now that picture ended with the test. Here every finished test and every lesson final
 * check leaves rows in LearnerSkillEvidence, one per skill, and the student's current picture is folded
 * from all of their rows, so it never drifts from the evidence behind it.
 *
 * Read back by: the AI review of a new test (planningContext), the lesson brief, and the report.
 */
import type { PrismaClient } from "@cogna/database";
import { LOTUS_TOPIC_NAMES, isPlannedLotusTopic, type LotusLedgerPrior, type LotusQuestionAudit, type LotusSessionView, type LotusTopic } from "@cogna/shared";
import { depth, foldLedger } from "../lotus/lotus-factorisation";
import { dependsOnTransitively, skillName } from "../lotus/lotus-factorisation-catalogue";
import { mistakeInWords } from "../lotus/lotus-reasons";
import { tidyExpression } from "../personalized-videos/ai-authoring/lesson-brief";

export type EvidenceState = "GAP" | "SUSPECTED" | "SECURE" | "UNCLEAR" | "LESSON_PASSED" | "LESSON_FAILED" | "PROFILE";

/** One mistake, as the student made it. */
export interface MistakeSeen {
  code: string;
  question: string;
  answer: string;
  /** What code or the review said went wrong. */
  description?: string;
  /** The student's own one-tap "How did you get it?" answer, in their words. */
  studentSaid?: string;
}

export interface EvidenceRow {
  studentId: string;
  topic: string;
  skillId: string;
  source: "TEST" | "LESSON";
  sourceId: string;
  state: EvidenceState;
  mistakes: MistakeSeen[];
  detail: Record<string, unknown>;
  observedAt: Date;
}

/** The whole-student row's skill id. */
export const PROFILE_SKILL = "*";
const CONFIDENT = 75;
const UNSURE = 50;

const tidy = (text: string | undefined, max = 140) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function studentSaid(audit: LotusQuestionAudit): string | undefined {
  const chosen = audit.reasonCheck?.chosenId;
  return chosen ? audit.reasonCheck!.options.find((option) => option.id === chosen)?.text : undefined;
}

/**
 * What a finished test showed, as rows: one per skill the test learned something about, and one
 * PROFILE row for the student as a whole. Pure, so a re-saved report (a late review) replaces its rows.
 */
export function testEvidence(session: LotusSessionView): EvidenceRow[] {
  if (session.status !== "COMPLETE" || !session.finalReport || !isPlannedLotusTopic(session.topic)) return [];
  const answered = session.audits.filter((a) => a.response);
  if (!answered.length) return [];
  const observedAt = new Date(answered.at(-1)!.createdAt ?? session.startedAt);
  const base = { studentId: session.studentId, topic: session.topic!, source: "TEST" as const, sourceId: session.sessionId, observedAt };
  const ledger = foldLedger(session.audits, session.priors);
  const rows: EvidenceRow[] = [];

  const onSkill = (skillId: string) => answered.filter((a) => a.question.answerKey?.diagnostics?.skillId === skillId || (a.skillEvidence ?? []).some((e) => e.skillId === skillId));
  for (const entry of ledger.values()) {
    const state: EvidenceState | null = entry.state === "CONFIRMED" ? (entry.tiredness ? "SUSPECTED" : "GAP")
      : entry.state === "SUSPECTED" ? "SUSPECTED"
        : entry.state === "SECURE" ? "SECURE"
          : (entry.unexplained ?? 0) > 0 ? "UNCLEAR" : null;
    if (!state) continue;
    const mistakes: MistakeSeen[] = [];
    for (const audit of onSkill(entry.skillId)) {
      for (const ev of audit.skillEvidence ?? []) {
        if (ev.skillId !== entry.skillId || ev.kind === "SECURE" || !ev.mistake) continue;
        mistakes.push({
          code: ev.mistake,
          // The expression as the student read it (no "+ 7932 - 7932" uniqueness padding), else the question itself.
          question: tidy(audit.question.answerKey?.diagnostics?.expression ? tidyExpression(audit.question.answerKey.diagnostics.expression) : audit.question.prompt, 100).replace(/[.?]+$/, ""),
          answer: tidy(audit.response!.answer, 80),
          ...(tidy(audit.conclusion?.mistakeDescription || ev.description) ? { description: tidy(audit.conclusion?.mistakeDescription || ev.description, 200) } : {}),
          ...(studentSaid(audit) ? { studentSaid: studentSaid(audit) } : {}),
        });
      }
    }
    const slips = onSkill(entry.skillId).filter((a) => a.conclusion?.mistakeKind === "SLIP").length + (entry.clearedAfterSlip ? 1 : 0);
    rows.push({
      ...base,
      skillId: entry.skillId,
      state,
      mistakes,
      detail: {
        ...(slips ? { slips } : {}),
        ...(entry.supportCount ? { saidDidNotKnow: entry.supportCount } : {}),
        ...(entry.clearedAfterSlip ? { earlierMistakeLookedLikeSlip: true } : {}),
        ...(entry.tiredness ? { maybeTired: true } : {}),
        ...(entry.rightSinceConfirmed?.length ? { rightAfterGap: entry.rightSinceConfirmed.length } : {}),
      },
    });
  }

  const wrong = (a: LotusQuestionAudit) => a.verification?.status === "VERIFIED_INCORRECT" || a.verification?.status === "VERIFIED_UNFINISHED";
  const right = (a: LotusQuestionAudit) => a.verification?.status === "VERIFIED_CORRECT";
  rows.push({
    ...base,
    skillId: PROFILE_SKILL,
    state: "PROFILE",
    mistakes: [],
    detail: {
      answered: answered.length,
      right: answered.filter(right).length,
      slips: answered.filter((a) => a.conclusion?.mistakeKind === "SLIP").length + [...ledger.values()].filter((e) => e.clearedAfterSlip).length,
      guesses: answered.filter((a) => a.conclusion?.mistakeKind === "GUESS").length,
      saidDidNotKnow: answered.filter((a) => a.response!.didNotKnow).length,
      // Confidence the answer doesn't bear out, either way: how well the student knows what they know.
      confidentButWrong: answered.filter((a) => wrong(a) && (a.response!.confidence ?? 0) >= CONFIDENT).length,
      unsureButRight: answered.filter((a) => right(a) && (a.response!.confidence ?? 100) < UNSURE).length,
      outcome: session.finalReport.outcome,
    },
  });
  return rows;
}

/** What a lesson's main final check showed, as a row against the skill the lesson taught. Null if the lesson isn't tied to one. */
export function lessonEvidence(input: {
  studentId: string;
  assignmentId: string;
  /** The lesson's brief: its chapter name ("Factorisation") and target skill. */
  taught?: { topic: string; targetSkill: { id: string } } | null;
  format?: string;
  exitPrompt?: string;
  answer: string;
  correct: boolean;
  at: Date;
}): EvidenceRow | null {
  const topic = input.taught && (Object.keys(LOTUS_TOPIC_NAMES) as LotusTopic[]).find((key) => LOTUS_TOPIC_NAMES[key] === input.taught!.topic);
  if (!input.taught || !topic) return null;
  return {
    studentId: input.studentId, topic, skillId: input.taught.targetSkill.id, source: "LESSON", sourceId: input.assignmentId,
    state: input.correct ? "LESSON_PASSED" : "LESSON_FAILED", mistakes: [],
    detail: { format: input.format ?? "VIDEO", exitPrompt: input.exitPrompt ?? "", answer: input.answer },
    observedAt: input.at,
  };
}

// ---------- the student's current picture ----------

export type SkillStatus = "GAP" | "SUSPECTED" | "UNCLEAR" | "SECURE" | "FIXED" | "TAUGHT" | "TAUGHT_NOT_YET";

export interface SkillMemory {
  skillId: string;
  name: string;
  /**
   * GAP/SUSPECTED/UNCLEAR/SECURE: what the latest test said. FIXED: secure now, but a gap or a lesson
   * before. TAUGHT / TAUGHT_NOT_YET: a lesson since the latest test, its final check right / wrong.
   */
  status: SkillStatus;
  tests: number;
  gapTests: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Every mistake ever seen on the skill, most frequent first, with the latest example in the student's own answer. */
  mistakes: Array<{ code: string; inWords?: string; times: number; sources: number; lastSeenAt: string; example: MistakeSeen }>;
  /** Mistakes seen in two or more tests or lessons: a held way of thinking, not a one-off. */
  recurring: string[];
  slips: number;
  lessons: Array<{ at: string; passed: boolean; format?: string }>;
}

export interface LearnerProfile {
  tests: number;
  answered: number;
  /** Of wrong answers, how many were slips: high means careless, not confused. */
  slipShare: number;
  saidDidNotKnow: number;
  confidentButWrong: number;
  unsureButRight: number;
}

export interface LearnerModel {
  studentId: string;
  skills: SkillMemory[];
  profile: LearnerProfile | null;
}

type StoredRow = Pick<EvidenceRow, "skillId" | "source" | "sourceId" | "state" | "detail"> & { mistakes: unknown; observedAt: Date | string; studentId?: string };

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();

export function foldLearnerModel(studentId: string, stored: StoredRow[]): LearnerModel {
  const rows = [...stored].sort((a, b) => iso(a.observedAt).localeCompare(iso(b.observedAt)));
  const skills: SkillMemory[] = [];
  for (const skillId of [...new Set(rows.map((r) => r.skillId))].filter((id) => id !== PROFILE_SKILL)) {
    const mine = rows.filter((r) => r.skillId === skillId);
    const tests = mine.filter((r) => r.source === "TEST");
    const lessons = mine.filter((r) => r.source === "LESSON");
    const latestTest = tests.at(-1);
    const latestLesson = lessons.at(-1);
    let status: SkillStatus;
    if (latestLesson && (!latestTest || iso(latestLesson.observedAt) > iso(latestTest.observedAt))) {
      status = latestLesson.state === "LESSON_PASSED" ? "TAUGHT" : "TAUGHT_NOT_YET";
    } else {
      const s = latestTest!.state;
      const hadTrouble = mine.some((r) => r !== latestTest && (r.state === "GAP" || r.source === "LESSON"));
      status = s === "SECURE" ? (hadTrouble ? "FIXED" : "SECURE") : s === "GAP" ? "GAP" : s === "SUSPECTED" ? "SUSPECTED" : "UNCLEAR";
    }
    const byCode = new Map<string, SkillMemory["mistakes"][number] & { sourceIds: Set<string> }>();
    for (const row of mine) {
      for (const m of (Array.isArray(row.mistakes) ? row.mistakes : []) as MistakeSeen[]) {
        const seen = byCode.get(m.code) ?? { code: m.code, inWords: mistakeInWords(m.code), times: 0, sources: 0, lastSeenAt: iso(row.observedAt), example: m, sourceIds: new Set<string>() };
        seen.times += 1;
        seen.sourceIds.add(row.sourceId);
        seen.sources = seen.sourceIds.size;
        seen.lastSeenAt = iso(row.observedAt);
        seen.example = m;
        byCode.set(m.code, seen);
      }
    }
    const mistakes = [...byCode.values()].sort((a, b) => b.times - a.times).map(({ sourceIds: _s, ...m }) => (m.inWords ? m : (({ inWords: _i, ...rest }) => rest)(m)));
    skills.push({
      skillId,
      name: skillName(skillId),
      status,
      tests: tests.length,
      gapTests: tests.filter((r) => r.state === "GAP").length,
      firstSeenAt: iso(mine[0]!.observedAt),
      lastSeenAt: iso(mine.at(-1)!.observedAt),
      mistakes,
      recurring: mistakes.filter((m) => m.sources >= 2).map((m) => m.code),
      slips: mine.reduce((n, r) => n + (Number((r.detail as Record<string, unknown>)?.slips) || 0), 0),
      lessons: lessons.map((r) => ({ at: iso(r.observedAt), passed: r.state === "LESSON_PASSED", ...(typeof (r.detail as Record<string, unknown>)?.format === "string" ? { format: (r.detail as Record<string, string>).format } : {}) })),
    });
  }
  const profiles = rows.filter((r) => r.skillId === PROFILE_SKILL).map((r) => r.detail as Record<string, number>);
  const sum = (key: string) => profiles.reduce((n, p) => n + (Number(p[key]) || 0), 0);
  const wrongs = sum("answered") - sum("right");
  return {
    studentId,
    skills,
    profile: profiles.length ? {
      tests: profiles.length,
      answered: sum("answered"),
      slipShare: wrongs > 0 ? Math.round((sum("slips") / wrongs) * 100) / 100 : 0,
      saidDidNotKnow: sum("saidDidNotKnow"),
      confidentButWrong: sum("confidentButWrong"),
      unsureButRight: sum("unsureButRight"),
    } : null,
  };
}

/**
 * What a new test should re-check first: each skill an earlier test left as a gap or a suspicion, or a
 * lesson taught since without a test checking it. Secure, fixed and unclear skills carry nothing in.
 * LOTUS_MEMORY_PRIORS=off turns this off (tests then start from nothing, as before).
 */
export function priorsFromMemory(model: LearnerModel, env: NodeJS.ProcessEnv = process.env): LotusLedgerPrior[] {
  if ((env.LOTUS_MEMORY_PRIORS ?? "on").toLowerCase() === "off") return [];
  const day = (at: string) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const all = model.skills.flatMap((s): LotusLedgerPrior[] => {
    const mistakes = s.mistakes.slice(0, 2).map((m) => m.code);
    if (s.status === "TAUGHT") return [{ skillId: s.skillId, reason: "TAUGHT", mistakes, note: `taught on ${day(s.lessons.at(-1)!.at)}; checking it stuck` }];
    if (s.status === "GAP" || s.status === "SUSPECTED" || s.status === "TAUGHT_NOT_YET") {
      const what = s.status === "GAP" ? "a gap" : s.status === "SUSPECTED" ? "shaky" : "still wrong after a lesson";
      return [{ skillId: s.skillId, reason: "GAP", mistakes, note: `${what} on ${day(s.lastSeenAt)}${mistakes[0] && mistakeInWords(mistakes[0]) ? ` (${mistakeInWords(mistakes[0])})` : ""}` }];
    }
    return [];
  });
  // Carry the causes, not their symptoms: a skill built on another open skill went wrong because of it,
  // and a test can only settle a few suspicions. Deepest first, at most MAX_PRIORS (each costs a question).
  const roots = all.filter((p) => !all.some((o) => o.skillId !== p.skillId && dependsOnTransitively(p.skillId, o.skillId)));
  return roots.sort((a, b) => depth(a.skillId) - depth(b.skillId)).slice(0, MAX_PRIORS);
}

/** Most suspicions one test carries in from earlier ones. */
const MAX_PRIORS = 3;

/** What's worth knowing from earlier tests and lessons, as short lines for a teacher, a report or the AI review. */
export function memoryLines(model: LearnerModel, opts: { only?: string[]; beforeSourceId?: string } = {}): string[] {
  const day = (at: string) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const lines: string[] = [];
  for (const s of model.skills) {
    if (opts.only && !opts.only.includes(s.skillId)) continue;
    for (const m of s.mistakes.filter((x) => s.recurring.includes(x.code))) {
      lines.push(`${s.name}: the same mistake in ${m.sources} tests or lessons${m.inWords ? ` (${m.inWords})` : ""}, most recently ${day(m.lastSeenAt)}, e.g. wrote ${m.example.answer} for ${m.example.question}.`);
    }
    if (s.status === "FIXED") lines.push(`${s.name}: had trouble before, secure since ${day(s.lastSeenAt)}.`);
    const lesson = s.lessons.at(-1);
    if (s.status === "TAUGHT_NOT_YET" && lesson) lines.push(`${s.name}: taught on ${day(lesson.at)}${lesson.format ? ` (${lesson.format.toLowerCase()} lesson)` : ""}, but the final check was still wrong.`);
    if (s.status === "TAUGHT" && lesson) lines.push(`${s.name}: taught on ${day(lesson.at)} and the final check was right; not yet re-checked in a test.`);
    // Teaching that didn't stick: the next lesson must try another way.
    if ((s.status === "GAP" || s.status === "SUSPECTED") && lesson) {
      lines.push(`${s.name}: taught on ${day(lesson.at)}${lesson.format ? ` (${lesson.format.toLowerCase()} lesson)` : ""}, but still ${s.status === "GAP" ? "a gap" : "shaky"} in a later test.`);
    }
  }
  for (let i = 0; i < lines.length; i += 1) lines[i] = lines[i]!.replace(/\^2/g, "²").replace(/\^3/g, "³");
  const p = model.profile;
  if (p && p.tests >= 1 && p.slipShare >= 0.4) lines.push(`Across ${p.tests} test${p.tests === 1 ? "" : "s"}, many wrong answers were slips: careless rather than confused.`);
  if (p && p.confidentButWrong >= 3) lines.push(`Often sure of answers that turn out wrong (${p.confidentButWrong} times so far).`);
  return lines;
}

// ---------- the database ----------

type EvidenceDb = Pick<PrismaClient, "learnerSkillEvidence">;

/** Replaces the rows a source left before (a late review re-saves the report) with what it shows now. */
export async function writeEvidence(db: EvidenceDb, rows: EvidenceRow[]): Promise<void> {
  if (!rows.length) return;
  const { source, sourceId } = rows[0]!;
  await db.learnerSkillEvidence.deleteMany({ where: { source, sourceId, skillId: { notIn: rows.map((r) => r.skillId) } } });
  for (const row of rows) {
    const data = { studentId: row.studentId, topic: row.topic, state: row.state, mistakes: row.mistakes as object[], detail: row.detail as object, observedAt: row.observedAt };
    await db.learnerSkillEvidence.upsert({
      where: { source_sourceId_skillId: { source: row.source, sourceId: row.sourceId, skillId: row.skillId } },
      create: { ...data, skillId: row.skillId, source: row.source, sourceId: row.sourceId },
      update: data,
    });
  }
}

export async function loadLearnerModel(db: EvidenceDb, studentId: string, topic?: string): Promise<LearnerModel> {
  const rows = await db.learnerSkillEvidence.findMany({ where: { studentId, ...(topic ? { topic } : {}) }, orderBy: { observedAt: "asc" } });
  return foldLearnerModel(studentId, rows as unknown as StoredRow[]);
}

/**
 * Fills the memory from everything already saved: every finished test, and every lesson's main final
 * check. Safe to run again: each source replaces its own rows.
 */
export async function backfillLearnerMemory(
  db: Pick<PrismaClient, "learnerSkillEvidence" | "lotusSessionRecord" | "personalizedVideoEvent">,
  log: (line: string) => void = () => undefined,
): Promise<{ tests: number; lessons: number; rows: number; skipped: number }> {
  let tests = 0, lessons = 0, rows = 0, skipped = 0;
  // A test or lesson whose student no longer exists (deleted, or a demo id with no record) is passed over.
  const write = async (evidence: EvidenceRow[]) => {
    try { await writeEvidence(db, evidence); return true; } catch (error) {
      if ((error as { code?: string }).code !== "P2003") throw error;
      skipped += 1;
      return false;
    }
  };
  for (let cursor: string | undefined; ;) {
    const page = await db.lotusSessionRecord.findMany({ where: { status: "COMPLETE" }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), select: { id: true, payload: true } });
    for (const record of page) {
      const evidence = testEvidence(record.payload as unknown as LotusSessionView);
      if (!evidence.length || !(await write(evidence))) continue;
      tests += 1; rows += evidence.length;
    }
    if (page.length < 100) break;
    cursor = page.at(-1)!.id;
  }
  const exits = await db.personalizedVideoEvent.findMany({
    where: { kind: "INDEPENDENT_EXIT", OR: [{ exitItem: 0 }, { exitItem: null }] },
    orderBy: { createdAt: "asc" },
    select: { studentId: true, assignmentId: true, exitPrompt: true, exitAnswer: true, exitCorrect: true, createdAt: true, assignment: { select: { script: true } } },
  });
  for (const exit of exits) {
    const script = exit.assignment.script as { authoring?: { brief?: { topic: string; targetSkill: { id: string } } }; micro?: { brief?: { topic: string; targetSkill: { id: string } } }; format?: string } | null;
    const row = lessonEvidence({
      studentId: exit.studentId, assignmentId: exit.assignmentId, taught: script?.authoring?.brief ?? script?.micro?.brief,
      format: script?.format, exitPrompt: exit.exitPrompt ?? undefined, answer: exit.exitAnswer ?? "", correct: exit.exitCorrect === true, at: exit.createdAt,
    });
    if (!row || !(await write([row]))) continue;
    lessons += 1; rows += 1;
  }
  log(`Learner memory: ${tests} tests and ${lessons} lessons, ${rows} rows${skipped ? `; ${skipped} skipped (student no longer exists)` : ""}.`);
  return { tests, lessons, rows, skipped };
}
