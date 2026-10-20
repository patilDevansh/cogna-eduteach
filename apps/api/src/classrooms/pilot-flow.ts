import { ClassroomAssignmentKind } from "@cogna/database";

/**
 * Pilot orchestration rules (docs/mvp-10.0/PILOT_FLOW.md).
 *
 * In the pilot each student moves through diagnostic → lesson and practice →
 * independent exit on their own, as soon as they finish a stage: no teacher
 * button and no waiting for the rest of the class. The teacher's one action
 * is releasing the diagnostic. A run created with config.autoAdvance = false
 * keeps the original teacher-gated lifecycle.
 */

export type StageKind = (typeof ClassroomAssignmentKind)[keyof typeof ClassroomAssignmentKind];

export function autoAdvanceEnabled(config: unknown): boolean {
  return !(config && typeof config === "object" && (config as Record<string, unknown>).autoAdvance === false);
}

/** The stage that follows a completed one, or null after the exit. */
export function nextStage(kind: StageKind): StageKind | null {
  if (kind === ClassroomAssignmentKind.DIAGNOSTIC) return ClassroomAssignmentKind.TEACHING;
  if (kind === ClassroomAssignmentKind.TEACHING) return ClassroomAssignmentKind.INDEPENDENT_EXIT;
  return null;
}

/**
 * What to do with the stages after a finished diagnostic. A student with no
 * gap (or whose lesson abstained) has nothing to be taught or re-checked:
 * those stages are recorded as SKIPPED with the reason, never left waiting.
 */
export function stagesAfterDiagnostic(input: { outcome?: unknown; lessonStatus?: string | null }):
  | { kind: "CONTINUE" }
  | { kind: "SKIP_REST"; reason: string } {
  if (input.outcome === "ADVANCEMENT") return { kind: "SKIP_REST", reason: "No gap found: everything tested looked secure." };
  if (input.lessonStatus === "ABSTAINED") return { kind: "SKIP_REST", reason: "Lotus didn't find a clear enough starting point to teach from. The teacher decides the next step." };
  return { kind: "CONTINUE" };
}
