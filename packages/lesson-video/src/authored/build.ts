import type { KitBeat, KitScene, LessonCheckpoint } from "../lesson-types";
import type { LessonThemeId } from "../themes";

/**
 * AI-authored lessons, ready to play.
 *
 * The draft arrives here only after the API's verifier has checked every
 * claim in it (apps/api/.../ai-authoring/lesson-verifier.ts). This file
 * mirrors that contract (@cogna/shared authored-lessons.ts) structurally —
 * the API passes its type straight in, so any drift is a compile error —
 * and turns it into timed scenes the AuthoredLesson composition animates.
 * Nothing here computes or changes mathematics.
 */

export type AuthoredTask = "factorise" | "expand" | "simplify";

export type AuthoredVisual =
  | { type: "title"; text: string }
  | { type: "expression"; expr: string; highlight?: string[]; caption?: string }
  | { type: "steps"; steps: string[]; caption?: string }
  | { type: "distribute"; outside: string; inside: string[]; result: string[] }
  | { type: "area"; rows: string[]; cols: string[]; cells: string[][] }
  | { type: "pair-search"; product: number; sum: number; pairs: Array<[number, number]>; answer: [number, number] }
  | { type: "common-factor"; terms: string[]; factor: string; remaining: string[] }
  | { type: "mistake"; expr: string; task: AuthoredTask; wrong: string; wrongKind: "unfinished" | "incorrect"; right: string; note: string }
  | { type: "rule"; heading: string; lines: string[] };

export interface AuthoredDraftForPlayback {
  title: string;
  objective: string;
  scenes: Array<{ title: string; beats: Array<{ say: string; visual: AuthoredVisual }> }>;
  checkpoints: Array<{
    afterScene: number;
    afterBeat: number;
    prompt: string;
    spoken: string;
    options: Array<{ label: string; correct: boolean; feedback: string }>;
  }>;
}

export interface AuthoredBeat extends KitBeat {
  visual: AuthoredVisual;
}

export interface AuthoredScene extends KitScene {
  beats: AuthoredBeat[];
}

export interface AuthoredLessonInput {
  draft: AuthoredDraftForPlayback;
  studentName: string;
  theme?: LessonThemeId;
}

export interface AuthoredLessonProps {
  studentName: string;
  topic: string;
  theme?: LessonThemeId;
  /** The letter to italicise ("x"), from the lesson's maths. */
  variable: string;
  scenes: AuthoredScene[];
  checkpoints: LessonCheckpoint[];
}

const SUPERSCRIPT: Record<string, string> = { "2": "²", "3": "³", "4": "⁴", "5": "⁵" };

/** ASCII algebra → what the student reads: x^2 → x², binary minus → " − ", unary minus → "−", * → ×. */
export function prettyMath(text: string): string {
  const src = text.replace(/\^([2-5])/g, (_, d: string) => SUPERSCRIPT[d]!).replace(/\s+/g, "");
  let out = "";
  let prev = "";
  for (const ch of src) {
    if (ch === "-" || ch === "−") out += prev === "" || "(+−-×*".includes(prev) ? "−" : " − ";
    else if (ch === "+") out += " + ";
    else if (ch === "*" || ch === "×") out += " × ";
    else out += ch;
    prev = ch;
  }
  return out;
}

/** Light touch for sentences that contain maths (checkpoint prompts): powers and spaced minus signs only. */
export function prettyText(text: string): string {
  return text.replace(/\^([2-5])/g, (_, d: string) => SUPERSCRIPT[d]!).replace(/ - /g, " − ").replace(/\*/g, "×");
}

/** How long a beat needs on screen before narration replaces it with the real clip length. */
function estimateSeconds(say: string, visual: AuthoredVisual): number {
  const words = say.trim().split(/\s+/).length;
  const extra =
    visual.type === "steps" ? visual.steps.length * 0.7
      : visual.type === "distribute" ? visual.inside.length * 0.9
        : visual.type === "pair-search" ? visual.pairs.length * 0.8
          : visual.type === "area" ? visual.rows.length * visual.cols.length * 0.5
            : visual.type === "common-factor" ? 1.5
              : visual.type === "mistake" ? 1.5
                : 0.5;
  return Math.max(3.4, words / 2.5 + 0.8 + extra);
}

function variableOf(draft: AuthoredDraftForPlayback): string {
  const maths = draft.scenes.flatMap((s) => s.beats.map((b) => JSON.stringify(b.visual))).join(" ");
  return maths.match(/[0-9)( ]([a-z])\b/)?.[1] ?? "x";
}

export function buildAuthoredLesson(input: AuthoredLessonInput): AuthoredLessonProps {
  const { draft } = input;
  const scenes: AuthoredScene[] = draft.scenes.map((scene, si) => ({
    id: `scene-${si}`,
    title: scene.title,
    beats: scene.beats.map((beat) => ({ text: beat.say, seconds: estimateSeconds(beat.say, beat.visual), visual: beat.visual })),
  }));
  const checkpoints: LessonCheckpoint[] = draft.checkpoints.map((cp, i) => ({
    id: `cp-${i}`,
    afterScene: cp.afterScene,
    afterBeat: cp.afterBeat,
    prompt: prettyText(cp.prompt),
    spoken: cp.spoken,
    options: cp.options.map((o) => ({ label: /[\^*]|\d[a-z]|\([a-z]/.test(o.label) ? prettyMath(o.label) : o.label, correct: o.correct, feedback: o.feedback })),
  }));
  return {
    studentName: input.studentName,
    topic: "Factorisation",
    theme: input.theme,
    variable: variableOf(draft),
    scenes,
    checkpoints,
  };
}

export function authoredDurationInFrames(props: Pick<AuthoredLessonProps, "scenes">, fps: number): number {
  return Math.max(1, props.scenes.reduce((sum, s) => sum + s.beats.reduce((t, b) => t + Math.round(b.seconds * fps), 0), 0));
}
