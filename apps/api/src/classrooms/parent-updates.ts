/**
 * What a parent is told when something happens in their child's class.
 * Pure: the service decides when, this decides the words. Only the child's
 * own row goes in, never a classmate's.
 */
import type { StudentRow } from "./class-report";

export type ParentUpdateKind = "CHECK_FINISHED" | "CATCH_UP_SET" | "LINK_APPROVED";

/** The short text for each update (see updateText): under 30 characters, nothing about what the child found hard. */
export const UPDATE_TEXT: Record<ParentUpdateKind, string> = {
  CHECK_FINISHED: "class check finished",
  CATCH_UP_SET: "catch-up work set",
  LINK_APPROVED: "linked to your account",
};

export interface ParentUpdate {
  kind: ParentUpdateKind;
  title: string;
  body: string;
  /** The same event never notifies the same parent twice. */
  dedupeKey: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Rational numbers · Topic check" → "topic check on rational numbers"; older checks are "class check". */
function checkName(title: string): string {
  const [topic, kind] = title.split(" · ");
  return topic && kind ? `${kind.toLowerCase()} on ${topic.toLowerCase()}` : "class check";
}

/** Sent once a student has nothing left to do in a check (finished, or the rest was skipped because nothing needed fixing). */
export function checkFinishedUpdate(input: { runId: string; className: string; checkTitle: string; row: StudentRow }): ParentUpdate {
  const { row } = input;
  const name = firstName(row.name);
  const need = row.startingPoint?.name.toLowerCase();
  const what = checkName(input.checkTitle);
  let body: string;
  if (row.progress === "IMPROVED") body = `${name} worked on ${need ?? "one step"}, then got the final question right on their own.`;
  else if (row.progress === "NOT_YET") body = `${name} worked on ${need ?? "one step"}. The final question was still tricky, so a little more practice at home will help.`;
  else if (row.progress === "NO_GAP") body = `${name} finished the ${what}: nothing to fix right now.`;
  else if (row.progress === "UNCLEAR") body = `${name} finished the ${what}. The teacher will check again to be sure.`;
  else body = `${name} finished the ${what}.`;
  return { kind: "CHECK_FINISHED", title: `${input.className}: ${what} finished`, body, dedupeKey: `CHECK_FINISHED:${input.runId}:${row.studentId}` };
}

/** Sent when the teacher sets a student a catch-up check. */
export function catchUpSetUpdate(input: { runId: string; className: string; checkTitle: string; studentId: string; studentName: string; teacherName: string }): ParentUpdate {
  const topic = input.checkTitle.split(" · ")[0] ?? input.checkTitle;
  return {
    kind: "CATCH_UP_SET",
    title: `${input.className}: catch-up set`,
    body: `${input.teacherName} set ${firstName(input.studentName)} a short catch-up on ${topic.toLowerCase()}, aimed at what they still found tricky.`,
    dedupeKey: `CATCH_UP_SET:${input.runId}:${input.studentId}`,
  };
}

/** Sent when a teacher approves a parent's request to be linked to their child. */
export function linkApprovedUpdate(input: { requestId: string; className: string; studentName: string; teacherName: string }): ParentUpdate {
  const name = firstName(input.studentName);
  return {
    kind: "LINK_APPROVED",
    title: `${input.className}: ${name} is linked`,
    body: `${input.teacherName} linked ${name} to your account. You'll see their class work and progress here.`,
    dedupeKey: `LINK_APPROVED:${input.requestId}`,
  };
}
