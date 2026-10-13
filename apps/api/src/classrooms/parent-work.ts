/**
 * What a parent sees first (docs/mvp-10.0/PARENT_DASHBOARD.md): has the work been
 * done, on time, and what's next, how long it takes and by when.
 *
 * One "task" is one class check for one student (diagnostic → lesson → final
 * check, or a catch-up). Pure: the service loads each check's steps for the
 * child, this decides the words' inputs. Only the child's own steps go in.
 */
import type { CheckKind } from "./topic-flow";

export type StepKind = "DIAGNOSTIC" | "TEACHING" | "INDEPENDENT_EXIT";
export type StepStatus = "WAITING" | "READY" | "IN_PROGRESS" | "COMPLETE" | "SKIPPED" | "FAILED";

export interface WorkStep {
  kind: StepKind;
  status: StepStatus;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface WorkTask {
  runId: string;
  title: string;
  kind: CheckKind;
  /** LIVE, PAUSED, COMPLETE or CANCELLED. */
  runStatus: string;
  launchedAt: Date;
  dueAt: Date | null;
  steps: WorkStep[];
}

/** DONE: nothing left. ENDED: the teacher closed the check before the child finished. WITH_TEACHER: a step failed and needs a restart. */
export type TaskState = "DONE" | "NOT_STARTED" | "STARTED" | "OVERDUE" | "ENDED" | "WITH_TEACHER";

export interface OpenTask {
  runId: string;
  title: string;
  kind: CheckKind;
  state: "NOT_STARTED" | "STARTED" | "OVERDUE" | "WITH_TEACHER";
  dueAt: string | null;
  setAt: string;
  /** Always "about": the remaining steps' usual length. */
  minutesLeft: number;
}

export interface ParentWork {
  windowDays: number;
  total: number;
  onTime: number;
  late: number;
  /** Checks the teacher ended before the child finished. */
  missed: number;
  open: number;
  next: OpenTask | null;
  openTasks: OpenTask[];
}

/** Usual length of each step, in minutes. The diagnostic stops at 15 at the latest. */
export const STEP_MINUTES: Record<StepKind, number> = { DIAGNOSTIC: 15, TEACHING: 10, INDEPENDENT_EXIT: 5 };
const ORDER: StepKind[] = ["DIAGNOSTIC", "TEACHING", "INDEPENDENT_EXIT"];
const OPEN: StepStatus[] = ["WAITING", "READY", "IN_PROGRESS"];

/** A check is due this many days after launch unless the teacher says otherwise (config.dueDays; null for no deadline). */
export const DEFAULT_DUE_DAYS = 2;

export function dueAtFor(config: unknown, launchedAt: Date): Date | null {
  const raw = (config as { dueDays?: unknown } | null)?.dueDays;
  if (raw === null) return null;
  const days = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 30 ? raw : DEFAULT_DUE_DAYS;
  return new Date(launchedAt.getTime() + days * 86_400_000);
}

export function taskState(task: WorkTask, now: Date): TaskState {
  const steps = task.steps;
  if (steps.some((s) => s.status === "FAILED")) return "WITH_TEACHER";
  const open = steps.filter((s) => OPEN.includes(s.status));
  if (!open.length) return "DONE";
  if (task.runStatus === "COMPLETE" || task.runStatus === "CANCELLED") return "ENDED";
  if (task.dueAt && now > task.dueAt) return "OVERDUE";
  const begun = steps.some((s) => s.startedAt || s.status === "COMPLETE" || s.status === "IN_PROGRESS");
  return begun ? "STARTED" : "NOT_STARTED";
}

/** Open steps plus the steps still to come after the latest one (a skipped step ends the check). */
export function minutesLeft(steps: WorkStep[]): number {
  if (steps.some((s) => s.status === "SKIPPED")) return steps.filter((s) => OPEN.includes(s.status)).reduce((n, s) => n + STEP_MINUTES[s.kind], 0);
  const latest = Math.max(-1, ...steps.map((s) => ORDER.indexOf(s.kind)));
  const open = steps.filter((s) => OPEN.includes(s.status)).reduce((n, s) => n + STEP_MINUTES[s.kind], 0);
  const toCome = ORDER.slice(latest + 1).reduce((n, k) => n + STEP_MINUTES[k], 0);
  return open + toCome;
}

function finishedAt(steps: WorkStep[]): Date | null {
  const times = steps.map((s) => s.completedAt).filter((d): d is Date => Boolean(d));
  return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
}

/**
 * The parent's work summary: checks set in the last `windowDays` days (open ones always count),
 * and the open check due soonest. A check with no deadline sorts after those with one.
 */
export function parentWork(tasks: WorkTask[], now: Date, windowDays = 30): ParentWork {
  const since = now.getTime() - windowDays * 86_400_000;
  let onTime = 0, late = 0, missed = 0;
  const openTasks: OpenTask[] = [];
  for (const task of tasks) {
    if (!task.steps.length) continue;
    const state = taskState(task, now);
    const isOpen = state === "NOT_STARTED" || state === "STARTED" || state === "OVERDUE" || state === "WITH_TEACHER";
    if (!isOpen && task.launchedAt.getTime() < since) continue;
    if (task.runStatus === "CANCELLED" && !isOpen && state !== "DONE") continue;
    if (state === "DONE") {
      const at = finishedAt(task.steps);
      if (!task.dueAt || !at || at <= task.dueAt) onTime++;
      else late++;
    } else if (state === "ENDED") {
      missed++;
    } else {
      openTasks.push({
        runId: task.runId,
        title: task.title,
        kind: task.kind,
        state,
        dueAt: task.dueAt?.toISOString() ?? null,
        setAt: task.launchedAt.toISOString(),
        minutesLeft: minutesLeft(task.steps),
      });
    }
  }
  const time = (iso: string | null) => (iso ? Date.parse(iso) : Infinity);
  openTasks.sort((a, b) => time(a.dueAt) - time(b.dueAt) || time(a.setAt) - time(b.setAt));
  return {
    windowDays,
    total: onTime + late + missed + openTasks.length,
    onTime,
    late,
    missed,
    open: openTasks.length,
    next: openTasks[0] ?? null,
    openTasks,
  };
}
