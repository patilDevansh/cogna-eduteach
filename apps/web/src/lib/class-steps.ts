import type { ClassroomStudentAssignment } from "./api";

/** What each class step is called on the student's screen. */
export const STEP: Record<ClassroomStudentAssignment["kind"], { title: string; note: string; cta: string }> = {
  DIAGNOSTIC: { title: "Your quick check", note: "About 15 minutes. It stops early once Cogna knows where to start.", cta: "Start the quick check" },
  TEACHING: { title: "Your lesson and practice", note: "A short lesson made from your own answers, then a few questions to practise.", cta: "Start my lesson" },
  INDEPENDENT_EXIT: { title: "One question on your own", note: "No hints. This shows your teacher what you can do now.", cta: "Start" },
};
