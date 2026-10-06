/**
 * Game-like answer formats ("interaction formats") for the Lotus diagnostic,
 * the independent exit and practice.
 *
 * A format only changes how a student ENTERS an answer, never how it is
 * marked: the student's tile picks are assembled into the same plain answer
 * text a typed answer would produce, and that text goes through the existing
 * algebra marking unchanged. The server builds every tile set from a verified
 * answer key, checks that the right picks assemble into a CORRECT answer, and
 * re-assembles the answer from the picks itself on submit — the browser never
 * decides what was answered.
 *
 * See docs/mvp-10.0/INTERACTION_FORMATS.md.
 */

/** Where a format may be used. The exit only allows formats where the student builds the answer. */
export type InteractionStage = "DIAGNOSTIC" | "EXIT" | "PRACTICE";

/**
 * BRACKET_BRIDGE — two linear brackets for a monic trinomial: tiles are the insides ("x + 5").
 * FACTOR_BUILDER — a full factorisation built from factor tiles ("2", "(x - 3)", "(x^2 - 9)"); boxes may stay empty.
 * TERM_BUILDER   — an expansion built from signed term tiles ("-6x", "+ 12").
 */
export type TileBuildFormat = "BRACKET_BRIDGE" | "FACTOR_BUILDER" | "TERM_BUILDER";

export interface InteractionFormatSpec {
  id: TileBuildFormat;
  /** Student-facing name of the game. */
  title: string;
  /** One line telling the student what to do. */
  instruction: string;
  stages: readonly InteractionStage[];
  /** True when the student constructs the answer (required for the exit). */
  constructed: boolean;
}

export const INTERACTION_FORMATS: Record<TileBuildFormat, InteractionFormatSpec> = {
  BRACKET_BRIDGE: {
    id: "BRACKET_BRIDGE",
    title: "Bracket bridge",
    instruction: "Build the two brackets.",
    stages: ["DIAGNOSTIC", "EXIT", "PRACTICE"],
    constructed: true,
  },
  FACTOR_BUILDER: {
    id: "FACTOR_BUILDER",
    title: "Split it",
    instruction: "Build the fully factorised answer. Leave a box empty if you need fewer parts.",
    stages: ["DIAGNOSTIC", "EXIT", "PRACTICE"],
    constructed: true,
  },
  TERM_BUILDER: {
    id: "TERM_BUILDER",
    title: "Term builder",
    instruction: "Build the answer one term at a time.",
    stages: ["DIAGNOSTIC", "EXIT", "PRACTICE"],
    constructed: true,
  },
};

/** One piece of fixed text between answer boxes, or an answer box (by index). */
export type TileFramePart = { text: string } | { slot: number };

/** Everything the browser needs to draw a tile game. Contains no answer key. */
export interface TileBuildInteraction {
  version: 1;
  format: TileBuildFormat;
  stage: InteractionStage;
  /** The expression the student works on, as plain algebra text. */
  expression: string;
  /** How the boxes sit in the answer, e.g. "(" [0] ")(" [1] ")". */
  frame: TileFramePart[];
  slots: number;
  /** Tile labels, plain algebra text, in display order. */
  tiles: string[];
  /** When true a box may be left empty (FACTOR_BUILDER: fewer parts than boxes). */
  allowEmpty: boolean;
}

/** What the browser sends back: the tile index chosen for each box (null = left empty). */
export interface TileBuildResponse {
  format: TileBuildFormat;
  picks: Array<number | null>;
  /** How many times the student took a tile back out before submitting. Weak evidence only. */
  changes?: number;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Turns tile picks into the answer text. Shared by browser (preview) and
 * server (marking), so both always agree. Returns null when the picks don't
 * make a complete answer (a required box is empty, an index is out of range,
 * or a tile is used twice).
 */
export function assembleTileAnswer(interaction: TileBuildInteraction, picks: ReadonlyArray<number | null>): string | null {
  if (!Array.isArray(picks) || picks.length !== interaction.slots) return null;
  const used = new Set<number>();
  const parts: string[] = [];
  for (const pick of picks) {
    if (pick === null) {
      if (!interaction.allowEmpty) return null;
      continue;
    }
    if (!Number.isInteger(pick) || pick < 0 || pick >= interaction.tiles.length || used.has(pick)) return null;
    used.add(pick);
    parts.push(interaction.tiles[pick]!);
  }
  if (parts.length === 0) return null;
  switch (interaction.format) {
    case "BRACKET_BRIDGE":
      return parts.length === 2 ? `(${tidy(parts[0]!)})(${tidy(parts[1]!)})` : null;
    case "FACTOR_BUILDER":
      return parts.map(tidy).join("");
    case "TERM_BUILDER":
      return parts
        .map((raw, i) => {
          const term = tidy(raw);
          const sign = term[0] === "-" || term[0] === "+" ? term[0] : "+";
          const body = sign === term[0] ? term.slice(1).trim() : term;
          if (i === 0) return sign === "-" ? `-${body}` : body;
          return `${sign} ${body}`;
        })
        .join(" ");
  }
}

/** True when a format may be used at a stage. */
export function formatAllowedAt(format: TileBuildFormat, stage: InteractionStage): boolean {
  const spec = INTERACTION_FORMATS[format];
  return spec.stages.includes(stage) && (stage !== "EXIT" || spec.constructed);
}
