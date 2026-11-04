"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * A game's unfinished play, kept for this tab so a refresh resumes it. Like the
 * typed-answer recovery it stays in the browser: nothing here is evidence until
 * the student submits, and the server still reads and checks the final play.
 */
const PREFIX = "cogna_lotus_game_draft:";

export interface GameDraftContext {
  /** The student and question this play belongs to. */
  scope: string;
  /** What a typing game holds now, for the same bounded draft record as a typed answer. */
  onTyped?: (text: string) => void;
  onTypedBlur?: () => void;
}

export const GameDraft = createContext<GameDraftContext | null>(null);

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** A saved value only comes back if it still has the shape the game expects. */
function fits(saved: unknown, initial: unknown): boolean {
  if (initial === null) return true;
  if (Array.isArray(initial)) return Array.isArray(saved) && (initial.length === 0 || saved.length === initial.length);
  if (typeof initial === "object") {
    return !!saved && typeof saved === "object" && !Array.isArray(saved) && Object.keys(initial as object).every((key) => key in (saved as object));
  }
  return typeof saved === typeof initial;
}

/** useState that survives a refresh of this question. Without a scope it is plain useState. */
export function useGameDraft<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(GameDraft)?.scope;
  const key = scope ? `${PREFIX}${scope}:${name}` : null;
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial;
    try {
      const raw = storage()?.getItem(key);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (fits(saved, initial)) return saved as T;
      }
    } catch {
      // A damaged draft is the same as none.
    }
    return initial;
  });
  useEffect(() => {
    if (!key) return;
    try {
      storage()?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be blocked or full: the game still plays, it just won't survive a refresh.
    }
  }, [key, value]);
  return [value, setValue];
}

/** Once a new question is on screen, drafts for any other question are finished with. */
export function clearOtherGameDrafts(scope: string): void {
  const store = storage();
  if (!store) return;
  try {
    const keep = `${PREFIX}${scope}:`;
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX) && !key.startsWith(keep)) store.removeItem(key);
    }
  } catch {
    // Nothing depends on this tidy-up.
  }
}
