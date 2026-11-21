import React from "react";
import { Composition } from "remotion";
import { LessonVideo } from "./LessonVideo";
import { ProductLoop } from "./ProductLoop";
import { DistributionLesson } from "./distribution/DistributionLesson";
import { TrinomialLesson } from "./trinomial/TrinomialLesson";
import { AuthoredLesson } from "./authored/AuthoredLesson";
import { authoredDurationInFrames, buildAuthoredLesson, type AuthoredLessonProps } from "./authored/build";
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

// A short lesson that touches each kind of motion, so Studio shows something for AuthoredLesson.
const authoredPreview: AuthoredLessonProps = buildAuthoredLesson({
  studentName: "Meena",
  draft: {
    title: "Opening a bracket",
    objective: "Multiply every term inside the bracket.",
    checkpoints: [],
    scenes: [
      {
        title: "What happened in your answer",
        beats: [
          { say: "Here is the bracket you opened.", visual: { type: "expression", expr: "3(x + 4)", highlight: ["4"], caption: "Both terms are inside the bracket" } },
          { say: "The 3 reached x, but it never reached the 4.", visual: { type: "mistake", expr: "3(x + 4)", task: "expand", wrong: "3x + 4", wrongKind: "incorrect", right: "3x + 12", note: "The 3 multiplies every term inside the bracket." } },
          { say: "The 3 goes to each term in turn.", visual: { type: "distribute", outside: "3", inside: ["x", "4"], result: ["3x", "12"] } },
        ],
      },
      {
        title: "Using it",
        beats: [
          { say: "Open the bracket, then collect the numbers.", visual: { type: "steps", steps: ["3(x + 4) + 2", "3x + 12 + 2", "3x + 14"], caption: "Fully simplified" } },
          { say: "Four angles of a quadrilateral add to 360 degrees.", visual: { type: "shape", angles: [80, 95, 110, null], caption: "80 + 95 + 110 + ? = 360" } },
        ],
      },
    ],
  },
});

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
        id="AuthoredLesson"
        component={AuthoredLesson}
        durationInFrames={1}
        fps={lessonFps()}
        width={LESSON_VIDEO_WIDTH}
        height={LESSON_VIDEO_HEIGHT}
        defaultProps={authoredPreview}
        calculateMetadata={({ props }) => ({
          durationInFrames: authoredDurationInFrames(props, lessonFps()),
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
