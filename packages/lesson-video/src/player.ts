/**
 * Browser entry: the lesson compositions for @remotion/player. No Node-only
 * code (bundler/renderer) is reachable from here, so the web app can import it.
 */
export { TrinomialLesson } from "./trinomial/TrinomialLesson";
export { DistributionLesson } from "./distribution/DistributionLesson";
export { AuthoredLesson } from "./authored/AuthoredLesson";
export { authoredDurationInFrames, prettyMath, type AuthoredLessonProps } from "./authored/build";
export { gridExtent, missingAngle, pieSlices, polygonCorners, slicePath, towardCentre } from "./authored/figures";
export { trinomialDurationInFrames, type TrinomialLessonProps } from "./trinomial/trinomial";
export { distributionLessonDurationInFrames, lessonFps, type DistributionLessonProps } from "./distribution/lesson";
export { LESSON_THEMES, type LessonThemeId } from "./themes";
export type { LessonCheckpoint, KitScene } from "./lesson-types";
export { LESSON_VIDEO_WIDTH, LESSON_VIDEO_HEIGHT } from "./types";
