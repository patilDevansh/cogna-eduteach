/**
 * Themed Lotus games: richer ways to answer a factorising question.
 *
 * A game only changes how a question is dressed and what process evidence is
 * recorded (the search path, a guess made before the options, the verdicts on
 * several claims). Which answer is marked, and how, never changes: the server
 * builds every game from the checked question, and on submit it rebuilds the
 * answer from the payload itself and reads the process evidence itself. The
 * browser never decides what was answered and never sees what is right.
 *
 * The student's theme (see lotus-themes.ts) supplies words and art only.
 */
export const LOTUS_GAME_KINDS = ["TWO_NUMBERS", "COMMIT_THEN_CHOOSE", "TRUE_FALSE"] as const;
export type LotusGameKind = (typeof LOTUS_GAME_KINDS)[number];

export function isLotusGameKind(value: unknown): value is LotusGameKind {
  return typeof value === "string" && (LOTUS_GAME_KINDS as readonly string[]).includes(value);
}

/** Student-facing facts about a game, for pickers and audit views. */
export const LOTUS_GAME_TITLES: Record<LotusGameKind, string> = {
  TWO_NUMBERS: "Two numbers",
  COMMIT_THEN_CHOOSE: "Commit, then choose",
  TRUE_FALSE: "True or false",
};

/** Most numbers a "Two numbers" search can record, and the longest search kept. */
export const LOTUS_GAME_MAX_TRIES = 40;
/** A claim verdict. `null` is not used on the wire: every claim must be decided. */
export type LotusClaimVerdict = "true" | "false" | "unsure";
export const LOTUS_CLAIM_VERDICTS: readonly LotusClaimVerdict[] = ["true", "false", "unsure"];

interface LotusGameBase {
  version: 1;
  /** The expression the student works on, as plain algebra text. */
  expression: string;
}

/** Choose the two numbers p and q for (x + p)(x + q). */
export interface TwoNumbersGame extends LotusGameBase {
  kind: "TWO_NUMBERS";
  /** The numbers can be set anywhere from −range to +range, never 0. */
  range: number;
}

/** Guess (x + p)(x + q) first; the options appear only after that guess is locked in. */
export interface CommitThenChooseGame extends LotusGameBase {
  kind: "COMMIT_THEN_CHOOSE";
  range: number;
  /** Candidate answers, plain algebra text, in display order. */
  options: string[];
}

/** Judge each claim "expression = candidate". */
export interface TrueFalseGame extends LotusGameBase {
  kind: "TRUE_FALSE";
  /** Candidates, in the order the cards are dealt. */
  claims: string[];
}

/** What the browser gets: the configuration of a game, carrying no answer. */
export type LotusGameConfig = TwoNumbersGame | CommitThenChooseGame | TrueFalseGame;

export interface TwoNumbersTry {
  p: number;
  q: number;
  /** Milliseconds since the game was shown when the student settled on this pair. Weak evidence only. */
  atMs?: number;
}

export interface TwoNumbersResponse {
  kind: "TWO_NUMBERS";
  /** Pairs the student paused on, oldest first. */
  tries: TwoNumbersTry[];
  /** The pair locked in. */
  final: { p: number; q: number };
}

export interface CommitThenChooseResponse {
  kind: "COMMIT_THEN_CHOOSE";
  /** The guess made before any option was shown. */
  guess: { p: number; q: number };
  /** Index into the issued options. */
  pick: number;
  /** Milliseconds from locking in the guess to choosing. Weak evidence only. */
  chooseMs?: number;
}

export interface TrueFalseResponse {
  kind: "TRUE_FALSE";
  /** One verdict per issued claim, in the issued order. */
  verdicts: LotusClaimVerdict[];
  /** Milliseconds spent on each card, same order. Weak evidence only. */
  cardMs?: number[];
}

export type LotusGameResponse = TwoNumbersResponse | CommitThenChooseResponse | TrueFalseResponse;

/**
 * What the server read from a game, for teachers and the diagnosis. Never shown
 * to the student during the test. Plain text only.
 */
export interface LotusGameReading {
  kind: LotusGameKind;
  /** One or two plain sentences. */
  summary: string;
  /** Machine-readable tags, e.g. "hit_sign_slip", "predicted_then_picked". */
  signals: string[];
  /** 0–1: how firmly this evidence points one way. */
  certainty: number;
  /** The skill the question tests, copied from the checked question. */
  skillId: string;
  /** Small figures behind the summary (tries, right-product tries, …). */
  facts: Record<string, number | string | boolean>;
}
