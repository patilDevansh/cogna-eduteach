/**
 * Ceiling-escalation stretch items (Q6–Q15 for a student who blitzes Q1–Q5).
 *
 * Each item is a complete, code-checked question: a real answer key, a worked
 * solution whose steps line up with stepSkills, the skills it uses, and the
 * wrong answers code can recognise. Built items are validated at module load
 * with the same assertFixedItemIsValid every fixed item goes through, so a
 * broken key fails at startup instead of crashing a student's answer.
 */
import { randomUUID } from "node:crypto";
import type { LotusBoard, LotusPredictedMistake, LotusQuestion } from "@cogna/shared";
import { adaptPromptForBoard, assertFixedItemIsValid, FACTORISATION_STRETCH_SLOTS, findSkill, skillName, type SlotSpec } from "./lotus-factorisation-catalogue";

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** Student-facing notation: superscript powers and a real minus sign. The ASCII expression stays in diagnostics for the algebra engine. */
export function prettyMath(text: string): string {
  return text
    .replace(/\^(\d+)/g, (_, d: string) => d.split("").map((c) => SUP[Number(c)]).join(""))
    .replace(/ - /g, " − ")
    .replace(/^-/, "−")
    .replace(/\(-/g, "(−");
}

interface StretchContent {
  answer: string;
  worked: string[];
  wrong: Array<[string, string]>;
  /** NUMBER items: arithmetic that proves the answer. */
  check?: string;
  /** Overrides the default "Factorise …" / "Simplify …" wording. */
  prompt?: string;
}

/** Keyed by stretch slot. Wrong answers are only the ones we are sure of; anything else goes to the AI review like any unpredicted answer. */
const CONTENT: Record<number, StretchContent> = {
  6: {
    answer: "(2x - 5)(3x + 2)",
    worked: ["6 × (−10) = −60; −15 and 4 multiply to −60 and add to −11", "6x^2 - 15x + 4x - 10 = 3x(2x - 5) + 2(2x - 5) = (2x - 5)(3x + 2)"],
    wrong: [["(2x - 2)(3x + 5)", "SPLIT_PAIR_DOES_NOT_SUM"]],
  },
  7: {
    answer: "(x^2 + 9)(x + 3)(x - 3)",
    worked: ["x^4 - 81 = (x^2 + 9)(x^2 - 9)", "x^2 - 9 = (x + 3)(x - 3), and x^2 + 9 does not factorise"],
    wrong: [["(x^2 + 9)(x^2 - 9)", "INCOMPLETE_FACTORISATION"]],
  },
  8: {
    answer: "(x + 3)/(x - 2)",
    worked: ["x^2 - 9 = (x + 3)(x - 3) and x^2 - 5x + 6 = (x - 2)(x - 3)", "Cancel the common factor (x - 3): (x + 3)/(x - 2)"],
    wrong: [],
  },
  9: {
    answer: "a(a + 2)(a - 2)",
    worked: ["a^3 - 4a = a(a^2 - 4)", "a^2 - 4 = (a + 2)(a - 2)"],
    wrong: [["a(a^2 - 4)", "INCOMPLETE_FACTORISATION"]],
  },
  10: {
    answer: "(2x - 3y)^2",
    worked: ["4x^2 = (2x)^2 and 9y^2 = (3y)^2", "2 × 2x × 3y = 12xy with a minus sign, so (2x - 3y)^2"],
    wrong: [["(2x + 3y)^2", "WRONG_MIDDLE_SIGN"], ["(2x - 3y)(2x + 3y)", "WROTE_DIFF_OF_SQUARES"]],
  },
  11: {
    answer: "14",
    check: "2 * 7",
    worked: ["x^2 + kx + 49 = (x + 7)^2 for a perfect square", "(x + 7)^2 = x^2 + 14x + 49, so k = 14"],
    wrong: [["7", "MIDDLE_TERM_NOT_CHECKED"], ["49", "HALVED_NOT_ROOTED"]],
  },
  12: {
    answer: "2x(x - 6)(x + 2)",
    worked: ["2x^3 - 8x^2 - 24x = 2x(x^2 - 4x - 12)", "x^2 - 4x - 12 = (x - 6)(x + 2)"],
    wrong: [["2x(x^2 - 4x - 12)", "INCOMPLETE_FACTORISATION"]],
  },
  13: {
    answer: "(x - y - 1)(x + y + 1)",
    worked: ["Treat (y + 1) as one quantity: x^2 - (y + 1)^2 is a difference of squares", "(x - (y + 1))(x + (y + 1)) = (x - y - 1)(x + y + 1)"],
    wrong: [["(x - y + 1)(x + y - 1)", "TREATED_BRACKET_AS_TWO_TERMS"]],
  },
  14: {
    answer: "(x + 3)/(2x + 1)",
    worked: ["2x^2 + 5x - 3 = (2x - 1)(x + 3) and 4x^2 - 1 = (2x - 1)(2x + 1)", "Cancel the common factor (2x - 1): (x + 3)/(2x + 1)"],
    wrong: [],
  },
  15: {
    answer: "(n^2 + 2n + 2)(n^2 - 2n + 2)",
    worked: ["n^4 + 4 = n^4 + 4n^2 + 4 - 4n^2 = (n^2 + 2)^2 - (2n)^2", "Difference of squares: (n^2 + 2 + 2n)(n^2 + 2 - 2n)"],
    wrong: [["(n^2 + 2)^2", "FACTORED_SUM_OF_SQUARES"]],
  },
};

type Item = Omit<LotusQuestion, "id">;

function promptFor(spec: SlotSpec, content: StretchContent): string {
  if (content.prompt) return content.prompt;
  if (spec.kind === "NUMBER") return prettyMath(spec.shape);
  return `${spec.kind === "SIMPLIFY" ? "Simplify" : "Factorise"} ${prettyMath(spec.shape)}.`;
}

function buildItem(spec: SlotSpec, board: LotusBoard): Item {
  const content = CONTENT[spec.slot];
  if (!content) throw new Error(`Stretch slot ${spec.slot} has no answer content.`);
  const predictedMistakes: LotusPredictedMistake[] = content.wrong.map(([answer, mistake]) => ({ answer, mistake }));
  return {
    phase: spec.phase,
    subtopic: skillName(spec.skillId),
    prompt: adaptPromptForBoard(promptFor(spec, content), board),
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: false,
    purpose: "STRETCH",
    answerKey: {
      kind: "OPEN_RESPONSE",
      canonicalAnswer: content.answer,
      workedSolution: content.worked,
      diagnostics: {
        itemKind: spec.kind,
        ...(spec.kind === "NUMBER" ? { check: content.check } : { expression: spec.shape }),
        skillId: spec.skillId,
        taggedSkills: spec.tagged.filter((s) => findSkill(s)),
        stepSkills: content.worked.map(() => spec.skillId),
        predictedMistakes,
        slot: spec.slot,
        level: spec.level,
        origin: "CODE",
        provenance: "CODE_BUILT_GAME",
      },
    },
  };
}

/** One stretch question for a slot, ready to stage. */
export function stretchQuestionFor(slot: number, board: LotusBoard = "CBSE"): LotusQuestion | null {
  const spec = FACTORISATION_STRETCH_SLOTS.find((s) => s.slot === slot);
  if (!spec) return null;
  return { ...buildItem(spec, board), id: `stretch-${slot}-${randomUUID()}` };
}

// Fail fast: every stretch item must be a valid, code-checked question on every board.
for (const spec of FACTORISATION_STRETCH_SLOTS) {
  for (const board of ["CBSE", "ICSE", "IGCSE"] as LotusBoard[]) assertFixedItemIsValid(buildItem(spec, board), `stretch slot ${spec.slot} (${board})`);
}
