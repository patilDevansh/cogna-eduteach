/**
 * Lesson "worlds" a student can choose. A theme changes colours, background
 * art and a few framing sentences — never the mathematics. Palettes feed the
 * kit's CSS variables (see ThemeRoot in lesson-kit.tsx).
 */
export type LessonThemeId = "classic" | "cricket" | "space";

export interface LessonTheme {
  id: LessonThemeId;
  label: string;
  /** One short line for the theme picker. */
  blurb: string;
  palette: {
    paper: string;
    surface: string;
    ink: string;
    muted: string;
    line: string;
    accent: string;
    accentSoft: string;
    onAccent: string;
    miss: string;
    missSoft: string;
    fix: string;
    fixSoft: string;
    blue: string;
    blueSoft: string;
  };
}

export const LESSON_THEMES: Record<LessonThemeId, LessonTheme> = {
  classic: {
    id: "classic",
    label: "Classic",
    blurb: "Calm and clear",
    palette: {
      paper: "#f6f3ea",
      surface: "#ffffff",
      ink: "#0b3b33",
      muted: "#58706a",
      line: "rgba(11,59,51,0.12)",
      accent: "#1f8a6e",
      accentSoft: "rgba(31,138,110,0.14)",
      onAccent: "#ffffff",
      miss: "#d9480f",
      missSoft: "rgba(217,72,15,0.12)",
      fix: "#c77700",
      fixSoft: "rgba(199,119,0,0.16)",
      blue: "#3b5bdb",
      blueSoft: "rgba(59,91,219,0.12)",
    },
  },
  cricket: {
    id: "cricket",
    label: "Cricket",
    blurb: "Partnerships, overs and sixes",
    palette: {
      paper: "#eef4e4",
      surface: "#fffdf7",
      ink: "#15301c",
      muted: "#4e6a53",
      line: "rgba(21,48,28,0.14)",
      accent: "#1d7a3c",
      accentSoft: "rgba(29,122,60,0.15)",
      onAccent: "#ffffff",
      miss: "#c0262d",
      missSoft: "rgba(192,38,45,0.12)",
      fix: "#b8741a",
      fixSoft: "rgba(184,116,26,0.16)",
      blue: "#1f5fa8",
      blueSoft: "rgba(31,95,168,0.12)",
    },
  },
  space: {
    id: "space",
    label: "Space",
    blurb: "Rockets, ports and docking",
    palette: {
      paper: "#0f1633",
      surface: "#1a2350",
      ink: "#eef1ff",
      muted: "#a9b2d8",
      line: "rgba(238,241,255,0.16)",
      accent: "#7fd6c2",
      accentSoft: "rgba(127,214,194,0.18)",
      onAccent: "#0f1633",
      miss: "#ff7b5c",
      missSoft: "rgba(255,123,92,0.18)",
      fix: "#ffc857",
      fixSoft: "rgba(255,200,87,0.18)",
      blue: "#9fb4ff",
      blueSoft: "rgba(159,180,255,0.18)",
    },
  },
};

export function lessonTheme(id: string | undefined | null): LessonTheme {
  return LESSON_THEMES[(id as LessonThemeId) ?? "classic"] ?? LESSON_THEMES.classic;
}
