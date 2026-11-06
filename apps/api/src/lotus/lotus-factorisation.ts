/**
 * The factorisation skill tracker. Pure functions, no AI calls:
 *
 *  - instantVerdict: what an answer tells us the moment it arrives
 *  - foldLedger:     each skill's state, rebuilt from every turn's evidence in order
 *  - planAdjustments: which unseen questions to check, swap, remove, or repurpose to go down
 *  - buildFactorisationReport: the teacher-facing result
 *
 * The rules (COGNA 10.0/FACTORISATION_SKILL_MAP.md §5): one mistake makes a
 * skill SUSPECTED, never confirmed; it's CONFIRMED when the same skill fails
 * again on a later question and CLEARED when a later question using it is
 * right; only confirmed skills prune later questions; the question that
 * checks a suspicion is never pruned; nothing the student can already see is
 * ever changed; removed questions are reported as "not tested", never failed.
 */
import type {
  LotusFinalReport,
  LotusItemDiagnostics,
  LotusLedgerPrior,
  LotusMathVerification,
  LotusQuestion,
  LotusQuestionAudit,
  LotusSessionView,
  LotusSkillEvidence,
  LotusSkillAssessmentProjection,
  LotusSkillState,
  LotusPlannedTopic,
  LotusSkillSummary,
  LotusStudentResponse,
} from "@cogna/shared";
import { LOTUS_SELECT_SEPARATOR, LOTUS_SPLIT_TOKENS, assembleTileAnswer } from "@cogna/shared";
import { assessSkillEvidence } from "./lotus-evidence-assessment";
import { mistakeInWords } from "./lotus-reasons";
import {
  algebraicallyEqual,
  classifyExpansion,
  classifyFactorisation,
  classifySimplification,
  type CommonFactorReading,
  finalAnswerText,
  factorisationDefect,
  bracketFactorCount,
  squarePatternMistake,
  expressionCanShowSkill,
  expressionHasCommonLetter,
  lettersFullyTakenOut,
  normalizeMathText,
  readCommonFactor,
  readNumberAnswer,
  sameFactorisation,
  sameNumber,
} from "./lotus-algebra";
import {
  type SlotSpec,
  curriculumFor,
  curriculumOfSkill,
  dependsOnTransitively,
  findSkill,
  ownerOfMistake,
  skillName,
  skillsUsedBy,
  SOFT_PREREQUISITES,
} from "./lotus-factorisation-catalogue";
import { checkSpecFor } from "./lotus-skill-checks";
import { SHARED_PATTERNS } from "./lotus-skill-map";

/** An explicit "I don't know" is always a learning signal, regardless of response speed. */
export const FAST_SKIP_MS = 15_000;

export interface FactorisationTurn {
  turn: number;
  /** The base slot this turn came from. */
  slot: number;
  status: "PLANNED" | "SKIPPED" | "REPURPOSED";
  purpose?: "CHECK" | "AVOID" | "DESCENT" | "WIDEN";
  forSkill?: string;
  reason?: string;
  /** Bumped on every change, so a background result for an older version is thrown away. */
  version: number;
  /** What the slot was before a rewrite put it on hold, so a rewrite that can't be prepared leaves the planned question in place. */
  held?: { status: "PLANNED" | "REPURPOSED"; purpose?: FactorisationTurn["purpose"]; forSkill?: string; reason?: string };
}

export interface FactorisationState {
  /** The planned topic this test follows. Missing on sessions from before other topics existed: those are factorisation. */
  topic?: LotusPlannedTopic;
  /** A catch-up: only these skills are planned, and the result is judged on them alone. */
  focusSkills?: string[];
  /** The plan turn currently on the student's screen. */
  planTurn: number;
  turns: FactorisationTurn[];
  /** Plan turn of each answered audit, in answer order. */
  answeredTurns: number[];
  handledConfirmed: string[];
  /** Skills already offered a BROADEN check (found a target or not) — never revisited, so one secure skill never claims two slots. */
  handledBroadened: string[];
  fastSkips: number;
}

// ---------- instant verdict ----------

/**
 * What a student types when they have no answer. Compared after trimming, lower-casing and dropping full stops,
 * commas, "!" and apostrophes, so "I don't know." and "IDK!" both match. Whole answers only: a bare "1" or "x"
 * is a real answer, and "I don't know why it is 2(x + 3)" is not in this list.
 */
export const DONT_KNOW_PHRASES: ReadonlySet<string> = new Set([
  "idk", "i dont know", "dont know", "i do not know", "do not know", "dunno", "i dunno", "no idea", "i have no idea",
  "not sure", "i am not sure", "im not sure", "dk", "?", "??", "???",
]);

export function isDontKnowText(answer: string | undefined): boolean {
  const text = (answer ?? "").toLowerCase().replace(/['\u2019.,!]/g, "").replace(/\s+/g, " ").trim();
  return text !== "" && DONT_KNOW_PHRASES.has(text);
}

function sameChoice(a: string, b: string): boolean {
  return normalizeMathText(a).toLowerCase() === normalizeMathText(b).toLowerCase();
}

function unfinishedCode(answer: string): string {
  switch (factorisationDefect(answer)) {
    case "NOT_A_PRODUCT": return "SUM_ACCEPTED_AS_FACTORISED";
    case "LETTER_LEFT_INSIDE": return "PARTIAL_GCF";
    case "FACTOR_SPLITS_FURTHER": return "INCOMPLETE_FACTORISATION";
    case "NUMBER_LEFT_INSIDE":
      // (2x + 4)(x + 3): two brackets, common factor never taken out, is a method mistake. One bracket (2(6x + 9), x(6x + 10y)) is not the highest factor.
      return bracketFactorCount(answer) >= 2 ? "SKIPPED_COMMON_FACTOR_CHECK" : "COMMON_NOT_HIGHEST";
    default: return "INCOMPLETE_FACTORISATION";
  }
}

/**
 * How much a mistake matters when one answer carries several (lower = look at it first):
 * 0 a misconception about what the task means (a sum with brackets counted as factorised),
 * 1 a method mistake, 2 a completeness miss (stopped too early, a factor left in).
 * A misconception can sit under a miss, never the other way round, so it is probed first.
 */
export function mistakeRank(code: string | undefined): number {
  if (!code) return 1;
  if (MEANING_RANKED.has(code)) return 0;
  if (COMPLETENESS_RANKED.has(code)) return 2;
  return 1;
}
const MEANING_RANKED = new Set(["SUM_ACCEPTED_AS_FACTORISED", "TERMS_VS_FACTORS", "BRACKET_NOT_SEEN_AS_FACTOR", "SHAPE_MISREAD"]);
const COMPLETENESS_RANKED = new Set(["INCOMPLETE_FACTORISATION", "PARTIAL_GCF", "COMMON_NOT_HIGHEST", "SKIPPED_COMMON_FACTOR_CHECK", "STOPPED_AT_COMPOSITE_FACTOR", "NOT_FULLY_SIMPLIFIED"]);

/** "Chose 2(2x + 6): divided only the first term by the common factor." */
function named(what: string, mistake: string): string {
  return `${what}: ${mistakeInWords(mistake) ?? mistake.toLowerCase().replace(/_/g, " ")}.`;
}

function secureAll(d: LotusItemDiagnostics): LotusSkillEvidence[] {
  // The question's own skill is always credited; a tagged or step skill only when the expression can exercise it.
  return skillsUsedBy(d)
    .filter((skillId) => skillId === d.skillId || expressionCanShowSkill(skillId, d.expression))
    .map((skillId) => ({ skillId, kind: "SECURE" as const, source: "INSTANT" as const }));
}

export interface InstantVerdict {
  verification: LotusMathVerification;
  evidence: LotusSkillEvidence[];
  fastSkip: boolean;
  /** True when code alone couldn't say what went wrong — the background analysis has to. */
  needsAnalysis: boolean;
}

export function instantVerdict(question: LotusQuestion, response: LotusStudentResponse): InstantVerdict {
  return withGameLimits(question, withDraftDoubt(response, withGameDiagnosis(question, response, markedVerdict(question, response))));
}

/**
 * Skills a game's play cannot demonstrate, whatever the item's tags say: choosing values to test a claim shows
 * checking a claim, not expanding a bracket. The question's own skill is never dropped.
 */
const GAME_CANT_SHOW: Partial<Record<string, string[]>> = {
  TEST_CLAIM: ["EXP_EXPAND_BINOMIALS"],
};
function withGameLimits(question: LotusQuestion, verdict: InstantVerdict): InstantVerdict {
  const blocked = GAME_CANT_SHOW[question.game?.kind ?? ""];
  const own = question.answerKey.diagnostics?.skillId;
  if (!blocked) return verdict;
  return { ...verdict, evidence: verdict.evidence.filter((e) => !(e.kind === "SECURE" && blocked.includes(e.skillId) && e.skillId !== own)) };
}

/**
 * A discarded draft that matches no known mistake, under an answer that isn't fully right and that code
 * couldn't pin on a predicted mistake, is something only the background review can read.
 */
function withDraftDoubt(response: LotusStudentResponse, verdict: InstantVerdict): InstantVerdict {
  if (verdict.needsAnalysis || response.didNotKnow || verdict.verification.status === "VERIFIED_CORRECT") return verdict;
  const reading = response.gameReading?.kind === "EDIT_HISTORY" ? response.gameReading : response.typingReading;
  const facts = reading?.facts as { drafts?: number } | undefined;
  if (!reading || !facts?.drafts) return verdict;
  if (reading.signals.some((s) => s.startsWith("draft_mistake:"))) return verdict;
  if (verdict.evidence.some((e) => e.kind !== "SECURE" && e.mistake && e.source === "INSTANT" && verdict.verification.status === "VERIFIED_INCORRECT")) return verdict;
  return { ...verdict, needsAnalysis: true };
}

/**
 * A themed game's reading decides how far a marked answer counts towards the
 * skill. It never changes the mark, except that an answer which only a game can
 * give ("None of these") is plainly wrong rather than unreadable. Code settles
 * all of this. The one exception is a mostly-right split whose other chip sits on
 * an option no known mistake explains, or that came with working: the background
 * review reads that, and the student never waits for it.
 */
function withGameDiagnosis(question: LotusQuestion, response: LotusStudentResponse, verdict: InstantVerdict): InstantVerdict {
  const diagnosis = response.gameReading?.diagnosis;
  if (!diagnosis || response.didNotKnow || verdict.verification.status === "NO_ANSWER") return verdict;
  const d = question.answerKey.diagnostics!;
  const description = diagnosis.note;
  switch (diagnosis.effect) {
    case "SECURE":
      return verdict;
    case "NEEDS_ANOTHER": {
      const hedge = diagnosis.hedge;
      if (!hedge || verdict.verification.status !== "VERIFIED_CORRECT") return verdict;
      // The doubt belongs to the skill the doubted option's mistake shows, else to the question's own skill.
      const owner = hedge.mistake ? ownerOfMistake(hedge.mistake, d) : d.skillId;
      const holder = verdict.evidence.some((e) => e.kind === "SECURE" && e.skillId === owner) ? owner : d.skillId;
      // Right, but with chips on a named wrong answer: for the skill that doubt is about, this is partial evidence,
      // not a demonstration. It is recorded as UNFINISHED carrying the hedge (never a mistake: no `mistake` is set),
      // so the ledger keeps the skill unconfirmed until a later check settles it. Other skills stay secure.
      const evidence = verdict.evidence.map((e): LotusSkillEvidence => (e.kind === "SECURE" && e.skillId === holder
        ? { ...e, kind: "UNFINISHED", hedge, description: hedgeDescription(hedge) } : e));
      const working = !!response.working?.trim();
      return { ...verdict, evidence, needsAnalysis: verdict.needsAnalysis || !hedge.mistake || working };
    }
    case "NO_EVIDENCE": {
      // A torn split on a RIGHT answer proves nothing either way. On a wrong one it must not silence the review:
      // a named mistake stays, as a doubt (the chips did not settle it), and with none named the review reads it.
      if (response.gameReading?.kind !== "SPLIT_CONFIDENCE" || verdict.verification.status === "VERIFIED_CORRECT") return { ...verdict, evidence: [], needsAnalysis: false };
      const doubted = verdict.evidence.map((e) => (e.kind === "MISTAKE" || e.kind === "UNFINISHED")
        ? { ...e, description: `${(e.description ?? "").replace(/\.$/, "")} (the chips were split, so this is a doubt, not a settled mistake).`.trim() } : e);
      const named = doubted.some((e) => e.kind !== "SECURE");
      return { ...verdict, evidence: doubted, needsAnalysis: verdict.needsAnalysis || !named };
    }
    case "DOESNT_KNOW":
      return {
        ...verdict,
        verification: verdict.verification.status === "NOT_DETERMINISTIC" ? { ...verdict.verification, status: "VERIFIED_INCORRECT", explanation: "Didn't choose the factorisation." } : verdict.verification,
        evidence: [{ skillId: d.skillId, kind: "DID_NOT_KNOW", source: "INSTANT", ...(description ? { description } : {}) }],
        needsAnalysis: false,
      };
    case "MISTAKE": {
      // The question's own predicted mistake is more exact than one worked out from the play.
      const named = verdict.evidence.some((e) => e.kind === "MISTAKE" && e.mistake);
      const skillId = diagnosis.mistake ? ownerOfMistake(diagnosis.mistake, d) : d.skillId;
      // Right picks that show another skill on their own are kept as secure evidence for it (never a skill that has a mistake here).
      const blamed = new Set(named ? verdict.evidence.filter((e) => e.kind !== "SECURE").map((e) => e.skillId) : [skillId]);
      const credited: LotusSkillEvidence[] = (diagnosis.creditFor ?? [])
        .map((code) => ownerOfMistake(code, d))
        .filter((owner, i, all) => !blamed.has(owner) && all.indexOf(owner) === i && (skillsUsedBy(d).includes(owner) || (findSkill(d.skillId)?.dependsOn ?? []).includes(owner)) && expressionCanShowSkill(owner, d.expression))
        .map((owner) => ({ skillId: owner, kind: "SECURE" as const, source: "INSTANT" as const, description: "Right picks on both the positive and the negative side." }));
      if (named) return { ...verdict, evidence: [...verdict.evidence, ...credited], needsAnalysis: false };
      return { ...verdict, evidence: [{ skillId, kind: "MISTAKE", source: "INSTANT", ...(diagnosis.mistake ? { mistake: diagnosis.mistake } : {}), ...(description ? { description } : {}) }, ...credited], needsAnalysis: false };
    }
  }
}

/** The doubt in plain words, e.g. "Right answer, but kept 1 of 4 chips on 6(x + 48), the answer you get if you divided only the first term by the common factor." */
export function hedgeDescription(hedge: { chips: number; option: string; mistake?: string }): string {
  const words = hedge.mistake ? mistakeInWords(hedge.mistake) : undefined;
  return `Right answer, but kept ${hedge.chips} of ${LOTUS_SPLIT_TOKENS} chips on ${hedge.option}${words ? `, the answer you get if you ${words}` : ""}.`;
}

function markedVerdict(question: LotusQuestion, response: LotusStudentResponse): InstantVerdict {
  const d = question.answerKey.diagnostics!;
  const key = question.answerKey.canonicalAnswer;
  const verification = (status: LotusMathVerification["status"], explanation: string): LotusMathVerification => ({
    status, correctAnswer: key, method: d.itemKind === "CHOICE" ? (d.origin === "CODE" ? "DETERMINISTIC_ALGEBRA" : "AI_AUTHORED_REFERENCE") : d.itemKind === "SELECT" ? "DETERMINISTIC_ALGEBRA" : "DETERMINISTIC_ALGEBRA", explanation,
  });

  if (response.didNotKnow) {
    return {
      verification: verification("NO_ANSWER", "The student said they don't know this yet; this is recorded as a support signal."),
      evidence: [{ skillId: d.skillId, kind: "DID_NOT_KNOW", source: "INSTANT", description: "Student explicitly said they don't know this yet." }],
      fastSkip: false,
      needsAnalysis: false,
    };
  }

  const answer = response.answer;
  // "idk" typed into the answer box: a don't-know, not a wrong answer. The drafts and the working still carry
  // partial evidence (a factor found, a stuck point), so a review reads them when there are any.
  const typedItem = d.itemKind === "FACTORISE" || d.itemKind === "SIMPLIFY" || d.itemKind === "EXPAND" || d.itemKind === "NUMBER";
  if (typedItem && isDontKnowText(answer)) {
    const reading = response.gameReading?.kind === "EDIT_HISTORY" ? response.gameReading : response.typingReading;
    const drafts = Number((reading?.facts as { drafts?: number } | undefined)?.drafts ?? 0);
    return {
      verification: verification("NO_ANSWER", "The student typed that they don't know; this is recorded as a support signal."),
      evidence: [{ skillId: d.skillId, kind: "DID_NOT_KNOW", source: "INSTANT", description: "Typed that they don't know this yet." }],
      fastSkip: false,
      needsAnalysis: drafts > 0 || !!response.working?.trim(),
    };
  }
  if (question.interaction?.format === "FACTOR_CROSSWORD") {
    // Rebuild again at this boundary: caller-supplied text cannot override tile picks.
    const built = response.interaction ? assembleTileAnswer(question.interaction, response.interaction.picks) : answer;
    const answers = built?.split(" | ") ?? [];
    const clues = question.interaction.crossword ?? [];
    const correct = clues.length === 4 && answers.length === 4
      && clues.every((clue, i) => classifyFactorisation(answers[i]!, clue.expression) === "CORRECT");
    return {
      verification: { ...verification(correct ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT",
        correct ? "All four crossings verified by expansion. This is one diagnostic item, not four independent observations."
          : "At least one crossing does not match. Review the four submitted products; a particular misconception is not inferred from puzzle activity."),
        correctAnswer: question.answerKey.crosswordAnswers?.join(" | ") ?? key },
      evidence: correct ? secureAll(d) : [], fastSkip: false, needsAnalysis: !correct,
    };
  }
  if (d.itemKind === "SELECT") {
    // "Net every one that fits": the chosen options, in any order.
    const chosen = new Set(answer.split(LOTUS_SELECT_SEPARATOR).map((part) => normalizeMathText(part).toLowerCase()).filter(Boolean));
    const keyed = new Set(key.split(LOTUS_SELECT_SEPARATOR).map((part) => normalizeMathText(part).toLowerCase()));
    if (chosen.size === keyed.size && [...chosen].every((c) => keyed.has(c))) {
      return { verification: verification("VERIFIED_CORRECT", "Chose exactly the right options."), evidence: secureAll(d), fastSkip: false, needsAnalysis: false };
    }
    // Weightiest mistake first, so the plan and the observer text lead with it.
    const accepted = d.predictedMistakes.filter((p) => chosen.has(normalizeMathText(p.answer).toLowerCase()))
      .sort((a, b) => mistakeRank(a.mistake) - mistakeRank(b.mistake));
    const leftOut = [...keyed].some((k) => !chosen.has(k));
    return {
      verification: verification("VERIFIED_INCORRECT", accepted.length ? "Chose an option that doesn't fit." : "Left out an option that fits."),
      evidence: accepted.map((p) => ({ skillId: ownerOfMistake(p.mistake, d), kind: "MISTAKE" as const, mistake: p.mistake, source: "INSTANT" as const, description: named(`Chose "${p.answer}"`, p.mistake) })),
      fastSkip: false,
      // Code names the wrong picks, but nothing explains a right option left out (or a pick no known mistake covers):
      // the review decides what that means, whether or not other picks were named.
      needsAnalysis: accepted.length === 0 || leftOut,
    };
  }
  if (d.itemKind === "CHOICE") {
    if (sameChoice(answer, key)) return { verification: verification("VERIFIED_CORRECT", "Chose the correct option."), evidence: secureAll(d), fastSkip: false, needsAnalysis: false };
    const predicted = d.predictedMistakes.find((p) => sameChoice(p.answer, answer));
    return {
      verification: verification("VERIFIED_INCORRECT", "Chose a wrong option."),
      evidence: predicted ? [{ skillId: ownerOfMistake(predicted.mistake, d), kind: "MISTAKE", mistake: predicted.mistake, source: "INSTANT", description: named(`Chose "${answer}"`, predicted.mistake) }] : [],
      fastSkip: false,
      needsAnalysis: !predicted,
    };
  }

  if (d.itemKind === "NUMBER") {
    if (readNumberAnswer(answer) === null) {
      return { verification: verification("NOT_DETERMINISTIC", "The answer couldn't be read as a number, so the AI review will interpret it."), evidence: [], fastSkip: false, needsAnalysis: true };
    }
    if (sameNumber(answer, key)) {
      const doubtful = workingHasWrongStep(response.working, undefined, d.itemKind);
      return { verification: verification("VERIFIED_CORRECT", `Equal to ${key}.`), evidence: doubtful ? [] : secureAll(d), fastSkip: false, needsAnalysis: doubtful };
    }
    const predicted = d.predictedMistakes.find((p) => sameNumber(p.answer, answer));
    return {
      verification: verification("VERIFIED_INCORRECT", `Not equal to ${key}.`),
      evidence: predicted ? [{ skillId: ownerOfMistake(predicted.mistake, d), kind: "MISTAKE", mistake: predicted.mistake, source: "INSTANT", description: named(`Wrote ${answer}`, predicted.mistake) }] : [],
      fastSkip: false,
      needsAnalysis: !predicted,
    };
  }

  const expression = d.expression!;
  // What the student meant as the answer: "Ans: 7(x + 4).", "= 7(x + 4)" or "7x + 28 = 7(x + 4)" all mean 7(x + 4).
  const typed = finalAnswerText(response.answer) || response.answer;
  const verdict = d.itemKind === "SIMPLIFY" ? classifySimplification(typed, expression, key)
    : d.itemKind === "EXPAND" ? classifyExpansion(typed, expression)
      : classifyFactorisation(typed, expression);
  const done = d.itemKind === "SIMPLIFY" ? "simplified" : d.itemKind === "EXPAND" ? "expanded and collected" : "factorised";
  if (verdict === "CORRECT") {
    // Right answer, but a step in the working is false: don't call the skill
    // secure on trust — let the AI review read the working first (C3).
    const doubtful = workingHasWrongStep(response.working, expression, d.itemKind);
    return { verification: verification("VERIFIED_CORRECT", `Equal to ${expression} and fully ${done} — checked by expanding.`), evidence: doubtful ? [] : secureAll(d), fastSkip: false, needsAnalysis: doubtful };
  }
  if (verdict === "UNREADABLE") {
    return { verification: verification("NOT_DETERMINISTIC", "The answer couldn't be read as an expression, so the AI review will interpret it."), evidence: [], fastSkip: false, needsAnalysis: true };
  }
  const matches = (p: { answer: string }) => d.itemKind === "SIMPLIFY" || d.itemKind === "EXPAND"
    ? safe(() => algebraicallyEqual(p.answer, typed))
    : sameFactorisation(p.answer, typed);
  const predicted = d.predictedMistakes.find(matches);
  if (verdict === "UNFINISHED") {
    const code = predicted?.mistake ?? (d.itemKind === "EXPAND" ? "NOT_FULLY_SIMPLIFIED" : unfinishedCode(typed));
    const blamed: LotusSkillEvidence[] = [{ skillId: ownerOfMistake(code, d), kind: "UNFINISHED", mistake: code, source: "INSTANT", description: named(`Wrote ${answer}`, code) }];
    return {
      verification: verification("VERIFIED_UNFINISHED", `Equal to ${expression}, but not fully ${done}.`),
      evidence: [...blamed, ...lettersShown(d, expression, typed, blamed)],
      fastSkip: false,
      // A cause code guessed (no predicted mistake on the question) is the kind of answer the background review should read.
      needsAnalysis: !predicted,
    };
  }
  // With the right factor outside the bracket, code reads the bracket itself: 7(x + 28) for 7x + 28
  // is "divided only the first term" whether or not the question's writer predicted it. That beats a
  // predicted label, which an AI wrote, and keeps a plain mistake out of the AI review.
  const reading = d.itemKind === "FACTORISE" ? readCommonFactor(typed, expression) : null;
  // The square-pattern beliefs are also read from the answer's shape, so a mistake the item didn't list is still named.
  const shape = d.itemKind === "FACTORISE" ? squarePatternMistake(typed, expression) : null;
  const mistake = reading?.mistake ?? predicted?.mistake ?? shape ?? undefined;
  // A predicted wrong answer after working that already reached the right
  // one is most likely a copying slip, not the misconception it resembles:
  // leave it to the AI review (which labels slips) instead of counting it.
  const countable = !!mistake && !workingReachesAnswer(response.working, key, d.itemKind) && !workingShowsLostNumbers(response.working, key, typed);
  const blamed: LotusSkillEvidence[] = countable ? [{ skillId: ownerOfMistake(mistake, d), kind: "MISTAKE", mistake, source: "INSTANT", description: named(`Wrote ${answer}`, mistake) }] : [];
  return {
    verification: verification("VERIFIED_INCORRECT", `Not equal to ${expression} — checked by expanding.`),
    evidence: [...blamed, ...(reading ? commonFactorShown(reading, d, blamed) : [])],
    fastSkip: false,
    needsAnalysis: !countable,
  };
}

/**
 * An unfinished answer like x(6x + 10y) for 6x² + 10xy took every shared letter out and only left a number
 * inside. Code can verify that (no letter is common to the bracket's terms), so the letters skill gets credit,
 * never the skill that was missed. Only for a single bracket with the letters outside.
 */
function lettersShown(d: LotusItemDiagnostics, expression: string, typed: string, blamed: LotusSkillEvidence[]): LotusSkillEvidence[] {
  if (d.itemKind !== "FACTORISE" || factorisationDefect(typed) !== "NUMBER_LEFT_INSIDE") return [];
  if (bracketFactorCount(typed) !== 1 || !lettersFullyTakenOut(typed) || !expressionHasCommonLetter(expression)) return [];
  const letters = "FAC_GCF_VARIABLE";
  if (!skillsUsedBy(d).includes(letters) || blamed.some((b) => b.skillId === letters)) return [];
  return [{ skillId: letters, kind: "SECURE", source: "INSTANT", description: "Took every common letter out of the bracket." }];
}

/**
 * The right factor outside the bracket shows the student found the common factor, even when the bracket
 * is wrong. Recorded on the answer, it stops the AI review pinning the mistake on that step.
 */
function commonFactorShown(reading: CommonFactorReading, d: LotusItemDiagnostics, blamed: LotusSkillEvidence[]): LotusSkillEvidence[] {
  const inTopic = new Set((curriculumOfSkill(d.skillId)?.skills ?? []).map((s) => s.id));
  return [reading.numberPart && "FAC_GCF_NUMERIC", reading.letterPart && "FAC_GCF_VARIABLE"]
    .filter((s): s is string => !!s && inTopic.has(s) && !blamed.some((b) => b.skillId === s))
    .map((skillId) => ({ skillId, kind: "SECURE" as const, source: "INSTANT" as const, description: skillId === "FAC_GCF_NUMERIC" ? "Took out the right number part of the common factor." : "Took out the right letters of the common factor." }));
}

/**
 * Does the working contain a step that is false, even though the final answer
 * is right? (Two errors can cancel; a lucky answer can sit on nonsense.) A step
 * is false when an equation in it has unequal sides ("4 + 5 = 20"), or, for
 * EXPAND/SIMPLIFY, a line stops being equal to the original expression. Lines
 * code can't read as maths (words, labels) are skipped, never counted against.
 */
function workingHasWrongStep(working: string | undefined, expression: string | undefined, itemKind: LotusItemDiagnostics["itemKind"]): boolean {
  const readable = (s: string) => /[0-9a-z]/i.test(s) && safe(() => algebraicallyEqual(s, s));
  for (const line of (working ?? "").split("\n")) {
    for (const raw of line.split(/,|;|\band\b/i)) {
      const segment = (raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw)
        .replace(/^\s*(so|then|therefore|which is|gives)\s+/i, "").trim();
      if (!segment) continue;
      const sides = segment.split("=").map((s) => s.trim()).filter(Boolean);
      if (sides.length >= 2) {
        for (let i = 0; i + 1 < sides.length; i += 1) {
          const [a, b] = [sides.at(i)!, sides.at(i + 1)!];
          if (readable(a) && readable(b) && !safe(() => algebraicallyEqual(a, b))) return true;
        }
      } else if (expression && (itemKind === "EXPAND" || itemKind === "SIMPLIFY") && /[a-z]/i.test(segment) && readable(segment)) {
        if (!safe(() => algebraicallyEqual(segment, expression))) return true;
      }
    }
  }
  return false;
}

/** The signed numbers written in a piece of maths: "(x - 4)(x - 5)" → ["-4", "-5"]. */
function signedNumbers(text: string): string[] {
  const flat = text.replace(/[−–]/g, "-").replace(/\s+/g, "");
  return [...flat.matchAll(/([+-]?)(\d+(?:\.\d+)?)/g)].map((m) => `${m[1] === "-" ? "-" : ""}${m[2]}`);
}

/**
 * Does the working contain the signed numbers the correct answer needs but
 * the submitted answer lost? E.g. working "-4 × -5 = 20, -4 + -5 = -9", then
 * (x + 4)(x + 5): the child found the right pair and miscopied it, which
 * looks like the predicted sign mistake but isn't one (C3).
 */
function workingShowsLostNumbers(working: string | undefined, key: string, answer: string): boolean {
  if (!working?.trim()) return false;
  const inAnswer = new Set(signedNumbers(answer));
  const lost = [...new Set(signedNumbers(key))].filter((n) => !inAnswer.has(n) && n !== "1" && n !== "0");
  if (!lost.length) return false;
  const inWorking = new Set(signedNumbers(working));
  return lost.every((n) => inWorking.has(n));
}

/** Does any line of the working (or the part after its last "=") already equal the correct answer? */
function workingReachesAnswer(working: string | undefined, key: string, itemKind: LotusItemDiagnostics["itemKind"]): boolean {
  const same = itemKind === "FACTORISE" ? sameFactorisation : algebraicallyEqual;
  for (const line of (working ?? "").split("\n")) {
    const candidates = [line, line.split("=").at(-1) ?? ""].map((c) => c.replace(/^\s*(so|therefore|answer:?)\s+/i, "").trim()).filter(Boolean);
    if (candidates.some((c) => safe(() => same(c, key)))) return true;
  }
  return false;
}

function safe(fn: () => boolean): boolean { try { return fn(); } catch { return false; } }

/**
 * The analyser only says *which step* went wrong; the item's own step tags
 * turn that into a skill. It only fills turns code couldn't explain: if code
 * already proved the answer right, or already named the mistake, the AI's
 * reading doesn't override it (the Lotus policy: never infer a misconception
 * from an answer deterministic verification marks correct).
 */
export function evidenceFromAnalysis(
  question: LotusQuestion,
  existing: LotusSkillEvidence[],
  firstWrongStep: unknown,
  description: string | undefined,
  mistakeKind?: unknown,
  answerCorrect = false,
): LotusSkillEvidence[] {
  const d = question.answerKey.diagnostics;
  // Models sometimes send the step as a string; anything that isn't a step number means "no wrong step".
  const step = typeof firstWrongStep === "string" ? Number(firstWrongStep) : firstWrongStep;
  const noRealStep = typeof step !== "number" || !Number.isInteger(step) || step < 1;
  // A right answer held back for review because its working looked wrong (C3):
  // if the review finds nothing, or only a slip in the working, it is the
  // secure evidence it would have been; a real misunderstanding counts below.
  if (d && answerCorrect && existing.length === 0 && (noRealStep || mistakeKind === "SLIP" || mistakeKind === "UNREADABLE")) return secureAll(d);
  if (!d) return existing;
  // Code named the mistake: the review can't override it. Code may also have proved part of a wrong
  // answer right (the factor outside the bracket); that stays, and nothing below blames those skills.
  const proven = existing.filter((e) => e.kind === "SECURE");
  if (existing.length > proven.length) return existing;
  // A slip or an unreadable answer is not evidence the student lacks the
  // skill: two careless copies must not confirm a gap. The analyser's note
  // stays on the turn's analysis record. A missing kind is counted as before.
  if (mistakeKind === "SLIP" || mistakeKind === "UNREADABLE") return existing;
  // A guess (no method) means the same as "I don't know this yet": a support
  // signal on the question's own skill — the step it "went wrong" at means
  // nothing without a method. Two on a skill confirm it, so the child is taught.
  const isProven = (skillId: string) => proven.some((e) => e.skillId === skillId);
  if (mistakeKind === "GUESS") {
    return isProven(d.skillId) ? existing : [...proven, { skillId: d.skillId, kind: "DID_NOT_KNOW", source: "ANALYSIS", description: description?.trim() || "Guessed with no method." }];
  }
  if (noRealStep) return existing;
  // A step code saw done right can't be where it went wrong: the review is pointing at the question's own skill.
  const stepSkill = d.stepSkills[step - 1] ?? d.skillId;
  const skillId = isProven(stepSkill) ? d.skillId : stepSkill;
  if (isProven(skillId)) return existing;
  return [...proven, { skillId, kind: "MISTAKE", source: "ANALYSIS", description: description?.trim() || `Step ${step} went wrong.` }];
}

// ---------- conflicting evidence on one skill ----------

/**
 * Does this answer pull against what the session already showed on a skill? A predicted mistake on a skill
 * that was answered right earlier, or a right answer on a skill that already showed that mistake. Code can
 * mark each answer, but only a review can weigh the two against each other, so it is worth asking for one.
 */
export function conflictsWithEarlier(prior: LotusQuestionAudit[], evidence: LotusSkillEvidence[], status: LotusMathVerification["status"] | undefined): boolean {
  for (const e of evidence) {
    const earlier = prior.flatMap((a) => (a.skillEvidence ?? []).filter((x) => x.skillId === e.skillId).map((x) => ({ x, audit: a })));
    if (e.kind === "MISTAKE" && e.mistake) {
      if (earlier.some(({ x, audit }) => x.kind === "SECURE" && !x.hedge && audit.verification?.status === "VERIFIED_CORRECT")) return true;
    } else if (e.kind === "SECURE" && status === "VERIFIED_CORRECT") {
      if (earlier.some(({ x }) => (x.kind === "MISTAKE" || x.kind === "UNFINISHED") && x.mistake)) return true;
    }
  }
  return false;
}

// ---------- what an answer did to an open suspicion ----------

/**
 * Plain words for what this answer did to a suspicion the skill was already under (a mistake on an earlier
 * question): repeated it, made a different one, or got it right. Rebuilt from the same ledger the plan uses, so
 * it says what the rules actually did. Null when no skill this question uses was under suspicion.
 */
export function suspicionEffectNote(prior: LotusQuestionAudit[], audit: LotusQuestionAudit, priors: LotusLedgerPrior[] = []): string | null {
  const d = audit.question?.answerKey?.diagnostics;
  if (!d) return null;
  const before = foldLedger(prior, priors);
  const after = foldLedger([...prior, audit], priors);
  const wordsOf = (code: string) => mistakeInWords(code) ?? code.toLowerCase().replace(/_/g, " ");
  const ordered = [d.skillId, ...skillsUsedBy(d).filter((s) => s !== d.skillId)];
  for (const skillId of ordered) {
    const was = before.get(skillId);
    const mistake = was?.mistakes.at(-1);
    if (!was || (was.state !== "SUSPECTED" && was.state !== "CONFIRMED") || !mistake) continue;
    const words = wordsOf(mistake);
    const evidence = (audit.skillEvidence ?? []).filter((e) => e.skillId === skillId);
    const now = after.get(skillId)?.state;
    const negative = evidence.find((e) => e.kind !== "SECURE" && !e.hedge);
    if (negative) {
      if (negative.kind === "DID_NOT_KNOW") return `Said they don't know this yet, after the earlier suspicion (${words}); ${now === "CONFIRMED" ? "it is now confirmed" : "it stays open"}.`;
      if (negative.mistake === mistake) return `Made the same mistake again (${words}), so ${was.state === "CONFIRMED" ? "the gap stays confirmed" : now === "CONFIRMED" ? "it is now confirmed" : "the suspicion stands"}.`;
      return `Made a different mistake${negative.mistake ? ` (${wordsOf(negative.mistake)})` : ""}; the earlier suspicion (${words}) stays open.`;
    }
    if (was.state === "CONFIRMED") continue;
    if (!evidence.some((e) => e.kind === "SECURE" || e.hedge) || audit.verification?.status !== "VERIFIED_CORRECT") continue;
    if (evidence.some((e) => e.hedge)) return `Right, but with some doubt, so the earlier suspicion (${words}) is not settled.`;
    const option = audit.question.options?.length ? d.predictedMistakes.find((p) => p.mistake === mistake)?.answer : undefined;
    const lead = option ? `Avoided the "${words}" option (${option}).` : `Got it right without the "${words}" mistake.`;
    if (now === "SECURE") {
      return isTap(audit)
        ? `${lead} Lotus counts a picked answer on the re-check as clearing the earlier suspicion, though a pick could be a guess.`
        : `${lead} The earlier suspicion looks settled.`;
    }
    return `${lead} The earlier suspicion stays open: this question could not fully test it.`;
  }
  return null;
}

// ---------- ledger ----------

export interface SkillLedgerEntry {
  skillId: string;
  state: Exclude<LotusSkillState, "NOT_TESTED_DEPENDENCY">;
  /** Answer number (1-based) where the suspicion started / was confirmed. */
  suspectedAt?: number;
  confirmedAt?: number;
  clearedAfterSlip?: number;
  /** Answers (1-based) the student got right on this skill after it was confirmed: shown next to the gap, never silently dropped. */
  rightSinceConfirmed?: number[];
  /** A confirmed gap reopened as a suspicion after two later right answers, waiting for one direct question. */
  recheck?: boolean;
  /** The skill has had its one re-check; later evidence no longer reopens it. */
  recheckUsed?: boolean;
  /** Right once on a multiple-choice tap: not yet enough to call it secure. */
  tapRights?: number;
  /** A weaker successful check gives positive evidence but cannot resolve the original concern. */
  needsComparableCheck?: boolean;
  /** A correct leading chip choice still included a wrong alternative; this is uncertainty, not a mistake. */
  splitDoubtAt?: number;
  /** Right, but with chips on a wrong option: the question and the doubted mistake ("" when none is named). */
  hedges?: Array<{ q: number; mistake: string }>;
  /** Suspected because the same doubt came back, not because of a wrong answer. */
  fromHedge?: boolean;
  /** Confirmed only by fast wrong answers late in the test: may be tiredness, so not taught (C13). */
  tiredness?: boolean;
  mistakes: string[];
  notes: string[];
  /** Answers where code saw this skill done right inside a wrong answer (the factor outside the bracket): it is shown, so no step down to it. */
  shownInWrong?: number;
  /** The learner explicitly needed help; use a lower prerequisite probe where possible. */
  needsSupport?: boolean;
  /** How many different questions on this skill got "I don't know this yet". */
  supportCount?: number;
  /** Confirmed because the student said they don't know it (twice, or once plus a mistake), not by two mistakes. */
  confirmedBySupport?: boolean;
  /** Every question this skill went wrong on also needed a confirmed gap in an unrelated branch, so that gap may be the cause: shown as suspected, not confirmed. */
  explainedBy?: string;
  /** Answers on this skill that were wrong, where the AI review said "misunderstanding" but named no step, so no skill got evidence. */
  unexplained?: number;
  /** Carried in from earlier tests or lessons (see foldLedger's priors), and why. */
  fromMemory?: LotusLedgerPrior["reason"];
}

export type Ledger = Map<string, SkillLedgerEntry>;

/**
 * Could this answered question have shown the given mistake? Only a question
 * built to catch that mistake (it lists it among its predicted wrong answers)
 * can clear a suspicion of it. Unknown mistake or no question details: yes,
 * as before.
 */
/** An answer faster than this, and wrong, counts toward "not really trying". */
const RUSHED_MS = 5_000;

/**
 * An answer picked from a few given options rather than written: multiple
 * choice, choose-several, or the two-bracket tile game (6 tiles, so a guess
 * is right about 1 time in 15). One right pick isn't enough for "secure".
 */
function isTap(audit: LotusQuestionAudit): boolean {
  // A themed game says itself how far a right answer counts.
  const effect = audit.response?.gameReading?.diagnosis?.effect;
  if (effect) return effect === "NEEDS_ANOTHER";
  // A typed answer whose discarded draft was a known mistake: fixed this time, but not proof yet.
  if (audit.response?.typingReading?.diagnosis?.effect === "NEEDS_ANOTHER") return true;
  const kind = audit.question?.answerKey?.diagnostics?.itemKind;
  return kind === "CHOICE" || kind === "SELECT" || audit.question?.interaction?.format === "BRACKET_BRIDGE" || ["COMMIT_THEN_CHOOSE", "TRUE_FALSE", "SPLIT_CONFIDENCE", "FOUR_SIGNS"].includes(audit.question?.game?.kind ?? "");
}

function couldShow(audit: LotusQuestionAudit, mistake: string | undefined): boolean {
  // The dedicated check written for this suspicion settles it either way:
  // one mistake earns one fresh check, never a chain of them.
  if ((audit.questionSelection as { adaptationTag?: { kind?: string } } | undefined)?.adaptationTag?.kind === "TARGETED_CHECK") return true;
  // These plays show the student's signs directly, whatever the question's own list of mistakes says.
  const signals = audit.response?.gameReading?.signals ?? [];
  if ((mistake === "SIGN_PAIR_ERROR" || mistake === "SIGNS_SWAPPED") && (signals.includes("sound") || signals.includes("rule_real"))) return true;
  return itemCouldShow(audit.question, mistake);
}

function itemCouldShow(item: LotusQuestion | undefined | null, mistake: string | undefined): boolean {
  const predicted = item?.answerKey?.diagnostics?.predictedMistakes;
  if (!mistake || !predicted) return true;
  return predicted.some((p) => p.mistake === mistake);
}

/**
 * Folds the answers into each skill's state. `priors` are skills earlier tests or lessons left open
 * (the learner memory): each starts this test as a suspicion from before its first question, so the
 * plan re-checks it early, one more mistake confirms it, and a right answer that could have shown
 * the old mistake clears it.
 */
const LEVEL_RANK = { easy: 1, medium: 2, hard: 3 } as const;

/** A suspicion needs an independent, relevant and comparable success to settle it. */
function isWeakerCheck(original: LotusQuestionAudit | undefined, current: LotusQuestionAudit, skillId: string): boolean {
  // A deliberately installed targeted check is the comparable evidence the
  // planner selected for this concern, even when its generated metadata uses
  // a lower difficulty label than the item that first exposed the mistake.
  if (current.questionSelection?.adaptationTag?.kind === "TARGETED_CHECK") return false;
  const diagnostics = current.question?.answerKey?.diagnostics;
  if (!diagnostics) return false;
  // Learner-memory priors have no originating item in this session. A direct
  // right re-check is the evidence that shows whether the earlier concern is fixed.
  if (!original) return false;
  const before = original.question?.answerKey?.diagnostics?.level;
  const after = diagnostics.level;
  // Older verified items do not always carry levels. Missing metadata must
  // not make a direct right re-check permanently unable to settle a concern.
  if (!before || !after) return false;
  return LEVEL_RANK[after] < LEVEL_RANK[before];
}

export function foldLedger(audits: LotusQuestionAudit[], priors: LotusLedgerPrior[] = []): Ledger {
  const ledger: Ledger = new Map();
  const entry = (skillId: string): SkillLedgerEntry => {
    let e = ledger.get(skillId);
    if (!e) { e = { skillId, state: "UNTESTED", mistakes: [], notes: [] }; ledger.set(skillId, e); }
    return e;
  };
  for (const prior of priors) {
    const e = entry(prior.skillId);
    e.state = "SUSPECTED";
    e.suspectedAt = 0;
    e.fromMemory = prior.reason;
    e.mistakes.push(...prior.mistakes);
    e.notes.push(`Before this test: ${prior.note}`);
  }
  audits.forEach((audit, i) => {
    const q = i + 1;
    const bySkill = new Map<string, LotusSkillEvidence[]>();
    for (const ev of audit.skillEvidence ?? []) bySkill.set(ev.skillId, [...(bySkill.get(ev.skillId) ?? []), ev]);
    // Wrong, reviewed, called a misunderstanding, yet no step named: nothing was learned about any skill. Count it, so
    // the report doesn't read it as nothing and the plan can look underneath.
    const wrongAnswer = audit.verification?.status === "VERIFIED_INCORRECT" || audit.verification?.status === "VERIFIED_UNFINISHED";
    const headline = audit.question?.answerKey?.diagnostics?.skillId;
    const chipPlay = audit.response?.game;
    if (headline && audit.verification?.status === "VERIFIED_CORRECT" && chipPlay?.kind === "SPLIT_CONFIDENCE" &&
      chipPlay.counts.filter((count) => count > 0).length > 1 && Math.max(...chipPlay.counts) === 3) {
      const e = entry(headline);
      e.splitDoubtAt = q;
      e.notes.push(`Q${q}: main chip choice correct, but another option received a chip; a fresh check may clarify the uncertainty`);
    } else if (headline && chipPlay?.kind !== "SPLIT_CONFIDENCE" && !isTap(audit) &&
      audit.question?.answerKey?.diagnostics?.skillId === headline && audit.verification?.status === "VERIFIED_CORRECT") {
      const prior = ledger.get(headline);
      if (prior?.splitDoubtAt) { prior.splitDoubtAt = undefined; prior.notes.push(`Q${q}: a later independent correct answer followed the split-chip response`); }
    }
    if (headline && wrongAnswer && audit.analysisStatus === "COMPLETE" && audit.conclusion?.mistakeKind === "MISUNDERSTANDING" &&
      !(audit.skillEvidence ?? []).some((ev) => ev.kind !== "SECURE")) {
      const u = entry(headline);
      u.unexplained = (u.unexplained ?? 0) + 1;
      u.notes.push(`Q${q}: wrong, but the cause couldn't be linked to a skill`);
    }
    for (const [skillId, items] of bySkill) {
      const e = entry(skillId);
      const negative = items.find((ev) => ev.kind !== "SECURE" && !ev.hedge);
      if (negative) {
        const label = negative.mistake ?? (negative.kind === "DID_NOT_KNOW" ? "DID_NOT_KNOW" : "MISTAKE");
        e.notes.push(`Q${q}: ${negative.description ?? label}${negative.mistake ? ` (${negative.mistake})` : ""}`);
        if (negative.kind === "DID_NOT_KNOW") {
          // One "I don't know" is a support signal, not a gap: it earns an
          // easier prerequisite question. A second one on another question,
          // or one alongside a mistake, means the skill isn't learned yet.
          // Treat it as a gap so the student is taught from the foundations
          // instead of getting "no lesson needed".
          e.needsSupport = true;
          e.supportCount = (e.supportCount ?? 0) + 1;
          // A skill already answered right stays secure: one shown success outweighs saying "not sure".
          if ((e.state === "UNTESTED" || e.state === "SUSPECTED") && (e.supportCount >= 2 || e.mistakes.length > 0)) {
            e.state = "CONFIRMED";
            e.confirmedAt = q;
            e.confirmedBySupport = true;
          }
          continue;
        }
        // Captured before this mistake is pushed: does this skill already
        // carry a mistake from an earlier, since-cleared suspicion? If so,
        // this is a second independent negative on the skill, not a fresh
        // first-time slip — it should confirm outright rather than restart
        // the SUSPECTED/SECURE cycle and let a repeatable misconception hide
        // behind alternating right/wrong turns indefinitely. An earlier
        // "I don't know" on the skill counts as that first negative too.
        const hadPriorMistake = e.mistakes.length > 0 || (e.supportCount ?? 0) > 0;
        if (negative.mistake) e.mistakes.push(negative.mistake);
        if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt) { e.state = "CONFIRMED"; e.confirmedAt = q; }
        else if (e.state === "UNTESTED" && hadPriorMistake) { e.state = "CONFIRMED"; e.confirmedAt = q; e.confirmedBySupport = true; }
        else if (e.state === "SECURE" && hadPriorMistake) { e.state = "CONFIRMED"; e.confirmedAt = q; }
        else if (e.state === "UNTESTED" || e.state === "SECURE") { e.state = "SUSPECTED"; e.suspectedAt = q; }
      } else if (wrongAnswer) {
        // Done right inside a wrong answer (the factor outside the bracket). Kept on record, and the AI review
        // can't blame it (evidenceFromAnalysis), but only a right answer makes a skill secure or clears a suspicion.
        e.notes.push(`Q${q}: right as part of a wrong answer`);
        e.shownInWrong = (e.shownInWrong ?? 0) + 1;
      } else if (items.find((ev) => ev.hedge)?.hedge) {
        // Right, but some confidence went on a wrong option. One doubt is not a gap and not a success:
        // it neither makes the skill secure nor clears a suspicion. The same doubt again makes it suspected.
        const hedge = items.find((ev) => ev.hedge)!.hedge!;
        const key = hedge.mistake ?? "";
        e.hedges = [...(e.hedges ?? []), { q, mistake: key }];
        const doubtedBefore = e.hedges.filter((h) => h.mistake === key).length > 1;
        const about = hedge.mistake ? `the ${hedge.mistake} mistake` : `another answer (${hedge.option})`;
        if (doubtedBefore && (e.state === "UNTESTED" || e.state === "SECURE")) {
          e.state = "SUSPECTED"; e.suspectedAt = q; e.fromHedge = true;
          if (hedge.mistake) e.mistakes.push(hedge.mistake);
          e.notes.push(`Q${q}: right, but the same doubt about ${about} came back, so it needs a check`);
        } else {
          e.notes.push(`Q${q}: right, with a doubt about ${about}, so not counted secure yet`);
        }
      } else {
        // A re-check is settled only by a question aimed at the skill itself,
        // not by one where it is a single step among others.
        const direct = audit.question?.answerKey?.diagnostics?.skillId === skillId;
        if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt &&
          isWeakerCheck(audits[e.suspectedAt - 1], audit, skillId)) {
          e.needsComparableCheck = true;
          e.notes.push(`Q${q}: right on a weaker check; the ${e.suspectedAt ? `concern from Q${e.suspectedAt}` : "earlier concern"} needs a comparable independent check`);
        } else if (e.recheck && e.state === "SUSPECTED") {
          if (direct && e.suspectedAt !== undefined && q > e.suspectedAt) {
            e.state = "SECURE"; e.recheck = false; e.needsComparableCheck = false; e.clearedAfterSlip = e.confirmedAt;
            e.notes.push(`Q${q}: right on the re-check, so the earlier mistakes look like slips`);
          } else {
            e.rightSinceConfirmed = [...(e.rightSinceConfirmed ?? []), q];
            e.notes.push(`Q${q}: right, but not a direct re-check`);
          }
        } else if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt &&
          audit.questionSelection?.adaptationTag?.kind !== "TARGETED_CHECK" && !couldShow(audit, e.mistakes.at(-1))) {
          // C6: right, but this question couldn't produce the suspected
          // mistake (e.g. no negative numbers for a sign mistake), so it
          // can't clear it. The plan keeps a check that can.
          e.notes.push(`Q${q}: right, but it couldn't show the ${e.mistakes.at(-1)} mistake`);
        } else if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt) {
          e.state = "SECURE"; e.needsComparableCheck = false;
          if (!e.fromHedge) e.clearedAfterSlip = e.suspectedAt;
          e.notes.push(e.suspectedAt === 0
            ? `Q${q}: right, so ${e.fromMemory === "TAUGHT" ? "the lesson has stuck" : "the earlier gap looks fixed"}`
            : e.fromHedge ? `Q${q}: right with no doubt, so the earlier doubt looks settled`
              : `Q${q}: right, so the Q${e.suspectedAt} mistake looks like a slip`);
          e.fromHedge = false;
        } else if (e.state === "UNTESTED" && e.splitDoubtAt && isTap(audit)) {
          e.notes.push(`Q${q}: a selected answer provides supporting evidence, but the split still needs an independent answer`);
        } else if (e.state === "UNTESTED" && isTap(audit) && (e.tapRights ?? 0) < 1) {
          // One right multiple-choice tap could be a 1-in-4 guess: it takes a
          // second right tap or a right typed answer to call the skill secure.
          e.tapRights = 1;
          e.notes.push(`Q${q}: right on a multiple-choice question — one more right answer needed to count it secure`);
        } else if (e.state === "UNTESTED") {
          e.state = "SECURE"; e.notes.push(`Q${q}: right`);
        } else if (e.state === "SECURE") {
          e.notes.push(`Q${q}: right`);
        }
        // CONFIRMED stays confirmed: a later success doesn't erase a confirmed
        // gap, but it is kept so the report can show the conflicting evidence.
        else if (e.state === "CONFIRMED" && e.confirmedAt !== undefined && q > e.confirmedAt) {
          e.rightSinceConfirmed = [...(e.rightSinceConfirmed ?? []), q];
          e.notes.push(`Q${q}: right after the gap was confirmed`);
          // Two right answers since confirmation cast real doubt: reopen it as
          // a suspicion so the plan asks one direct question to settle it.
          // Once per skill, so the evidence can't flip back and forth.
          if (!e.recheckUsed && e.rightSinceConfirmed.length >= 2) {
            e.state = "SUSPECTED"; e.suspectedAt = q; e.recheck = true; e.recheckUsed = true;
            e.notes.push(`Q${q}: right twice since the gap was confirmed, so it needs a re-check`);
          }
        }
      }
      if (e.state === "CONFIRMED") e.recheck = false;
    }
  });
  explainAwayConfounded(audits, ledger);
  markTirednessGaps(audits, ledger);
  return ledger;
}

/** Reconstruct each prefix using today's persisted records, not a delivery-time snapshot. */
export function projectSkillAssessments(audits: LotusQuestionAudit[], priors: LotusLedgerPrior[] = []): LotusSkillAssessmentProjection[] {
  return audits.map((audit, index) => {
    const previous = foldLedger(audits.slice(0, index), priors);
    const current = foldLedger(audits.slice(0, index + 1), priors);
    const skills = [...new Set((audit.skillEvidence ?? []).map((item) => item.skillId))];
    return {
      basis: "RECONSTRUCTED_FROM_CURRENT_RECORD" as const,
      entries: skills.flatMap((skillId) => {
        const after = current.get(skillId);
        if (!after) return [];
        const before = previous.get(skillId);
        return [{
          skillId,
          previousState: before?.state ?? "UNTESTED",
          state: after.state,
          notes: after.notes.slice(before?.notes.length ?? 0),
          needsComparableCheck: after.needsComparableCheck ?? false,
        }];
      }),
    };
  });
}

/**
 * A mistake on a question is blamed on the question's own skill, but the question may have needed
 * other skills too (tagged or in its steps). When a skill's mistakes all came on questions that also
 * needed a skill built on a confirmed gap in an UNRELATED branch (neither above nor below this skill),
 * that gap may be the real cause, so this skill is shown as suspected, not confirmed, and says why.
 * A gap above the skill (a prerequisite) is left alone: that is the "one cause, many gaps" case the
 * report already handles by starting at the root. A skill with any mistake on a question that needed
 * nothing else from a confirmed gap stays confirmed.
 */
function explainAwayConfounded(audits: LotusQuestionAudit[], ledger: Ledger): void {
  const confirmed = [...ledger.values()].filter((e) => e.state === "CONFIRMED").map((e) => e.skillId);
  if (confirmed.length < 2) return;
  const demote: Array<[SkillLedgerEntry, string]> = [];
  for (const e of ledger.values()) {
    if (e.state !== "CONFIRMED" || e.confirmedBySupport || !e.mistakes.length) continue;
    const negatives = audits.filter((a) => (a.skillEvidence ?? []).some((ev) => ev.skillId === e.skillId && ev.kind !== "SECURE" && ev.kind !== "DID_NOT_KNOW" && !ev.hedge));
    if (!negatives.length) continue;
    const causeOf = (a: LotusQuestionAudit): string | undefined => {
      const d = a.question?.answerKey?.diagnostics;
      if (!d) return undefined;
      const others = skillsUsedBy(d).filter((u) => u !== e.skillId);
      return confirmed.find((g) => g !== e.skillId && !dependsOnTransitively(g, e.skillId) && !dependsOnTransitively(e.skillId, g) &&
        others.some((u) => dependsOnTransitively(u, g)));
    };
    const causes = negatives.map(causeOf);
    if (causes.every((c) => !!c)) demote.push([e, causes[0]!]);
  }
  for (const [e, g] of demote) {
    e.explainedBy = g;
    e.state = "SUSPECTED";
    e.suspectedAt = e.confirmedAt;
    delete e.confirmedAt;
    e.notes.push(`Every question it went wrong on also needed ${skillName(g)}, a confirmed gap, so that may be the cause`);
  }
}

/**
 * Tired halfway (C13): careful and mostly right early, then mostly fast and
 * wrong late. A gap confirmed only by those late rushed answers may be
 * tiredness, not a gap: it becomes a suspicion marked `tiredness`, so no
 * lesson is built on it and the report says why. A gap also seen in the
 * careful part of the test stays confirmed.
 */
function markTirednessGaps(audits: LotusQuestionAudit[], ledger: Ledger): void {
  const fatigue = fatigueStart(audits);
  // Two fast wrong answers can confirm a gap and end the test before a third is asked. That alone isn't fatigue,
  // but it can't outweigh the same skill answered right while the child was careful.
  const run = fastWrongRunAtEnd(audits);
  const lastSpell = run === 2 && carefulBeforeRun(audits, run) ? audits.length - 1 : null;
  if (fatigue === null && lastSpell === null) return;
  const rushedWrongTurn = (q: number, from: number) => {
    const a = audits.at(q - 1);
    return !!a && q >= from && (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT";
  };
  for (const e of ledger.values()) {
    if (e.state !== "CONFIRMED") continue;
    const negativeTurns = e.notes
      .filter((n) => !n.includes(": right"))
      .map((n) => Number(/^Q(\d+):/.exec(n)?.[1]))
      .filter((q) => Number.isInteger(q) && q > 0);
    const inFatigue = fatigue !== null && negativeTurns.every((q) => rushedWrongTurn(q, fatigue));
    const rightWhileCareful = lastSpell !== null && e.notes.some((n) => n.includes(": right")) && negativeTurns.every((q) => rushedWrongTurn(q, lastSpell));
    if (negativeTurns.length && (inFatigue || rightWhileCareful)) {
      e.state = "SUSPECTED"; e.tiredness = true; e.suspectedAt = negativeTurns.at(-1);
    }
  }
}

/** The answer number where a careful start turns into fast wrong answers, or null if it doesn't. */
export function fatigueStart(audits: LotusQuestionAudit[]): number | null {
  const answered = audits.filter((a) => a.response && !a.response.didNotKnow);
  if (answered.length < 10) return null;
  const half = Math.floor(audits.length / 2);
  const early = audits.slice(0, half).filter((a) => a.response && !a.response.didNotKnow);
  const late = audits.slice(half).filter((a) => a.response && !a.response.didNotKnow);
  const rushedWrong = (a: LotusQuestionAudit) => (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT";
  const earlyRight = early.filter((a) => a.verification?.status === "VERIFIED_CORRECT").length / Math.max(early.length, 1);
  const earlyRushed = early.filter(rushedWrong).length / Math.max(early.length, 1);
  const lateRushed = late.filter(rushedWrong).length / Math.max(late.length, 1);
  if (late.length >= 4 && earlyRight >= 0.6 && earlyRushed <= 0.2 && lateRushed >= 0.5) {
    // The first rushed wrong answer in the second half.
    const first = audits.findIndex((a, i) => i >= half && rushedWrong(a));
    return first < 0 ? null : first + 1;
  }
  // A short tired spell at the very end: three or more fast wrong answers in a row after a careful, mostly right start.
  const run = fastWrongRunAtEnd(audits);
  return run >= 3 && carefulBeforeRun(audits, run) ? audits.length - run + 1 : null;
}

/** How many answers in a row at the very end were fast and wrong. */
function fastWrongRunAtEnd(audits: LotusQuestionAudit[]): number {
  let run = 0;
  for (let i = audits.length - 1; i >= 0; i -= 1) {
    const a = audits[i]!;
    if (!a.response || a.response.didNotKnow || !((a.response.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT")) break;
    run += 1;
  }
  return run;
}

/** Whether the answers before that run were careful and mostly right. */
function carefulBeforeRun(audits: LotusQuestionAudit[], run: number): boolean {
  const before = audits.slice(0, audits.length - run).filter((a) => a.response && !a.response.didNotKnow);
  const right = before.filter((a) => a.verification?.status === "VERIFIED_CORRECT").length / Math.max(before.length, 1);
  const rushed = before.filter((a) => (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT").length / Math.max(before.length, 1);
  return before.length >= 7 && right >= 0.6 && rushed <= 0.2;
}

// ---------- plan adjustments ----------

export type PlanAction =
  | { kind: "SKIP"; turn: number; reason: string }
  | {
      kind: "REPURPOSE";
      turn: number;
      purpose: "CHECK" | "AVOID" | "DESCENT" | "WIDEN";
      forSkill: string;
      reason: string;
      /** When set, the AI writes a fresh question from this spec in the background. */
      spec: SlotSpec | null;
      targetMistake?: string;
      avoidSkill?: string;
      /** Keep the turn out of the test until the AI's version is ready. */
      skipUntilReady?: boolean;
    };

export interface PlanInput {
  state: FactorisationState;
  ledger: Ledger;
  /** The question currently planned for a turn (the preferred version if one was swapped in). */
  itemAt: (turn: number) => LotusQuestion | undefined;
  /** Every question already shown, so the AI writer avoids repeating it. */
  askedItems: LotusQuestion[];
  /**
   * Whether the next open turn is off-limits too. True for background
   * updates: the browser already holds that question to show the instant the
   * student presses Submit. False right after an answer, because the reply
   * carries the new plan with it.
   */
  freezeNext?: boolean;
  /** A completed AI review explicitly asked for another probe of this skill. */
  forceCheckSkills?: string[];
  /** Who found the evidence behind each forced check: "AI" when the review named the skill, else code's own evidence rules. */
  forceCheckDecidedBy?: Record<string, "AI" | "CODE">;
  /**
   * How many of the questions still ahead the student can plausibly reach before the time limit
   * (see reachableQuestionsAhead). Absent = no limit. A check is never placed beyond it.
   */
  reachableQuestions?: number;
  /** Called when open slots exist but none can be reached, so a check was left out for lack of time. */
  onNoReachableSlot?: () => void;
}

/** How many more questions fit in the time left, at the pace so far. Zero once time is up. */
export function reachableQuestionsAhead(elapsedSeconds: number, answered: number, timeLimitSeconds: number = factorisationTimeLimitSeconds()): number {
  const left = timeLimitSeconds - elapsedSeconds;
  if (left <= 0) return 0;
  const pace = Math.max(20, answered > 0 ? elapsedSeconds / answered : 60);
  return Math.max(1, Math.ceil(left / pace));
}

export function nextOpenTurn(state: FactorisationState, after: number): number | null {
  for (const t of state.turns) if (t.turn > after && t.status !== "SKIPPED") return t.turn;
  return null;
}

function usesSkill(item: LotusQuestion | undefined, skillId: string): boolean {
  const d = item?.answerKey.diagnostics;
  return !!d && skillsUsedBy(d).includes(skillId);
}

/**
 * A different catalogue shape for a skill already secured on one
 * representation — e.g. the numeric "x^2 - 9" difference-of-squares slot
 * versus the coefficient "49a^2 - 25b^2" one. Reuses the existing
 * multi-shape slots in the catalogue; never authors new content. A
 * single-shape skill has no target, and the caller must fall back to KEEP.
 * `askedSlots` is the origin slot of every question actually shown so far
 * (the served item's content, not the turn number it was shown on — a
 * REPURPOSEd turn shows a different slot's content than its own base slot).
 */
function widenTargets(slots: SlotSpec[], skillId: string, askedSlots: Set<number>, max: number): Array<{ skill: string; spec: SlotSpec }> {
  return slots
    .filter((spec) => spec.skillId === skillId && !askedSlots.has(spec.slot))
    .slice(0, max)
    .map((spec) => ({ skill: skillId, spec }));
}

/**
 * Which skills to check underneath a confirmed gap, nearest first. A skill
 * already secure is solid ground, so nothing below it is visited. A skill
 * with no question available here (or one that's already shaky) is passed
 * through to the skills below it. Unlike widenTargets, this deliberately
 * does not exclude an already-asked slot: the repurposed turn always gets a
 * fresh AI-written numeric variant (never the original fixed item verbatim),
 * so revisiting the same shape to check a now-relevant prerequisite is safe
 * even when that shape was already shown earlier in the curriculum — and for
 * a skill with only one catalogue slot (e.g. FAC_GCF_VARIABLE), excluding it
 * would make that skill permanently undescendable after turn 1.
 */
/**
 * Mistakes made after the common factor was already found: dividing the terms wrongly. When every mistake on a
 * gap is of this kind, a factor found outside the bracket in the same answers shows the foundation underneath.
 */
/** Times the answers showed a skill done right without it becoming secure: inside a wrong answer, or on one picked option. Two is enough to not re-ask it. */
function shownCount(entry: SkillLedgerEntry | undefined): number {
  return (entry?.shownInWrong ?? 0) + (entry?.tapRights ?? 0);
}
const INSIDE_BRACKET = new Set(["DIVIDED_FIRST_TERM_ONLY", "DROPPED_THE_ONE", "INDEX_NOT_REDUCED"]);
function INSIDE_BRACKET_ONLY(mistakes: string[]): boolean {
  return mistakes.length > 0 && mistakes.every((m) => INSIDE_BRACKET.has(m));
}

function descentTargets(slots: SlotSpec[], skillId: string, ledger: Ledger, max: number, mistakes: string[] = []) {
  const found: Array<{ skill: string; spec: SlotSpec }> = [];
  // A foundation the gap's own mistakes point at goes first: a sign error under a
  // trinomial is checked at signed numbers before it is checked at factor pairs.
  const pointedAt = new Set(SHARED_PATTERNS.filter((p) => p.mistakes.some((m) => mistakes.includes(m)))
    .flatMap((p) => p.skills).filter((s) => findSkill(s)?.group === 0));
  const queue = [...(findSkill(skillId)?.dependsOn ?? [])].sort((a, b) => Number(!pointedAt.has(a)) - Number(!pointedAt.has(b)));
  const seen = new Set<string>();
  while (queue.length && found.length < max) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    const state = ledger.get(p)?.state ?? "UNTESTED";
    if (state === "SECURE") continue;
    // The wrong answers themselves already showed it (the right factor was taken out): going down to it would re-ask what is known.
    if (state === "UNTESTED" && shownCount(ledger.get(p)) >= 2 && INSIDE_BRACKET_ONLY(mistakes)) continue;
    if (state === "UNTESTED") {
      // A foundation the 25 slots never ask about is checked directly with a short code-made
      // question (lotus-skill-checks.ts) instead of being passed over.
      const spec = slots.find((s) => s.skillId === p) ?? checkSpecFor(p);
      if (spec) { found.push({ skill: p, spec }); continue; }
    }
    queue.push(...(findSkill(p)?.dependsOn ?? []));
  }
  return found;
}

/**
 * Where a freed slot is best spent: first a suspected skill that has no check coming, then a skill nothing has
 * asked yet. Never a skill that depends (however far down) on a skill that is suspected or confirmed, never one
 * already planned or probed, and in the order of the curriculum.
 */
function coverageTargets(
  slots: SlotSpec[], ledger: Ledger, askedSlots: Set<number>, itemAt: (turn: number) => LotusQuestion | undefined,
  state: FactorisationState, taken: Set<string>,
): Array<{ skill: string; spec: SlotSpec; why: string }> {
  const shaky = [...ledger.values()].filter((e) => e.state === "CONFIRMED" || e.state === "SUSPECTED").map((e) => e.skillId);
  const planned = (skill: string) => state.turns.some((t) => t.turn > state.planTurn && t.status !== "SKIPPED" &&
    (t.forSkill === skill || usesSkill(itemAt(t.turn), skill)));
  const out: Array<{ skill: string; spec: SlotSpec; why: string }> = [];
  for (const e of ledger.values()) {
    if (e.state !== "SUSPECTED" || taken.has(e.skillId) || planned(e.skillId)) continue;
    const spec = slots.find((s) => s.skillId === e.skillId) ?? checkSpecFor(e.skillId);
    if (spec) out.push({ skill: e.skillId, spec, why: "A suspicion with no check planned:" });
  }
  const seen = new Set<string>();
  for (const spec of slots) {
    const skill = spec.skillId;
    if (seen.has(skill)) continue;
    seen.add(skill);
    if ((ledger.get(skill)?.state ?? "UNTESTED") !== "UNTESTED" || taken.has(skill) || planned(skill) || askedSlots.has(spec.slot)) continue;
    if (shaky.some((g) => g === skill || dependsOnTransitively(skill, g))) continue;
    out.push({ skill, spec, why: "Not asked yet:" });
  }
  return out;
}

/** The skills of the curriculum nothing has asked about, for the stop reason. */
export function untestedSkillsLeft(topic: LotusPlannedTopic | undefined, ledger: Ledger): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const spec of curriculumFor(topic).slots) {
    if (seen.has(spec.skillId)) continue;
    seen.add(spec.skillId);
    if ((ledger.get(spec.skillId)?.state ?? "UNTESTED") === "UNTESTED") names.push(skillName(spec.skillId));
  }
  return names;
}

export function planAdjustments(input: PlanInput): PlanAction[] {
  const { state, ledger, itemAt } = input;
  const slots = curriculumFor(state.topic).slots;
  const actions: PlanAction[] = [];
  const frozenNext = input.freezeNext === false ? state.planTurn : nextOpenTurn(state, state.planTurn);
  const askedSlots = new Set(
    input.askedItems
      .map((item) => item.answerKey.diagnostics?.slot)
      .filter((slot): slot is number => slot !== undefined),
  );
  const claimed = new Set<number>();
  // Skills already given a dedicated CHECK or DESCENT probe within THIS call.
  // state.turns only reflects turns installed by a *previous* call
  // (applyPlanAction runs after planAdjustments returns), so without this,
  // forceCheckSkills and the suspicion loop below could each independently
  // check the same skill in the same replan and install two probes for one
  // mistake — and two different confirmed gaps that share an untested
  // prerequisite could each independently claim a descent turn for it.
  const checkedThisCall = new Set<string>();
  const mutable = () => state.turns.filter((t) =>
    t.turn > (frozenNext ?? state.planTurn) && t.status !== "SKIPPED" && !claimed.has(t.turn));

  // Protect the question that will check each open suspicion.
  const protectedTurns = new Set<number>();
  // A confirmed gap's planned check is protected too: a step down must never take the typed re-ask of the skill itself.
  for (const e of ledger.values()) {
    if (e.state !== "SUSPECTED" && e.state !== "CONFIRMED") continue;
    const check = state.turns.find((t) => t.turn >= state.planTurn &&
      // A checked replacement is deliberately SKIPPED until its background
      // writer succeeds. It still reserves this diagnostic check; otherwise
      // a second review can queue a duplicate probe while the first writes.
      ((t.purpose === "CHECK" && t.forSkill === e.skillId) ||
        (t.status !== "SKIPPED" && usesSkill(itemAt(t.turn), e.skillId))));
    if (check) protectedTurns.add(check.turn);
  }

  // The only open question left for a skill nothing has asked about yet. Widening a skill that is already
  // secure must not use it up (that is how a never-asked skill was left out of a test); a real gap check or a
  // going-down question still may, because evidence about a gap outranks coverage of an unasked skill.
  const soleQuestionForUntested = (turn: number): boolean => {
    const skill = itemAt(turn)?.answerKey.diagnostics?.skillId;
    if (!skill || (ledger.get(skill)?.state ?? "UNTESTED") !== "UNTESTED") return false;
    return !state.turns.some((o) => o.turn !== turn && o.turn > state.planTurn && o.status !== "SKIPPED" &&
      itemAt(o.turn)?.answerKey.diagnostics?.skillId === skill);
  };
  // Position among the questions still ahead (0 = the next one); reachable when the time left covers it.
  const reachable = (turn: number): boolean => {
    if (input.reachableQuestions === undefined) return true;
    const ahead = state.turns.filter((t) => t.turn > state.planTurn && t.status !== "SKIPPED").map((t) => t.turn);
    return ahead.indexOf(turn) < input.reachableQuestions;
  };
  const pickVictim = (widening = false): number | null => {
    const open = mutable().filter((t) =>
      !protectedTurns.has(t.turn) && t.purpose !== "CHECK" && t.purpose !== "DESCENT" && t.purpose !== "WIDEN");
    // A slot the student can't reach in the time left is no place for a check.
    const candidates = open.filter((t) => reachable(t.turn));
    if (open.length && !candidates.length) input.onNoReachableSlot?.();
    const allSecure = candidates.filter((t) => {
      const d = itemAt(t.turn)?.answerKey.diagnostics;
      return !!d && skillsUsedBy(d).every((s) => ledger.get(s)?.state === "SECURE");
    });
    const spare = candidates.filter((t) => !soleQuestionForUntested(t.turn));
    const pool = allSecure.length ? allSecure : widening ? spare : candidates;
    // The earliest eligible slot, not the latest: an accepted change belongs
    // in the earliest useful unseen slot (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md
    // §8/§10 Phase 2) — picking the furthest slot here previously produced
    // the observed bug where a near-term recommendation installed at
    // Q24/Q25 instead, far past where the evidence was actually needed.
    return pool.length ? pool[0]!.turn : null;
  };

  // A closure-stage AI recommendation is an explicit request for fresh
  // evidence. Keep the question already visible to the student, but reserve
  // the next mutable future slot for an AI-written check of the same skill.
  const forced = [...(input.forceCheckSkills ?? [])].sort((a, b) => mistakeRank(ledger.get(a)?.mistakes.at(-1)) - mistakeRank(ledger.get(b)?.mistakes.at(-1)));
  for (const skillId of forced) {
    const spec = slots.find((s) => s.skillId === skillId) ?? checkSpecFor(skillId);
    const evidence = ledger.get(skillId);
    if (!spec || !evidence || claimed.has(spec.slot)) continue;
    // A duplicate request for the same skill (e.g. a code-instant suspicion
    // and a later AI review both asking for the same check) must never
    // install a second probe — one mistake earns at most one fresh check.
    // Only an already-installed dedicated CHECK counts here; a turn that
    // merely happens to use the skill among its other tagged skills is not
    // a substitute for the AI's specifically requested probe.
    const alreadyChecked = checkedThisCall.has(skillId) || state.turns.some((t) =>
      t.purpose === "CHECK" && t.forSkill === skillId);
    if (alreadyChecked) continue;
    const turn = pickVictim();
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    checkedThisCall.add(skillId);
    actions.push({
      kind: "REPURPOSE",
      turn,
      purpose: "CHECK",
      forSkill: skillId,
      spec,
      targetMistake: evidence.mistakes.at(-1),
      reason: input.forceCheckDecidedBy?.[skillId] === "AI"
        ? `The AI review requested a fresh check of ${skillName(skillId)}; an unseen future slot is being rewritten for that evidence.`
        : `Code's evidence rules asked for a fresh check of ${skillName(skillId)}; an unseen future slot is being rewritten for that evidence.`,
    });
  }

  // A split between a correct leader and a wrong alternative is uncertainty,
  // not a diagnosed error. When capacity permits reserve one fresh skill check.
  for (const e of ledger.values()) {
    if (!e.splitDoubtAt || e.state === "SUSPECTED" || e.state === "CONFIRMED" || checkedThisCall.has(e.skillId)) continue;
    if (state.turns.some((t) => t.purpose === "CHECK" && t.forSkill === e.skillId && t.turn > e.splitDoubtAt! && t.turn > state.planTurn && t.status !== "SKIPPED")) continue;
    const spec = slots.find((s) => s.skillId === e.skillId) ?? checkSpecFor(e.skillId);
    const turn = spec ? pickVictim() : null;
    if (!spec || turn === null) continue;
    claimed.add(turn); protectedTurns.add(turn); checkedThisCall.add(e.skillId);
    actions.push({ kind: "REPURPOSE", turn, purpose: "CHECK", forSkill: e.skillId, spec,
      reason: `A split-chip response favoured the correct answer but gave weight to an alternative; a fresh ${skillName(e.skillId)} check may clarify the uncertainty.` });
  }

  // 1. Every suspicion needs a later question that can confirm or clear it. The weightiest mistake is
  // handled first, so when there is room for one check it goes to the misconception, not the miss.
  for (const e of [...ledger.values()].sort((a, b) => mistakeRank(a.mistakes.at(-1)) - mistakeRank(b.mistakes.at(-1)))) {
    // A support signal is not evidence of a mathematical gap, but it does
    // justify one lower-prerequisite question. Handle it before the
    // suspicion-only confirmation path, or a pure "I don't know" remains
    // UNTESTED and can never receive the promised support action.
    // Wrong answers whose review says "misunderstanding" but names no step give no skill evidence at all, so
    // nothing above would send the test down. One lower question finds out whether a prerequisite is the cause.
    if ((e.unexplained ?? 0) > 0 && !e.needsSupport) {
      const lower = descentTargets(slots, e.skillId, ledger, 1, e.mistakes)[0];
      const reserved = lower && (checkedThisCall.has(lower.skill) || state.turns.some((t) => t.purpose === "DESCENT" && t.forSkill === lower.skill));
      if (lower && !reserved) {
        const turn = pickVictim();
        if (turn !== null) {
          claimed.add(turn);
          protectedTurns.add(turn);
          checkedThisCall.add(lower.skill);
          actions.push({
            kind: "REPURPOSE", turn, purpose: "DESCENT", forSkill: lower.skill, spec: lower.spec,
            reason: `${skillName(e.skillId)} went wrong without a clear cause; checking the easier prerequisite ${skillName(lower.skill)} next.`,
          });
        }
      }
    }
    if (e.needsSupport) {
      const support = descentTargets(slots, e.skillId, ledger, 1, e.mistakes)[0];
      const supportAlreadyReserved = support && (checkedThisCall.has(support.skill) || state.turns.some((t) =>
        t.purpose === "DESCENT" && t.forSkill === support.skill));
      if (support && !supportAlreadyReserved) {
        const turn = pickVictim();
        if (turn !== null) {
          claimed.add(turn);
          protectedTurns.add(turn);
          checkedThisCall.add(support.skill);
          actions.push({
            kind: "REPURPOSE", turn, purpose: "DESCENT", forSkill: support.skill,
            spec: support.spec,
            reason: `The student said they do not know this yet; checking the easier prerequisite ${skillName(support.skill)} next.`,
          });
        }
      }
      if (support) continue;
      // "I don't know" alone never earns a same-skill confirmation probe.
      if (e.state !== "SUSPECTED") continue;
    }
    if (e.state !== "SUSPECTED") continue;
    // A re-check needs a question aimed at the skill: one that merely uses it
    // as a step can't settle it (foldLedger only clears it on a direct item).
    // A suspicion gets one dedicated check, ever (an answered one counts too);
    // a re-check needs its own, still ahead.
    const hasCheck = checkedThisCall.has(e.skillId) || state.turns.some((t) =>
      (t.purpose === "CHECK" && t.forSkill === e.skillId && (!(e.recheck || e.needsComparableCheck) || t.turn >= state.planTurn)) ||
      (t.turn >= state.planTurn &&
        (t.status !== "SKIPPED" && (e.needsComparableCheck
          ? false // A generic planned item has not established independent comparable evidence.
          : e.recheck
          ? itemAt(t.turn)?.answerKey.diagnostics?.skillId === e.skillId
          // C6: the later question must be able to show the suspected mistake.
          : usesSkill(itemAt(t.turn), e.skillId) && itemCouldShow(itemAt(t.turn), e.mistakes.at(-1))))));
    if (hasCheck) continue;
    const sourceSlot = e.needsComparableCheck && e.suspectedAt
      ? input.askedItems[e.suspectedAt - 1]?.answerKey.diagnostics?.slot : undefined;
    const spec = (sourceSlot !== undefined ? slots.find((s) => s.slot === sourceSlot) : undefined)
      ?? slots.find((s) => s.skillId === e.skillId) ?? checkSpecFor(e.skillId);
    if (!spec) continue;
    const turn = pickVictim();
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    checkedThisCall.add(e.skillId);
    actions.push({
      kind: "REPURPOSE", turn, purpose: "CHECK", forSkill: e.skillId, spec,
      targetMistake: e.mistakes.at(-1),
      reason: e.needsComparableCheck
        ? `The simpler answer was correct, but ${skillName(e.skillId)} still needs a comparable independent check.`
        : e.recheck
        ? `Re-checks ${skillName(e.skillId)}: it was confirmed earlier, but answered right twice since.`
        : `Checks the suspected gap in ${skillName(e.skillId)} a second time.`,
    });
  }

  // 2. A confirmed gap: remove or reroute later questions that depend on it, then go down.
  for (const e of ledger.values()) {
    if (e.state !== "CONFIRMED" || state.handledConfirmed.includes(e.skillId)) continue;
    const freed: number[] = [];
    for (const t of mutable()) {
      if (protectedTurns.has(t.turn)) continue;
      const d = itemAt(t.turn)?.answerKey.diagnostics;
      if (!d) continue;
      const reason = `Not tested: it depends on ${skillName(e.skillId)}, which isn't secure yet.`;
      if (dependsOnTransitively(d.skillId, e.skillId)) {
        claimed.add(t.turn);
        actions.push({ kind: "SKIP", turn: t.turn, reason });
        freed.push(t.turn);
      } else if (skillsUsedBy(d).some((u) => dependsOnTransitively(u, e.skillId))) {
        claimed.add(t.turn);
        const spec = slots.find((s) => s.slot === t.slot) ?? null;
        actions.push({
          kind: "REPURPOSE", turn: t.turn, purpose: "AVOID", forSkill: d.skillId, spec,
          avoidSkill: e.skillId, skipUntilReady: true,
          reason: `Rewritten to test ${skillName(d.skillId)} without needing ${skillName(e.skillId)}.`,
        });
      }
    }
    // Going down: are the skills underneath solid? Two different confirmed
    // skills can share the same untested prerequisite (they're independent
    // ledger entries, so nothing else stops both from picking it); skip one
    // already claimed for a probe this call rather than installing a second
    // turn for the same hypothesis.
    for (const { skill: p, spec } of descentTargets(slots, e.skillId, ledger, 2, e.mistakes)) {
      if (checkedThisCall.has(p)) continue;
      const turn = freed.shift() ?? pickVictim();
      if (turn === null) break;
      claimed.add(turn);
      // A freed turn was just marked SKIP above; the descent question takes it back.
      const skipIndex = actions.findIndex((a) => a.kind === "SKIP" && a.turn === turn);
      if (skipIndex >= 0) actions.splice(skipIndex, 1);
      checkedThisCall.add(p);
      actions.push({
        kind: "REPURPOSE", turn, purpose: "DESCENT", forSkill: p, spec,
        reason: `Going down: is ${skillName(p)} solid underneath ${skillName(e.skillId)}?`,
      });
    }
    // Turns freed by the removals above that going down did not use are not simply dropped: a shorter test
    // would leave skills unasked. Each goes to the most useful skill that does not lean on a shaky one.
    for (const turn of freed.splice(0)) {
      if (!reachable(turn)) continue;
      const target = coverageTargets(slots, ledger, askedSlots, itemAt, state, checkedThisCall)[0];
      if (!target) break;
      claimed.add(turn);
      const skipIndex = actions.findIndex((a) => a.kind === "SKIP" && a.turn === turn);
      if (skipIndex >= 0) actions.splice(skipIndex, 1);
      checkedThisCall.add(target.skill);
      actions.push({
        kind: "REPURPOSE", turn, purpose: "WIDEN", forSkill: target.skill, spec: target.spec,
        reason: `${target.why} ${skillName(target.skill)}: this slot was freed because its original question depended on ${skillName(e.skillId)}, which isn't secure yet.`,
      });
    }
    state.handledConfirmed.push(e.skillId);
  }

  // 3. A skill secured from a single correct answer: a fresh, different
  // representation can confirm transfer rather than one memorized shape.
  // Never revisits a skill (found a target or not) once considered, so one
  // secure skill can claim at most one later slot.
  for (const e of ledger.values()) {
    if (e.state !== "SECURE" || e.clearedAfterSlip || e.notes.length !== 1) continue;
    if (state.handledBroadened.includes(e.skillId)) continue;
    state.handledBroadened.push(e.skillId);
    const target = widenTargets(slots, e.skillId, askedSlots, 1)[0];
    if (!target) continue;
    // Widening is a nicety: it never takes the only question left for a skill nobody has asked about.
    const turn = pickVictim(true);
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    actions.push({
      kind: "REPURPOSE", turn, purpose: "WIDEN", forSkill: target.skill, spec: target.spec,
      reason: `${skillName(e.skillId)} was right once; a different representation of the same skill can confirm transfer rather than one memorized shape.`,
    });
  }
  return actions;
}

// ---------- catch-up ----------

/** Most a catch-up asks, and the fewest worth sending. */
export const CATCH_UP_MAX = 8;
export const CATCH_UP_MIN = 5;

/**
 * A catch-up's questions: two per open skill (so a gap can be confirmed or
 * cleared), most foundational first, topped up toward five with the skills
 * they build on (and theirs), and never more than eight. A chapter whose
 * skill chain is short can give fewer than five. Empty when the topic has no question
 * for any of them — the caller then runs the full test.
 */
export function catchUpSlots(topic: LotusPlannedTopic, focusSkills: string[]): SlotSpec[] {
  const slots = curriculumFor(topic).slots;
  const focus = [...new Set(focusSkills)].filter((id) => slots.some((s) => s.skillId === id)).sort((a, b) => depth(a) - depth(b));
  const chosen: SlotSpec[] = [];
  for (const skill of focus) {
    const own = slots.filter((s) => s.skillId === skill);
    chosen.push(own[0]!, own[1] ?? own[0]!);
  }
  if (!chosen.length) return [];
  // Nearest prerequisites first, then theirs, until there are five questions.
  const seen = new Set(focus);
  const queue = focus.flatMap((id) => findSkill(id)?.dependsOn ?? []);
  while (queue.length && chosen.length < CATCH_UP_MIN) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const spec = slots.find((s) => s.skillId === id);
    if (spec) chosen.unshift(spec);
    queue.push(...(findSkill(id)?.dependsOn ?? []));
  }
  return chosen.slice(0, CATCH_UP_MAX);
}

// ---------- report ----------

export function depth(skillId: string, seen = new Set<string>()): number {
  if (seen.has(skillId)) return 0;
  seen.add(skillId);
  const deps = findSkill(skillId)?.dependsOn ?? [];
  return deps.length ? 1 + Math.max(...deps.map((d) => depth(d, seen))) : 0;
}

/** Confirmed gaps, most foundational first — [0] is the report's starting point. */
export function confirmedByDepth(ledger: Ledger): SkillLedgerEntry[] {
  return [...ledger.values()].filter((e) => e.state === "CONFIRMED").sort((a, b) => depth(a.skillId) - depth(b.skillId));
}

/**
 * C2: is any AI review of this test still running and not yet well past its
 * deadline? A lesson chosen now would miss its evidence and then be kept for
 * good, so lesson creation waits (the classroom retries for two minutes).
 * A review a minute past its deadline isn't waited for.
 */
export function reviewsStillRunning(session: Pick<LotusSessionView, "audits">, now = Date.now()): boolean {
  return (session.audits ?? []).some((a) => a.analysisStatus === "PENDING" &&
    (!a.analysisDeadlineAt || now < Date.parse(a.analysisDeadlineAt) + 60_000));
}

/** Shared sign skill; it must earn its own evidence before becoming a teaching target. */
export const SIGN_ROOT_SKILL = "FND_SIGN_MUL_DIV";

/**
 * Teach the most foundational evidenced support target. Similar sign labels on
 * different skills are a reason to probe a prerequisite, not proof of a common
 * cause. Never synthesize a confirmed ledger entry for an untested skill.
 */
export function teachingStart(ledger: Ledger): (SkillLedgerEntry & { rootOf?: string[] }) | undefined {
  return confirmedByDepth(ledger)[0];
}

export function buildFactorisationReport(args: {
  ledger: Ledger;
  state: FactorisationState;
  pendingAnalyses: number;
  /** The answered turns, for checking whether the child was really trying. */
  audits?: LotusQuestionAudit[];
}): LotusFinalReport {
  const curriculum = curriculumFor(args.state.topic);
  // Not trying: most answers very fast (under 5 s) and wrong. Such a test
  // can't show what the child knows, so it gives no gap to teach.
  const answered = (args.audits ?? []).filter((a) => a.response && !a.response.didNotKnow);
  const rushedWrong = answered.filter((a) => (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT");
  const rushed = answered.length >= 8 && rushedWrong.length / answered.length >= 0.6;
  const slotSkill = (slot: number) => curriculum.slots.find((s) => s.slot === slot)?.skillId;
  const entries = [...args.ledger.values()];
  const assessments = new Map(entries.map((e) => [e.skillId, assessSkillEvidence(args.audits ?? [], e.skillId)]));
  const confirmed = confirmedByDepth(args.ledger);
  const suspected = entries.filter((e) => e.state === "SUSPECTED");
  // The planner's legacy SECURE state is provisional. Reporting and advancement
  // require repeated direct checks; supporting tags cannot establish mastery.
  const secure = entries.filter((e) => e.state === "SECURE" && assessments.get(e.skillId)!.distinctDirectSuccessCount >= 2)
    .sort((a, b) => depth(b.skillId) - depth(a.skillId));
  const secureIds = new Set(secure.map((e) => e.skillId));
  const observed = entries.filter((e) => e.state === "SECURE" && !secureIds.has(e.skillId));

  const skipped = args.state.turns.filter((t) => t.status === "SKIPPED" && t.reason);
  // A skill tested on another question isn't "not tested", even if one of its questions was removed.
  const notTested = [...new Map(skipped.flatMap((t) => {
    const skill = slotSkill(t.slot);
    if (!skill || args.ledger.has(skill)) return [];
    return [[skill, `${skillName(skill)} — ${t.reason!.replace(/^Not tested: /, "not tested: ")}`] as const];
  })).values()];

  // Skills the plan meant to ask about and never reached (a slot was reused for a gap check, or the test ended first):
  // neither secure nor a gap, so the report says so instead of reading as "no gap found". Skills removed because
  // they depend on a confirmed gap are already in `notTested`; skills without a slot are covered by what is built on them.
  const skippedSkills = new Set(skipped.map((t) => slotSkill(t.slot)).filter((id): id is string => !!id));
  // A catch-up asks only about the skills it was sent for, so nothing is "not reached" there.
  const notReached = args.state.focusSkills?.length ? [] : [...new Set(curriculum.slots.map((s) => s.skillId))].filter((id) => {
    const e = args.ledger.get(id);
    return !skippedSkills.has(id) && (!e || (e.state === "UNTESTED" && !e.tapRights && !e.needsSupport && !e.unexplained));
  });
  // Skills no question in the plan asks about, with nothing tested above them to stand in for them (the added skills that
  // sit above nothing). Without this a child missing one reads as an all-clear. Skills with a tested skill above them are
  // covered by it, as before.
  const hasEvidence = (id: string) => ["SECURE", "CONFIRMED", "SUSPECTED"].includes(args.ledger.get(id)?.state ?? "");
  const notAsked = args.state.focusSkills?.length ? [] : curriculum.skills.filter((s) =>
    !curriculum.slots.some((slot) => slot.skillId === s.id) &&
    !hasEvidence(s.id) && !args.ledger.get(s.id)?.tapRights && !args.ledger.get(s.id)?.needsSupport && !args.ledger.get(s.id)?.unexplained &&
    !curriculum.skills.some((o) => o.id !== s.id && hasEvidence(o.id) && dependsOnTransitively(o.id, s.id))).map((s) => s.id);
  const notReachedNames = notReached.map((id) => skillName(id).toLowerCase());
  const notAskedNames = notAsked.map((id) => skillName(id).toLowerCase());
  // A skill with no question of its own that sits under a skill that went wrong, and was never checked: it could be the cause.
  const wentWrong = entries.filter((e) => e.state === "SUSPECTED" || e.state === "CONFIRMED").map((e) => e.skillId);
  const notChecked = args.state.focusSkills?.length ? [] : curriculum.skills.filter((s) =>
    !curriculum.slots.some((slot) => slot.skillId === s.id) && !notAsked.includes(s.id) &&
    !hasEvidence(s.id) && !args.ledger.get(s.id)?.tapRights && !args.ledger.get(s.id)?.needsSupport && !args.ledger.get(s.id)?.unexplained &&
    wentWrong.some((g) => dependsOnTransitively(g, s.id))).map((s) => ({ id: s.id, above: wentWrong.filter((g) => dependsOnTransitively(g, s.id)) }));
  const unaskedAll = [...notReached, ...notAsked, ...notChecked.map((c) => c.id)];
  const unaskedAllNames = unaskedAll.map((id) => skillName(id).toLowerCase());
  // Answers that were wrong but taught nothing about any skill (the review named no step). Two or more are not an all-clear.
  const unexplained = entries.filter((e) => (e.unexplained ?? 0) > 0);
  const unexplainedTotal = unexplained.reduce((n, e) => n + (e.unexplained ?? 0), 0);

  const start = confirmed[0];
  // A catch-up is judged only on the skills it was sent for: all of them secure, nothing still suspected, means caught up.
  const focus = args.state.focusSkills;
  const caughtUp = focus?.length
    ? focus.every((id) => secureIds.has(id)) && suspected.length === 0
    : suspected.length === 0 && secure.length >= 5 && unexplainedTotal < 2;
  const outcome: LotusFinalReport["outcome"] = rushed ? "INSUFFICIENT_OR_CONFLICTING"
    : confirmed.length ? "SOLID_GAP" : caughtUp ? "ADVANCEMENT" : "INSUFFICIENT_OR_CONFLICTING";
  const startingPoint = rushed
    ? `This test doesn't tell us much: ${rushedWrong.length} of ${answered.length} answers were very fast (under ${RUSHED_MS / 1000} seconds) and wrong. Try again when the child can focus.`
    : start
    ? `Start with ${skillName(start.skillId).toLowerCase()}. ${start.notes.filter((n) => !n.includes(": right")).slice(0, 2).join(" · ")}`
    : outcome === "ADVANCEMENT"
      ? focus?.length
        ? `Repeated direct checks succeeded for ${focus.map((id) => skillName(id).toLowerCase()).join(", ")}. Check retention later.`
        : `Repeated direct checks succeeded across several tested ${curriculum.name.toLowerCase()} skills.${unaskedAll.length ? ` Not asked in this test: ${unaskedAllNames.join(", ")}.` : ""} Consider the next challenge; untested skills and retention remain unknown.`
      : suspected.length
        ? "No gap was confirmed. Review the suspected areas below before deciding where to start."
        : unexplainedTotal >= 2
          ? `${unexplainedTotal} answers were wrong but the cause couldn't be linked to a skill (${unexplained.map((e) => skillName(e.skillId).toLowerCase()).join(", ")}). Review the uncertain areas below, and check the skills underneath with fresh questions.`
          : "Not enough answers to show where to start yet. Check again with a few fresh questions.";

  const limitations = [
    "Experimental: questions were written and checked by AI and code, without human review.",
    "Repeated mistakes or support requests identify a skill needing support under the current rules; they do not by themselves establish a specific misconception or its cause.",
    "Reported strengths require success on at least two distinct questions directly targeting the skill. This is a provisional product rule, not a validated mastery threshold.",
    "This diagnostic does not measure delayed retention. Supporting skill tags and repeated copies of a question do not establish a demonstrated strength.",
  ];
  if (unexplainedTotal >= 2) limitations.push(`${unexplainedTotal} wrong answers couldn't be linked to a skill, so no gap is confirmed or ruled out from them. This is not a sign that all is well.`);
  if (notReached.length) limitations.push(`${notReached.length} skill${notReached.length === 1 ? " was" : "s were"} planned but not asked in this test (${notReachedNames.join(", ")}), so nothing is known about ${notReached.length === 1 ? "it" : "them"} yet.`);
  if (notAsked.length) limitations.push(`No question in this test covers ${notAskedNames.join(", ")}, so nothing is known about ${notAsked.length === 1 ? "it" : "them"}; a gap there would not show up here.`);
  if (notChecked.length) limitations.push(`${notChecked.map((c) => skillName(c.id).toLowerCase()).join(", ")} ${notChecked.length === 1 ? "was" : "were"} never checked, and a skill built on ${notChecked.length === 1 ? "it" : "them"} went wrong, so ${notChecked.length === 1 ? "it" : "they"} could be the cause.`);
  if (args.pendingAnalyses > 0) limitations.push(`${args.pendingAnalyses} answer(s) didn't finish their deeper AI review, so any mistake code couldn't explain is missing.`);
  if (args.state.fastSkips > 0) limitations.push(`${args.state.fastSkips} question(s) were skipped quickly with nothing written. Those aren't counted as evidence either way.`);
  if (rushed) limitations.unshift("Most answers were very fast and wrong, so the gaps below may come from rushing, not from what the child knows. No lesson is suggested from this test.");
  const tiredFrom = args.audits ? fatigueStart(args.audits) : null;
  if (!rushed && tiredFrom !== null) limitations.unshift(`From Q${tiredFrom} the answers got much faster and more often wrong, which may be tiredness. Gaps seen only in that part are marked unclear, not taught.`);

  const summaries: LotusSkillSummary[] = [
    ...entries.map((e) => ({
      skillId: e.skillId, name: skillName(e.skillId),
      state: e.state === "SECURE" && !secureIds.has(e.skillId) ? "OBSERVED" as const : e.state,
      evidence: e.notes, evidenceAssessment: assessments.get(e.skillId),
    })),
    ...skipped
      .map((t) => slotSkill(t.slot))
      .filter((id): id is string => !!id && !args.ledger.has(id))
      .map((id) => ({ skillId: id, name: skillName(id), state: "NOT_TESTED_DEPENDENCY" as const, evidence: [] })),
    ...notReached
      .filter((id) => !args.ledger.has(id))
      .map((id) => ({ skillId: id, name: skillName(id), state: "UNTESTED" as const, evidence: ["Planned for this test but not asked."] })),
    ...notAsked
      .filter((id) => !args.ledger.has(id))
      .map((id) => ({ skillId: id, name: skillName(id), state: "UNTESTED" as const, evidence: ["No question in this test covers it."] })),
    ...notChecked
      .filter((c) => !args.ledger.has(c.id))
      .map((c) => ({ skillId: c.id, name: skillName(c.id), state: "UNTESTED" as const, evidence: ["Never checked, and a skill built on it went wrong."] })),
  ].filter((s, i, all) => all.findIndex((o) => o.skillId === s.skillId) === i);

  return {
    outcome,
    startingPoint,
    observedStrengths: secure.map((e) => skillName(e.skillId) + (e.clearedAfterSlip ? " (an earlier mistake looked like a slip)" : "")),
    uncertainAreas: [
      ...observed.map((e) => {
        const a = assessments.get(e.skillId)!;
        return `${skillName(e.skillId)}: ${a.directSuccessTurns.length
          ? `${a.distinctDirectSuccessCount} distinct direct successful check(s); more evidence is needed`
          : a.supportingSuccessTurns.length ? "supporting evidence only; not directly demonstrated"
          : "successful observation without enough question context to establish a strength"}.`;
      }),
      ...suspected.map((e) => e.tiredness
        ? `${skillName(e.skillId)}: unclear — the mistakes came only from fast answers late in the test, which may be tiredness. Check again when the child is fresh.`
        : e.explainedBy
        ? `${skillName(e.skillId)}: unclear — every question it went wrong on also needed ${skillName(e.explainedBy).toLowerCase()}, which is a confirmed gap. Check it again after that is taught.`
        : e.recheck
        ? `${skillName(e.skillId)}: unclear — confirmed earlier, but answered right on ${(e.rightSinceConfirmed ?? []).map((q) => `Q${q}`).join(", ")} since, and the re-check question wasn't reached. Check again before teaching it.`
        : `${skillName(e.skillId)}: one mistake, not confirmed — ${e.notes.at(-1) ?? ""}`),
      // C10: slips and unreadable answers the AI noticed. Never gaps, but the teacher should see them.
      ...(args.audits ?? []).flatMap((a, i) => {
        const kind = a.conclusion?.mistakeKind;
        if (a.analysisStatus !== "COMPLETE" || (kind !== "SLIP" && kind !== "UNREADABLE")) return [];
        const what = kind === "SLIP" ? "Possible slip" : "Answer couldn't be read";
        return [`${what} on Q${i + 1} (not counted as a gap): ${(a.conclusion.mistakeDescription ?? "").trim() || "see the answer"}`];
      }),
      ...confirmed.filter((e) => e.rightSinceConfirmed?.length).map((e) =>
        `${skillName(e.skillId)}: confirmed earlier, but answered right on ${e.rightSinceConfirmed!.map((q) => `Q${q}`).join(", ")} since — check again before teaching it.`),
      ...entries.filter((e) => e.state === "UNTESTED" && e.tapRights).map((e) =>
        `${skillName(e.skillId)}: right once on a multiple-choice question, not enough to call it secure yet.`),
      ...notReached.map((id) => `${skillName(id)}: not asked in this test, so nothing is known about it yet.`),
      ...notAsked.map((id) => `${skillName(id)}: no question in this test covers it, so nothing is known about it.`),
      ...notChecked.map((c) => `${skillName(c.id)}: never checked, and ${c.above.map((g) => skillName(g).toLowerCase()).join(", ")} went wrong, so it could be the cause.`),
      ...unexplained.map((e) => `${skillName(e.skillId)}: wrong ${e.unexplained === 1 ? "once" : `${e.unexplained} times`}, and the cause couldn't be linked to a skill. Check the skills underneath it.`),
    ],
    evidenceSummary: [
      ...confirmed.map((e) => `${skillName(e.skillId)} — ${e.confirmedBySupport ? "not learned yet" : "confirmed gap"}. ${e.notes.join(" · ")}`),
    ],
    recommendedNextStep: rushed
      ? "Retake the diagnostic when the child is settled; this one was too rushed to act on."
      : start
      ? `Teach ${skillName(start.skillId).toLowerCase()} directly, then re-check it with a fresh question.`
      : suspected[0]
        ? `Give one more question on ${skillName(suspected[0].skillId).toLowerCase()} to see whether the mistake repeats.`
        : unexplainedTotal >= 2
        ? "Check the skills underneath the ones that went wrong with a few fresh questions; this test could not say what went wrong."
        : unaskedAll.length
          ? `No teaching gap found in the skills asked. ${unaskedAllNames.join(", ")} ${unaskedAll.length === 1 ? "wasn't" : "weren't"} asked, so check ${unaskedAll.length === 1 ? "it" : "them"} before moving on.`
          : outcome === "ADVANCEMENT"
            ? "Offer the next challenge and schedule a later retention check."
            : "Gather fresh direct evidence before deciding whether to teach or advance.",
    limitations,
    notTested,
    skills: summaries.sort((a, b) => curriculum.skills.findIndex((s) => s.id === a.skillId) - curriculum.skills.findIndex((s) => s.id === b.skillId)),
  };
}

// ---------- stopping rule ----------

/** Pilot time box for the factorisation diagnostic. LOTUS_TIME_LIMIT_MINUTES overrides it. */
export function factorisationTimeLimitSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env.LOTUS_TIME_LIMIT_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60;
}

/** Fewest answers before a starting point may end the test: one confirmed gap needs two questions, and its prerequisites need checking. */
export const MIN_ANSWERS_FOR_EARLY_STOP = 8;

export type FactorisationStop =
  | { reason: "TIME_LIMIT"; note: string }
  | { reason: "STARTING_POINT_FOUND"; skillId: string; note: string };

/**
 * Whether the diagnostic should end now, with the answer just given counted.
 *
 * - TIME_LIMIT: the pilot's 15 minutes are up.
 * - STARTING_POINT_FOUND: the most foundational confirmed gap is the real
 *   starting point — every skill it depends on has been tested and is
 *   secure, so more questions wouldn't move the start any lower. A gap whose
 *   prerequisites are untested or shaky keeps the test going, because the
 *   plan probes those next.
 *
 * Pure and deterministic: it reads only the code-marked evidence ledger.
 */
export function factorisationStopReason(
  audits: LotusQuestionAudit[],
  elapsedSeconds: number,
  timeLimitSeconds: number = factorisationTimeLimitSeconds(),
  priors: LotusLedgerPrior[] = [],
): FactorisationStop | null {
  const answered = audits.length;
  if (elapsedSeconds >= timeLimitSeconds) {
    return {
      reason: "TIME_LIMIT",
      note: `The ${Math.round(timeLimitSeconds / 60)}-minute time limit ended the test after ${answered} question${answered === 1 ? "" : "s"}. Skills planned after that point weren't reached.`,
    };
  }
  if (answered < MIN_ANSWERS_FOR_EARLY_STOP) return null;
  const ledger = foldLedger(audits, priors);
  const start = confirmedByDepth(ledger)[0];
  if (!start) return null;
  // A soft prerequisite only holds the test open once it has shown trouble; unasked or merely observed, it doesn't.
  // A prerequisite the wrong answers already showed done right (the factor outside the bracket) is not re-asked, so it doesn't hold the test open.
  const onlyInsideBracket = [...ledger.values()].filter((e) => e.state === "CONFIRMED").every((e) => INSIDE_BRACKET_ONLY(e.mistakes));
  const shownInAnswers = (id: string) => onlyInsideBracket && (ledger.get(id)?.state ?? "UNTESTED") === "UNTESTED" && shownCount(ledger.get(id)) >= 2;
  const quiet = (id: string) => shownInAnswers(id) || (SOFT_PREREQUISITES.has(id) && !["SUSPECTED", "CONFIRMED"].includes(ledger.get(id)?.state ?? "UNTESTED"));
  const prerequisites = findSkill(start.skillId)?.dependsOn ?? [];
  if (!prerequisites.every((id) => ledger.get(id)?.state === "SECURE" || quiet(id))) return null;
  // Not only the start: every confirmed gap's prerequisites must be settled (secure, or a gap already found).
  // A gap with an untested or shaky prerequisite on another branch may be that prerequisite's doing, so the plan
  // keeps probing it. A skill nothing can test doesn't hold the test open.
  const testable = (id: string) => !!checkSpecFor(id) || !!curriculumOfSkill(id)?.slots.some((s) => s.skillId === id);
  const settled = (id: string) => { const s = ledger.get(id)?.state; return s === "SECURE" || s === "CONFIRMED" || !testable(id) || quiet(id); };
  const unsettled = [...ledger.values()].some((e) => e.state === "CONFIRMED" && (findSkill(e.skillId)?.dependsOn ?? []).some((id) => !settled(id)));
  if (unsettled) return null;
  return {
    reason: "STARTING_POINT_FOUND",
    skillId: start.skillId,
    note: `Lotus found the starting point after ${answered} questions: ${skillName(start.skillId).toLowerCase()} went wrong twice while everything it builds on was secure, so the test ended early.`,
  };
}
