import type { LotusQuestion, LotusStudentResponse } from "@cogna/shared";

/**
 * What the thinking print draws from one answer: the skill it was about, how
 * sure the student was and how much the format showed. Whether the answer was
 * right never reaches it, so a student can't read a score from the picture.
 */
export type PrintFamily = "PAIR" | "SQUARES" | "SIGNS" | "CHECK" | "GROUP";

export interface PrintMark {
  id: string;
  family: PrintFamily;
  /** 0 to 1: sure answers draw crisp lines, guesses wide faint ones. */
  certainty: number;
  /** 0 to 1: how much the answer told Lotus; more strokes. */
  strength: number;
}

export const PRINT_FAMILIES: ReadonlyArray<{ family: PrintFamily; label: string; color: string }> = [
  { family: "PAIR", label: "x² + bx + c", color: "#c98a1b" },
  { family: "SQUARES", label: "Squares", color: "#08463a" },
  { family: "SIGNS", label: "Signs", color: "#b8492f" },
  { family: "CHECK", label: "Checking", color: "#17a077" },
  { family: "GROUP", label: "Grouping", color: "#3f7f95" },
];

const GAME_FAMILY: Partial<Record<string, PrintFamily>> = {
  TWO_NUMBERS: "PAIR", COMMIT_THEN_CHOOSE: "PAIR", RECTANGLE: "PAIR", FIND_EVERY_B: "PAIR",
  TWO_MOVES: "SIGNS", FOUR_SIGNS: "SIGNS",
  TEST_CLAIM: "CHECK", REPLAY: "CHECK",
  RAPID_SET: "SQUARES", CHUNK_IT: "SQUARES",
  ORDER_STEPS: "GROUP",
};

/** The skill family, from what the question already shows the browser: its topic name, then its format. */
function familyOf(question: Pick<LotusQuestion, "subtopic" | "game">): PrintFamily {
  const topic = question.subtopic.toLowerCase();
  if (/square/.test(topic)) return "SQUARES";
  if (/sign|negative/.test(topic)) return "SIGNS";
  if (/check|verif|expand|meaning/.test(topic)) return "CHECK";
  if (/product|sum|trinomial|pair/.test(topic)) return "PAIR";
  if (/group|common|gcf|divid|factor/.test(topic)) return "GROUP";
  return (question.game && GAME_FAMILY[question.game.kind]) ?? "GROUP";
}

export function printMarks(audits: ReadonlyArray<{ question: LotusQuestion; response: LotusStudentResponse | null }>): PrintMark[] {
  const marks: PrintMark[] = [];
  for (const { question, response } of audits) {
    if (!response) continue;
    const certainty = response.didNotKnow ? 0.2 : Math.max(0.2, Math.min(0.95, (response.confidence ?? 60) / 100));
    const strength = response.didNotKnow ? 0.3 : question.game ? 0.8 : question.asksForWorking ? 0.6 : 0.45;
    marks.push({ id: question.id, family: familyOf(question), certainty, strength });
  }
  return marks;
}

/** A guess teaches Lotus little, so it fills the ring less. */
const learned = (mark: PrintMark) => (0.03 + mark.strength * 0.08) * (0.35 + 0.65 * mark.certainty);

/** How full the ring is. The test's own length sets the scale; only the finish closes it. */
export function ringShare(marks: readonly PrintMark[], plannedQuestions: number | undefined, complete?: boolean): number {
  if (complete) return 1;
  const full = Math.max(8, plannedQuestions ?? 20) * 0.075;
  return Math.min(0.97, marks.reduce((sum, mark) => sum + learned(mark), 0) / full);
}

/** A picture for the start screen, before the student has drawn anything of their own. */
export const SAMPLE_MARKS: readonly PrintMark[] = (["PAIR", "SIGNS", "SQUARES", "PAIR", "CHECK", "GROUP", "SIGNS", "PAIR", "CHECK", "SQUARES"] as const)
  .map((family, i) => ({ id: `sample-${i}`, family, certainty: [0.9, 0.5, 0.85, 0.7, 0.3, 0.9][i % 6]!, strength: [0.8, 0.6, 0.45][i % 3]! }));
