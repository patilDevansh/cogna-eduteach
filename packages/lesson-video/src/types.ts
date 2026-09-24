export type LessonAccent = "green" | "amber" | "violet";

/**
 * One frame of a scene's equation display — see the matching type in
 * @cogna/shared's personalized-videos contract (duplicated here, not
 * imported, to keep this package dependency-free of @cogna/shared).
 * A single-element array renders as static text for the whole scene, same
 * as the old plain-string display; multiple steps animate in sequence.
 */
export interface EquationStep {
  text: string;
  highlight?: Array<[number, number]>;
}

export interface LessonVideoScene {
  eyebrow?: string;
  headline: string;
  equation: EquationStep[];
  narration: string;
  durationSeconds: number;
  accent?: LessonAccent | string;
  /**
   * Absolute local filesystem path to a pre-generated narration clip for this
   * scene (caller-resolved — see apps/api's synthesizeNarration). Optional:
   * omit for a silent scene, e.g. when TTS is disabled or generation failed.
   * render.ts converts this to a file:// URL (audioSrc) before it reaches the
   * composition; the package itself never generates audio.
   */
  audioPath?: string;
  /**
   * render.ts-derived file:// URL for audioPath, set right before rendering.
   * Not meant to be set by callers directly — set audioPath instead.
   */
  audioSrc?: string;
}

export interface LessonVideoProps {
  title: string;
  scenes: LessonVideoScene[];
}

export const LESSON_VIDEO_FPS = 24;
export const LESSON_VIDEO_WIDTH = 1280;
export const LESSON_VIDEO_HEIGHT = 720;

/**
 * Crossfade length between scenes (~0.4s). Expressed in seconds, not frames,
 * so it stays correct at whatever fps a caller actually renders at — use
 * sceneTransitionFrames(fps) to get the frame count for a given rate.
 * TransitionSeries overlaps each pair of adjacent scenes by this many
 * frames, so the composition's total length is shorter than the plain sum
 * of scene durations — lessonDurationInFrames subtracts it, or the
 * calculated duration (what Remotion actually renders, and what durationMs
 * reports to callers) would run long relative to what the transitions
 * actually produce. LessonVideo.tsx calls the same helper so the two can
 * never drift apart.
 */
export const SCENE_TRANSITION_SECONDS = 0.4;

export function sceneTransitionFrames(fps: number): number {
  return Math.round(SCENE_TRANSITION_SECONDS * fps);
}

export function lessonDurationInFrames(
  scenes: LessonVideoScene[],
  fps = LESSON_VIDEO_FPS,
): number {
  const seconds = scenes.reduce((sum, scene) => sum + Math.max(scene.durationSeconds, 1), 0);
  const totalFrames = Math.round(seconds * fps);
  const overlapFrames = scenes.length > 1 ? (scenes.length - 1) * sceneTransitionFrames(fps) : 0;
  return Math.max(1, totalFrames - overlapFrames);
}

export const PRODUCT_LOOP_FPS = 24;
export const PRODUCT_LOOP_WIDTH = 1280;
export const PRODUCT_LOOP_HEIGHT = 720;

export const PRODUCT_LOOP_SCENES = [
  {
    id: "title",
    seconds: 5,
    voice: "Cogna. Student and teacher, one honest loop.",
  },
  {
    id: "twoSides",
    seconds: 6,
    voice: "Aarav works a problem. Ananya sees the next teaching move, not a long report.",
  },
  {
    id: "join",
    seconds: 6,
    voice: "The student joins with a class code. The session is calm, signed, and attributed.",
  },
  {
    id: "diagnostic",
    seconds: 8,
    voice: "Lotus records the answer, the working, the confidence, and the time. Every action is evidence.",
  },
  {
    id: "evidence",
    seconds: 7,
    voice: "Cogna names one supported need. Aarav already knows the sign rule. The work is to keep both products visible.",
  },
  {
    id: "lesson",
    seconds: 8,
    voice: "A short, verified lesson. Unchecked mathematics never reaches the student.",
  },
  {
    id: "exit",
    seconds: 6,
    voice: "Then a fresh item, without hints. Watching is not the same as knowing.",
  },
  {
    id: "teacher",
    seconds: 9,
    voice: "Ananya’s first screen: who is ready, who needs a bridge, and who should not be labelled yet.",
  },
  {
    id: "roster",
    seconds: 9,
    voice: "Five students. Five distinct next actions. The exact work sits behind each card.",
  },
  {
    id: "close",
    seconds: 6,
    voice: "The child practices. The teacher decides. Cogna does not invent a label.",
  },
] as const;

export function productLoopDurationInFrames(fps = PRODUCT_LOOP_FPS): number {
  return Math.max(
    1,
    PRODUCT_LOOP_SCENES.reduce((sum, scene) => sum + Math.round(scene.seconds * fps), 0),
  );
}
