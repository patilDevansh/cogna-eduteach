"use client";

import { useEffect, useState } from "react";

/** How often teacher pages re-read live class data. */
export const LIVE_MS = 5_000;

/** A number that goes up every `ms` and when the tab is shown again; add it to an effect's deps to reload live data. */
export function useRefreshTick(ms = 20_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    const timer = window.setInterval(bump, ms);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", bump);
    };
  }, [ms]);
  return tick;
}
