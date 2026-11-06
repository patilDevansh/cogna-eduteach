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
export const LOTUS_GAME_KINDS = ["TWO_NUMBERS", "COMMIT_THEN_CHOOSE", "TRUE_FALSE", "SPLIT_CONFIDENCE", "TWO_MOVES", "FOUR_SIGNS", "EDIT_HISTORY", "RECTANGLE", "READBACK", "ORDER_STEPS", "TEST_CLAIM", "RAPID_SET", "FIND_EVERY_B", "REPLAY", "CHUNK_IT"] as const;
export type LotusGameKind = (typeof LOTUS_GAME_KINDS)[number];

export function isLotusGameKind(value: unknown): value is LotusGameKind {
  return typeof value === "string" && (LOTUS_GAME_KINDS as readonly string[]).includes(value);
}

/** Student-facing facts about a game, for pickers and audit views. */
export const LOTUS_GAME_TITLES: Record<LotusGameKind, string> = {
  TWO_NUMBERS: "Two numbers",
  COMMIT_THEN_CHOOSE: "Commit, then choose",
  TRUE_FALSE: "True or false",
  SPLIT_CONFIDENCE: "Split your confidence",
  TWO_MOVES: "Look inside",
  FOUR_SIGNS: "Four sign cases",
  EDIT_HISTORY: "Edit history",
  RECTANGLE: "Tiles",
  READBACK: "Confirm your input",
  ORDER_STEPS: "Order the steps",
  TEST_CLAIM: "Test the claim",
  RAPID_SET: "Rapid set",
  FIND_EVERY_B: "Find every b",
  REPLAY: "Stop the replay",
  CHUNK_IT: "Chunk it",
};

/** Most numbers a "Two numbers" search can record, and the longest search kept. */
export const LOTUS_GAME_MAX_TRIES = 40;
/** A claim verdict. `null` is not used on the wire: every claim must be decided. */
export type LotusClaimVerdict = "true" | "false" | "unsure";
export const LOTUS_CLAIM_VERDICTS: readonly LotusClaimVerdict[] = ["true", "false", "unsure"];
/** Tokens a student shares across the answers in "Split your confidence". */
export const LOTUS_SPLIT_TOKENS = 4;
/** The sign in front of a number in a bracket. */
export type LotusBracketSign = "+" | "-";
/** "Edit history": most snapshots of the typed answer kept, and the longest text of one snapshot. */
export const LOTUS_EDIT_MAX_SAMPLES = 400;
export const LOTUS_EDIT_MAX_LENGTH = 120;

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

/** Share four tokens across the answers: all on one if sure, split if torn. */
export interface SplitConfidenceGame extends LotusGameBase {
  kind: "SPLIT_CONFIDENCE";
  options: string[];
}

/** Move 1: the two numbers. Move 2: the sign each one takes into its bracket. */
export interface TwoMovesGame extends LotusGameBase {
  kind: "TWO_MOVES";
  range: number;
}

/**
 * The numbers are given; the student sets the signs in four cases, one of which
 * is the question. The pattern across the four is the evidence.
 */
export interface FourSignsGame extends LotusGameBase {
  kind: "FOUR_SIGNS";
  /** The two numbers, smaller first, as they sit in every bracket pair. */
  numbers: [number, number];
  /** The four expressions, in display order. */
  cases: string[];
}

/** Type the answer; each deleted draft is kept and read. Works on any factorising question. */
export interface EditHistoryGame extends LotusGameBase {
  kind: "EDIT_HISTORY";
}

/**
 * Make one rectangle from an x² square, `strips` strips and `units` unit tiles
 * by choosing how many strips go down the side. Both numbers are the
 * coefficients already written in the expression.
 */
export interface RectangleGame extends LotusGameBase {
  kind: "RECTANGLE";
  strips: number;
  units: number;
}

/** Type the answer and see how it was read before it is marked. Works on any factorising question. */
export interface ReadbackGame extends LotusGameBase {
  kind: "READBACK";
}

/**
 * Build the working for a grouping question by tapping three of the six cards
 * into order. Three cards are sound steps and three each hide a slip; nothing
 * on a card says which. The last card placed is the answer.
 */
export interface OrderStepsGame extends LotusGameBase {
  kind: "ORDER_STEPS";
  /** The six cards, in the order they are dealt. */
  steps: string[];
  /** How many cards the working takes. */
  slots: number;
}

/** Is `(x + k)² = x² + k²` always, sometimes or never true? Try values of x, then decide. */
export interface TestClaimGame extends LotusGameBase {
  kind: "TEST_CLAIM";
  /** The claim compares (x + k)² with x² + k². */
  k: number;
  min: number;
  max: number;
  /** The verdicts, in display order. */
  options: string[];
}

export interface RapidSetRow {
  /** The expression to factorise. */
  q: string;
  options: string[];
}

/** Four quick factorisations; the last one is a look-alike of the first three. */
export interface RapidSetGame extends LotusGameBase {
  kind: "RAPID_SET";
  rows: RapidSetRow[];
}

/** Pick every whole number b for which x² + bx + c factorises into two brackets. */
export interface FindEveryBGame extends LotusGameBase {
  kind: "FIND_EVERY_B";
  c: number;
  /** The b values on the number line run from −range to +range. */
  range: number;
}

/** A worked check plays line by line; stop it at the first line that goes wrong. */
export interface ReplayGame extends LotusGameBase {
  kind: "REPLAY";
  /** What is being checked, e.g. "(x − 3)(x + 2)". */
  claim: string;
  /** The working, one line at a time. */
  lines: string[];
  /** How long each line stays alone on the screen before the next appears. */
  stepMs: number;
}

export interface ChunkRoute {
  /** The first move, named. Says what is done, never whether it works. */
  move: "CHUNK" | "EXPAND" | "ROOT";
  /** The working this first move leads to, line by line. The last line is the answer it ends with. */
  lines: string[];
}

/** Choose a first move for a bracket-squared minus a number; each leads to its own working. */
export interface ChunkItGame extends LotusGameBase {
  kind: "CHUNK_IT";
  /** The bracket that can be treated as one chunk, e.g. "x + 3". */
  chunk: string;
  routes: ChunkRoute[];
}

/** What the browser gets: the configuration of a game, carrying no answer. */
export type LotusGameConfig = OrderStepsGame | TestClaimGame | RapidSetGame | FindEveryBGame | ReplayGame | ChunkItGame | TwoNumbersGame | CommitThenChooseGame | TrueFalseGame | SplitConfidenceGame | TwoMovesGame | FourSignsGame | EditHistoryGame | RectangleGame | ReadbackGame;

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

export interface SplitConfidenceResponse {
  kind: "SPLIT_CONFIDENCE";
  /** Tokens on each issued option, same order. Adds up to LOTUS_SPLIT_TOKENS. */
  counts: number[];
}

export interface TwoMovesResponse {
  kind: "TWO_MOVES";
  /** Move 1: the two numbers as chosen, with their own signs. */
  numbers: { n1: number; n2: number };
  /** Move 2: the sign written into each bracket. */
  signs: [LotusBracketSign, LotusBracketSign];
}

export interface FourSignsResponse {
  kind: "FOUR_SIGNS";
  /** The two signs chosen for each issued case, same order. */
  picks: Array<[LotusBracketSign, LotusBracketSign]>;
}

export interface EditHistorySample {
  /** Milliseconds since the game was shown. */
  t: number;
  /** The whole answer box at that moment. */
  v: string;
}

export interface EditHistoryResponse {
  kind: "EDIT_HISTORY";
  /** Snapshots of the answer box, oldest first. The last one is the answer. */
  history: EditHistorySample[];
}

export interface RectangleResponse {
  kind: "RECTANGLE";
  /** The number of strips down the side each time the student settled on a split, oldest first. */
  tries: number[];
  /** The split locked in. */
  final: number;
}

export interface ReadbackResponse {
  kind: "READBACK";
  /** Snapshots of the answer box, oldest first. The last one is what the student confirmed. */
  history: EditHistorySample[];
  /** The student pressed "use the suggestion" when one was offered. */
  tookSuggestion?: boolean;
}

export interface OrderStepsResponse {
  kind: "ORDER_STEPS";
  /** The three cards placed, in order, as indexes into the issued cards. */
  placed: number[];
  /** Every card that was ever placed, including ones taken back out. */
  ever: number[];
}

export interface TestClaimResponse {
  kind: "TEST_CLAIM";
  /** The values of x tried, each once. */
  tested: number[];
  /** The verdict chosen, as an index into the issued options. */
  verdict: number;
}

export interface RapidSetResponse {
  kind: "RAPID_SET";
  /** The option picked on each row, same order. */
  picks: number[];
  /** Milliseconds spent on each row. Weak evidence only. */
  times: number[];
}

export interface FindEveryBResponse {
  kind: "FIND_EVERY_B";
  /** Every b picked. */
  picked: number[];
}

export interface ReplayResponse {
  kind: "REPLAY";
  /** The line the replay was stopped at (0 = the first line). */
  stopped: number;
  /** Milliseconds after that line appeared that the student pressed stop. Weak evidence only. */
  lateMs?: number;
}

export interface ChunkItResponse {
  kind: "CHUNK_IT";
  /** The first move chosen, as an index into the issued routes. */
  route: number;
}

export type LotusGameResponse = OrderStepsResponse | TestClaimResponse | RapidSetResponse | FindEveryBResponse | ReplayResponse | ChunkItResponse | TwoNumbersResponse | CommitThenChooseResponse | TrueFalseResponse | SplitConfidenceResponse | TwoMovesResponse | FourSignsResponse | EditHistoryResponse | RectangleResponse | ReadbackResponse;

/**
 * What a play means for the skill. The mark on the answer never changes; only
 * how far it counts does.
 *  SECURE        counts in full
 *  NEEDS_ANOTHER right, but one more right answer is needed to call the skill secure
 *  NO_EVIDENCE   right or wrong, this play says nothing either way about the skill
 *  MISTAKE       one negative on the skill, even if the answer came out right
 *  DOESNT_KNOW   the same as saying "I don't know this yet"
 */
export type LotusGameEffect = "SECURE" | "NEEDS_ANOTHER" | "NO_EVIDENCE" | "MISTAKE" | "DOESNT_KNOW";

export interface LotusGameDiagnosis {
  effect: LotusGameEffect;
  /** MISTAKE: the skill's mistake code, when the play names one. */
  mistake?: string;
  /** One neutral sentence that can reach the student's report. */
  note?: string;
  /** NEEDS_ANOTHER: the wrong option the rest of the confidence went on. */
  hedge?: { chips: number; option: string; mistake?: string };
  /**
   * MISTAKE: right picks that show a skill on their own, as the mistake codes that skill owns (e.g. finding both
   * 9 and -9 shows the negative pairs, so NO_NEGATIVE_PAIRS). Credited only for skills the item can show.
   */
  creditFor?: string[];
}

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
  /** How this play counts towards the skill. Absent on older records and on plays that add nothing to the mark. */
  diagnosis?: LotusGameDiagnosis;
  /** Small figures behind the summary (tries, right-product tries, …). */
  facts: Record<string, number | string | boolean>;
}
