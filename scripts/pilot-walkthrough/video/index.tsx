import React from "react";
import { Composition, registerRoot } from "remotion";
import { FPS, HEIGHT, WIDTH, Walkthrough, totalFrames, type WalkthroughProps } from "./Walkthrough";

const Root: React.FC = () => (
  <Composition
    id="PilotWalkthrough"
    component={Walkthrough as unknown as React.FC<Record<string, unknown>>}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={1}
    defaultProps={{ segments: [], model: "real" } as WalkthroughProps as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => ({ durationInFrames: totalFrames((props as unknown as WalkthroughProps).segments) })}
  />
);

registerRoot(Root);
