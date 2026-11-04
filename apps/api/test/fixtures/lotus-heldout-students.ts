/**
 * HELD-OUT simulated students for the factorisation diagnostic, set v1.
 *
 * Written BEFORE the first run against the short foundation checks, and never used to
 * tune any rule. The rules (planAdjustments, descentTargets, the evidence folding, the
 * check families) were tuned against the P01-P10 and X01-X09 catalogues in
 * lotus-factorisation-personas.ts; none of these students appears there. If a rule
 * changes after seeing these results, this set becomes a tuning set and a new held-out
 * set (v2) must be written. Do not edit a student after its first run.
 *
 * Each student is a statement of TRUTH, not an answer script: which skills they truly
 * lack (and the one mistake they make on them), plus how they behave (slips, guessing,
 * tiredness, tapping, a different valid method). A student answers whatever question is
 * actually shown: wrong, in their own way, when the question exercises a skill they lack
 * (the skill itself or anything that depends on it); otherwise as their behaviour says.
 *
 * Pre-declared scoring (do not change after seeing results):
 *   FOUND_ROOT   every root gap (a lacked skill with no lacked skill beneath it) is CONFIRMED.
 *   FOUND_ABOVE  not every root is confirmed, but a skill that depends on a root is: the child
 *                can be taught at the right chapter but not at the true cause.
 *   MISSED       no planted gap, and nothing that depends on one, is confirmed.
 *   FALSE GAP    a skill CONFIRMED that the student does not lack and that does not depend on
 *                a skill they lack. Target: 0.
 *   UNCLEAR      outcome INSUFFICIENT_OR_CONFLICTING for a student whose truth is determinable
 *                (everyone except the random tapper, whose correct outcome IS unclear).
 *   Non-inferiority (decided in advance): with the short checks, found (root or above) must not
 *   be lower than without, and false gaps must not be higher.
 *
 * Limits, stated up front: answers are scripted and the AI is a pretend AI; the student's
 * truth uses the same prerequisite map the rules use, so this tests the rules against the
 * map, not the map against real children; every wrong answer a student gives is one the
 * system predicted (except the messy behaviours, which are not predicted).
 */
import type { PersonaProfile, PersonaQuestionLike, PersonaResponsePlan } from "./lotus-factorisation-personas";
import { chooseResponse } from "./lotus-factorisation-personas";
import { FACTORISATION_SKILLS, dependsOnTransitively, skillsUsedBy } from "../../src/lotus/lotus-factorisation-catalogue";

export interface HeldOutStudent {
  id: string;
  /** What the student truly lacks: skill, and the one mistake they make on it. */
  lacks: Record<string, string>;
  /** Group for the scorecard. */
  group: "CAPABLE" | "FOUNDATION_GAP" | "CHAPTER_GAP" | "SEVERAL_GAPS" | "MESSY";
  /** Plain description of the child this stands in for. */
  story: string;
  behaviour: Pick<PersonaProfile, "messy" | "supportSkills" | "slipOnTurn" | "confidenceBand" | "paceMsBand" | "workingStyle">;
  /** The correct outcome is "unclear" (a child who is not really trying). */
  unclearIsCorrect?: boolean;
  /** Two students who look alike on one question but need different teaching share a pair id. */
  pair?: string;
}

const tidy = { confidenceBand: [55, 80] as [number, number], paceMsBand: [15_000, 35_000] as [number, number], workingStyle: "full-steps" as const };

export const HELDOUT_STUDENTS: HeldOutStudent[] = [
  // ---- A. capable children: any confirmed gap is a false gap ----
  { id: "H01_SOLID", group: "CAPABLE", lacks: {}, story: "Solid on everything, fast and confident.", behaviour: { ...tidy, confidenceBand: [85, 100] } },
  { id: "H02_SOLID_SLOW_UNSURE", group: "CAPABLE", lacks: {}, story: "Right on everything but slow and unsure of themselves.", behaviour: { confidenceBand: [10, 30], paceMsBand: [60_000, 100_000], workingStyle: "hesitant" } },
  { id: "H03_SOLID_OTHER_ROUTE", group: "CAPABLE", lacks: {}, story: "Right on everything, always by guess-and-check.", behaviour: { ...tidy, messy: { differentMethod: true } } },
  { id: "H04_SOLID_ONE_SLIP", group: "CAPABLE", lacks: {}, story: "Right on everything; one miscopied sign late on.", behaviour: { ...tidy, messy: { copySlipTurns: [11] } } },
  { id: "H05_SOLID_TWO_SLIPS_APART", group: "CAPABLE", lacks: {}, story: "Right on everything; two miscopied digits far apart.", behaviour: { ...tidy, messy: { copySlipTurns: [4, 17] } } },
  { id: "H06_SOLID_UNCLOSED_BRACKETS", group: "CAPABLE", lacks: {}, story: "Right on everything; sometimes forgets a closing bracket.", behaviour: { ...tidy, messy: { unreadableTurns: [5, 12] } } },
  // ---- B. one foundation skill missing (only reachable with the short checks) ----
  { id: "H07_SIGNED_PRODUCTS", group: "FOUNDATION_GAP", pair: "TRINOMIAL_SYMPTOM", lacks: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR" }, story: "Gets the sign wrong when multiplying or dividing negatives.", behaviour: tidy },
  { id: "H08_FACTOR_PAIRS", group: "FOUNDATION_GAP", pair: "TRINOMIAL_SYMPTOM", lacks: { FND_FACTOR_PAIRS: "NO_NEGATIVE_PAIRS" }, story: "Lists factor pairs but never thinks of the negative ones.", behaviour: tidy },
  { id: "H09_LOWEST_POWER", group: "FOUNDATION_GAP", lacks: { FND_MIN_EXP_COMMON: "TOOK_HIGHEST_POWER" }, story: "Takes the highest power of a shared letter, not the lowest.", behaviour: tidy },
  { id: "H10_SQUARE_ROOTS", group: "FOUNDATION_GAP", lacks: { FND_RECOGNISE_SQUARE: "ROOTED_NUMBER_ONLY" }, story: "Roots the number in a square but leaves the letter's power.", behaviour: tidy },
  { id: "H11_EXPAND_ONE_BRACKET", group: "FOUNDATION_GAP", lacks: { EXP_EXPAND_SINGLE: "FIRST_TERM_ONLY" }, story: "Multiplies only the first term inside a bracket.", behaviour: tidy },
  { id: "H12_IDENTITIES_FORWARD", group: "FOUNDATION_GAP", lacks: { ID_SQUARE_DIFF: "SQUARE_DISTRIBUTES" }, story: "Believes (a + b)² = a² + b².", behaviour: tidy },
  { id: "H13_HCF_AS_LCM", group: "FOUNDATION_GAP", lacks: { FND_GCD_NUMERIC: "GAVE_LCM" }, story: "Gives the lowest common multiple when asked for the HCF.", behaviour: tidy },
  { id: "H14_TERMS_AND_FACTORS", group: "FOUNDATION_GAP", lacks: { ALG_IDENTIFY_STRUCTURE: "COUNTED_FACTORS_AS_TERMS" }, story: "Counts the factors of a product as if they were terms.", behaviour: tidy },
  // ---- C. one chapter skill missing ----
  { id: "H15_GROUP_WITH_MINUS", group: "CHAPTER_GAP", lacks: { FAC_GROUP_SIGN: "SIGN_NOT_FLIPPED_IN_GROUP" }, story: "Grouping is fine until the second pair starts with a minus.", behaviour: tidy },
  { id: "H16_MINUS_SQUARE", group: "CHAPTER_GAP", lacks: { FAC_PERFECT_SQUARE_MINUS: "WRONG_MIDDLE_SIGN" }, story: "Perfect squares fine, except the minus case.", behaviour: tidy },
  { id: "H17_REVERSED_BRACKET", group: "CHAPTER_GAP", lacks: { FAC_COMMON_BINOMIAL: "REVERSED_BRACKET_MISSED" }, story: "Takes out a common bracket, but misses (2 − x) versus (x − 2).", behaviour: tidy },
  { id: "H18_CANCEL_TERMS", group: "CHAPTER_GAP", lacks: { FAC_CANCEL_COMMON_FACTOR: "CANCELLED_TERMS_NOT_FACTORS" }, story: "Cancels terms instead of factors when simplifying.", behaviour: tidy },
  // ---- D. several gaps ----
  { id: "H19_SIGNS_AND_PAIRS", group: "SEVERAL_GAPS", lacks: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR", FND_FACTOR_PAIRS: "NO_NEGATIVE_PAIRS" }, story: "Both signed products and negative factor pairs trip them.", behaviour: tidy },
  { id: "H20_POWERS_AND_SQUARES", group: "SEVERAL_GAPS", lacks: { FND_EXPONENT_PRODUCT: "MULTIPLIED_EXPONENTS", FAC_DIFF_SQUARES: "WROTE_PERFECT_SQUARE" }, story: "Multiplies the indices when multiplying powers, and writes a perfect square for a difference of squares.", behaviour: tidy },
  // ---- E. messy: the gap plus real-child behaviour ----
  { id: "H21_SIGNS_PLUS_SLIPS", group: "MESSY", lacks: { FND_SIGN_MUL_DIV: "SIGN_PRODUCT_ERROR" }, story: "A signed-number gap, plus two miscopied answers elsewhere.", behaviour: { ...tidy, messy: { copySlipTurns: [3, 9] } } },
  { id: "H22_GUESSES_ON_TRINOMIALS", group: "MESSY", lacks: { FAC_PAIR_PRODUCT_SUM: "WRONG_FACTOR_PAIR_SUM" }, story: "Can't find the pair for a trinomial and guesses instead of saying so.", behaviour: { confidenceBand: [10, 30], paceMsBand: [6_000, 12_000], workingStyle: "terse", messy: { guessSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"] } } },
  { id: "H23_SAYS_IDK_ON_NEGATIVE_FACTOR", group: "MESSY", lacks: { FAC_GCF_NEGATIVE: "KEPT_ORIGINAL_SIGNS" }, story: "Honestly says they don't know how to take out a negative factor.", behaviour: { ...tidy, supportSkills: ["FAC_GCF_NEGATIVE"] } },
  { id: "H24_NOT_TRYING", group: "MESSY", lacks: {}, unclearIsCorrect: true, story: "Taps fast and at random.", behaviour: { confidenceBand: [10, 30], paceMsBand: [2_000, 3_000], workingStyle: "terse", messy: { randomTapper: true } } },
];

// ---------- the truth-driven student ----------

const SKILL_BY_ID = new Map(FACTORISATION_SKILLS.map((s) => [s.id, s]));

/** Does this question exercise the lacked skill: the skill itself, or anything built on it? */
function exercises(question: PersonaQuestionLike, lackedSkill: string): boolean {
  const d = question.answerKey.diagnostics;
  if (!d) return false;
  return skillsUsedBy({ skillId: d.skillId, taggedSkills: d.taggedSkills, stepSkills: (d as { stepSkills?: string[] }).stepSkills ?? [] })
    .some((used) => dependsOnTransitively(used, lackedSkill));
}

function lackAnswer(student: HeldOutStudent, question: PersonaQuestionLike, lackedSkill: string, code: string): PersonaResponsePlan {
  const d = question.answerKey.diagnostics!;
  const correct = question.answerKey.canonicalAnswer;
  const listed = new Set(SKILL_BY_ID.get(lackedSkill)?.mistakes ?? []);
  const predicted = d.predictedMistakes.filter((p) => p.answer !== correct);
  // The student's own mistake first; then another mistake of the same family (a sign mistake under a sign gap); then any predicted wrong answer.
  const family = /SIGN/.test(code) ? (m: string) => /SIGN/.test(m) : (m: string) => listed.has(m);
  const pick = predicted.find((p) => p.mistake === code) ?? predicted.find((p) => family(p.mistake)) ?? predicted[0];
  const typed = d.itemKind === "FACTORISE" || d.itemKind === "SIMPLIFY" || d.itemKind === "EXPAND";
  const answer = pick?.answer ?? (typed ? "(x + 1)(x + 2)" : "No");
  return {
    answer: answer === correct ? `${correct} + 1` : answer,
    working: `I used the rule I know for this, and I think my answer is ${answer}.`,
    didNotKnow: false,
    isDeliberateMistake: true,
  };
}

/** What the student submits for this question on this turn. */
export function respond(student: HeldOutStudent, question: PersonaQuestionLike, turn: number): PersonaResponsePlan {
  const profile: PersonaProfile = {
    id: student.id, displayName: student.id, summary: student.story,
    supportSkills: student.behaviour.supportSkills, slipOnTurn: student.behaviour.slipOnTurn, messy: student.behaviour.messy,
    confidenceBand: student.behaviour.confidenceBand, paceMsBand: student.behaviour.paceMsBand, workingStyle: student.behaviour.workingStyle,
    expectedEvidenceNote: "", expectedReportBoundary: "", expectedAdaptiveBehaviorNote: "",
  };
  const skillId = question.answerKey.diagnostics?.skillId;
  // A student who says "I don't know" does so on the skill's own question.
  if (skillId && student.behaviour.supportSkills?.includes(skillId)) return chooseResponse(profile, question, turn);
  // A student who guesses on a skill really guesses: a made-up answer, not one the system predicted.
  const guessed = student.behaviour.messy?.guessSkills;
  const touched = [skillId, ...(question.answerKey.diagnostics?.taggedSkills ?? [])];
  if (guessed && touched.some((s) => s && guessed.includes(s))) return chooseResponse(profile, question, turn);
  for (const [lacked, code] of Object.entries(student.lacks)) {
    if (exercises(question, lacked)) return lackAnswer(student, question, lacked, code);
  }
  return chooseResponse(profile, question, turn);
}

// ---------- scoring ----------

export interface StudentScore {
  id: string;
  group: HeldOutStudent["group"];
  answered: number;
  outcome: string;
  confirmed: string[];
  /** Lacked skills with no lacked skill beneath them. */
  roots: string[];
  rootsConfirmed: string[];
  result: "FOUND_ROOT" | "FOUND_ABOVE" | "MISSED" | "NO_GAP";
  falseGaps: string[];
  unclear: boolean;
  /** Simulated minutes: questions answered at the student's mean pace. */
  minutes: number;
}

const dependsOnLacked = (skill: string, lacked: string[]) => lacked.some((l) => dependsOnTransitively(skill, l));

export function scoreStudent(student: HeldOutStudent, view: { finalReport?: { outcome: string; skills?: Array<{ skillId: string; state: string }> } }, answered: number): StudentScore {
  const lacked = Object.keys(student.lacks);
  const roots = lacked.filter((l) => !lacked.some((o) => o !== l && dependsOnTransitively(l, o)));
  const report = view.finalReport!;
  const confirmed = (report.skills ?? []).filter((s) => s.state === "CONFIRMED").map((s) => s.skillId).sort();
  const rootsConfirmed = roots.filter((r) => confirmed.includes(r));
  const explained = (s: string) => lacked.includes(s) || dependsOnLacked(s, lacked);
  const falseGaps = confirmed.filter((s) => !explained(s));
  const aboveConfirmed = confirmed.some((s) => explained(s));
  const result: StudentScore["result"] = lacked.length === 0 ? "NO_GAP"
    : rootsConfirmed.length === roots.length ? "FOUND_ROOT"
    : aboveConfirmed ? "FOUND_ABOVE" : "MISSED";
  const [lo, hi] = student.behaviour.paceMsBand;
  return {
    id: student.id, group: student.group, answered, outcome: report.outcome, confirmed, roots, rootsConfirmed, result, falseGaps,
    unclear: report.outcome === "INSUFFICIENT_OR_CONFLICTING" && !student.unclearIsCorrect,
    minutes: Math.round((answered * (lo + hi)) / 2 / 6000) / 10,
  };
}
