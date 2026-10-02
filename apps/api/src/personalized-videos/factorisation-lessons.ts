import type { LotusSessionView, PersonalizedVideoExitItem, PersonalizedVideoLesson } from "@cogna/shared";
import {
  buildTrinomialLesson,
  classifyTrinomialAnswer,
  formatTrinomial,
  parsePair,
  parseTrinomial,
  type TrinomialLessonInput,
  type TrinomialLessonProps,
} from "@cogna/lesson-video";

/** Secure skills worth opening a trinomial lesson with, most relevant first. */
const OPENING_STRENGTHS = ["FAC_MONIC_TRINOMIAL", "EXP_EXPAND_BINOMIALS", "FND_FACTOR_PAIRS", "FND_SIGN_MUL_DIV", "FAC_DIFF_SQUARES"];
import { skillName } from "../lotus/lotus-factorisation-catalogue";
import { confirmedByDepth, foldLedger } from "../lotus/lotus-factorisation";

/**
 * Factorisation diagnostic → animated lesson.
 *
 * Uses Lotus's own verdict rather than re-diagnosing: the lesson targets the
 * report's starting point (the most foundational confirmed gap). An animation
 * is built only when that skill belongs to a family we have one for AND at
 * least one of the student's own answers is independently reproduced by code
 * as that family's mistake. Otherwise this returns an abstention reason.
 */

/** Trinomial-signs family: the skills and Lotus mistake codes it teaches. */
const TRINOMIAL_SKILLS = new Set(["FAC_MONIC_TRINOMIAL", "FAC_PAIR_PRODUCT_SUM", "FAC_READ_ABC_SIGNS"]);
const TRINOMIAL_SIGN_MISTAKES = new Set(["SIGN_PAIR_ERROR", "SIGNS_SWAPPED", "DROPPED_SIGN"]);

export type FactorisationPlan =
  | {
      kind: "trinomial";
      animation: TrinomialLessonProps;
      /** What built `animation`: rebuilt per theme by the interactive player endpoint. */
      input: TrinomialLessonInput;
      lesson: PersonalizedVideoLesson;
      exit: PersonalizedVideoExitItem;
      skillId: string;
      learnerDecision: string;
      teacherDecision: string;
    }
  | { kind: "abstain"; reason: string };

export function planFactorisationLesson(session: LotusSessionView, studentName: string): FactorisationPlan | null {
  if (session.topic !== "FACTORISATION") return null;
  if (session.finalReport?.outcome !== "SOLID_GAP") return null;

  const start = confirmedByDepth(foldLedger(session.audits))[0];
  if (!start) return null;
  if (!TRINOMIAL_SKILLS.has(start.skillId) || !start.mistakes.some((m) => TRINOMIAL_SIGN_MISTAKES.has(m))) {
    return { kind: "abstain", reason: `No animated lesson exists yet for the starting gap: ${skillName(start.skillId)}.` };
  }

  // The student's own trinomial items that code confirms as right-numbers, wrong-signs.
  const items = session.audits.flatMap((audit) => {
    const d = audit.question.answerKey?.diagnostics;
    const answer = audit.response?.answer;
    if (!d || d.itemKind !== "FACTORISE" || !d.expression || !answer || audit.response?.didNotKnow) return [];
    const t = parseTrinomial(d.expression);
    const pair = t && parsePair(answer, t.v);
    return t && pair && classifyTrinomialAnswer(t, pair) === "sign" ? [{ expression: d.expression, answer }] : [];
  });

  const secure = new Map((session.finalReport.skills ?? []).filter((s) => s.state === "SECURE").map((s) => [s.skillId, s.name]));
  const strength = OPENING_STRENGTHS.map((id) => secure.get(id)).find(Boolean);

  for (const item of items) {
    let animation: TrinomialLessonProps;
    const input: TrinomialLessonInput = { studentName, ...item, ...(strength ? { strengths: [strength] } : {}) };
    try {
      animation = buildTrinomialLesson(input);
    } catch {
      continue;
    }
    const seconds = animation.scenes.flatMap((s) => s.beats).reduce((t, b) => t + b.seconds, 0);
    const lesson: PersonalizedVideoLesson = {
      title: studentName ? `${studentName}, read the signs first` : "Read the signs first",
      duration: `About ${Math.max(1, Math.round(seconds / 60))} min`,
      objective: "Use the signs of the last and middle terms to choose the pair before factorising.",
      // Student-facing: no mistake codes or engine names (those stay in the teacher/dev views).
      generationReason: `Your diagnostic found the same slip more than once in ${skillName(start.skillId).toLowerCase()}: the right numbers, but the wrong signs. This lesson is built from ${items.length === 1 ? "one of your own answers" : `${items.length} of your own answers`}.`,
      verification:
        "Every expansion was recomputed in code: the taught pair gives the question back, your answer doesn't, and the exit item is new.",
      scenes: animation.scenes.map((scene) => ({
        eyebrow: animation.topic,
        headline: scene.title,
        equation: [{ text: formatTrinomial(animation.trinomial) }],
        narration: scene.beats.map((b) => b.text).join(" "),
        durationSeconds: Math.ceil(scene.beats.reduce((t, b) => t + b.seconds, 0)),
        accent: "green" as const,
      })),
    };
    return {
      kind: "trinomial",
      animation,
      input,
      lesson,
      exit: {
        prompt: animation.exit.prompt,
        expected: animation.exit.expected,
        evidencePurpose: "A fresh trinomial with the same sign pattern, answered without support.",
      },
      skillId: start.skillId,
      learnerDecision: "Read the last term's sign, then the middle's, before choosing the pair; expand to check.",
      teacherDecision: "Do not reteach factor pairs. Give one fresh trinomial with the same sign pattern, unsupported.",
    };
  }
  return { kind: "abstain", reason: "Lotus confirmed a sign gap, but none of the answers could be rebuilt exactly as a lesson." };
}
