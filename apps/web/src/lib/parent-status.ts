import type { ParentChildOverview } from "./api";

type Check = ParentChildOverview["classes"][number]["check"];
export type Tone = "good" | "work" | "wait";

/** One plain sentence for a parent about where their child is in a class check. */
export function classCheckLine(check: Check): { tone: Tone; text: string } {
  if (!check) return { tone: "wait", text: "No class check yet." };
  const need = check.need ? check.need.toLowerCase() : "one step";
  // "Rational numbers · Topic check" → "topic check on rational numbers"; older checks are "the class quick check".
  const [topic, kind] = (check.title ?? "").split(" · ");
  const what = topic && kind ? `${kind.toLowerCase()} on ${topic.toLowerCase()}` : "class quick check";
  if (check.stage === "DONE" && check.stageStatus === "SKIPPED") return { tone: "wait", text: "The check ended before they finished it." };
  if (check.progress === "IMPROVED") return { tone: "good", text: `Worked on ${need}, then got the final question right on their own.` };
  if (check.progress === "NOT_YET") return { tone: "work", text: `Worked on ${need}. The final question was still tricky, so it’s worth more practice.` };
  if (check.progress === "NO_GAP") return { tone: "good", text: kind?.toLowerCase() === "catch-up" ? "Caught up: everything they were working on is secure now." : "Check done: nothing to fix right now." };
  if (check.progress === "UNCLEAR") return { tone: "wait", text: "Check done. The teacher will check again to be sure." };
  if (check.stage === "JOINED") return { tone: "wait", text: "Waiting for the class check to start." };
  if (check.stage === "DIAGNOSTIC") return { tone: "wait", text: check.stageStatus === "IN_PROGRESS" ? `Doing the ${what} now.` : `Has the ${what} to do.` };
  if (check.stage === "LESSON") return { tone: "work", text: `Found one step to work on: ${need}. ${check.stageStatus === "IN_PROGRESS" ? "Working through their lesson." : "Their personal lesson is ready."}` };
  return { tone: "work", text: `Finished their lesson on ${need}. One final question to answer on their own.` };
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
