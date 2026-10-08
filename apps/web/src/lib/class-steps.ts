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
