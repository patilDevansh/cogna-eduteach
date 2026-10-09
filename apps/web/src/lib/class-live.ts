import type { ClassActivityEvent, ClassroomRunReport, PilotClassReport } from "./api";

type Row = PilotClassReport["students"][number];

/**
 * Applies a live "a student answered" update to the report on screen, without
 * reloading it. Returns null when the update can't be applied from the event
 * alone (the student isn't on screen yet, or wasn't shown as mid-test), so the
 * page reloads the report instead.
 */
export function applyActivity(report: ClassroomRunReport, event: ClassActivityEvent): ClassroomRunReport | null {
  if (report.run.id !== event.runId) return report;
  const rows = report.classReport.students;
  const index = rows.findIndex((row) => row.studentId === event.studentId);
  const row = rows[index];
  if (!row || !row.activity) return null;
  if (row.stage !== "DIAGNOSTIC") return report;
  // Two updates can arrive out of order; an older one never rolls a row back.
  if (row.activity.lastActiveAt && new Date(row.activity.lastActiveAt) > new Date(event.lastActiveAt)) return report;
  const activity: NonNullable<Row["activity"]> = {
    ...row.activity,
    state: event.testFinished ? "FILING" : "WORKING",
    lastActiveAt: event.lastActiveAt,
    quietMinutes: 0,
    answeredSoFar: event.answeredSoFar,
  };
  const students = rows.slice();
  students[index] = { ...row, activity };
  return { ...report, classReport: { ...report.classReport, students } };
}

/**
 * One line under a student's name while they are mid-step. Minutes are counted
 * from their last action against `now`, so the line stays current between reloads.
 */
export function activityLine(row: Row, now: number): { text: string; quiet: boolean } | null {
  const a = row.activity;
  if (!a) return null;
  if (a.state === "FILING") return { text: "Finished · filing result", quiet: false };
  const minutes = a.lastActiveAt ? Math.max(0, Math.floor((now - new Date(a.lastActiveAt).getTime()) / 60_000)) : a.quietMinutes;
  if (minutes === null) return null;
  const answered = a.answeredSoFar ? `${a.answeredSoFar} answered · ` : "";
  if (minutes >= a.quietAfterMinutes) return { text: `${answered}No activity for ${minutes} min`, quiet: true };
  return { text: `${answered}${minutes < 1 ? "Active now" : `Active ${minutes} min ago`}`, quiet: false };
}
