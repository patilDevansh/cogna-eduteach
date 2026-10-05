/**
 * Targeted micro-lessons: 15–25 seconds, one idea, built by code from the
 * student's own diagnostic answer, narrated by the configured voice
 * (Cartesia in the pilot). The maths on screen moves while the voice talks:
 * tokens highlight, arrows draw, pieces fly between rows. One quick check
 * follows, marked on the server.
 *
 * The browser receives a declarative script, never the quick-check answer.
 */

/** A token on screen: [id, text, class shown in the poster frame]. Plain strings are fixed text. */
export type MicroToken = string | [id: string, text: string, posterClass?: string];

export type MicroTone = "bad" | "good" | "warn";

/** One thing that happens on screen when a narration line starts. */
export type MicroAction =
  | { op: "pill"; text: string; tone?: MicroTone }
  | { op: "clearPills" }
  | { op: "add"; id: string; cls: string[] }
  | { op: "rm"; id: string; cls: string[] }
  | { op: "show"; ids: string[] }
  | { op: "pulse"; ids: string[] }
  | { op: "down"; index: number }
  | { op: "arc"; from: string; to: string; delayMs?: number }
  | { op: "fly"; from: string; to: string }
  | { op: "later"; ms: number; then: MicroAction };

export interface MicroStep {
  /** What the voice says and the caption shows. */
  say: string;
  actions: MicroAction[];
}

export interface MicroStepView extends MicroStep {
  /** Narration audio for this line; absent when the voice is unavailable (the caption still plays). */
  audioUrl?: string;
  /** Length of the narration in seconds (or an estimate when silent). */
  seconds: number;
}

export type MicroTemplate = "SIGNS_IN_PAIR" | "EQUAL_NOT_FINISHED" | "COMMON_BRACKET" | "NEGATIVE_TIMES_BRACKET" | "YOUR_ANSWER_VS_RIGHT";

export interface MicroLessonView {
  template: MicroTemplate;
  /** The student's first name, used in the card's title ("Aarav's lesson"). */
  who: string;
  /** Short name of the gap, e.g. "signs in the factor pair". */
  gap: string;
  /** One sentence under the card. */
  takeaway: string;
  /** Rows of maths; arrows sit between rows. */
  rows: MicroToken[][];
  arrow: "mint" | "violet";
  /** Font size override for many-row lessons, in container units. */
  size?: number;
  steps: MicroStepView[];
  check: { prompt: string; options: string[] };
}

export interface MicroCheckResult {
  correct: boolean;
  feedback: string;
}
