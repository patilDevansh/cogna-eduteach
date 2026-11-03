"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOTUS_THEME, LOTUS_THEMES, type LotusTheme, type LotusThemeSettings } from "@cogna/shared";
import { api } from "@/lib/api";

const NEUTRAL: LotusThemeSettings = { chosen: null, lockedTheme: null, effective: DEFAULT_LOTUS_THEME };
const SEEN_KEY = "cogna_lotus_theme_seen";

/** The look this browser last showed, so a page opened later (the report) doesn't flash the neutral look first. */
function lastSeenTheme(): LotusTheme | null {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    return LOTUS_THEMES.find((theme) => theme === seen) ?? null;
  } catch {
    return null;
  }
}

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
    const seen = lastSeenTheme();
    if (seen) setSettings((current) => (current.effective === seen ? current : { ...current, effective: seen }));
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

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(SEEN_KEY, settings.effective); } catch { /* storage can be blocked */ }
  }, [ready, settings.effective]);

  return { settings, ready, busy, choose };
}
