/**
 * Lotus themes: the look a student takes the diagnostic in.
 *
 * A theme only changes how questions are dressed (words, art, fonts, progress).
 * It never changes what is asked or how an answer is read, so the diagnosis is
 * identical in every theme. "studio" is the neutral, default one.
 */
export const LOTUS_THEMES = ["studio", "drafting", "cabinet", "soundlab"] as const;
export type LotusTheme = (typeof LOTUS_THEMES)[number];

export const DEFAULT_LOTUS_THEME: LotusTheme = "studio";

export const LOTUS_THEME_NAMES: Record<LotusTheme, string> = {
  studio: "Studio",
  drafting: "Drafting Room",
  cabinet: "The Cabinet",
  soundlab: "Sound Lab",
};

export function isLotusTheme(value: unknown): value is LotusTheme {
  return typeof value === "string" && (LOTUS_THEMES as readonly string[]).includes(value);
}

/** What the student's screen needs to show the picker (or skip it). */
export interface LotusThemeSettings {
  /** The student's own choice, if they have made one. */
  chosen: LotusTheme | null;
  /** Set when a teacher has locked the class to one theme; the picker is then hidden. */
  lockedTheme: LotusTheme | null;
  /** What the screen should use right now: the lock, else the choice, else the neutral default. */
  effective: LotusTheme;
}

/** A teacher's lock wins over the student's choice, which wins over the neutral default. */
export function resolveLotusTheme(chosen: unknown, lockedThemes: readonly unknown[]): LotusThemeSettings {
  const lockedTheme = lockedThemes.find(isLotusTheme) ?? null;
  const own = isLotusTheme(chosen) ? chosen : null;
  return { chosen: own, lockedTheme, effective: lockedTheme ?? own ?? DEFAULT_LOTUS_THEME };
}
