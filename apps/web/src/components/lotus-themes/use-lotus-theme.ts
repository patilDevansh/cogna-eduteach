"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOTUS_THEME, type LotusTheme, type LotusThemeSettings } from "@cogna/shared";
import { api } from "@/lib/api";

const NEUTRAL: LotusThemeSettings = { chosen: null, lockedTheme: null, effective: DEFAULT_LOTUS_THEME };

/**
 * The student's Lotus look. A failed lookup never blocks the test: it falls
 * back to the neutral look, the one every other theme is measured against.
 */
export function useLotusTheme(studentId: string) {
  const [settings, setSettings] = useState<LotusThemeSettings>(NEUTRAL);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    // The student's session can still be settling when the page opens, so a first miss is retried a few times.
    (async () => {
      for (const wait of [0, 1200, 3000]) {
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        if (cancelled) return;
        try {
          const next = await api.getLotusTheme();
          if (!cancelled) { setSettings(next); setReady(true); }
          return;
        } catch {
          // try again
        }
      }
      if (!cancelled) { setSettings(NEUTRAL); setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  const choose = useCallback(async (theme: LotusTheme) => {
    setSettings((current) => (current.lockedTheme ? current : { ...current, chosen: theme, effective: theme }));
    setBusy(true);
    try {
      setSettings(await api.chooseLotusTheme(theme));
    } catch {
      // Keep the look on screen even if saving failed; it will be asked again next time.
    } finally {
      setBusy(false);
    }
  }, []);

  return { settings, ready, busy, choose };
}
