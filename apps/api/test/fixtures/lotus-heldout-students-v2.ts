/**
 * HELD-OUT simulated students for the factorisation diagnostic, set v2.
 *
 * Written BEFORE the fixes it measures, and never used to tune them. Set v1
 * (lotus-heldout-students.ts) was used to report the first scorecard, which found two
 * problems; the fixes were designed from v1's findings, so v1 is now a tuning set and
 * cannot show whether they work. None of these students is in v1 or in the P/X catalogues.
 * Do not edit a student after its first run.
 *
 * What is different from v1 (decided now, from first principles):
 *   - Student model. A v1 student who lacked a skill answered a question that only *tagged*
 *     that skill with the question's own first predicted mistake, which blames the question's
 *     headline skill for something it did not cause. A v2 student gives a system-predicted
 *     wrong answer only when the lacked skill really is behind a mistake the question lists;
 *     otherwise (typed answers) a plain wrong answer nobody predicted, as a real child would.
 *   - More students whose gap is in the last skills of the plan (G).
 *   - Same scoring, plus one measure: a SILENT MISS is a play with a planted gap that is not
 *     found and whose report neither names the gap's skill as untested or uncertain nor says
 *     anything but "no gap". Target 0.
 *
 * Pre-declared criteria for the fixes (same students, played with and without them is not
 * possible, so the "before" figures come from the code before the fixes, run on this set once
 * before they were written):
 *   A. Silent misses: 0.
 *   B. Found (root or above) not lower than before; found at the root not lower than before.
 *   C. False gaps (v1 definition) not higher than before; no capable child ever given a gap.
 *   D. Median questions for children with a gap no more than 2 higher than before.
 *
 * Limits, as in v1: scripted students, a pretend AI that gives no evidence for an unpredicted
 * wrong answer, truth built on the same prerequisite map as the rules.
 */
import type { PersonaProfile, PersonaQuestionLike, PersonaResponsePlan } from "./lotus-factorisation-personas";
import { chooseResponse } from "./lotus-factorisation-personas";
import { FACTORISATION_SKILLS, dependsOnTransitively, skillName, skillsUsedBy } from "../../src/lotus/lotus-factorisation-catalogue";
import { scoreStudent, type HeldOutStudent, type StudentScore } from "./lotus-heldout-students";

const tidy = { confidenceBand: [55, 80] as [number, number], paceMsBand: [15_000, 35_000] as [number, number], workingStyle: "full-steps" as const };

export const HELDOUT_STUDENTS_V2: HeldOutStudent[] = [
  // ---- A. capable children ----
  { id: "V01_SOLID", group: "CAPABLE", lacks: {}, story: "Solid on everything.", behaviour: { ...tidy, confidenceBand: [80, 95] } },
  { id: "V02_TWO_SLIPS_TOGETHER", group: "CAPABLE", lacks: {}, story: "Solid, but two miscopied answers one after the other late in the test.", behaviour: { ...tidy, messy: { copySlipTurns: [14, 15] } } },
  { id: "V03_SOLID_SLOW", group: "CAPABLE", lacks: {}, story: "Solid, slow and careful.", behaviour: { confidenceBand: [40, 60], paceMsBand: [50_000, 90_000], workingStyle: "full-steps" } },
  { id: "V04_SOLID_TIRED_LATE", group: "CAPABLE", lacks: {}, story: "Solid, but tired and rushing from question 20.", behaviour: { ...tidy, messy: { tiredFromTurn: 20 } } },
  { id: "V05_SOLID_UNCLOSED_BRACKETS", group: "CAPABLE", lacks: {}, story: "Solid; leaves a bracket open three times.", behaviour: { ...tidy, messy: { unreadableTurns: [3, 9, 16] } } },
  { id: "V06_SOLID_OTHER_ROUTE", group: "CAPABLE", lacks: {}, story: "Solid, by guess-and-check on every typed question.", behaviour: { ...tidy, messy: { differentMethod: true } } },
  // ---- B. one foundation skill missing ----
  { id: "V07_SIGNED_SUMS", group: "FOUNDATION_GAP", lacks: { FND_SIGN_ADD_SUB: "SIGN_SUM_ERROR" }, story: "Gets the sign wrong when adding negatives.", behaviour: tidy },
  { id: "V08_POWERS_SUBTRACTED", group: "FOUNDATION_GAP", lacks: { FND_EXPONENT_PRODUCT: "SUBTRACTED_EXPONENTS" }, story: "Subtracts indices when multiplying powers.", behaviour: tidy },
  { id: "V09_TWO_BRACKETS", group: "FOUNDATION_GAP", lacks: { EXP_EXPAND_BINOMIALS: "FIRST_LAST_ONLY" }, story: "Multiplies only the first and last terms of two brackets.", behaviour: tidy },
  { id: "V10_MISCOUNTS_TERMS", group: "FOUNDATION_GAP", lacks: { ALG_IDENTIFY_STRUCTURE: "MISCOUNTED_TERMS" }, story: "Miscounts the terms of an expression.", behaviour: tidy },
  { id: "V11_HALVES_NOT_ROOTS", group: "FOUNDATION_GAP", lacks: { FND_RECOGNISE_SQUARE: "HALVED_NOT_ROOTED" }, story: "Halves a number when asked for its square root.", behaviour: tidy },
  { id: "V12_COMMON_NUMBER", group: "FOUNDATION_GAP", lacks: { FAC_GCF_NUMERIC: "COMMON_NOT_HIGHEST" }, story: "Takes out a common number, but not the highest one.", behaviour: tidy },
  { id: "V13_MISSES_A_PAIR", group: "FOUNDATION_GAP", lacks: { FND_FACTOR_PAIRS: "MISSED_PAIR" }, story: "Lists factor pairs but leaves one out.", behaviour: tidy },
  { id: "V14_WHICH_IDENTITY", group: "FOUNDATION_GAP", lacks: { ID_REVERSE_PATTERN: "SHAPE_MISREAD" }, story: "Can expand the identities but can't tell which one an expression is.", behaviour: tidy },
  // ---- C. one chapter skill missing ----
  { id: "V15_NEGATIVE_FACTOR_ONE_SIGN", group: "CHAPTER_GAP", lacks: { FAC_GCF_NEGATIVE: "FLIPPED_ONE_SIGN" }, story: "Takes out a negative but flips only one sign.", behaviour: tidy },
  { id: "V16_PLUS_SQUARE_MIDDLE", group: "CHAPTER_GAP", lacks: { FAC_PERFECT_SQUARE_PLUS: "MIDDLE_TERM_NOT_CHECKED" }, story: "Writes a perfect square without checking the middle term.", behaviour: tidy },
  { id: "V17_CHECKS_FIRST_TERM", group: "CHAPTER_GAP", lacks: { FAC_VERIFY_EXPAND: "CHECKED_FIRST_TERM_ONLY" }, story: "Checks a factorisation by expanding, but only looks at the first term.", behaviour: tidy },
  { id: "V18_CANCELS_ONE_TERM", group: "CHAPTER_GAP", lacks: { FAC_CANCEL_COMMON_FACTOR: "DIVIDED_ONE_TERM_ONLY" }, story: "Divides only one term when simplifying a fraction.", behaviour: tidy },
  { id: "V19_PAIRS_SHARE_NOTHING", group: "CHAPTER_GAP", lacks: { FAC_GROUP_TERMS: "PAIRS_SHARE_NOTHING" }, story: "Groups four terms into pairs that share nothing.", behaviour: tidy },
  // ---- D. several gaps ----
  { id: "V20_SIGN_SUMS_AND_LOWEST_POWER", group: "SEVERAL_GAPS", lacks: { FND_SIGN_ADD_SUB: "SIGN_SUM_ERROR", FND_MIN_EXP_COMMON: "TOOK_HIGHEST_POWER" }, story: "Adding negatives and the lowest common power both trip them.", behaviour: tidy },
  { id: "V21_DIVIDING_AND_MINUS_SQUARE", group: "SEVERAL_GAPS", lacks: { FAC_DIVIDE_TERMS: "DIVIDED_FIRST_TERM_ONLY", FAC_PERFECT_SQUARE_MINUS: "WRONG_MIDDLE_SIGN" }, story: "Divides only the first term, and gets the minus square's middle sign wrong.", behaviour: tidy },
  // ---- E. messy ----
  { id: "V22_SIGNS_PLUS_MESS", group: "MESSY", lacks: { FND_SIGN_ADD_SUB: "SIGN_SUM_ERROR" }, story: "A signed-sum gap, one unclosed bracket and one miscopied digit.", behaviour: { ...tidy, messy: { unreadableTurns: [4], copySlipTurns: [11] } } },
  { id: "V23_GUESSES_ON_GROUPING", group: "MESSY", lacks: { FAC_GROUP_TERMS: "PAIRS_SHARE_NOTHING" }, story: "Can't group four terms and guesses instead of saying so.", behaviour: { confidenceBand: [10, 30], paceMsBand: [6_000, 12_000], workingStyle: "terse", messy: { guessSkills: ["FAC_GROUP_TERMS"] } } },
  { id: "V24_GAP_THEN_TIRED", group: "MESSY", lacks: { FAC_COMMON_BINOMIAL: "BRACKET_NOT_SEEN_AS_FACTOR" }, story: "A common-bracket gap, then tired and rushing from question 18.", behaviour: { ...tidy, messy: { tiredFromTurn: 18 } } },
];

// ---------- the v2 student ----------

const SKILL_BY_ID = new Map(FACTORISATION_SKILLS.map((s) => [s.id, s]));

function exercises(question: PersonaQuestionLike, lackedSkill: string): boolean {
  const d = question.answerKey.diagnostics;
  if (!d) return false;
  return skillsUsedBy({ skillId: d.skillId, taggedSkills: d.taggedSkills, stepSkills: (d as { stepSkills?: string[] }).stepSkills ?? [] })
    .some((used) => dependsOnTransitively(used, lackedSkill));
}

/** A wrong answer nobody predicted: the last digit bumped, or a "+ 1" on the end. */
function unpredictedWrong(correct: string, predictedAnswers: string[]): string {
  const digit = correct.search(/\d(?!.*\d)/);
  for (let bump = 1; bump <= 9; bump += 1) {
    const candidate = digit >= 0 ? `${correct.slice(0, digit)}${(Number(correct[digit]) + bump) % 10}${correct.slice(digit + 1)}` : `${correct} + ${bump}`;
    if (candidate !== correct && !predictedAnswers.includes(candidate)) return candidate;
  }
  return `${correct} + 1`;
}

function lackAnswerV2(question: PersonaQuestionLike, lackedSkill: string, code: string): PersonaResponsePlan {
  const d = question.answerKey.diagnostics!;
  const correct = question.answerKey.canonicalAnswer;
  const listed = new Set(SKILL_BY_ID.get(lackedSkill)?.mistakes ?? []);
  const predicted = d.predictedMistakes.filter((p) => p.answer !== correct);
  const sign = /SIGN/.test(code);
  // A predicted wrong answer only when this question really lists a mistake behind the lacked skill.
  const own = predicted.find((p) => p.mistake === code) ?? predicted.find((p) => listed.has(p.mistake)) ?? (sign ? predicted.find((p) => /SIGN/.test(p.mistake)) : undefined);
  const typed = d.itemKind === "FACTORISE" || d.itemKind === "SIMPLIFY" || d.itemKind === "EXPAND";
  let answer: string;
  if (own) answer = own.answer;
  else if (typed) answer = unpredictedWrong(correct, predicted.map((p) => p.answer));
  else answer = predicted[0]?.answer ?? "No"; // a choice has only listed options to pick from
  return {
    answer: answer === correct ? `${correct} + 1` : answer,
    working: `I used the rule I know for this, and I think my answer is ${answer}.`,
    didNotKnow: false,
    isDeliberateMistake: true,
  };
}

export function respondV2(student: HeldOutStudent, question: PersonaQuestionLike, turn: number): PersonaResponsePlan {
  const profile: PersonaProfile = {
    id: student.id, displayName: student.id, summary: student.story,
    supportSkills: student.behaviour.supportSkills, slipOnTurn: student.behaviour.slipOnTurn, messy: student.behaviour.messy,
    confidenceBand: student.behaviour.confidenceBand, paceMsBand: student.behaviour.paceMsBand, workingStyle: student.behaviour.workingStyle,
    expectedEvidenceNote: "", expectedReportBoundary: "", expectedAdaptiveBehaviorNote: "",
  };
  const skillId = question.answerKey.diagnostics?.skillId;
  if (skillId && student.behaviour.supportSkills?.includes(skillId)) return chooseResponse(profile, question, turn);
  const guessed = student.behaviour.messy?.guessSkills;
  const touched = [skillId, ...(question.answerKey.diagnostics?.taggedSkills ?? [])];
  if (guessed && touched.some((s) => s && guessed.includes(s))) return chooseResponse(profile, question, turn);
  // Tired: from the stated turn on the child rushes, whatever they know.
  if (student.behaviour.messy?.tiredFromTurn !== undefined && turn >= student.behaviour.messy.tiredFromTurn) return chooseResponse(profile, question, turn);
  for (const [lacked, code] of Object.entries(student.lacks)) {
    if (exercises(question, lacked)) return lackAnswerV2(question, lacked, code);
  }
  return chooseResponse(profile, question, turn);
}

// ---------- scoring: v1 scoring plus the silent miss ----------

export interface StudentScoreV2 extends StudentScore {
  /** A planted gap not found, and the report does not name its skill as untested or uncertain. */
  silentMiss: boolean;
}

interface ReportLike {
  outcome: string;
  startingPoint?: string;
  recommendedNextStep?: string;
  uncertainAreas?: string[];
  skills?: Array<{ skillId: string; state: string }>;
}

export function scoreStudentV2(student: HeldOutStudent, view: { finalReport?: ReportLike }, answered: number): StudentScoreV2 {
  const base = scoreStudent(student, view as never, answered);
  const report = view.finalReport!;
  const prose = [report.startingPoint ?? "", report.recommendedNextStep ?? "", ...(report.uncertainAreas ?? [])].join(" ").toLowerCase();
  const namesRoot = (root: string) =>
    prose.includes(skillName(root).toLowerCase()) ||
    (report.skills ?? []).some((s) => s.skillId === root && (s.state === "UNTESTED" || s.state === "SUSPECTED" || s.state === "NOT_TESTED_DEPENDENCY"));
  const silentMiss = base.result === "MISSED" && base.roots.some((r) => !namesRoot(r));
  return { ...base, silentMiss };
}
