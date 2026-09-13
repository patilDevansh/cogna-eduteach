import React from "react";
import { Composition } from "remotion";
import { LessonVideo } from "./LessonVideo";
import { ProductLoop } from "./ProductLoop";
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
