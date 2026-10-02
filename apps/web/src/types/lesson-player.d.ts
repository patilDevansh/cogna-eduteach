/**
 * Type surface of @cogna/lesson-video's browser entry (packages/lesson-video/src/player.ts).
 * Declared here rather than type-checking the package source, which is built
 * against React 18 types for server rendering. next.config aliases the
 * module to the real source for bundling.
 */
declare module "@cogna/lesson-video/player" {
  import type { ComponentType } from "react";

  export interface KitScene {
    id: string;
    title: string;
    beats: Array<{ text: string; seconds: number; audioSrc?: string }>;
  }
  export interface LessonCheckpoint {
    id: string;
    afterScene: number;
    afterBeat: number;
    prompt: string;
    spoken: string;
    options: Array<{ label: string; correct: boolean; feedback: string }>;
  }
  export type LessonThemeId = "classic" | "cricket" | "space";
  export const LESSON_THEMES: Record<
    LessonThemeId,
    { id: LessonThemeId; label: string; blurb: string; palette: { paper: string; accent: string; line: string; ink: string } }
  >;
  export const TrinomialLesson: ComponentType<Record<string, unknown>>;
  export const DistributionLesson: ComponentType<Record<string, unknown>>;
  export const AuthoredLesson: ComponentType<Record<string, unknown>>;
  export function authoredDurationInFrames(props: { scenes: KitScene[] }, fps: number): number;
  /** ASCII algebra → display form: x^2 → x², binary minus → " − ". */
  export function prettyMath(text: string): string;
  export function trinomialDurationInFrames(props: { scenes: KitScene[] }, fps: number): number;
  export function distributionLessonDurationInFrames(props: { scenes: KitScene[] }, fps: number): number;
  export function lessonFps(): number;
  export const LESSON_VIDEO_WIDTH: number;
  export const LESSON_VIDEO_HEIGHT: number;
}
