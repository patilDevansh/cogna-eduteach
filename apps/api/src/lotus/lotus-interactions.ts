import type { LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import { answerFromPicks, buildTileInteraction, gameFormatsEnabled } from "../interaction-formats/tile-builder";

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

/** Attaches a tile game to the question when one applies. Mutates and returns the question. */
export function withLotusInteraction(question: LotusQuestion, context: { turn: number; repurposed: boolean }, env: NodeJS.ProcessEnv = process.env): LotusQuestion {
  // A game probe (e.g. garden fences) already carries its own checked tiles.
  if (question.interaction) {
    question.asksForWorking = false;
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

export class TileAnswerError extends Error {}

/**
 * The answer the server marks. For a tile game it is rebuilt from the picks
 * against the interaction the server issued — never taken from the browser's
 * own text. A typed answer to a tile question is still accepted (the student
 * may switch to typing).
 */
export function resolveLotusResponse(question: LotusQuestion, response: LotusStudentResponse): LotusStudentResponse {
  if (!response.interaction || response.didNotKnow) {
    const { interaction: _unused, ...typed } = response;
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
