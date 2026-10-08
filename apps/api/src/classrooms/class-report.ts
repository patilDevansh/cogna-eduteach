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
}

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

function progressOf(s: StudentEvidence): Progress {
  const outcome = s.diagnostic?.outcome;
  if (!outcome) return "PENDING";
  if (outcome === "ADVANCEMENT") return "NO_GAP";
  if (outcome !== "SOLID_GAP") return "UNCLEAR";
  if (s.exit?.correct === true) return "IMPROVED";
  if (s.exit?.correct === false) return "NOT_YET";
  return "PENDING";
}

export function buildClassReport(students: StudentEvidence[]): ClassReport {
  const rows: StudentRow[] = students.map((s) => {
    const { stage, status } = stageOf(s);
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
