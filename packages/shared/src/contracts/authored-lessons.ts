/**
 * AI-authored lessons and independent practice.
 *
 * The model writes a lesson as data in this shape: scenes of narrated beats,
 * each beat showing one visual from a fixed catalogue, plus checkpoints and a
 * practice set. It never writes code or free-form animation. Before anything
 * reaches a student, the API's verifier (apps/api/.../ai-authoring/
 * lesson-verifier.ts) re-derives every piece of mathematics with the exact
 * algebra engine and rejects the draft if one claim fails. That is how
 * "no unchecked LLM math reaches students" holds with an AI author.
 *
 * Maths strings are plain ASCII algebra the engine can parse:
 * "x^2 - 7x + 12", "(x - 3)(x - 4)", "6x^2y + 9xy^2", "3(2x + 5)".
 */

/** One picture on screen while a beat is spoken. */
import type { TileBuildInteraction } from "./interaction-formats";

export type AuthoredVisual =
  /** A short statement or heading, no maths claim. */
  | { type: "title"; text: string }
  /** One expression, optionally with parts lit up (each highlight must appear in expr). */
  | { type: "expression"; expr: string; highlight?: string[]; caption?: string }
  /** A chain of equal expressions: every step must equal the one before it. */
  | { type: "steps"; steps: string[]; caption?: string }
  /** a(b + c + …): arrows from the outside factor to every inside term. result[i] = outside × inside[i]. */
  | { type: "distribute"; outside: string; inside: string[]; result: string[] }
  /** Area model: cells[i][j] = rows[i] × cols[j]. */
  | { type: "area"; rows: string[]; cols: string[]; cells: string[][] }
  /** Factor-pair search for x² + bx + c: every listed pair multiplies to product; answer also adds to sum. */
  | { type: "pair-search"; product: number; sum: number; pairs: Array<[number, number]>; answer: [number, number] }
  /** Taking out a common factor: terms[i] = factor × remaining[i], and factor(…remaining) is fully factorised. */
  | { type: "common-factor"; terms: string[]; factor: string; remaining: string[] }
  /**
   * The student's own mistake beside the correct answer for the same expression.
   * wrongKind says which kind of wrong it is — "unfinished" (equal, but not done) or "incorrect"
   * (not equal) — and the verifier checks it, so the narration can't misdescribe the mistake.
   */
  | { type: "mistake"; expr: string; task: AuthoredTask; wrong: string; wrongKind: "unfinished" | "incorrect"; right: string; note: string }
  /** Algebra tiles for a positive x² + bx + c sliding into one rectangle: sides[0] + sides[1] = b strips, sides[0] × sides[1] = c squares. */
  | { type: "tiles"; b: number; c: number; sides: [number, number] }
  /** Signed numbers as moves on a number line: start, then each move hops left (negative) or right (positive). */
  | { type: "number-line"; start: number; moves: number[]; caption?: string }
  /** A shape with each corner's angle (null = the one to find) and optional side labels, e.g. "7 cm". 3–6 corners. */
  | { type: "shape"; angles: Array<number | null>; sides?: string[]; caption?: string }
  /** A bar or pie chart of a small data set; pie slices are drawn in proportion to the values. */
  | { type: "chart"; kind: "bar" | "pie"; labels: string[]; values: number[]; caption?: string }
  /** A first-quadrant grid with labelled points, and optionally the line y = m·x + c they all lie on. */
  | { type: "grid"; points: Array<{ label: string; x: number; y: number }>; line?: { m: number; c: number }; caption?: string }
  /** A short routine card (2–4 lines of words, no maths claims). */
  | { type: "rule"; heading: string; lines: string[] };

/** calculate: the expression is arithmetic and the answer one number or fraction. */
export type AuthoredTask = "factorise" | "expand" | "simplify" | "calculate";

export interface AuthoredBeat {
  /** What the narrator says (one or two sentences). */
  say: string;
  visual: AuthoredVisual;
}

export interface AuthoredScene {
  title: string;
  beats: AuthoredBeat[];
}

export interface AuthoredCheckpointOption {
  label: string;
  correct: boolean;
  feedback: string;
}

/** The lesson pauses after a beat and resumes only on the right answer. */
export interface AuthoredCheckpoint {
  afterScene: number;
  afterBeat: number;
  prompt: string;
  spoken: string;
  options: AuthoredCheckpointOption[];
  /** When the options are maths answers to a task on an expression, the verifier checks each option against it. */
  check?: { task: AuthoredTask; expression: string };
}

/** Independent practice, played after the lesson. Every format is animated in the browser. */
export type PracticeItem =
  /** Tap the factor pair; correct pairs snap into brackets. */
  | {
      id: string;
      format: "pair-hunt";
      prompt: string;
      expression: string;
      product: number;
      sum: number;
      options: Array<[number, number]>;
      answer: [number, number];
    }
  /** Tap the line where the working goes wrong; the fix slides in. */
  | {
      id: string;
      format: "spot-mistake";
      prompt: string;
      lines: string[];
      /** Index of the first line that is not equal to (or is an unfinished version of) the line before it. */
      wrongLine: number;
      fix: string;
      explanation: string;
    }
  /** Pick the right answer; one distractor is usually the student's own mistake. */
  | {
      id: string;
      format: "choose";
      prompt: string;
      expression: string;
      task: AuthoredTask;
      options: string[];
      answerIndex: number;
      /** Per-option reply when picked; the wrong ones explain what went wrong. */
      feedback: string[];
    }
  /** Type the answer; checked by the algebra engine on the server (equivalent forms accepted). */
  | {
      id: string;
      format: "type-answer";
      prompt: string;
      expression: string;
      task: AuthoredTask;
      answer: string;
      hint: string;
      /** Shown, step by step, after two misses. */
      workedSteps: string[];
    }
  /** Turn two dials until the product and sum lamps both light. Built by code only. */
  | {
      id: string;
      format: "factor-safe";
      prompt: string;
      expression: string;
      product: number;
      sum: number;
      answer: [number, number];
    }
  /** Make it a rectangle: split the x-strips between the side and the bottom until the small squares fill the corner exactly. Positive trinomials only. Built by code only. */
  | {
      id: string;
      format: "rectangle";
      prompt: string;
      expression: string;
      /** The middle coefficient (number of x-strips) and the constant (number of small squares). */
      strips: number;
      units: number;
      /** Strips on the side and on the bottom when it fits. */
      answer: [number, number];
    }
  /** Marker's desk: Bit the robot hands in papers; stamp each right or wrong and name the mistake. Built by code only. */
  | {
      id: string;
      format: "mark-it";
      prompt: string;
      papers: Array<{
        question: string;
        expression: string;
        task: AuthoredTask;
        bitAnswer: string;
        /** Decided by the algebra engine when the item is built. */
        verdict: "right" | "wrong";
        /** Mistake reasons that count as a correct diagnosis (wrong papers only). */
        reasons: MarkReason[];
        /** What Bit says once the mistake is named, or the check when Bit was right. */
        learn: string;
      }>;
    }
  /** Bracket rush: a timed round of quick picks; misses come back later in the round. Fluency only. Built by code only. */
  | {
      id: string;
      format: "rush";
      prompt: string;
      seconds: number;
      rounds: Array<{ expression: string; task: AuthoredTask; options: string[]; answerIndex: number; why: string[] }>;
    }
  /** Build the answer from tiles; the server assembles the picks and the algebra engine marks them. Built by code only. */
  | {
      id: string;
      format: "build";
      prompt: string;
      expression: string;
      task: AuthoredTask;
      answer: string;
      interaction: TileBuildInteraction;
      workedSteps: string[];
    };

/** The mistakes a student can name at the marker's desk. */
export type MarkReason = "sign" | "forgot" | "unfinished" | "pair";
export const MARK_REASONS: Array<{ code: MarkReason; label: string }> = [
  { code: "sign", label: "Sign slip" },
  { code: "forgot", label: "Forgot a term" },
  { code: "unfinished", label: "Not finished" },
  { code: "pair", label: "Wrong pair" },
];

export type PracticeFormat = PracticeItem["format"];

/** What the model returns. */
export interface AuthoredLessonDraft {
  title: string;
  objective: string;
  /** One sentence for the student: why this lesson, from their answers. */
  whyThisLesson: string;
  scenes: AuthoredScene[];
  checkpoints: AuthoredCheckpoint[];
  practice: PracticeItem[];
  /** A fresh, unsupported item for the independent exit check (held out of practice). */
  exit: { prompt: string; expression: string; task: AuthoredTask; answer: string };
  /** One line each for the learner and the teacher. */
  learnerDecision: string;
  teacherDecision: string;
}

/** Practice as the browser receives it: answers stay on the server. */
export type PracticeItemView =
  | Omit<Extract<PracticeItem, { format: "pair-hunt" }>, "answer">
  | Omit<Extract<PracticeItem, { format: "spot-mistake" }>, "wrongLine" | "fix" | "explanation">
  | Omit<Extract<PracticeItem, { format: "choose" }>, "answerIndex" | "feedback">
  | Omit<Extract<PracticeItem, { format: "type-answer" }>, "answer" | "workedSteps">
  | Omit<Extract<PracticeItem, { format: "factor-safe" }>, "answer">
  | Omit<Extract<PracticeItem, { format: "build" }>, "answer" | "workedSteps">
  | Omit<Extract<PracticeItem, { format: "rectangle" }>, "answer">
  | (Omit<Extract<PracticeItem, { format: "mark-it" }>, "papers"> & { papers: Array<{ question: string; bitAnswer: string }> })
  | (Omit<Extract<PracticeItem, { format: "rush" }>, "rounds"> & { rounds: Array<{ expression: string; options: string[] }> });

export interface PracticeSetView {
  assignmentId: string;
  /** Where the set came from. AI sets passed the verifier; code sets are built and checked by code. */
  source: "AI_VERIFIED" | "CODE_GENERATED";
  skillName: string;
  items: PracticeItemView[];
}

/** A practice answer: pair-hunt and factor-safe send the pair, spot-mistake the line, choose the option, type-answer the text, build the tile picks. */
export type PracticeAnswer =
  | { pair: [number, number] }
  | { line: number }
  | { option: number }
  | { text: string }
  | { picks: Array<number | null> }
  | { paper: number; mark: "right" | "wrong"; reason?: MarkReason }
  | { round: number; option: number };

export interface PracticeCheckResult {
  itemId: string;
  verdict: "CORRECT" | "UNFINISHED" | "INCORRECT" | "UNREADABLE";
  feedback: string;
  /** Revealed on a correct answer, or after two misses, so the animation can show the right working. */
  reveal?: { answer: string; steps: string[] };
  attempt: number;
}
