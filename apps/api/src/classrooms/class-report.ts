/**
 * Class results for the pilot teacher console, from stored evidence only.
 *
 * Pure: the service loads the rows (assignments, Lotus records, lessons and
 * their events) and this turns them into what the teacher reads — where each
 * student is, the class's gaps grouped by starting point, a skill map, and
 * progress from diagnostic to independent exit. Diagnostic, practice and exit
 * evidence stay separate: practice is never counted as progress.
 */

export type Stage = "JOINED" | "DIAGNOSTIC" | "LESSON" | "EXIT" | "DONE";
export type Progress = "IMPROVED" | "NOT_YET" | "NO_GAP" | "UNCLEAR" | "PENDING";

export interface StudentEvidence {
  studentId: string;
  name: string;
  rollNumber?: string | null;
  assignments: Array<{ kind: "DIAGNOSTIC" | "TEACHING" | "INDEPENDENT_EXIT"; status: string; startedAt?: Date | null; completedAt?: Date | null }>;
  diagnostic?: {
    outcome?: string;
    startingSkillId?: string;
    skills: Array<{ skillId: string; name: string; state: string }>;
    answered: number;
    correct: number;
    minutes?: number | null;
    endedNote?: string;
  } | null;
  lesson?: {
    title?: string;
    status?: string;
    authoredBy?: "AI" | "RECIPE";
    practice?: { attempted: number; correct: number; total: number };
  } | null;
  exit?: { prompt?: string | null; correct?: boolean | null; items?: Array<{ prompt: string | null; correct: boolean | null }> } | null;
  /** The student's last action in this check: an answer, a lesson step, or opening a step. */
  lastActiveAt?: Date | null;
  /** The Lotus test is finished, but its class step is not marked done yet. */
  testFinished?: boolean;
  /** Answers so far in a diagnostic still being taken. */
  answeredSoFar?: number;
}

/**
 * What the teacher sees about a student mid-step: working, gone quiet
 * (no action for a while, maybe stuck or offline), or finished with the
 * result still being filed.
 */
export interface Activity {
  state: "WORKING" | "IDLE" | "FILING";
  lastActiveAt: string | null;
  /** Whole minutes since the last action. */
  quietMinutes: number | null;
  /** Minutes without an action before this step reads as gone quiet, so a page can keep the count current itself. */
  quietAfterMinutes: number;
  answeredSoFar?: number;
}

/** Minutes without an action before a student in a step reads as gone quiet. A lesson has a video to watch, so it gets longer. */
export const QUIET_MINUTES: Record<"DIAGNOSTIC" | "LESSON" | "EXIT", number> = { DIAGNOSTIC: 3, LESSON: 8, EXIT: 4 };

export interface StudentRow {
  studentId: string;
  name: string;
  rollNumber?: string | null;
  stage: Stage;
  stageStatus: string;
  outcome?: string;
  startingPoint?: { skillId: string; name: string };
  answered?: number;
  correct?: number;
  minutes?: number | null;
  endedNote?: string;
  lesson?: StudentEvidence["lesson"];
  exitCorrect?: boolean | null;
  /** The independent questions answered alone after teaching, and how many were right. */
  exitScore?: { right: number; total: number };
  progress: Progress;
  /** This student's skill states from the check (for growth between checks). */
  skills?: Array<{ skillId: string; name: string; state: string }>;
  /** Only while a step is in progress, or a finished test is being filed. */
  activity?: Activity;
}

export interface ClassReport {
  totals: {
    enrolled: number;
    diagnosticDone: number;
    gapFound: number;
    noGap: number;
    unclear: number;
    lessonDone: number;
    exitDone: number;
    improved: number;
  };
  /** "Need a bridge in X": students grouped by their starting point, largest group first. */
  gapGroups: Array<{ skillId: string; name: string; students: string[]; exitCorrect: number; exitDone: number }>;
  /** Per skill: how many students were secure, had it as a gap, or were suspected. */
  skills: Array<{ skillId: string; name: string; secure: number; gap: number; suspected: number }>;
  headline: string;
  students: StudentRow[];
}

const KIND_STAGE = { DIAGNOSTIC: "DIAGNOSTIC", TEACHING: "LESSON", INDEPENDENT_EXIT: "EXIT" } as const;
const ORDER = ["DIAGNOSTIC", "TEACHING", "INDEPENDENT_EXIT"] as const;

function stageOf(s: StudentEvidence): { stage: Stage; status: string } {
  // The furthest stage this student has, and its status.
  for (const kind of [...ORDER].reverse()) {
    const row = s.assignments.find((a) => a.kind === kind);
    if (!row) continue;
    if (kind === "INDEPENDENT_EXIT" && row.status === "COMPLETE") return { stage: "DONE", status: "COMPLETE" };
    if (row.status === "SKIPPED") return { stage: "DONE", status: "SKIPPED" };
    return { stage: KIND_STAGE[kind], status: row.status };
  }
  return { stage: "JOINED", status: "WAITING" };
}

function activityOf(s: StudentEvidence, stage: Stage, status: string, now: Date): Activity | undefined {
  if (stage !== "DIAGNOSTIC" && stage !== "LESSON" && stage !== "EXIT") return undefined;
  const lastActiveAt = s.lastActiveAt ? s.lastActiveAt.toISOString() : null;
  const quietMinutes = s.lastActiveAt ? Math.max(0, Math.floor((now.getTime() - s.lastActiveAt.getTime()) / 60_000)) : null;
  const answered = stage === "DIAGNOSTIC" && s.answeredSoFar !== undefined ? { answeredSoFar: s.answeredSoFar } : {};
  const quietAfterMinutes = QUIET_MINUTES[stage];
  if (stage === "DIAGNOSTIC" && status !== "COMPLETE" && s.testFinished) return { state: "FILING", lastActiveAt, quietMinutes, quietAfterMinutes, ...answered };
  if (status !== "IN_PROGRESS") return undefined;
  const quiet = quietMinutes !== null && quietMinutes >= quietAfterMinutes;
  return { state: quiet ? "IDLE" : "WORKING", lastActiveAt, quietMinutes, quietAfterMinutes, ...answered };
}

function progressOf(s: StudentEvidence): Progress {
  const outcome = s.diagnostic?.outcome;
  if (!outcome) return "PENDING";
  if (outcome === "ADVANCEMENT") return "NO_GAP";
  if (outcome !== "SOLID_GAP") return "UNCLEAR";
  if (s.exit?.correct === true) return "IMPROVED";
  if (s.exit?.correct === false) return "NOT_YET";
  return "PENDING";
}

export function buildClassReport(students: StudentEvidence[], now: Date = new Date()): ClassReport {
  const rows: StudentRow[] = students.map((s) => {
    const { stage, status } = stageOf(s);
    const activity = activityOf(s, stage, status, now);
    const start = s.diagnostic?.startingSkillId
      ? { skillId: s.diagnostic.startingSkillId, name: s.diagnostic.skills.find((k) => k.skillId === s.diagnostic!.startingSkillId)?.name ?? s.diagnostic.startingSkillId }
      : undefined;
    return {
      studentId: s.studentId,
      name: s.name,
      rollNumber: s.rollNumber,
      stage,
      stageStatus: status,
      outcome: s.diagnostic?.outcome,
      startingPoint: start,
      answered: s.diagnostic?.answered,
      correct: s.diagnostic?.correct,
      minutes: s.diagnostic?.minutes,
      endedNote: s.diagnostic?.endedNote,
      lesson: s.lesson ?? undefined,
      exitCorrect: s.exit?.correct ?? null,
      ...(s.exit?.items?.length ? { exitScore: { right: s.exit.items.filter((i) => i.correct === true).length, total: s.exit.items.length } } : {}),
      progress: progressOf(s),
      skills: s.diagnostic?.skills ?? [],
      ...(activity ? { activity } : {}),
    };
  });

  const groups = new Map<string, ClassReport["gapGroups"][number]>();
  for (const row of rows) {
    if (row.outcome !== "SOLID_GAP" || !row.startingPoint) continue;
    const g = groups.get(row.startingPoint.skillId) ?? { skillId: row.startingPoint.skillId, name: row.startingPoint.name, students: [], exitCorrect: 0, exitDone: 0 };
    g.students.push(row.name);
    if (row.exitCorrect !== null && row.exitCorrect !== undefined) {
      g.exitDone += 1;
      if (row.exitCorrect) g.exitCorrect += 1;
    }
    groups.set(g.skillId, g);
  }
  const gapGroups = [...groups.values()].sort((a, b) => b.students.length - a.students.length || a.name.localeCompare(b.name));

  const skillMap = new Map<string, ClassReport["skills"][number]>();
  for (const s of students) {
    for (const k of s.diagnostic?.skills ?? []) {
      const e = skillMap.get(k.skillId) ?? { skillId: k.skillId, name: k.name, secure: 0, gap: 0, suspected: 0 };
      if (k.state === "SECURE") e.secure += 1;
      else if (k.state === "CONFIRMED") e.gap += 1;
      else if (k.state === "SUSPECTED") e.suspected += 1;
      skillMap.set(k.skillId, e);
    }
  }
  const skills = [...skillMap.values()].sort((a, b) => b.gap - a.gap || b.suspected - a.suspected || a.name.localeCompare(b.name));

  const done = (kind: StudentEvidence["assignments"][number]["kind"]) =>
    students.filter((s) => s.assignments.some((a) => a.kind === kind && a.status === "COMPLETE")).length;
  const totals = {
    enrolled: students.length,
    diagnosticDone: done("DIAGNOSTIC"),
    gapFound: rows.filter((r) => r.outcome === "SOLID_GAP").length,
    noGap: rows.filter((r) => r.outcome === "ADVANCEMENT").length,
    unclear: rows.filter((r) => r.outcome && r.outcome !== "SOLID_GAP" && r.outcome !== "ADVANCEMENT").length,
    lessonDone: done("TEACHING"),
    // Counted from the answer itself, like "improved", so the two always agree.
    exitDone: Math.max(done("INDEPENDENT_EXIT"), rows.filter((r) => r.exitCorrect !== null && r.exitCorrect !== undefined).length),
    improved: rows.filter((r) => r.progress === "IMPROVED").length,
  };

  const top = gapGroups[0];
  const headline = !totals.diagnosticDone
    ? totals.enrolled ? `${totals.enrolled} student${totals.enrolled === 1 ? "" : "s"} in class. Results appear as each one finishes the quick check.` : "Waiting for students to join."
    : top && top.students.length > 1
      ? `Most common need: ${top.name.toLowerCase()} (${top.students.length} of the ${totals.diagnosticDone} who finished).`
      : top
        ? `${gapGroups.length} different need${gapGroups.length === 1 ? "" : "s"} among the ${totals.diagnosticDone} who finished: each student gets their own lesson.`
      : `${totals.diagnosticDone} finished. No shared need so far.`;

  return { totals, gapGroups, skills, headline, students: rows };
}
