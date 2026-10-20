import React from "react";
import { Composition, registerRoot } from "remotion";
import { FPS, SIZES, Walkthrough, totalFrames, type WalkthroughProps } from "./Walkthrough";

const Root: React.FC = () => (
  <Composition
    id="PilotWalkthrough"
    component={Walkthrough as unknown as React.FC<Record<string, unknown>>}
    fps={FPS}
    width={SIZES.wide.width}
    height={SIZES.wide.height}
    durationInFrames={1}
    defaultProps={{ segments: [], model: "real", layout: "wide" } as WalkthroughProps as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as WalkthroughProps;
      return { durationInFrames: totalFrames(p.segments), ...SIZES[p.layout ?? "wide"] };
    }}
  />
);

registerRoot(Root);
