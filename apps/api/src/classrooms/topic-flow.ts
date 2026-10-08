/**
 * The topic flow, from stored check results only:
 * diagnostic → teach → topic check → catch-up for anyone still stuck → move on.
 *
 * Pure: the service loads each check's class rows (class-report.ts) and this
 * turns them into where every student stands on the topic, what the teacher
 * should do next, and how a student grew between their first and latest check.
 */
import type { StudentRow } from "./class-report";

export type CheckKind = "DIAGNOSTIC" | "TOPIC_CHECK" | "CATCH_UP";
export const CHECK_KINDS: CheckKind[] = ["DIAGNOSTIC", "TOPIC_CHECK", "CATCH_UP"];
export const CHECK_LABEL: Record<CheckKind, string> = { DIAGNOSTIC: "Diagnostic", TOPIC_CHECK: "Topic check", CATCH_UP: "Catch-up" };

/** "Most of the class understood": the share that lets the teacher move on. */
export const MOVE_ON_SHARE = 0.8;

/** Checks made before kinds existed were diagnostics. */
export function checkKindOf(config: unknown): CheckKind {
  const kind = (config as { kind?: unknown } | null)?.kind;
  return CHECK_KINDS.includes(kind as CheckKind) ? (kind as CheckKind) : "DIAGNOSTIC";
}

/** A catch-up goes to named students only; null means the whole class. */
export function checkStudentIds(config: unknown): string[] | null {
  const ids = (config as { studentIds?: unknown } | null)?.studentIds;
  return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? ids : null;
}

export type TopicStatus = "UNDERSTOOD" | "STUCK" | "UNCLEAR" | "IN_PROGRESS" | "NOT_CHECKED";

export interface CheckRows {
  runId: string;
  kind: CheckKind;
  live: boolean;
  rows: StudentRow[];
}

/** What one check says about a student, or null when it says nothing (not given it, or it ended unstarted). */
export function rowStatus(row: StudentRow, live: boolean): Exclude<TopicStatus, "NOT_CHECKED"> | null {
  if (row.progress === "IMPROVED" || row.progress === "NO_GAP") return "UNDERSTOOD";
  if (row.progress === "NOT_YET") return "STUCK";
  if (row.progress === "UNCLEAR") return "UNCLEAR";
  // Not given it yet, or given but not opened: it says nothing yet.
  if (row.stage === "JOINED" || (row.stage === "DIAGNOSTIC" && row.stageStatus === "READY")) return null;
  if (row.outcome === "SOLID_GAP") return live && row.stage !== "DONE" ? "IN_PROGRESS" : "STUCK";
  return live && row.stage !== "DONE" ? "IN_PROGRESS" : null;
}

export interface TopicReadiness {
  students: Array<{ studentId: string; name: string; status: TopicStatus; need?: string }>;
  counts: Record<TopicStatus, number> & { enrolled: number };
  recommendation: { action: "DIAGNOSTIC" | "WAIT" | "TOPIC_CHECK" | "CATCH_UP" | "MOVE_ON"; text: string; studentIds?: string[] };
}

/** Where each enrolled student stands on a topic (their latest check wins), and the teacher's next move. */
export function topicReadiness(checks: CheckRows[], enrolled: Array<{ studentId: string; name: string }>, topic: string): TopicReadiness {
  const latest = new Map<string, { status: Exclude<TopicStatus, "NOT_CHECKED">; need?: string }>();
  for (const check of checks) {
    for (const row of check.rows) {
      const status = rowStatus(row, check.live);
      if (status) latest.set(row.studentId, { status, need: row.startingPoint?.name });
    }
  }
  const students = enrolled.map((s) => ({ ...s, ...(latest.get(s.studentId) ?? { status: "NOT_CHECKED" as const }) }));
  const counts = { UNDERSTOOD: 0, STUCK: 0, UNCLEAR: 0, IN_PROGRESS: 0, NOT_CHECKED: 0, enrolled: students.length };
  for (const s of students) counts[s.status] += 1;

  const live = checks.find((c) => c.live);
  const n = students.length;
  const lower = topic.toLowerCase();
  const recommendation: TopicReadiness["recommendation"] = (() => {
    if (!n) return { action: "WAIT", text: "Add students to the class first." };
    if (live) {
      // Same counts as the live view: who has finished the questions, and who is on their lesson after it.
      const given = live.rows.filter((r) => r.stage !== "JOINED");
      const answered = given.filter((r) => r.outcome).length;
      const learning = given.filter((r) => r.stage === "LESSON" || r.stage === "EXIT").length;
      return {
        action: "WAIT",
        text: `The ${CHECK_LABEL[live.kind].toLowerCase()} is running: ${answered} of ${given.length} finished the questions${learning ? `, ${learning} on their lesson now` : ""}.`,
      };
    }
    if (!checks.length) return { action: "DIAGNOSTIC", text: `Start with a diagnostic to see what everyone already knows about ${lower}.` };
    const stuck = students.filter((s) => s.status === "STUCK" || s.status === "UNCLEAR");
    if (counts.UNDERSTOOD >= Math.ceil(MOVE_ON_SHARE * n)) {
      return {
        action: "MOVE_ON",
        text: `${counts.UNDERSTOOD} of ${n} have understood ${lower}.${stuck.length ? ` ${stuck.length} still need help: send them a catch-up, then move on.` : " The class is ready to move on."}`,
        studentIds: stuck.map((s) => s.studentId),
      };
    }
    if (!checks.some((c) => c.kind === "TOPIC_CHECK")) {
      return { action: "TOPIC_CHECK", text: `${counts.UNDERSTOOD} of ${n} already know ${lower}. Teach it, then send the topic check to see who has understood.` };
    }
    if (stuck.length) {
      return { action: "CATCH_UP", text: `${stuck.length} ${stuck.length === 1 ? "is" : "are"} still stuck on ${lower}. Send them a catch-up: a few questions (up to 8) on just the skills each still has open, and a lesson if it's still a gap.`, studentIds: stuck.map((s) => s.studentId) };
    }
    return { action: "TOPIC_CHECK", text: `${counts.NOT_CHECKED} ${counts.NOT_CHECKED === 1 ? "hasn't" : "haven't"} done a check on ${lower} yet. Send the topic check, or move on.` };
  })();
  return { students, counts, recommendation };
}

export interface SkillSnapshot {
  date: Date;
  kind: CheckKind;
  skills: Array<{ skillId: string; name: string; state: string }>;
}

export interface TopicGrowth {
  checks: number;
  firstDate: Date;
  latestDate: Date;
  firstSecure: number;
  latestSecure: number;
  /** Skills that were a gap or unsure in the first check and secure in the latest. */
  fixed: string[];
  /** Skills still a confirmed gap in the latest check. */
  stillWorking: string[];
}

/**
 * How a student grew on a topic between their first finished check and now.
 * "Now" is each skill's most recent result across every check, because a
 * catch-up re-tests only a few skills: comparing it alone with a full
 * diagnostic would look like skills were lost.
 */
export function topicGrowth(snapshots: SkillSnapshot[]): TopicGrowth | null {
  const done = snapshots.filter((s) => s.skills.length).sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = done[0];
  const last = done.at(-1);
  if (!first || !last) return null;
  const tested = (state: string) => state === "SECURE" || state === "CONFIRMED" || state === "SUSPECTED";
  const now = new Map<string, { name: string; state: string }>();
  for (const snap of done) for (const k of snap.skills) if (tested(k.state)) now.set(k.skillId, { name: k.name, state: k.state });
  const firstState = new Map(first.skills.map((k) => [k.skillId, k.state]));
  const current = [...now.entries()];
  return {
    checks: done.length,
    firstDate: first.date,
    latestDate: last.date,
    firstSecure: first.skills.filter((k) => k.state === "SECURE").length,
    latestSecure: current.filter(([, k]) => k.state === "SECURE").length,
    fixed: done.length > 1 ? current.filter(([id, k]) => k.state === "SECURE" && ["CONFIRMED", "SUSPECTED"].includes(firstState.get(id) ?? "")).map(([, k]) => k.name) : [],
    stillWorking: current.filter(([, k]) => k.state === "CONFIRMED").map(([, k]) => k.name),
  };
}
