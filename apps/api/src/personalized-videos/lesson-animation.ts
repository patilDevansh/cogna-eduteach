import type {
  PersonalizedVideoExitItem,
  PersonalizedVideoLesson,
} from "@cogna/shared";
import {
  AARAV_TRINOMIAL_EXAMPLE,
  MEENA_EXAMPLE,
  buildDistributionLesson,
  buildAuthoredLesson,
  buildTrinomialLesson,
  formatExpression,
  formatTrinomial,
  type AuthoredLessonInput,
  type AuthoredLessonProps,
  type DistributionLessonInput,
  type DistributionLessonProps,
  type TrinomialLessonInput,
  type TrinomialLessonProps,
} from "@cogna/lesson-video";

/**
 * Recipe and AI-authored lesson builders. Their scenes are stored with each
 * lesson, but students see the lesson as narrated slides.
 */

export type AnimationKind = "distribution" | "trinomial" | "authored";

export type AnimationInput =
  | { kind: "distribution"; input: DistributionLessonInput }
  | { kind: "trinomial"; input: TrinomialLessonInput }
  /** Written by the AI author; stored only after lesson-verifier.ts passed it. */
  | { kind: "authored"; input: AuthoredLessonInput; authoredBy?: { model: string; attempts: number; claimsChecked: number } };

export function buildLessonProps(source: AnimationInput): DistributionLessonProps | TrinomialLessonProps | AuthoredLessonProps {
  if (source.kind === "authored") return buildAuthoredLesson(source.input);
  return source.kind === "trinomial" ? buildTrinomialLesson(source.input) : buildDistributionLesson(source.input);
}

/**
 * Dev/demo only: animated lessons for pilot students built from their pilot
 * evidence (not a live diagnostic), so the student switcher can show each
 * one. Only students whose mistake has an animation recipe are listed.
 */
export const DEMO_ANIMATIONS: Partial<Record<string, AnimationInput>> = {
  aarav: { kind: "trinomial", input: { ...AARAV_TRINOMIAL_EXAMPLE, strengths: ["Factorising x² + bx + c"] } },
  meena: { kind: "distribution", input: { ...MEENA_EXAMPLE, strengths: ["Expanding one bracket"] } },
};

/** The lesson summary, exit item and decisions stored alongside a demo animation. */
export function demoLessonRecord(source: AnimationInput, firstName: string) {
  if (source.kind === "authored") throw new Error("Demo lessons are recipe lessons.");
  const input = { ...source, input: { ...source.input, studentName: firstName } } as AnimationInput;
  const props = buildLessonProps(input) as DistributionLessonProps | TrinomialLessonProps;
  const trinomial = input.kind === "trinomial";
  const heading = trinomial ? "read the signs first" : props.scenes[1]!.title.replace(/^./, (c) => c.toLowerCase());
  const equation = trinomial
    ? formatTrinomial((props as TrinomialLessonProps).trinomial)
    : formatExpression((props as DistributionLessonProps).groups, (props as DistributionLessonProps).variable || "x");
  const seconds = props.scenes.flatMap((scene) => scene.beats).reduce((t, b) => t + b.seconds, 0);
  const lesson: PersonalizedVideoLesson = {
    title: firstName ? `${firstName}, ${heading}` : heading.replace(/^./, (c) => c.toUpperCase()),
    duration: `About ${Math.max(1, Math.round(seconds / 60))} min`,
    objective: trinomial
      ? "Use the signs of the last and middle terms to choose the pair before factorising."
      : "Multiply the number outside a bracket into every term inside it.",
    generationReason: "Built from your pilot diagnostic answers (demo lesson).",
    verification: "Every number was computed in code, and the exit item is new.",
    scenes: props.scenes.map((scene) => ({
      eyebrow: props.topic,
      headline: scene.title,
      equation: [{ text: equation }],
      narration: scene.beats.map((b) => b.text).join(" "),
      durationSeconds: Math.ceil(scene.beats.reduce((t, b) => t + b.seconds, 0)),
      accent: "green" as const,
    })),
  };
  const exit: PersonalizedVideoExitItem = {
    prompt: trinomial ? props.exit.prompt : `${props.exit.prompt} Show your steps.`,
    expected: props.exit.expected,
    evidencePurpose: "A fresh item with the same trap, answered without support.",
  };
  return {
    input,
    lesson,
    exit,
    conceptId: trinomial ? "FAC_MONIC_TRINOMIAL" : "C3_DISTRIBUTIVE_PROPERTY",
    learnerDecision: trinomial
      ? "Read the last term's sign, then the middle's, before choosing the pair; expand to check."
      : "Count the terms inside, give every term an arrow, then check.",
    teacherDecision: "Demo lesson from pilot evidence. Give one fresh item of the same form, unsupported.",
  };
}
