import type { LotusGameConfig, LotusGameKind, LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import { answerFromPicks, buildTileInteraction, gameFormatsEnabled } from "../interaction-formats/tile-builder";
import { checkedPlainTyping, chooseLotusGame, gameOfPreferredKind, isTypedGame, LotusGameError, readLotusGame, readTypingRecord, themedGamesEnabled } from "./lotus-games";
import { DRESSABLE_KINDS } from "./lotus-format-guide";
import { buildLotusPuzzle } from "./lotus-puzzles";
import { prettyPowers } from "./lotus-question-factory";

/**
 * Which Lotus questions are shown as tile games.
 *
 * Only FACTORISE items (their answers are marked by the algebra engine, so a
 * built answer is marked exactly like a typed one). Of those:
 *  - turn 1, so the test opens with something playful;
 *  - every turn the plan repurposed (a check, a step down, a widening), so a
 *    suspected gap is confirmed in a different format from the one that
 *    raised it — wrong in two formats means the format isn't the cause;
 *  - every second coverage turn, for variety from the start.
 * Everything else stays typed with working, which is the richest evidence
 * Lotus gets. A tile game drops the working request (there is nothing to write).
 */
export function chooseLotusInteraction(
  question: LotusQuestion,
  context: { turn: number; repurposed: boolean },
  env: NodeJS.ProcessEnv = process.env,
): LotusQuestion["interaction"] {
  if (!gameFormatsEnabled(env)) return undefined;
  const d = question.answerKey.diagnostics;
  if (!d || d.itemKind !== "FACTORISE" || !d.expression) return undefined;
  if (!(context.turn === 1 || context.repurposed || context.turn % 2 === 0)) return undefined;
  return buildTileInteraction({
    stage: "DIAGNOSTIC",
    task: "factorise",
    expression: d.expression,
    answer: question.answerKey.canonicalAnswer,
    mistakes: d.predictedMistakes.map((m) => m.answer),
    seed: question.id,
  }) ?? undefined;
}

function withGame(question: LotusQuestion, game: LotusGameConfig): LotusQuestion {
  question.game = game;
  // A typed game is typed like any other answer, so its working stays.
  if (!isTypedGame(game.kind)) question.asksForWorking = false;
  // Sharing the tokens already says how sure the student is; don't ask again.
  if (game.kind === "SPLIT_CONFIDENCE") question.requiresConfidenceProbe = false;
  return question;
}

/** Attaches a tile game to the question when one applies. Mutates and returns the question. */
export function withLotusInteraction(question: LotusQuestion, context: { turn: number; repurposed: boolean; previousKind?: LotusGameKind; preferredKinds?: readonly LotusGameKind[] }, env: NodeJS.ProcessEnv = process.env): LotusQuestion {
  // A game probe (e.g. garden fences) already carries its own checked tiles.
  // A game probe (garden fences, a rapid set) already carries its own checked game.
  if (question.interaction || question.game) {
    question.asksForWorking = false;
    return question;
  }
  // The new games are how Lotus asks. Whatever none of them fits stays typed; the older games only return with the switch off.
  if (themedGamesEnabled(env)) {
    const game = chooseLotusGame(question, context, env);
    return game ? withGame(question, game) : question;
  }
  const puzzle = gameFormatsEnabled(env) && !context.repurposed ? buildLotusPuzzle(question) : undefined;
  if (puzzle) {
    question.interaction = puzzle.interaction;
    question.asksForWorking = false;
    if (puzzle.answers) {
      question.answerKey.crosswordAnswers = puzzle.answers;
      question.prompt = `Factor crossword: start with ${prettyPowers(puzzle.interaction.expression)}. Complete all four crossings using the shared factors.`;
      question.answerKey.workedSolution = puzzle.interaction.crossword!.map((clue, i) => `${clue.expression} = ${puzzle.answers![i]}`);
      const d = question.answerKey.diagnostics!;
      d.stepSkills = puzzle.answers.map(() => d.skillId);
      d.origin = "CODE";
      d.provenance = "CODE_BUILT_GAME";
    }
    return question;
  }
  const interaction = chooseLotusInteraction(question, context, env);
  if (interaction) {
    question.interaction = interaction;
    question.presentation ??= interaction.format === "BRACKET_BRIDGE"
      ? (context.turn % 4 === 2 ? "CONSTELLATION" : "BRIDGE")
      : (context.turn === 1 || context.turn % 4 === 0 ? "WORKSHOP" : "BRIDGE");
    question.asksForWorking = false;
  }
  return question;
}

/**
 * This question in another format, or undefined if it can't be: a question built
 * for its own game keeps it, as does a staged choice. A new id, because a browser
 * may already hold the old version and must still be able to submit it.
 */
export function redressedQuestion(question: LotusQuestion, kinds: readonly LotusGameKind[], previousKind: LotusGameKind | undefined, newId: string): LotusQuestion | undefined {
  if (question.presentation || question.interaction) return undefined;
  if (question.game && !DRESSABLE_KINDS.includes(question.game.kind)) return undefined;
  const game = gameOfPreferredKind(question, kinds, previousKind);
  if (!game || game.kind === question.game?.kind) return undefined;
  const next = withGame({ ...structuredClone(question), id: newId }, game);
  if (isTypedGame(game.kind)) next.asksForWorking = true;
  return next;
}

/** The formats this question can be asked in: its own game if it is built around one, else every format that dresses it. */
export function fittingFormats(question: LotusQuestion): LotusGameKind[] {
  if (question.presentation || question.interaction || (question.game && !DRESSABLE_KINDS.includes(question.game.kind))) {
    return question.game ? [question.game.kind] : [];
  }
  return DRESSABLE_KINDS.filter((kind) => question.game?.kind === kind || !!gameOfPreferredKind(question, [kind]));
}

export class TileAnswerError extends Error {}

/**
 * The answer the server marks. For a tile game it is rebuilt from the picks
 * against the interaction the server issued — never taken from the browser's
 * own text. A typed answer to a tile question is still accepted (the student
 * may switch to typing).
 */
export function resolveLotusResponse(question: LotusQuestion, response: LotusStudentResponse): LotusStudentResponse {
  // A reading is something the server writes; one sent by the browser is never kept.
  const { gameReading: _reading, typingReading: _typingReading, reportedResponseTimeMs: _reported, typing: sentTyping, ...sent } = response;
  response = sent;
  // The browser's own item clock (shown-to-submitted) is the ceiling for the writing time: a figure
  // measured from session start or question generation can never exceed the time the item was on screen.
  const shownMs = response.interactionContext?.timing.elapsedMs;
  if (typeof shownMs === "number" && response.responseTimeMs > shownMs) response = { ...response, responseTimeMs: shownMs, reportedResponseTimeMs: response.responseTimeMs };
  // An ordinary typed answer keeps its typing record, read the way Typing replay is.
  if (!response.game && !response.interaction && !response.didNotKnow && !question.interaction && question.answerKey.diagnostics) {
    const typing = checkedPlainTyping(sentTyping, response.answer);
    if (typing) return { ...response, typing, typingReading: readTypingRecord(question, typing) };
  }
  if (response.game && !response.didNotKnow) {
    // A game's answer is rebuilt, and its process read, from the payload against the game this server issued.
    let read: ReturnType<typeof readLotusGame>;
    try {
      read = readLotusGame(question, response.game);
    } catch (err) {
      if (err instanceof LotusGameError) throw new TileAnswerError(err.message);
      throw err;
    }
    const { interaction: _tiles, ...rest } = response;
    return {
      ...rest,
      answer: read.answer,
      working: response.working ?? "",
      didNotKnow: read.didNotKnow ?? response.didNotKnow,
      ...(read.confidence !== undefined ? { confidence: read.confidence } : {}),
      game: read.game,
      gameReading: read.reading,
    };
  }
  if (!response.interaction || response.didNotKnow) {
    const { interaction: _unused, game: _game, ...typed } = response;
    return typed;
  }
  if (!question.interaction) throw new TileAnswerError("This question isn't a tile question.");
  const picks = response.interaction.picks;
  if (!Array.isArray(picks) || picks.some((p) => p !== null && !Number.isInteger(p))) throw new TileAnswerError("Tile picks are malformed.");
  const answer = answerFromPicks(question.interaction, response.interaction);
  if (!answer) throw new TileAnswerError("Fill every box before submitting.");
  const changes = Number.isInteger(response.interaction.changes) && response.interaction.changes! >= 0 ? Math.min(response.interaction.changes!, 99) : 0;
  return {
    ...response,
    answer,
    working: response.working ?? "",
    interaction: { format: question.interaction.format, picks: [...picks], changes },
  };
}
