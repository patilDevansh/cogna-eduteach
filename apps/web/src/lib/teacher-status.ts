import type { PilotClassReport } from "./api";

export type StudentCheckRow = PilotClassReport["students"][number];
export type StatusTone = "ready" | "bridge" | "check" | "idle";

/** One plain status per student, from their row in a quick check. Shared by Students and Reports. */
export function studentStatus(row: StudentCheckRow | undefined): { label: string; tone: StatusTone } {
  if (!row || row.stage === "JOINED") return { label: "Not started", tone: "idle" };
  if (row.progress === "NO_GAP") return { label: "Ready to move on", tone: "ready" };
  if (row.progress === "IMPROVED") return { label: "Fixed it", tone: "ready" };
  if (row.progress === "NOT_YET") return { label: "Still needs help", tone: "bridge" };
  if (row.progress === "UNCLEAR") return { label: "Check again", tone: "check" };
  if (row.stageStatus === "SKIPPED") return { label: "Didn’t finish", tone: "idle" };
  if (row.stage === "DIAGNOSTIC") return { label: "Doing the check", tone: "idle" };
  if (row.startingPoint) return { label: "Needs one fix", tone: "bridge" };
  return { label: "In progress", tone: "idle" };
}
