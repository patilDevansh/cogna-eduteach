/**
 * Synthetic-learner persona foundation for the factorisation diagnostic
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §9). Test-only. These personas
 * are declared capability profiles — predetermined skills, misconceptions,
 * and response style — not real students. They exist to prove the *wiring
 * and policy invariants* of the diagnostic (evidence rules, adaptive
 * decisions, no duplicate probes, honest report boundaries) against a
 * deterministic, free, no-network fake model. They do NOT measure whether a
 * live model correctly diagnoses a real learner — the separate live-model
 * runner scores that against the versioned autonomous persona oracle.
 *
 * New file only — does not modify any existing application, contract,
 * persistence, or golden-test file. Its `PersonaFakeModels` class is a
 * fresh, self-contained controlled model adapter (matching the shape
 * LotusService expects — see lotus-model.service.ts / the FakeModels class
 * already used by lotus-factorisation-session.v1.spec.ts), not a copy of the
 * existing fixture: its wrongAnswers mistake codes are corrected to be
 * catalogue-accurate for every one of the 25 slots (see the code comment on
 * SLOT_WRITES below for why that correction was necessary).
 */
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusReserveIntent,
} from "@cogna/shared";

// ---------------------------------------------------------------------------
// Deterministic controlled model — corrected, catalogue-accurate fixture
// ---------------------------------------------------------------------------

const ASSESSMENT: LotusModelAssessment = {
  mathJudgment: "UNRESOLVED",
  observations: ["persona-fixture"],
  hypotheses: [],
  phaseRecommendation: "EXPLORE",
  proposedAction: "ASK",
  conciseRationale: "persona-fixture",
};

const DEBATE: LotusGptDebateResponse = {
  agreements: [],
  disagreements: [],
  disagreementExample: "None.",
  acceptedImprovements: [],
  revisedConclusion: "persona-fixture",
  revisedAction: "ASK",
  revisedPhase: "EXPLORE",
};

function closure(): LotusDebateClosure {
  return {
    verdict: "ACCEPTED",
    acceptedFromGpt: [],
    acceptedFromChallenger: [],
    rejectedClaims: [],
    conclusion: "persona-fixture",
    evidenceState: "PARTIAL",
    uncertainty: [],
    phase: "EXPLORE",
    action: "ASK",
    selectionReason: "persona-fixture",
    exitDiagnostic: false,
  };
}

interface WrongAnswer { answer: string; mistake: string }
interface SlotWrite {
  expression: string;
  answer: string;
  skill: string;
  /** Every code here is checked to actually belong to `skill` (directly or
   * via its tagged skills) so a persona's declared misconception always maps
   * to the skill it says it targets — see the self-check at the bottom of
   * this file. The fixture this was adapted from (the one already used by
   * apps/api/test/golden/lotus-factorisation-session.v1.spec.ts) leaves most
   * slots' wrongAnswers on a generic default pair (WRONG_FACTOR_PAIR_SUM /
   * WRONG_FACTOR_PAIR_PRODUCT) that only happens to be correct for the
   * product-and-sum/trinomial slots — fine for that file's own tests, which
   * never depend on skill-attribution for those slots, but wrong for a
   * persona catalogue that specifically asserts *which skill* an evidence
   * item lands on.
   */
  wrongAnswers: WrongAnswer[];
  kind: "FACTORISE" | "CHOICE" | "SIMPLIFY";
}

/** One real, catalogue-consistent write per slot shape (see lotus-factorisation-catalogue.ts's `raw` table for the shapes and skill ownership this mirrors). Values are a fresh, structurally-different instance of the same shape, not the literal catalogue example — matching the "never reuse a literal question" rule the real writer follows. */
const SLOT_WRITES: Record<string, SlotWrite> = {
  "6x + 9": { expression: "12x + 18", answer: "6(2x + 3)", skill: "FAC_DIVIDE_TERMS", wrongAnswers: [{ answer: "p1", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "p2", mistake: "COMMON_NOT_HIGHEST" }] , kind: "FACTORISE" },
  "x^2 + 5x": { expression: "x^2 + 7x", answer: "x(x + 7)", skill: "FAC_GCF_VARIABLE", wrongAnswers: [{ answer: "p1", mistake: "TOOK_HIGHEST_POWER" }, { answer: "p2", mistake: "INCLUDED_NON_COMMON_VARIABLE" }] , kind: "FACTORISE" },
  "3x^2 + 3x": { expression: "5x^2 + 5x", answer: "5x(x + 1)", skill: "FAC_DIVIDE_TERMS", wrongAnswers: [{ answer: "p1", mistake: "DROPPED_THE_ONE" }, { answer: "p2", mistake: "DIVIDED_FIRST_TERM_ONLY" }] , kind: "FACTORISE" },
  "10x^2 - 18x^3 + 14x^4": { expression: "6x^2 - 9x^3 + 12x^4", answer: "3x^2(2 - 3x + 4x^2)", skill: "FAC_COMMON_MONOMIAL", wrongAnswers: [{ answer: "p1", mistake: "PARTIAL_GCF" }, { answer: "p2", mistake: "TOOK_HIGHEST_POWER" }] , kind: "FACTORISE" },
  "-4x - 8": { expression: "-6x - 18", answer: "-6(x + 3)", skill: "FAC_GCF_NEGATIVE", wrongAnswers: [{ answer: "p1", mistake: "KEPT_ORIGINAL_SIGNS" }, { answer: "p2", mistake: "FLIPPED_ONE_SIGN" }] , kind: "FACTORISE" },
  "Is 2y(x + 1) + 3(x + 1) fully factorised? Why?": { expression: "Is 5y(x + 2) + 4(x + 2) fully factorised? Why?", answer: "No; it is (x + 2)(5y + 4).", skill: "FAC_MEANING", wrongAnswers: [{ answer: "Yes; it is a sum of two products.", mistake: "SUM_ACCEPTED_AS_FACTORISED" }, { answer: "No; 5y and 4 are different terms, not factors.", mistake: "TERMS_VS_FACTORS" }, { answer: "Yes; both parts share no common bracket.", mistake: "SUM_ACCEPTED_AS_FACTORISED" }] , kind: "CHOICE" },
  "3(x - 2) + y(x - 2)": { expression: "5(x - 4) + y(x - 4)", answer: "(x - 4)(5 + y)", skill: "FAC_COMMON_BINOMIAL", wrongAnswers: [{ answer: "p1", mistake: "LEFTOVERS_MULTIPLIED" }, { answer: "p2", mistake: "BRACKET_NOT_SEEN_AS_FACTOR" }] , kind: "FACTORISE" },
  "2xy + 2y + 3x + 3": { expression: "4xy + 4y + 5x + 5", answer: "(x + 1)(4y + 5)", skill: "FAC_GROUP_TERMS", wrongAnswers: [{ answer: "p1", mistake: "PAIRS_SHARE_NOTHING" }, { answer: "p2", mistake: "SUM_ACCEPTED_AS_FACTORISED" }] , kind: "FACTORISE" },
  "x^2 - 9": { expression: "x^2 - 49", answer: "(x - 7)(x + 7)", skill: "FAC_DIFF_SQUARES", wrongAnswers: [{ answer: "p1", mistake: "WROTE_PERFECT_SQUARE" }, { answer: "p2", mistake: "DROPPED_SQUARE" }] , kind: "FACTORISE" },
  "49a^2 - 25b^2": { expression: "81a^2 - 16b^2", answer: "(9a - 4b)(9a + 4b)", skill: "FAC_DIFF_SQUARES", wrongAnswers: [{ answer: "p1", mistake: "COEFFICIENT_NOT_ROOTED" }, { answer: "p2", mistake: "WROTE_PERFECT_SQUARE" }] , kind: "FACTORISE" },
  "x^2 + 6x + 9": { expression: "x^2 + 10x + 25", answer: "(x + 5)^2", skill: "FAC_PERFECT_SQUARE_PLUS", wrongAnswers: [{ answer: "p1", mistake: "SQUARED_WITHOUT_ROOT" }, { answer: "p2", mistake: "WROTE_DIFF_OF_SQUARES" }] , kind: "FACTORISE" },
  "Which two numbers have a product of 12 and a sum of -7?": { expression: "Which two numbers have a product of 18 and a sum of -9?", answer: "-3 and -6", skill: "FAC_PAIR_PRODUCT_SUM", wrongAnswers: [{ answer: "3 and 6", mistake: "SIGN_PAIR_ERROR" }, { answer: "-2 and -9", mistake: "WRONG_FACTOR_PAIR_SUM" }, { answer: "-1 and -18", mistake: "WRONG_FACTOR_PAIR_PRODUCT" }] , kind: "CHOICE" },
  "x^2 + 5x + 6": { expression: "x^2 + 9x + 20", answer: "(x + 4)(x + 5)", skill: "FAC_MONIC_TRINOMIAL", wrongAnswers: [{ answer: "p1", mistake: "WRONG_FACTOR_PAIR_SUM" }, { answer: "p2", mistake: "PRODUCT_SUM_SWAPPED" }] , kind: "FACTORISE" },
  "x^2 - 7x + 12": { expression: "x^2 - 9x + 20", answer: "(x - 4)(x - 5)", skill: "FAC_MONIC_TRINOMIAL", wrongAnswers: [{ answer: "p1", mistake: "SIGN_PAIR_ERROR" }, { answer: "p2", mistake: "WRONG_FACTOR_PAIR_SUM" }] , kind: "FACTORISE" },
  "x^2 - x - 12": { expression: "x^2 - 2x - 24", answer: "(x - 6)(x + 4)", skill: "FAC_MONIC_TRINOMIAL", wrongAnswers: [{ answer: "p1", mistake: "SIGNS_SWAPPED" }, { answer: "p2", mistake: "WRONG_FACTOR_PAIR_SUM" }] , kind: "FACTORISE" },
  "4y^2 - 12y + 9": { expression: "4y^2 - 20y + 25", answer: "(2y - 5)^2", skill: "FAC_PERFECT_SQUARE_MINUS", wrongAnswers: [{ answer: "p1", mistake: "WRONG_MIDDLE_SIGN" }, { answer: "p2", mistake: "WROTE_DIFF_OF_SQUARES" }] , kind: "FACTORISE" },
  "6xy - 4y - 9x + 6": { expression: "8xy - 6y - 12x + 9", answer: "(4x - 3)(2y - 3)", skill: "FAC_GROUP_SIGN", wrongAnswers: [{ answer: "p1", mistake: "SIGN_NOT_FLIPPED_IN_GROUP" }, { answer: "p2", mistake: "SUM_ACCEPTED_AS_FACTORISED" }] , kind: "FACTORISE" },
  "Riya says x^2 - 5x + 6 = (x - 2)(x + 3). Is she right?": { expression: "Riya says x^2 - 7x + 10 = (x - 2)(x - 5). Is she right?", answer: "Yes; expanding gives x^2 - 7x + 10.", skill: "FAC_VERIFY_EXPAND", wrongAnswers: [{ answer: "No; it gives x^2 - 3x + 10.", mistake: "CHECKED_FIRST_TERM_ONLY" }, { answer: "No; expanding gives x^2 - 7x - 10.", mistake: "EXPAND_CHECK_FAIL" }, { answer: "No; the constants don't multiply to 10.", mistake: "EXPAND_CHECK_FAIL" }] , kind: "CHOICE" },
  "What should you do first to factorise 3x^2 - 12?": { expression: "What should you do first to factorise 5x^2 - 45?", answer: "Take out the common factor 5.", skill: "FAC_CHOOSE_METHOD", wrongAnswers: [{ answer: "Use difference of squares immediately.", mistake: "SKIPPED_COMMON_FACTOR_CHECK" }, { answer: "Treat it as a perfect square.", mistake: "IDENTITY_MISAPPLIED" }, { answer: "Divide every term by x.", mistake: "SKIPPED_COMMON_FACTOR_CHECK" }] , kind: "CHOICE" },
  "3x^2 - 12": { expression: "5x^2 - 20", answer: "5(x - 2)(x + 2)", skill: "FAC_FACTOR_FULLY", wrongAnswers: [{ answer: "p1", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "p2", mistake: "SKIPPED_COMMON_FACTOR_CHECK" }] , kind: "FACTORISE" },
  "2x^2 + 10x + 12": { expression: "3x^2 + 15x + 18", answer: "3(x + 2)(x + 3)", skill: "FAC_FACTOR_FULLY", wrongAnswers: [{ answer: "p1", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "p2", mistake: "SKIPPED_COMMON_FACTOR_CHECK" }] , kind: "FACTORISE" },
  "x^4 - 16": { expression: "x^4 - 81", answer: "(x - 3)(x + 3)(x^2 + 9)", skill: "FAC_FACTOR_FULLY", wrongAnswers: [{ answer: "p1", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "p2", mistake: "FACTORED_SUM_OF_SQUARES" }] , kind: "FACTORISE" },
  "Amit writes (7x + 5)/5 = 7x. Is he right?": { expression: "Amit writes (9x + 4)/4 = 9x. Is he right?", answer: "No; the whole numerator cannot be cancelled by 4.", skill: "FAC_MEANING", wrongAnswers: [{ answer: "No; 9x and 4 are different terms.", mistake: "TERMS_VS_FACTORS" }, { answer: "Yes; cancel the 4 from both terms.", mistake: "SUM_ACCEPTED_AS_FACTORISED" }, { answer: "Yes; 4 divided by 4 is zero.", mistake: "TERMS_VS_FACTORS" }] , kind: "CHOICE" },
  "(x^2 - 9) / (x^2 - 6x + 9)": { expression: "(x^2 - 16) / (x^2 - 8x + 16)", answer: "(x + 4)/(x - 4)", skill: "FAC_CANCEL_COMMON_FACTOR", wrongAnswers: [{ answer: "p1", mistake: "CANCELLED_TERMS_NOT_FACTORS" }, { answer: "p2", mistake: "DIVIDED_ONE_TERM_ONLY" }] , kind: "SIMPLIFY" },
  "2x + 3y + 6 + xy": { expression: "3x + 4y + 12 + xy", answer: "(x + 4)(y + 3)", skill: "FAC_GROUP_TERMS", wrongAnswers: [{ answer: "p1", mistake: "PAIRS_SHARE_NOTHING" }, { answer: "p2", mistake: "SUM_ACCEPTED_AS_FACTORISED" }] , kind: "FACTORISE" },
};

interface WriteContext { shape: string; requiredExpression?: string; targetMistake?: string; variation?: string }

function parseWritePrompt(prompt: string): WriteContext {
  const requiredExpression = prompt.match(/expression MUST be exactly: (.+?)\. Write/)?.[1]?.trim();
  const shape = prompt.match(/Follow this shape, but write a NEW question with DIFFERENT numbers: ([^\n]+)/)?.[1]?.trim();
  const targetMistake = prompt.match(/re-checks a suspected mistake: ([A-Z0-9_]+)\./)?.[1];
  const variation = prompt.match(/Session variation token: ([^\n]+)/)?.[1];
  return { shape: shape ?? "", requiredExpression, targetMistake, variation };
}

/** The opener always requests a specific fresh `a x + b` numeric instance — answered mechanically, same as the shared golden-test fixture. */
function writeOpener(requiredExpression: string) {
  const match = requiredExpression.match(/^(\d+)x \+ (\d+)$/);
  if (!match) throw new Error(`persona fixture: unexpected opener shape ${requiredExpression}`);
  const a = Number(match[1]);
  const b = Number(match[2]);
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const factor = gcd(a, b);
  return {
    prompt: `Factorise completely: ${requiredExpression}`,
    expression: requiredExpression,
    answer: `${factor}(${a / factor}x + ${b / factor})`,
    wrongAnswers: [
      { answer: `${factor}(${a / factor}x + ${b})`, mistake: "DIVIDED_FIRST_TERM_ONLY" },
      { answer: `${factor === 1 ? 2 : 1}(${a}x + ${b})`, mistake: "COMMON_NOT_HIGHEST" },
    ],
    steps: [{ line: `Take out ${factor}.`, skill: "FAC_DIVIDE_TERMS" }],
  };
}

/**
 * Branches on the entry's real catalogue kind — never guessed from the
 * answer text. `toItem()` in lotus-question-factory.ts reads a completely
 * different field set for CHOICE (options/correctOption/wrongOptionMistakes)
 * than for FACTORISE/SIMPLIFY (expression/answer/wrongAnswers), so returning
 * the wrong shape for a slot silently produces an invalid or mis-parsed item.
 */
function personaControlledWrite(prompt: string): Record<string, unknown> {
  const ctx = parseWritePrompt(prompt);
  if (ctx.requiredExpression) return writeOpener(ctx.requiredExpression);
  const write = SLOT_WRITES[ctx.shape];
  if (!write) throw new Error(`persona fixture: no controlled writer entry for shape ${JSON.stringify(ctx.shape)}`);
  // Hashing the *whole prompt* (not just the "Session variation token:" line)
  // matters: a CHECK/DESCENT/WIDEN-triggered write never gets that line at
  // all (applyPlanAction in lotus.service.ts never sets WriteRequest.variation
  // — only the initial buildSkeleton pass does), so runWrite falls back to a
  // bare `${sessionId}:attemptN` token. Two *different* repurposed turns
  // requesting the same shape at different times would then produce the
  // identical candidate sequence and the second would collide with the
  // first's already-installed item — an actual observed failure while
  // validating this fixture. The prompt's own "Do not reuse any of these:"
  // avoid-list line differs per job/attempt, so hashing the full prompt
  // gives each job a distinct sequence without depending on that one line.
  const variant = [...prompt].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 11) % 100_000 + 1;
  const steps = [{ line: `Apply ${write.skill}.`, skill: write.skill }];

  if (write.kind === "CHOICE") {
    // For a CHOICE entry, `write.expression` holds the rephrased question
    // text (not a bare algebraic expression) — see the SLOT_WRITES table.
    return {
      prompt: `${write.expression} (Version ${variant}.)`,
      options: [write.answer, ...write.wrongAnswers.map((w) => w.answer)],
      correctOption: write.answer,
      wrongOptionMistakes: write.wrongAnswers.map((w) => ({ option: w.answer, mistake: w.mistake })),
      steps,
    };
  }
  if (write.kind === "SIMPLIFY") {
    // The prompt template requires the expression to stay exactly
    // "(numerator)/(denominator)" — wrapping it in a +v-v sum (fine for a
    // FACTORISE expression) would break that required shape. A FIXED
    // instance here is not safe even though no persona directly targets
    // this skill: a WIDEN/BROADEN decision can request a fresh write of
    // this exact slot from evidence gathered on a *tagged* skill, before
    // the slot's own turn is ever reached — a byte-identical repeat write
    // then fails "repeats a question already in this test" on every retry
    // (this was an actual observed failure while validating this fixture).
    // Instead this varies k via a general identity that holds for any k:
    // (x-k)(x+k) / (x-k)^2 = (x+k)/(x-k) — verified computationally for
    // several k values, not just asserted by hand (see the fixture's own
    // verification notes in the persona eval spec doc).
    const k = 3 + (variant % 500); // k in [3, 502] — a wide space, matching the FACTORISE branch's own variant width, to keep collisions rare under heavy adaptive replanning (BROADEN/WIDEN can request several extra writes beyond the base 25).
    const expression = `(x^2 - ${k * k}) / (x^2 - ${2 * k}x + ${k * k})`;
    const answer = `(x + ${k})/(x - ${k})`;
    return {
      prompt: `Simplify fully: ${expression}`,
      expression,
      answer,
      wrongAnswers: write.wrongAnswers,
      steps,
    };
  }
  // FACTORISE: a pure algebraic expression, safe to vary with a no-op +v-v
  // so every individual write is a fresh instance without changing meaning.
  const wrapped = `(${write.expression}) + ${variant} - ${variant}`;
  return {
    prompt: `Factorise completely: ${wrapped}`,
    expression: wrapped,
    answer: write.answer,
    wrongAnswers: write.wrongAnswers,
    steps,
  };
}

/**
 * A fresh, self-contained deterministic model adapter — the same shape
 * LotusModelService exposes (see lotus-model.service.ts), so
 * `new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null)`
 * works exactly like the existing golden tests' own FakeModels.
 */
export class PersonaFakeModels {
  readonly primaryModel = "persona-fixture-primary";
  readonly challengerModel = "persona-fixture-challenger";
  writes = 0;
  closures = 0;

  get status() {
    return { enabled: true, ready: true, missingConfiguration: [] as string[], progressiveStreamingEnabled: false };
  }
  get progressiveStreamingEnabled() {
    return false;
  }
  assertReady(): void {}
  async primaryAssessment(): Promise<LotusModelAssessment> { return ASSESSMENT; }
  async challengerAssessment(): Promise<LotusModelAssessment> { return ASSESSMENT; }
  async primaryDebate(): Promise<LotusGptDebateResponse> { return DEBATE; }
  async challengerClosure(): Promise<LotusDebateClosure> { this.closures += 1; return closure(); }
  async reviseQuestion(): Promise<never> { throw new Error("persona fixture: reviseQuestion is not exercised"); }
  async generateReserveCandidates(): Promise<Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }>> { return []; }
  async writeQuestion(prompt: string): Promise<Record<string, unknown>> {
    this.writes += 1;
    return personaControlledWrite(prompt);
  }
  async solveBlind(prompt: string): Promise<Record<string, unknown>> {
    const choice = prompt.match(/Options:\n- ([^\n]+)/)?.[1] ?? "";
    return { choice };
  }
}

// ---------------------------------------------------------------------------
// Persona catalogue
// ---------------------------------------------------------------------------

/**
 * A repeatable, declared error: whenever this persona is shown an item whose
 * *primary* skill is `skillId` (matching the same skill-ownership rule
 * `ownerOfMistake` uses — see lotus-factorisation-catalogue.ts), they submit
 * the predicted wrong answer carrying `mistakeCode`. Every other item they
 * answer correctly, unless `supportSkills` says otherwise.
 */
export interface PersonaMisconception {
  skillId: string;
  mistakeCode: string;
}

export interface PersonaProfile {
  id: string;
  displayName: string;
  /** One-line description of what this profile is standing in for. */
  summary: string;
  /** A repeatable error on this one skill; absent for personas with no misconception. */
  misconception?: PersonaMisconception;
  /** Skills where this persona explicitly says "I don't know this yet" instead of guessing. */
  supportSkills?: string[];
  /** Turn indices (1-based, in the order the persona actually answers them) that this persona deliberately answers wrong even though the skill is not their declared misconception — used only by the "one-off slip" profile. */
  slipOnTurn?: number;
  confidenceBand: [number, number];
  paceMsBand: [number, number];
  workingStyle: "full-steps" | "final-answer-only" | "terse" | "hesitant";
  expectedEvidenceNote: string;
  expectedReportBoundary: string;
  expectedAdaptiveBehaviorNote: string;
}

export const PERSONA_CATALOGUE: PersonaProfile[] = [
  {
    id: "P01_SECURE_ADVANCED",
    displayName: "Secure / advanced",
    summary: "Solves every tested skill correctly with clear working, fast and confident.",
    confidenceBand: [85, 100],
    paceMsBand: [15_000, 40_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "Every skill actually asked ends SECURE from real correct evidence; nothing is asserted about skills never reached.",
    expectedReportBoundary: "No confirmed or suspected gap anywhere. Report outcome ADVANCEMENT once enough skills are secure. notTested is empty (no confirmed gap ever prunes anything).",
    expectedAdaptiveBehaviorNote: "KEEP on almost every turn — there is never a suspicion to check or a gap to route around. BROADEN may fire once a skill is secured from a single answer and a different catalogue shape for it is still unseen (see WIDEN in lotus-factorisation.ts); this is expected, not a bug.",
  },
  {
    id: "P02_NUMERIC_HCF_ONLY",
    displayName: "Numeric-HCF-only",
    summary: "Reliable at everything except pulling the correct power of a shared letter out of every term.",
    misconception: { skillId: "FAC_GCF_VARIABLE", mistakeCode: "TOOK_HIGHEST_POWER" },
    confidenceBand: [55, 75],
    paceMsBand: [25_000, 50_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "First FAC_GCF_VARIABLE item: SUSPECTED (kind MISTAKE, mistake TOOK_HIGHEST_POWER). Second independent FAC_GCF_VARIABLE item, if the plan schedules one: CONFIRMED. FAC_GCF_NUMERIC/FAC_DIVIDE_TERMS items in the meantime: SECURE.",
    expectedReportBoundary: "FAC_GCF_VARIABLE is the only confirmed-or-suspected skill. Anything transitively depending on it (FAC_COMMON_MONOMIAL, FAC_GCF_NEGATIVE, FAC_COMMON_BINOMIAL, FAC_GROUP_TERMS, FAC_GROUP_SIGN, FAC_FACTOR_FULLY) is skipped and reported notTested, never wrong.",
    expectedAdaptiveBehaviorNote: "TARGETED_PROBE (a second FAC_GCF_VARIABLE check) once suspected, landing within a few turns — never at Q24/Q25. Once confirmed, EASIER_PREREQUISITE (DESCENT) checks the dependency chain underneath it (FND_MIN_EXP_COMMON, then FND_EXPONENT_PRODUCT if that's also untested/unsafe).",
  },
  {
    id: "P03_VARIABLE_COMMON_FACTOR_GAP",
    displayName: "Difficulty finding a variable common factor",
    summary: "Picks a letter that is not actually common to every term, rather than mishandling the power of a correct one.",
    misconception: { skillId: "FAC_GCF_VARIABLE", mistakeCode: "INCLUDED_NON_COMMON_VARIABLE" },
    confidenceBand: [50, 70],
    paceMsBand: [25_000, 55_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "Same skill as P02 (FAC_GCF_VARIABLE) but a distinct mistake code, kept as a separate persona precisely to prove the report distinguishes *which* misconception was observed, not just *that* the skill failed.",
    expectedReportBoundary: "Same shape as P02: FAC_GCF_VARIABLE confirmed, its dependents notTested, everything else secure or untested.",
    expectedAdaptiveBehaviorNote: "Identical decision shape to P02 — this persona exists to prove the mistake-code distinction survives into the evidence record and report notes, not to exercise a different adaptive path.",
  },
  {
    id: "P04_DIVIDE_FIRST_TERM_ONLY",
    displayName: "Divides only the first term",
    summary: "Correctly finds the common factor, but only actually divides the first term by it, leaving the rest unchanged.",
    misconception: { skillId: "FAC_DIVIDE_TERMS", mistakeCode: "DIVIDED_FIRST_TERM_ONLY" },
    confidenceBand: [60, 80],
    paceMsBand: [20_000, 45_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "The opening item already targets FAC_DIVIDE_TERMS, so this is the persona most likely to be SUSPECTED from turn 1 and CONFIRMED from the plan's own second FAC_DIVIDE_TERMS slot (slot 3) without needing a rewritten probe at all.",
    expectedReportBoundary: "FAC_DIVIDE_TERMS confirmed; FAC_COMMON_MONOMIAL, FAC_GCF_NEGATIVE, FAC_COMMON_BINOMIAL and further dependents notTested.",
    expectedAdaptiveBehaviorNote: "KEEP is the correct decision after turn 1 in this specific case (the existing plan already has an unseen, capable second FAC_DIVIDE_TERMS slot at slot 3 to confirm or clear the suspicion) — this persona is the canonical 'KEEP is correct because a natural re-check already exists' case.",
  },
  {
    id: "P05_NEGATIVE_SIGN_ERROR",
    displayName: "Negative-factor / sign error",
    summary: "Keeps the original signs inside the bracket after pulling out a negative common factor.",
    misconception: { skillId: "FAC_GCF_NEGATIVE", mistakeCode: "KEPT_ORIGINAL_SIGNS" },
    confidenceBand: [55, 75],
    paceMsBand: [20_000, 45_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "FAC_GCF_NEGATIVE is the only slot with this skill as primary — a repeat check needs a rewritten AI item (no second fixed slot to fall back on), so this persona specifically exercises the AI-rewrite-for-CHECK path, not just a pre-existing coverage slot.",
    expectedReportBoundary: "FAC_GCF_NEGATIVE confirmed once a second, freshly generated check also shows KEPT_ORIGINAL_SIGNS (or the tagged FLIPPED_ONE_SIGN); FAC_GROUP_SIGN (which depends on it) notTested if never independently secured.",
    expectedAdaptiveBehaviorNote: "TARGETED_PROBE with a validated, freshly-generated item; implementation must show APPLIED once that item is ready, QUEUED_FOR_GENERATION in between — never a false 'implemented' claim before the item exists.",
  },
  {
    id: "P06_DIFF_SQUARES_MISCONCEPTION",
    displayName: "Difference-of-squares misconception",
    summary: "Treats a difference of two squares as a perfect square, or forgets to take the square root of the coefficient.",
    misconception: { skillId: "FAC_DIFF_SQUARES", mistakeCode: "WROTE_PERFECT_SQUARE" },
    confidenceBand: [55, 75],
    paceMsBand: [20_000, 45_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "The catalogue has two FAC_DIFF_SQUARES slots (easy numeric, medium with coefficients) — the plan's own second slot is usually enough to confirm without a rewrite, similar to P04.",
    expectedReportBoundary: "FAC_DIFF_SQUARES confirmed; FAC_FACTOR_FULLY's item that depends on it (x^4 - 16) notTested if reached before that dependency is independently re-secured.",
    expectedAdaptiveBehaviorNote: "KEEP or TARGETED_PROBE depending on whether the plan's second difference-of-squares slot is still unseen when the first mistake lands — both are correct depending on timing, and the test asserts whichever is actually valid for that run rather than a single fixed expectation.",
  },
  {
    id: "P07_GROUPING_MISCONCEPTION",
    displayName: "Grouping misconception",
    summary: "Groups four terms into pairs that do not actually share a common bracket factor.",
    misconception: { skillId: "FAC_GROUP_TERMS", mistakeCode: "PAIRS_SHARE_NOTHING" },
    confidenceBand: [45, 65],
    paceMsBand: [25_000, 55_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "FAC_GROUP_TERMS depends on FAC_COMMON_MONOMIAL and FAC_COMMON_BINOMIAL — this persona answers those correctly, so a confirmed FAC_GROUP_TERMS gap should descend past them (both secure) to whatever is still untested beneath, or find nothing left to check.",
    expectedReportBoundary: "FAC_GROUP_TERMS confirmed; FAC_GROUP_SIGN (which depends on it) notTested.",
    expectedAdaptiveBehaviorNote: "DESCENT should either find no target (both direct prerequisites already secure) — a KEEP/no-op descent — or, if some untested prerequisite exists, a fresh EASIER_PREREQUISITE probe. The test asserts descent never fabricates a check on an already-secure prerequisite.",
  },
  {
    id: "P08_EXPLICIT_SUPPORT_NEED",
    displayName: "Explicit \"I don't know this yet\"",
    summary: "Says \"I don't know\" on every item past the easiest common-factor level, even when responding quickly.",
    supportSkills: ["FAC_GCF_VARIABLE", "FAC_COMMON_MONOMIAL", "FAC_GCF_NEGATIVE", "FAC_COMMON_BINOMIAL", "FAC_GROUP_TERMS", "FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_PLUS", "FAC_MONIC_TRINOMIAL"],
    confidenceBand: [0, 0],
    paceMsBand: [3_000, 8_000],
    workingStyle: "hesitant",
    expectedEvidenceNote: "Every support-skill turn: skillEvidence kind DID_NOT_KNOW, analysisSource SUPPORT_SIGNAL, analysisStatus NOT_REQUIRED, no gpt/challenger/debate populated (no fabricated model review of a signal that was never sent to a model).",
    expectedReportBoundary: "No skill is ever reported CONFIRMED purely from a support signal — a support signal alone never promotes to a maths error. Skills never actually tested (because the plan ran out of easy-enough slots) are notTested, not scored as gaps.",
    expectedAdaptiveBehaviorNote: "EASIER_PREREQUISITE (DESCENT) is the expected response to a support signal wherever a prerequisite slot exists and is unseen; KEEP is the correct decision once no easier untested prerequisite remains — the test asserts this KEEP is explicit and reasoned, never a silent no-op.",
  },
  {
    id: "P09_ONE_OFF_SLIP",
    displayName: "One-off slip followed by correct transfer evidence",
    summary: "Makes exactly one factor-pair mistake on turn 1, then answers every later item — including a fresh, differently-represented item on the same skill — correctly.",
    misconception: { skillId: "FAC_DIVIDE_TERMS", mistakeCode: "DIVIDED_FIRST_TERM_ONLY" },
    slipOnTurn: 1,
    confidenceBand: [70, 90],
    paceMsBand: [15_000, 35_000],
    workingStyle: "full-steps",
    expectedEvidenceNote: "Turn 1: SUSPECTED (one MISTAKE observation). The plan's own second FAC_DIVIDE_TERMS slot, answered correctly: the ledger moves the skill to SECURE with clearedAfterSlip set — the original mistake is retained as a note ('looks like a slip'), never silently erased.",
    expectedReportBoundary: "No confirmed gap. observedStrengths includes FAC_DIVIDE_TERMS, annotated as cleared after an earlier slip, distinguishing it from a persona that was SECURE from the start.",
    expectedAdaptiveBehaviorNote: "KEEP throughout — the plan's own existing second slot already does the confirming/clearing work; no rewritten probe should ever be requested for this persona.",
  },
  {
    id: "P10_LOW_CONFIDENCE_CORRECT",
    displayName: "Low-confidence but correct",
    summary: "Solves every item correctly, with full working, but reports low confidence and a slow pace throughout.",
    confidenceBand: [10, 30],
    paceMsBand: [60_000, 120_000],
    workingStyle: "hesitant",
    expectedEvidenceNote: "Every skill actually asked ends SECURE — confidence and response time are context only, per COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §8 ('never as independent proof'); this persona exists specifically to prove low confidence alone never downgrades a mathematically correct, fully-worked answer to SUSPECTED.",
    expectedReportBoundary: "Same shape as P01 (secure/advanced): no confirmed or suspected gap. The report's evidence notes may reference the low confidence, but the skill state itself must not be penalised for it.",
    expectedAdaptiveBehaviorNote: "KEEP (or occasional BROADEN, as with P01) — low confidence must never by itself trigger a TARGETED_PROBE or EASIER_PREREQUISITE action; the test explicitly asserts no adaptive action is justified by a confidence/pace note alone.",
  },
];

// ---------------------------------------------------------------------------
// Response chooser — decides what a persona submits for a given question,
// reading only server-side diagnostics (never a client-redacted payload),
// matching the same convention as predictedWrong() in the existing golden
// tests (both call this "the browser never has it" server-side read).
// ---------------------------------------------------------------------------

export interface PersonaQuestionLike {
  answerKey: {
    canonicalAnswer: string;
    workedSolution?: string[];
    diagnostics?: {
      skillId: string;
      taggedSkills: string[];
      predictedMistakes: Array<{ answer: string; mistake: string }>;
    };
  };
}

export interface PersonaResponsePlan {
  answer: string;
  /** Meaningful student working, derived from the declared approach rather
   * than repeating the submitted final answer. This is deliberately carried
   * through the real answer flow so a future live-model runner tests the
   * analyst on the same evidence a child would provide. */
  working: string;
  didNotKnow: boolean;
  isDeliberateMistake: boolean;
}

function workingForMistake(mistakeCode: string, answer: string): string {
  const explanation: Record<string, string> = {
    TOOK_HIGHEST_POWER: "I chose the largest power of the variable I could see and took it outside the bracket.",
    INCLUDED_NON_COMMON_VARIABLE: "I took out every variable that appears somewhere in the expression.",
    DIVIDED_FIRST_TERM_ONLY: "I took out the common factor and divided the first term, then kept the other term unchanged.",
    KEPT_ORIGINAL_SIGNS: "I took out a negative factor and kept the signs inside the bracket the same.",
    WROTE_PERFECT_SQUARE: "Both terms are squares, so I wrote them as one squared bracket.",
    PAIRS_SHARE_NOTHING: "I grouped the first pair and the second pair, then used the bracket I thought they had in common.",
  };
  return `${explanation[mistakeCode] ?? "I used the factorisation method I thought fitted the expression."} My answer is ${answer}.`;
}

function workingForCorrect(question: PersonaQuestionLike): string {
  const steps = question.answerKey.workedSolution?.filter(Boolean) ?? [];
  return steps.length > 0
    ? steps.join("\n")
    : `I checked the factorisation by expanding it back to the original expression: ${question.answerKey.canonicalAnswer}.`;
}

export function chooseResponse(
  persona: PersonaProfile,
  question: PersonaQuestionLike,
  turnIndex: number,
): PersonaResponsePlan {
  const diagnostics = question.answerKey.diagnostics;
  const skillId = diagnostics?.skillId;
  if (skillId && persona.supportSkills?.includes(skillId)) {
    return {
      answer: "I don't know",
      working: "I am not sure how to begin this type of factorisation yet.",
      didNotKnow: true,
      isDeliberateMistake: false,
    };
  }
  // A real student with a genuine gap in a skill doesn't only slip when that
  // skill is the question's headline focus — they slip whenever the skill is
  // actually exercised, including as a secondary/tagged step inside a
  // question whose primary skill is something else. Matching only on primary
  // skillId under-tests the diagnostic: it lets a persona answer correctly
  // (and Lotus look appropriately cautious) on turns where the honest
  // simulation would have them slip, silently softening the eval.
  const misconceptionSkillId = persona.misconception?.skillId;
  const misconceptionMatches = misconceptionSkillId != null && (
    misconceptionSkillId === skillId || !!diagnostics?.taggedSkills?.includes(misconceptionSkillId)
  );
  const shouldSlip = persona.slipOnTurn === turnIndex && misconceptionMatches;
  if ((shouldSlip || (misconceptionMatches && persona.slipOnTurn === undefined)) && diagnostics) {
    const predicted = diagnostics.predictedMistakes.find((m) => m.mistake === persona.misconception!.mistakeCode);
    if (predicted) {
      return {
        answer: predicted.answer,
        working: workingForMistake(persona.misconception!.mistakeCode, predicted.answer),
        didNotKnow: false,
        isDeliberateMistake: true,
      };
    }
  }
  return {
    answer: question.answerKey.canonicalAnswer,
    working: workingForCorrect(question),
    didNotKnow: false,
    isDeliberateMistake: false,
  };
}

// ---------------------------------------------------------------------------
// Self-check: every persona's declared misconception must actually resolve
// to the skill it claims, and every mistake code referenced must be one the
// real catalogue lists for that skill — fails fast (at import time) if the
// catalogue ever changes under this fixture instead of failing silently
// inside a test assertion.
// ---------------------------------------------------------------------------
import { FACTORISATION_SKILLS } from "../../src/lotus/lotus-factorisation-catalogue";

const SKILL_MISTAKES = new Map(FACTORISATION_SKILLS.map((s) => [s.id, new Set(s.mistakes)]));
for (const persona of PERSONA_CATALOGUE) {
  if (!persona.misconception) continue;
  const { skillId, mistakeCode } = persona.misconception;
  const mistakes = SKILL_MISTAKES.get(skillId);
  if (!mistakes) throw new Error(`persona ${persona.id}: unknown skill ${skillId}`);
  if (!mistakes.has(mistakeCode)) {
    throw new Error(`persona ${persona.id}: ${mistakeCode} is not a catalogue mistake for ${skillId} (catalogue lists: ${[...mistakes].join(", ")})`);
  }
}
for (const persona of PERSONA_CATALOGUE) {
  for (const skillId of persona.supportSkills ?? []) {
    if (!SKILL_MISTAKES.has(skillId)) throw new Error(`persona ${persona.id}: unknown support skill ${skillId}`);
  }
}
