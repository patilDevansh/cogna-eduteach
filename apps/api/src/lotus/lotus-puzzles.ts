import type { LotusQuestion, TileBuildInteraction } from "@cogna/shared";
import { assembleTileAnswer } from "@cogna/shared";
import { buildTileInteraction, splitFactors, tidyAlgebra } from "../interaction-formats/tile-builder";
import { classifyFactorisation } from "./lotus-algebra";

/** These are deterministic adaptations of an already verified coverage item. */
export function buildLotusPuzzle(question: LotusQuestion): { interaction: TileBuildInteraction; answers?: string[] } | undefined {
  const d = question.answerKey.diagnostics;
  if (!d || d.itemKind !== "FACTORISE" || !d.expression) return;
  const factors = splitFactors(question.answerKey.canonicalAnswer);
  const parsed = factors?.map((f) => /^\(([a-z])\s*([+-])\s*(\d+)\)$/.exec(f));
  if (!parsed || parsed.length !== 2 || parsed.some((f) => !f)) return;
  const variable = parsed[0]![1]!;
  if (parsed[1]![1] !== variable) return;
  const constants = parsed.map((f) => Number(f![3]) * (f![2] === "-" ? -1 : 1));
  const [a, b] = constants as [number, number];
  if (!a || !b || Math.max(Math.abs(a), Math.abs(b)) > 20 || a === b) return;
  if (classifyFactorisation(question.answerKey.canonicalAnswer, d.expression) !== "CORRECT") return;
  const base = buildTileInteraction({ stage: "DIAGNOSTIC", task: "factorise", expression: d.expression,
    answer: question.answerKey.canonicalAnswer, mistakes: d.predictedMistakes.map((m) => m.answer), seed: question.id });
  if (!base || base.format !== "BRACKET_BRIDGE") return;
  if (d.skillId === "FAC_DIFF_SQUARES" && a === -b) {
    return { interaction: { ...base, format: "CUT_BUILD_STUDIO", cutBuild: { variable, removedSide: Math.abs(a) } } };
  }
  // Easy keeps Garden; hard remains available for unsupported written work.
  if (d.skillId !== "FAC_MONIC_TRINOMIAL" || d.level !== "medium") return;
  const candidates = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].filter((n) => n !== a && n !== b);
  const c = candidates.find((n) => n + b !== 0)!;
  const e = candidates.find((n) => n !== c && n + a !== 0 && n + c !== 0)!;
  const values = [a, c, b, e];
  const factor = (n: number) => tidyAlgebra(`${variable}${n < 0 ? "-" : "+"}${Math.abs(n)}`);
  const product = (u: number, v: number) => tidyAlgebra(`${variable}^2${u + v < 0 ? "-" : "+"}${Math.abs(u + v)}${variable}${u * v < 0 ? "-" : "+"}${Math.abs(u * v)}`);
  const crossword = [0, 1].flatMap((row) => [2, 3].map((column) => ({ row, column,
    expression: row === 0 && column === 2 ? d.expression! : product(values[row]!, values[column]!) })));
  const labels = [...new Set([...base.tiles, ...values.map(factor)])];
  // Stable question-specific order, unrelated to the solution positions.
  let seed = [...question.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 17);
  for (let i = labels.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1); [labels[i], labels[j]] = [labels[j]!, labels[i]!];
  }
  const interaction: TileBuildInteraction = { ...base, format: "FACTOR_CROSSWORD", slots: 4,
    frame: [0, 1, 2, 3].map((slot) => ({ slot })), tiles: labels, crossword };
  const assembled = assembleTileAnswer(interaction, values.map((n) => labels.indexOf(factor(n))));
  const answers = assembled?.split(" | ");
  if (!answers || crossword.some((clue, i) => classifyFactorisation(answers[i]!, clue.expression) !== "CORRECT")) return;
  return { interaction, answers };
}
