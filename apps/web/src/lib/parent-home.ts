import type { ParentChildOverview, ParentOpenTask, TopicGrowthEntry } from "./api";

/** "Factorisation · Catch-up" → "Factorisation catch-up"; older checks have no kind. */
export function taskName(title: string): string {
  const [topic, kind] = title.split(" · ");
  return topic && kind ? `${topic} ${kind.toLowerCase()}` : title;
}

export type DueTone = "calm" | "soon" | "over" | "grey";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Calendar days from today to the due date, in the viewer's time zone (0 = today, -1 = yesterday). */
export function daysUntil(dueAt: string, now: Date): number {
  return Math.round((startOfDay(new Date(dueAt)) - startOfDay(now)) / DAY);
}

/** The chip and the words under the deadline bar. */
export function dueLabel(task: ParentOpenTask, now: Date): { chip: string; left: string; tone: DueTone } {
  if (task.state === "WITH_TEACHER") return { chip: "With the teacher", left: "The teacher will restart it", tone: "grey" };
  if (!task.dueAt) return { chip: "No due date", left: "No due date", tone: "calm" };
  const days = daysUntil(task.dueAt, now);
  if (task.state === "OVERDUE" || days < 0) {
    const over = Math.max(1, -days);
    return { chip: "Overdue", left: `${over} day${over === 1 ? "" : "s"} over · it can still be done`, tone: "over" };
  }
  if (days === 0) return { chip: "Due today", left: "Due today", tone: "soon" };
  if (days === 1) return { chip: "Due tomorrow", left: "1 day left", tone: "soon" };
  return { chip: `Due ${shortDay(task.dueAt)}`, left: `${days} days left`, tone: "calm" };
}

/** How much of the time from set to due has passed, 0–1 (1 once overdue). */
export function deadlineShare(task: ParentOpenTask, now: Date): number {
  if (!task.dueAt) return 0;
  const start = Date.parse(task.setAt);
  const end = Date.parse(task.dueAt);
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

type ClassRow = ParentChildOverview["classes"][number];
type Check = NonNullable<ClassRow["check"]>;
export type StepLook = "done" | "good" | "work" | "now" | "unsure" | "todo";

export interface StuckView {
  /** The headline: the exact step, or what's happening. */
  headline: string;
  chip: { text: string; tone: "good" | "soon" | "calm" | "grey" };
  topic: string;
  steps: Array<{ label: string; look: StepLook }>;
  /** Steps whose connector to the next one is filled. */
  joined: [boolean, boolean];
}

/**
 * The check to explain: the most recent one that has found something. A newer check not
 * taken yet shows in "Next for…", and mustn't hide what the last one found.
 */
export function latestCheck(classes: ClassRow[]): (Check & { className: string }) | null {
  const checks = classes
    .filter((c): c is ClassRow & { check: Check } => Boolean(c.check))
    .map((c) => ({ ...c.check, className: c.name }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return checks.find((c) => c.stage !== "JOINED" && c.stage !== "DIAGNOSTIC") ?? checks[0] ?? null;
}

/** Found → lesson → fixed, from the latest check (api forStudent). */
export function stuckView(check: Check, firstName: string): StuckView {
  const topic = (check.title.split(" · ")[0] ?? check.title).trim();
  const need = check.need?.trim();
  const found = check.stage !== "JOINED" && check.stage !== "DIAGNOSTIC";
  const taught = check.stage === "EXIT" || check.stage === "DONE";
  if (check.progress === "NO_GAP") {
    return { headline: `${firstName} is solid in ${topic.toLowerCase()}. Nothing to fix.`, chip: { text: "Secure", tone: "calm" }, topic, steps: [{ label: "Checked", look: "done" }, { label: "No lesson needed", look: "done" }, { label: "Secure", look: "good" }], joined: [true, true] };
  }
  if (check.stage === "JOINED" || check.stage === "DIAGNOSTIC") {
    const live = check.stageStatus === "IN_PROGRESS";
    return { headline: live ? `${firstName} is taking a check on ${topic.toLowerCase()} now.` : `${firstName} has a check on ${topic.toLowerCase()} to do.`, chip: { text: live ? "In progress" : "Not checked yet", tone: "grey" }, topic, steps: [{ label: "Checking", look: live ? "now" : "todo" }, { label: "Lesson", look: "todo" }, { label: "Fixed", look: "todo" }], joined: [false, false] };
  }
  const headline = need ? `${need.charAt(0).toUpperCase()}${need.slice(1)}` : `One step in ${topic.toLowerCase()}`;
  const last: StuckView["steps"][number] =
    check.progress === "IMPROVED" ? { label: "Fixed", look: "good" }
    : check.progress === "NOT_YET" ? { label: "Not fixed yet", look: "work" }
    : check.progress === "UNCLEAR" ? { label: "Checking again", look: "unsure" }
    : { label: taught ? "Final question" : "Fixed", look: taught && check.stageStatus === "IN_PROGRESS" ? "now" : "todo" };
  const chip: StuckView["chip"] =
    check.progress === "IMPROVED" ? { text: "Fixed", tone: "good" }
    : check.progress === "NOT_YET" ? { text: "Still practising", tone: "soon" }
    : check.progress === "UNCLEAR" ? { text: "Checking again", tone: "grey" }
    : { text: "Working on it", tone: "soon" };
  return {
    headline,
    chip,
    topic,
    steps: [{ label: "Found", look: found ? "done" : "todo" }, { label: "Lesson", look: taught ? "done" : check.stage === "LESSON" ? "now" : "todo" }, last],
    joined: [found && taught, taught && last.look !== "todo" && last.look !== "now"],
  };
}

/** Skills secure in a topic: the latest check's count, out of all skills seen. */
export function topicSkills(entry: TopicGrowthEntry): { secure: number; total: number } {
  return { secure: entry.growth.latestSecure, total: entry.growth.latestSecure + entry.growth.stillWorking.length };
}

export function growthFor(topic: string, growth: TopicGrowthEntry[]): TopicGrowthEntry | undefined {
  return growth.find((g) => g.name.toLowerCase() === topic.toLowerCase());
}
