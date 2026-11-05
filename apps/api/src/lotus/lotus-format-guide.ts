import { LOTUS_GAME_KINDS, type LotusFormatDecision, type LotusGameKind, type LotusQuestionAudit } from "@cogna/shared";

/**
 * Which question format to ask with next, and why.
 *
 * Each format shows something the others can't, so the next one is chosen from
 * what the last answer left unclear. The evidence rules here run on every answer
 * with no model call. When an AI review has run, its suggestion goes first, but
 * it is only a suggestion: the server checks that the format exists and fits the
 * question, and otherwise carries on as if none was made. A format never changes
 * what is asked or how the maths is marked.
 */
export interface FormatGuide {
  /** What this format can show that a final answer alone can't. */
  reveals: string;
  useWhen: string;
  /** What the question has to be for this format to fit. */
  fits: "two monic brackets" | "two monic brackets, all positive" | "any factorising question" | "a grouping question";
}

export const FORMAT_GUIDE: Partial<Record<LotusGameKind, FormatGuide>> = {
  SPLIT_CONFIDENCE: { reveals: "Exactly which answers the student is torn between, and how sure they are; their own wrong answer can sit among the chips.", useWhen: "They were right but unsure, you can't tell a settled belief from a guess, or you want to see whether they choose the same wrong form again beside the right one.", fits: "any factorising question" },
  COMMIT_THEN_CHOOSE: { reveals: "Whether they worked it out themselves or only recognised it among options.", useWhen: "They got an options question right and may have checked the options instead of solving.", fits: "two monic brackets" },
  TWO_NUMBERS: { reveals: "How they search for the two numbers: systematic, trial and error, or stuck.", useWhen: "The trouble looks like finding the pair that multiplies and adds correctly.", fits: "two monic brackets" },
  TWO_MOVES: { reveals: "The numbers and the signs as two separate moves, so two mistakes that cancel out can be seen.", useWhen: "A right answer might hide wrong thinking, or you need to know whether the numbers or the signs went wrong.", fits: "two monic brackets" },
  FOUR_SIGNS: { reveals: "The pattern across all four sign cases, which separates the real rule from a shortcut that sometimes works.", useWhen: "A sign mistake appeared, or signs were only ever tested one way.", fits: "two monic brackets" },
  TRUE_FALSE: { reveals: "Which wrong claims they accept, and where they hesitate.", useWhen: "They may be answering on autopilot, or you want the same mistake tested from several sides quickly.", fits: "two monic brackets" },
  RECTANGLE: { reveals: "Whether they understand the factors as sides of an area, with no algebra to recall.", useWhen: "They said they don't know, or the method may be memorised without meaning.", fits: "two monic brackets, all positive" },
  ORDER_STEPS: { reveals: "Whether they follow the structure of grouping, and which tempting wrong step they pick.", useWhen: "The question is grouping and you want the working without typing.", fits: "a grouping question" },
  EDIT_HISTORY: { reveals: "Mistakes they made and fixed themselves, and where they paused.", useWhen: "A wrong answer may have been a slip: asked again, a student who slipped catches it in the drafts, and one who holds the misconception writes it again.", fits: "any factorising question" },
  READBACK: { reveals: "Whether a wrong answer is the maths or the typing, because they confirm how it was read.", useWhen: "An answer couldn't be read, or could be a typing problem. Not for a readable maths mistake: it only checks the typing.", fits: "any factorising question" },
};

/** The formats that can dress a question already written. The others come with a question of their own. */
export const DRESSABLE_KINDS = Object.keys(FORMAT_GUIDE) as LotusGameKind[];

export function formatGuideForPrompt(): string {
  return DRESSABLE_KINDS.map((kind) => {
    const g = FORMAT_GUIDE[kind]!;
    return `- ${kind}: shows ${g.reveals} Use when: ${g.useWhen} Fits: ${g.fits}.`;
  }).join("\n");
}

/** The formats this student has already seen, oldest first, for the reviewer to vary. */
export function formatsUsedForPrompt(audits: LotusQuestionAudit[]): string {
  const used = audits.map((a) => a.question.game?.kind ?? (a.question.options?.length ? "OPTIONS" : "TYPED"));
  return used.length ? used.join(", ") : "none yet";
}

export interface FormatNeed {
  kinds: LotusGameKind[];
  reason: string;
}

const SIGN_MISTAKE = /SIGN|FLIP/;
const PAIR_MISTAKE = /PAIR|PRODUCT|SUM/;
const SIGN_SIGNALS = ["two_slips_cancel", "hit_sign_slip", "fixed_sign_slip", "flips_into_brackets", "one_sign_lost"];
const FAST_RIGHT_MS = 8000;
const UNSURE_BELOW = 50;

/** Whether an earlier answer on the last question's skill was right without picking from options. */
function producedBefore(audits: LotusQuestionAudit[]): boolean {
  const skill = audits.at(-1)?.question.answerKey?.diagnostics?.skillId;
  if (!skill) return false;
  return audits.slice(0, -1).some((a) => a.question.answerKey?.diagnostics?.skillId === skill && a.verification?.status === "VERIFIED_CORRECT" && !a.question.options?.length && a.question.game?.kind !== "SPLIT_CONFIDENCE");
}

/** What the last answer left unclear, and the formats that could settle it. Null when nothing needs settling. */
export function evidenceFormatNeed(audits: LotusQuestionAudit[]): FormatNeed | null {
  const last = audits.at(-1);
  const response = last?.response;
  if (!last || !response) return null;
  const shown = last.question.game?.kind;
  const signals = response.gameReading?.signals ?? [];
  const wrong = last.verification?.status === "VERIFIED_INCORRECT";
  const right = last.verification?.status === "VERIFIED_CORRECT";
  const mistakes = (last.skillEvidence ?? []).filter((e) => e.kind === "MISTAKE").map((e) => e.mistake ?? "").join(" ");
  const need = (kinds: LotusGameKind[], reason: string): FormatNeed => ({ kinds: kinds.filter((kind) => kind !== shown), reason });

  if (response.didNotKnow || signals.includes("spread_evenly")) {
    return need(["RECTANGLE", "TWO_NUMBERS", "SPLIT_CONFIDENCE"], "They didn't know, so find out what they can do without recalling a method.");
  }
  // A sign slip can sit under a right answer: two that cancel, or one the student fixed.
  if ((wrong && SIGN_MISTAKE.test(mistakes)) || SIGN_SIGNALS.some((signal) => signals.includes(signal))) {
    return need(["FOUR_SIGNS", "TWO_MOVES"], "Signs went wrong or nearly did, so test the signs on their own.");
  }
  if (wrong && PAIR_MISTAKE.test(mistakes)) {
    return need(["TWO_NUMBERS", "RECTANGLE", "SPLIT_CONFIDENCE"], "The pair of numbers went wrong, so watch how they search for it.");
  }
  if (wrong) {
    // A readable wrong answer is the maths, not the typing, so READBACK can't settle it. Asked again with the
    // drafts kept, a slip gets caught and a misconception gets written again; beside the right answer as a
    // chip, a misconception gets chosen again. The two-bracket formats split the steps where they fit.
    return need(["EDIT_HISTORY", "SPLIT_CONFIDENCE", "TWO_MOVES", "COMMIT_THEN_CHOOSE", "TRUE_FALSE"], "Wrong once: ask it again in a format that shows whether it was a slip they catch or a method they repeat.");
  }
  if (last.verification?.status === "NOT_DETERMINISTIC") {
    return need(["READBACK", "EDIT_HISTORY"], "The answer couldn't be read, so check whether the trouble is the typing or the maths.");
  }
  if (!right) return null;
  if (signals.includes("torn") || signals.includes("leans") || signals.includes("mostly_sure") || response.confidence < UNSURE_BELOW) {
    return need(["SPLIT_CONFIDENCE", "TWO_MOVES"], "They were right but unsure, so find out exactly what they doubt.");
  }
  // Only for recognising an answer among options, and only until they have produced one on this skill. Staged
  // choices (the first wrong line, the odd one out) and games with their own question ask something else.
  const recognised = signals.includes("checked_options") || shown === "SPLIT_CONFIDENCE" || (!shown && !last.question.presentation && !!last.question.options?.length);
  if (recognised && !producedBefore(audits)) {
    return need(["COMMIT_THEN_CHOOSE", "TWO_MOVES"], "They chose from options, so check they can produce it themselves.");
  }
  const before = audits.at(-2);
  const quick = (a: LotusQuestionAudit | undefined) => a?.verification?.status === "VERIFIED_CORRECT" && (a.response?.responseTimeMs ?? Infinity) < FAST_RIGHT_MS;
  if (quick(last) && quick(before)) {
    return need(["TRUE_FALSE", "FOUR_SIGNS"], "Fast and right twice running, so check it isn't autopilot.");
  }
  return null;
}

/** A format the model named, if it is one we can actually dress a question in. */
export function checkedAiFormat(proposed: unknown): LotusGameKind | null {
  if (typeof proposed !== "string") return null;
  const kind = proposed.trim().toUpperCase() as LotusGameKind;
  return (LOTUS_GAME_KINDS as readonly string[]).includes(kind) && DRESSABLE_KINDS.includes(kind) ? kind : null;
}

export function formatDecisionNote(decision: LotusFormatDecision): string {
  const asked = decision.source === "AI" ? `The review asked for ${decision.proposed}` : "The last answer called for a new format";
  if (decision.status === "APPLIED") return `${asked}: question ${decision.targetTurn} is now ${decision.chosen}. ${decision.reason}`;
  if (decision.status === "WAITING_FOR_WRITE") return `${asked}: the next question written will use it. ${decision.reason}`;
  return `${asked}, but it fits none of the next questions, so they stay as they are. ${decision.reason}`;
}
