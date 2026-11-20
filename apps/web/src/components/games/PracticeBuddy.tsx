"use client";

import { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

/**
 * The practice companion. A Rive state machine owns all of its animation; this only sets inputs.
 * ponytail: Rive's public sample bear stands in until we have our own Cogna character; swap BUDDY_SRC
 * (and the input names) when that file exists.
 */
const BUDDY_SRC = "https://public.rive.app/community/runtime-files/2244-4463-animated-login-screen.riv";
const MACHINE = "Login Machine";

export type BuddyReaction = { kind: "thinking" | "right" | "wrong" | "idle"; n: number };

/** look: where the bear's eyes point, 0 (far left) to 100 (far right); defaults to straight ahead. */
export function PracticeBuddy({ reaction, look: lookAt = 50, className }: { reaction: BuddyReaction; look?: number; className?: string }) {
  const [ready, setReady] = useState(false);
  const { rive, RiveComponent } = useRive({ src: BUDDY_SRC, stateMachines: MACHINE, autoplay: true, onLoad: () => setReady(true) });
  const checking = useStateMachineInput(rive, MACHINE, "isChecking");
  const look = useStateMachineInput(rive, MACHINE, "numLook");
  const success = useStateMachineInput(rive, MACHINE, "trigSuccess");
  const fail = useStateMachineInput(rive, MACHINE, "trigFail");

  useEffect(() => {
    if (!rive) return;
    // Decoration only: a missing or torn-down bear must never break practice.
    try {
      if (checking) checking.value = reaction.kind === "thinking";
      if (reaction.kind === "right") success?.fire();
      if (reaction.kind === "wrong") fail?.fire();
    } catch { /* bear gone */ }
  }, [reaction, rive, checking, success, fail]);

  useEffect(() => {
    try { if (rive && look) look.value = lookAt; } catch { /* bear gone */ }
  }, [lookAt, rive, look]);

  // Hidden until loaded, so an offline or blocked fetch leaves no empty frame.
  return (
    <div className={className} style={{ opacity: ready ? 1 : 0, transition: "opacity 300ms" }} aria-hidden>
      <RiveComponent />
    </div>
  );
}
