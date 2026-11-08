/**
 * Experiment: AI-only analysis (LOTUS_AI_ONLY_ANALYSIS=true). Off by default.
 *
 * Code does not mark answers or read the play. Every answer (except an explicit "I don't know") goes to the AI review,
 * which judges right or wrong itself, and only the review's findings become skill evidence. The plan, the stop rules
 * and the report then work from that evidence as usual. Used to compare gap-finding against the code-checked test.
 */
import type { LotusDebateClosure, LotusMathVerification, LotusQuestion, LotusSkillEvidence, LotusStudentResponse } from "@cogna/shared";
import { evidenceFromAnalysis, type InstantVerdict } from "./lotus-factorisation";

export type AiAnswerJudgment = "CORRECT" | "INCORRECT" | "UNFINISHED" | "UNCLEAR";

export function aiOnlyAnalysis(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LOTUS_AI_ONLY_ANALYSIS?.trim().toLowerCase() === "true";
}

/** Evaluation baseline: ask the opening plan as written, never adapt it or stop early on a found starting point. */
export function fixedPlanEvaluation(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LOTUS_FIXED_PLAN?.trim().toLowerCase() === "true";
}

const UNMARKED = "Experiment: code marking is off. The AI review judges this answer.";

/** What submit records before the review: no code verdict, no evidence, and a review always. */
export function aiOnlyInstant(question: LotusQuestion): InstantVerdict {
  return {
    verification: { status: "NOT_DETERMINISTIC", correctAnswer: question.answerKey.canonicalAnswer, method: "AI_JUDGED", explanation: UNMARKED },
    evidence: [],
    fastSkip: false,
    needsAnalysis: true,
  };
}

/** Code's readings of the play are removed, so the review reads the raw chips, picks and drafts itself. */
export function withoutCodeReadings(response: LotusStudentResponse): LotusStudentResponse {
  const { gameReading: _game, typingReading: _typing, ...rest } = response;
  return rest;
}

export function isAiOnlyUnmarked(verification: LotusMathVerification | null | undefined): boolean {
  return verification?.method === "AI_JUDGED" && verification.explanation === UNMARKED;
}

export function readAnswerJudgment(value: unknown): AiAnswerJudgment {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  return v === "CORRECT" || v === "INCORRECT" || v === "UNFINISHED" ? v : "UNCLEAR";
}

/** The AI's own marking, recorded in place of code's. */
export function aiJudgedVerification(question: LotusQuestion, closure: LotusDebateClosure): LotusMathVerification {
  const judgment = readAnswerJudgment(closure.answerJudgment);
  const status: LotusMathVerification["status"] = judgment === "CORRECT" ? "VERIFIED_CORRECT"
    : judgment === "INCORRECT" ? "VERIFIED_INCORRECT"
    : judgment === "UNFINISHED" ? "VERIFIED_UNFINISHED" : "NOT_DETERMINISTIC";
  return {
    status, correctAnswer: question.answerKey.canonicalAnswer, method: "AI_JUDGED",
    explanation: `AI judged it ${judgment.toLowerCase()}${closure.answerJudgmentReason ? `: ${closure.answerJudgmentReason}` : "."}`,
  };
}

/**
 * Skill evidence from the review alone. The usual mapping (wrong step → that step's skill) applies; when the AI says the
 * answer is wrong or unfinished but names no step, the question's own skill carries it, so a wrong answer is never silent.
 */
export function aiOnlyEvidence(question: LotusQuestion, closure: LotusDebateClosure): LotusSkillEvidence[] {
  const judgment = readAnswerJudgment(closure.answerJudgment);
  const d = question.answerKey.diagnostics;
  // Right, but the AI read a doubt in the play: a doubt on the step's skill, never a mistake (as code records a hedge chip).
  const step = typeof closure.firstWrongStep === "string" ? Number(closure.firstWrongStep) : closure.firstWrongStep;
  if (d && judgment === "CORRECT" && typeof step === "number" && Number.isInteger(step) && step >= 1 && closure.mistakeDescription?.trim()) {
    const doubted = d.stepSkills[step - 1] ?? d.skillId;
    const credited = evidenceFromAnalysis(question, [], null, undefined, null, true).filter((e) => e.skillId !== doubted);
    return [...credited, { skillId: doubted, kind: "UNFINISHED", source: "ANALYSIS", hedge: { chips: 0, option: "AI-read doubt" },
      description: `Right answer, but the AI read a doubt: ${closure.mistakeDescription.trim()}` }];
  }
  const mapped = evidenceFromAnalysis(question, [], closure.firstWrongStep, closure.mistakeDescription, closure.mistakeKind,
    judgment === "CORRECT", judgment === "UNFINISHED" && d?.itemKind === "NUMBER", closure.mistakeSkill);
  if (mapped.length || !d || judgment === "CORRECT" || judgment === "UNCLEAR") return mapped;
  if (closure.mistakeKind === "SLIP" || closure.mistakeKind === "UNREADABLE") return mapped;
  return [{ skillId: d.skillId, kind: judgment === "UNFINISHED" ? "UNFINISHED" : "MISTAKE", source: "ANALYSIS",
    description: closure.mistakeDescription?.trim() || (judgment === "UNFINISHED" ? "Not finished." : "Wrong answer.") }];
}

/** Extra review instructions in this mode: the review is the only marker. */
export const AI_ONLY_REVIEW_RULES = `
EXPERIMENT — code has NOT marked this answer. You are the only judge. Ignore any "deterministic verification" text: it is a placeholder.
- Decide yourself whether the final answer is right, by checking it against the answer key and, for an expression, by expanding it.
- For a chips (split confidence) game, the answer is the option with the most chips; read the whole split yourself (a tie means no single answer). For a two-step or picking game, read the picks yourself. For typing, read the drafts yourself.
- Return "answerJudgment": CORRECT, INCORRECT, UNFINISHED (equal to the key but not fully factorised or not evaluated) or UNCLEAR, and "answerJudgmentReason" in one short sentence.
- If the answer is right but the play shows doubt (chips on a wrong option, a correct draft changed), say so in "uncertainty" and name the mistake the doubt points to in "mistakeDescription", with "firstWrongStep" set to the step that mistake belongs to.`;
