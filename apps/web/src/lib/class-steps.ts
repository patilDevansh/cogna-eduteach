import type { ClassroomStudentAssignment } from "./api";

type Step = { title: string; note: string; cta: string };

/** What each class step is called on the student's screen. */
export const STEP: Record<ClassroomStudentAssignment["kind"], Step> = {
  DIAGNOSTIC: { title: "Your quick check", note: "About 15 minutes. It stops early once Cogna knows where to start.", cta: "Start the quick check" },
  TEACHING: { title: "Your lesson and practice", note: "A short lesson made from your own answers, then a few questions to practise.", cta: "Start my lesson" },
  INDEPENDENT_EXIT: { title: "On your own", note: "No hints, one try each. This shows your teacher what you can do now.", cta: "Start" },
};

/** The step as this assignment's check names it: a topic check or a catch-up reads differently from a first diagnostic. */
export function stepFor(item: Pick<ClassroomStudentAssignment, "kind" | "payload">): Step {
  if (item.kind !== "DIAGNOSTIC") return STEP[item.kind];
  if (item.payload?.kind === "CATCH_UP") return { title: "Your catch-up", note: "A few questions (up to 8) on just what you were still working on.", cta: "Start the catch-up" };
  if (item.payload?.kind === "TOPIC_CHECK") return { title: "Your topic check", note: "Shows what you've understood since the lesson. It stops early once Cogna knows.", cta: "Start the topic check" };
  return STEP.DIAGNOSTIC;
}

/** How long "your teacher is waiting for you" stays up after a reminder. */
const REMINDER_SHOWN_MS = 10 * 60_000;

/**
 * What the teacher has done to this step that the student should know about:
 * paused the class, sent a reminder, or set an end time. Paused wins, since the
 * student can't start until it lifts.
 */
export function classNotice(item: Pick<ClassroomStudentAssignment, "status" | "payload" | "run">, now: number): { paused: boolean; text: string } | null {
  const config = item.run.config ?? {};
  if (typeof config.pausedAt === "string" && config.pausedAt) return { paused: true, text: "Your teacher has paused the class. This opens again when they resume." };
  const endsAt = typeof config.endsAt === "string" ? Date.parse(config.endsAt) : NaN;
  const ending = Number.isFinite(endsAt) && endsAt > now
    ? `Ends at ${new Date(endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} (${Math.max(1, Math.ceil((endsAt - now) / 60_000))} min left).`
    : "";
  const nudgedAt = typeof item.payload?.nudgedAt === "string" ? Date.parse(item.payload.nudgedAt) : NaN;
  if (item.status === "READY" && Number.isFinite(nudgedAt) && now - nudgedAt < REMINDER_SHOWN_MS) {
    return { paused: false, text: `Your teacher is waiting for you to start.${ending ? ` ${ending}` : ""}` };
  }
  return ending ? { paused: false, text: ending } : null;
}
