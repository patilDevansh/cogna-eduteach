/**
 * Lotus themes: the look a student takes the diagnostic in.
 *
 * A theme only changes how questions are dressed (words, art, fonts, progress).
 * It never changes what is asked or how an answer is read, so the diagnosis is
 * identical in every theme. "sevenways" is the look Lotus is built around.
 */
export const LOTUS_THEMES = ["sevenways", "studio", "drafting", "cabinet", "soundlab"] as const;
export type LotusTheme = (typeof LOTUS_THEMES)[number];

/**
 * The looks students and teachers can actually get. The other looks stay in the
 * code and a saved choice of one stays stored, so offering it again brings it back.
 */
export const LOTUS_OFFERED_THEMES: readonly LotusTheme[] = ["sevenways"];

export const DEFAULT_LOTUS_THEME: LotusTheme = "sevenways";

export const LOTUS_THEME_NAMES: Record<LotusTheme, string> = {
  sevenways: "Seven Ways",
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
  const offered = (value: unknown): value is LotusTheme => isLotusTheme(value) && LOTUS_OFFERED_THEMES.includes(value);
  const lockedTheme = lockedThemes.find(offered) ?? null;
  const own = offered(chosen) ? chosen : null;
  return { chosen: own, lockedTheme, effective: lockedTheme ?? own ?? DEFAULT_LOTUS_THEME };
}
