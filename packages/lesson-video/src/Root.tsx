import React from "react";
import { Composition } from "remotion";
import { LessonVideo } from "./LessonVideo";
import { ProductLoop } from "./ProductLoop";
import { DistributionLesson } from "./distribution/DistributionLesson";
import { TrinomialLesson } from "./trinomial/TrinomialLesson";
import {
  AARAV_TRINOMIAL_EXAMPLE,
  buildTrinomialLesson,
  trinomialDurationInFrames,
  type TrinomialLessonProps,
} from "./trinomial/trinomial";
import {
  MEENA_EXAMPLE,
  buildDistributionLesson,
  distributionLessonDurationInFrames,
  lessonFps,
  type DistributionLessonProps,
} from "./distribution/lesson";
import {
  LESSON_VIDEO_FPS,
  LESSON_VIDEO_HEIGHT,
  LESSON_VIDEO_WIDTH,
  PRODUCT_LOOP_FPS,
  PRODUCT_LOOP_HEIGHT,
  PRODUCT_LOOP_WIDTH,
  lessonDurationInFrames,
  productLoopDurationInFrames,
  type LessonVideoProps,
} from "./types";

// Studio preview uses estimated pacing and no audio; the render script
// replaces beat timings with real narration lengths.
const meenaPreview: DistributionLessonProps = buildDistributionLesson(MEENA_EXAMPLE);

const aaravTrinomialPreview: TrinomialLessonProps = buildTrinomialLesson(AARAV_TRINOMIAL_EXAMPLE);

const emptyProps: LessonVideoProps = { title: "Approved lesson", scenes: [] };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LessonVideo"
        component={LessonVideo}
        durationInFrames={15}
        fps={LESSON_VIDEO_FPS}
        width={LESSON_VIDEO_WIDTH}
        height={LESSON_VIDEO_HEIGHT}
        defaultProps={emptyProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: lessonDurationInFrames(props.scenes, LESSON_VIDEO_FPS),
        })}
      />
      <Composition
        id="DistributionLesson"
        component={DistributionLesson}
        durationInFrames={distributionLessonDurationInFrames(meenaPreview, lessonFps())}
        fps={lessonFps()}
        width={LESSON_VIDEO_WIDTH}
        height={LESSON_VIDEO_HEIGHT}
        defaultProps={meenaPreview}
        calculateMetadata={({ props }) => ({
          durationInFrames: distributionLessonDurationInFrames(props, lessonFps()),
        })}
      />
      <Composition
        id="TrinomialLesson"
        component={TrinomialLesson}
        durationInFrames={trinomialDurationInFrames(aaravTrinomialPreview, lessonFps())}
        fps={lessonFps()}
        width={LESSON_VIDEO_WIDTH}
        height={LESSON_VIDEO_HEIGHT}
        defaultProps={aaravTrinomialPreview}
        calculateMetadata={({ props }) => ({
          durationInFrames: trinomialDurationInFrames(props, lessonFps()),
        })}
      />
      <Composition
        id="ProductLoop"
        component={ProductLoop}
        durationInFrames={productLoopDurationInFrames()}
        fps={PRODUCT_LOOP_FPS}
        width={PRODUCT_LOOP_WIDTH}
        height={PRODUCT_LOOP_HEIGHT}
      />
    </>
  );
};
