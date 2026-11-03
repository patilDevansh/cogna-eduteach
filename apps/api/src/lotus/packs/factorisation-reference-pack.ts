/**
 * CUR-009 — Verified Reference Question Pack for Factorisation Module
 *
 * Implements the canonical teaching-first module journey defined in
 * docs/mvp-10.0/MODULE_LEARNING.md:
 *  1. Worked Examples (reviewed instructional walkthroughs)
 *  2. Supported Practice (scaffolded items with graduated hints)
 *  3. Fresh Independent Exit Checks (strict unscaffolded mastery evidence)
 *  4. Held-Out Delayed Review (retention recheck with isomorphic deep structures)
 *  5. Discriminating Prerequisite Probes (isolating foundation gaps)
 *
 * Coverage Boundary: Reference slice for monic trinomial factorisation
 * (x² + bx + c) and prerequisite signed pairs/division. Not full-grade coverage.
 */

export interface PackMetadata {
  packId: string;
  version: string;
  subskillId: string;
  curriculumTopic: string;
  curriculumBoards: string[];
  coverageLimitStatement: string;
  totalItems: number;
}

export interface WorkedExampleStep {
  stepIndex: number;
  explanation: string;
  expression: string;
  pedagogicalNote: string;
}

export interface WorkedExample {
  id: string;
  title: string;
  problem: string;
  finalAnswer: string;
  steps: WorkedExampleStep[];
  commonTrap: string;
}

export interface SupportedPracticeItem {
  id: string;
  prompt: string;
  expression: string;
  canonicalAnswer: string;
  hints: string[];
  predictedMistakes: Array<{ answer: string; mistake: string }>;
}

export interface ExitCheckItem {
  id: string;
  prompt: string;
  expression: string;
  canonicalAnswer: string;
  isIndependentScored: true;
  predictedMistakes: Array<{ answer: string; mistake: string }>;
}

export interface DelayedReviewItem {
  id: string;
  prompt: string;
  expression: string;
  canonicalAnswer: string;
  isomorphicToExitId: string;
  retentionWindowDays: number;
  predictedMistakes: Array<{ answer: string; mistake: string }>;
}

export interface PrerequisiteProbeItem {
  id: string;
  prerequisiteSkillId: string;
  discriminatorCode: string;
  prompt: string;
  canonicalAnswer: string;
  options: string[];
  predictedMistakes: Array<{ answer: string; mistake: string }>;
}

export interface FactorisationReferencePack {
  metadata: PackMetadata;
  workedExamples: WorkedExample[];
  supportedPractice: SupportedPracticeItem[];
  exitChecks: ExitCheckItem[];
  delayedReviews: DelayedReviewItem[];
  prerequisiteProbes: PrerequisiteProbeItem[];
}

export const FACTORISATION_REFERENCE_PACK_V1: FactorisationReferencePack = {
  metadata: {
    packId: "PACK_MATH_8_FACT_MONIC_TRINOMIAL",
    version: "1.0.0",
    subskillId: "FAC_MONIC_TRINOMIAL",
    curriculumTopic: "FACTORISATION",
    curriculumBoards: ["CBSE", "ICSE", "CAMBRIDGE_STAGE_9"],
    coverageLimitStatement:
      "This reference pack strictly covers monic quadratic trinomial factorisation x² + bx + c and its immediate foundation subskills (FAC_PAIR_PRODUCT_SUM, FND_SIGN_MUL_DIV, FAC_DIVIDE_TERMS). It does not claim full-grade Class 8 factorisation coverage, non-monic ax² + bx + c factorisation, or four-term grouping.",
    totalItems: 21,
  },

  workedExamples: [
    {
      id: "EX_FACT_01_ALL_POS",
      title: "Factorising with Positive Numbers",
      problem: "Factorise x² + 5x + 6",
      finalAnswer: "(x + 2)(x + 3)",
      steps: [
        {
          stepIndex: 1,
          explanation: "Compare with the standard form x² + bx + c. Here, coefficient b = 5 and constant c = 6.",
          expression: "x^2 + 5x + 6",
          pedagogicalNote: "Always identify b (sum) and c (product) first.",
        },
        {
          stepIndex: 2,
          explanation: "Find two numbers p and q such that their product p × q = 6 and their sum p + q = 5.",
          expression: "p * q = 6, p + q = 5",
          pedagogicalNote: "Factor pairs of 6 are (1, 6) and (2, 3). Sum of 1 + 6 = 7 (not 5). Sum of 2 + 3 = 5 (matches!).",
        },
        {
          stepIndex: 3,
          explanation: "Write the factorised form as double brackets (x + p)(x + q).",
          expression: "(x + 2)(x + 3)",
          pedagogicalNote: "Order does not matter: (x + 3)(x + 2) is equally valid.",
        },
      ],
      commonTrap: "Choosing 1 and 6 because 6 - 1 = 5; but the product must be +6, so factors must both be positive.",
    },
    {
      id: "EX_FACT_02_NEG_SUM_POS_PROD",
      title: "Factorising with Negative Sum and Positive Product",
      problem: "Factorise x² - 7x + 12",
      finalAnswer: "(x - 3)(x - 4)",
      steps: [
        {
          stepIndex: 1,
          explanation: "Here b = -7 and c = +12. Because the product is positive (+12) and the sum is negative (-7), both factors must be negative.",
          expression: "x^2 - 7x + 12",
          pedagogicalNote: "A positive product with a negative sum implies two negative numbers.",
        },
        {
          stepIndex: 2,
          explanation: "List negative factor pairs of 12: (-1, -12) adds to -13; (-2, -6) adds to -8; (-3, -4) adds to -7.",
          expression: "(-3) * (-4) = 12, (-3) + (-4) = -7",
          pedagogicalNote: "Pair (-3, -4) satisfies both conditions.",
        },
        {
          stepIndex: 3,
          explanation: "Write as (x - 3)(x - 4).",
          expression: "(x - 3)(x - 4)",
          pedagogicalNote: "Check by expanding: x² - 4x - 3x + 12 = x² - 7x + 12.",
        },
      ],
      commonTrap: "Writing (x + 3)(x + 4), which expands to x² + 7x + 12 (positive middle term).",
    },
    {
      id: "EX_FACT_03_NEG_PROD",
      title: "Factorising with Negative Product",
      problem: "Factorise x² + 2x - 15",
      finalAnswer: "(x + 5)(x - 3)",
      steps: [
        {
          stepIndex: 1,
          explanation: "Here b = +2 and c = -15. Because the product is negative (-15), the two numbers must have opposite signs (one positive, one negative).",
          expression: "x^2 + 2x - 15",
          pedagogicalNote: "Since their sum is +2, the larger magnitude factor must be positive.",
        },
        {
          stepIndex: 2,
          explanation: "Pairs multiplying to -15: (15, -1) adds to 14; (5, -3) adds to +2.",
          expression: "5 * (-3) = -15, 5 + (-3) = 2",
          pedagogicalNote: "The correct pair is +5 and -3.",
        },
        {
          stepIndex: 3,
          explanation: "Write as (x + 5)(x - 3).",
          expression: "(x + 5)(x - 3)",
          pedagogicalNote: "Verify: 5 × (-3) = -15 and 5 - 3 = 2.",
        },
      ],
      commonTrap: "Swapping signs to (x - 5)(x + 3), which gives sum -2 instead of +2.",
    },
  ],

  supportedPractice: [
    {
      id: "PRAC_FACT_01",
      prompt: "Factorise completely: x² + 7x + 10",
      expression: "x^2 + 7x + 10",
      canonicalAnswer: "(x + 2)(x + 5)",
      hints: [
        "Find two numbers that multiply to 10 and add to 7.",
        "Factor pairs of 10 are (1, 10) and (2, 5). Which pair adds to 7?",
        "The numbers are 2 and 5. Put them in brackets: (x + 2)(x + 5).",
      ],
      predictedMistakes: [
        { answer: "(x + 1)(x + 10)", mistake: "WRONG_FACTOR_PAIR_SUM" },
        { answer: "(x - 2)(x - 5)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x + 7)(x + 10)", mistake: "PRODUCT_SUM_SWAPPED" },
      ],
    },
    {
      id: "PRAC_FACT_02",
      prompt: "Factorise completely: x² + 9x + 20",
      expression: "x^2 + 9x + 20",
      canonicalAnswer: "(x + 4)(x + 5)",
      hints: [
        "What two numbers multiply to 20 and add to 9?",
        "Pairs multiplying to 20: 1 × 20, 2 × 10, 4 × 5. Check their sums.",
        "4 + 5 = 9. So the answer is (x + 4)(x + 5).",
      ],
      predictedMistakes: [
        { answer: "(x + 2)(x + 10)", mistake: "WRONG_FACTOR_PAIR_SUM" },
        { answer: "(x - 4)(x - 5)", mistake: "SIGN_PAIR_ERROR" },
      ],
    },
    {
      id: "PRAC_FACT_03",
      prompt: "Factorise completely: x² - 8x + 15",
      expression: "x^2 - 8x + 15",
      canonicalAnswer: "(x - 3)(x - 5)",
      hints: [
        "Product is positive (+15) but sum is negative (-8). Both numbers must be negative.",
        "Pairs of negative factors of 15: (-1, -15) and (-3, -5).",
        "(-3) + (-5) = -8. The answer is (x - 3)(x - 5).",
      ],
      predictedMistakes: [
        { answer: "(x + 3)(x + 5)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x - 1)(x - 15)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "PRAC_FACT_04",
      prompt: "Factorise completely: x² - 9x + 14",
      expression: "x^2 - 9x + 14",
      canonicalAnswer: "(x - 2)(x - 7)",
      hints: [
        "Find two negative numbers that multiply to 14 and add to -9.",
        "(-2) × (-7) = 14, and (-2) + (-7) = -9.",
        "Answer is (x - 2)(x - 7).",
      ],
      predictedMistakes: [
        { answer: "(x + 2)(x + 7)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x - 1)(x - 14)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "PRAC_FACT_05",
      prompt: "Factorise completely: x² + 3x - 10",
      expression: "x^2 + 3x - 10",
      canonicalAnswer: "(x + 5)(x - 2)",
      hints: [
        "Product is -10, so signs are opposite. Sum is +3, so positive factor is larger.",
        "Pairs for -10: (10, -1) and (5, -2).",
        "5 + (-2) = +3. The answer is (x + 5)(x - 2).",
      ],
      predictedMistakes: [
        { answer: "(x - 5)(x + 2)", mistake: "SIGNS_SWAPPED" },
        { answer: "(x + 10)(x - 1)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "PRAC_FACT_06",
      prompt: "Factorise completely: x² - 4x - 21",
      expression: "x^2 - 4x - 21",
      canonicalAnswer: "(x - 7)(x + 3)",
      hints: [
        "Product is -21 and sum is -4. The larger magnitude factor is negative.",
        "Factors of 21 with difference 4: 7 and 3.",
        "Since sum is -4, take -7 and +3: (x - 7)(x + 3).",
      ],
      predictedMistakes: [
        { answer: "(x + 7)(x - 3)", mistake: "SIGNS_SWAPPED" },
        { answer: "(x - 21)(x + 1)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
  ],

  exitChecks: [
    {
      id: "EXIT_FACT_01",
      prompt: "Independent Exit Check 1: Factorise completely x² + 8x + 12 (No hints allowed).",
      expression: "x^2 + 8x + 12",
      canonicalAnswer: "(x + 2)(x + 6)",
      isIndependentScored: true,
      predictedMistakes: [
        { answer: "(x + 3)(x + 4)", mistake: "WRONG_FACTOR_PAIR_SUM" },
        { answer: "(x - 2)(x - 6)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x + 8)(x + 12)", mistake: "PRODUCT_SUM_SWAPPED" },
      ],
    },
    {
      id: "EXIT_FACT_02",
      prompt: "Independent Exit Check 2: Factorise completely x² - 10x + 21 (No hints allowed).",
      expression: "x^2 - 10x + 21",
      canonicalAnswer: "(x - 3)(x - 7)",
      isIndependentScored: true,
      predictedMistakes: [
        { answer: "(x + 3)(x + 7)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x - 1)(x - 21)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "EXIT_FACT_03",
      prompt: "Independent Exit Check 3: Factorise completely x² + 4x - 12 (No hints allowed).",
      expression: "x^2 + 4x - 12",
      canonicalAnswer: "(x + 6)(x - 2)",
      isIndependentScored: true,
      predictedMistakes: [
        { answer: "(x - 6)(x + 2)", mistake: "SIGNS_SWAPPED" },
        { answer: "(x + 4)(x - 3)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "EXIT_FACT_04",
      prompt: "Independent Exit Check 4: Factorise completely x² - 2x - 24 (No hints allowed).",
      expression: "x^2 - 2x - 24",
      canonicalAnswer: "(x - 6)(x + 4)",
      isIndependentScored: true,
      predictedMistakes: [
        { answer: "(x + 6)(x - 4)", mistake: "SIGNS_SWAPPED" },
        { answer: "(x - 12)(x + 2)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
  ],

  delayedReviews: [
    {
      id: "DELAY_FACT_01",
      prompt: "Delayed Review Check 1: Factorise completely x² + 11x + 24.",
      expression: "x^2 + 11x + 24",
      canonicalAnswer: "(x + 3)(x + 8)",
      isomorphicToExitId: "EXIT_FACT_01",
      retentionWindowDays: 7,
      predictedMistakes: [
        { answer: "(x + 4)(x + 6)", mistake: "WRONG_FACTOR_PAIR_SUM" },
        { answer: "(x - 3)(x - 8)", mistake: "SIGN_PAIR_ERROR" },
      ],
    },
    {
      id: "DELAY_FACT_02",
      prompt: "Delayed Review Check 2: Factorise completely x² - 11x + 28.",
      expression: "x^2 - 11x + 28",
      canonicalAnswer: "(x - 4)(x - 7)",
      isomorphicToExitId: "EXIT_FACT_02",
      retentionWindowDays: 7,
      predictedMistakes: [
        { answer: "(x + 4)(x + 7)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x - 2)(x - 14)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "DELAY_FACT_03",
      prompt: "Delayed Review Check 3: Factorise completely x² + 5x - 14.",
      expression: "x^2 + 5x - 14",
      canonicalAnswer: "(x + 7)(x - 2)",
      isomorphicToExitId: "EXIT_FACT_03",
      retentionWindowDays: 7,
      predictedMistakes: [
        { answer: "(x - 7)(x + 2)", mistake: "SIGNS_SWAPPED" },
        { answer: "(x + 14)(x - 1)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "DELAY_FACT_04",
      prompt: "Delayed Review Check 4: Factorise completely x² - 3x - 28.",
      expression: "x^2 - 3x - 28",
      canonicalAnswer: "(x - 7)(x + 4)",
      isomorphicToExitId: "EXIT_FACT_04",
      retentionWindowDays: 7,
      predictedMistakes: [
        { answer: "(x + 7)(x - 4)", mistake: "SIGNS_SWAPPED" },
        { answer: "(x - 14)(x + 2)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
  ],

  prerequisiteProbes: [
    {
      id: "PREREQ_PROBE_01_SIGN_PRODUCT",
      prerequisiteSkillId: "FND_SIGN_MUL_DIV",
      discriminatorCode: "DISCRIM_SIGNED_PAIRS",
      prompt: "Evaluate: (-4) × (-6)",
      canonicalAnswer: "+24",
      options: ["+24", "-24", "+10", "-10"],
      predictedMistakes: [
        { answer: "-24", mistake: "SIGN_PRODUCT_ERROR" },
        { answer: "-10", mistake: "ADDED_INSTEAD" },
      ],
    },
    {
      id: "PREREQ_PROBE_02_FACTOR_PAIRS",
      prerequisiteSkillId: "FND_FACTOR_PAIRS",
      discriminatorCode: "DISCRIM_SIGNED_PAIRS",
      prompt: "Which pair of numbers multiplies to 36 and adds to 13?",
      canonicalAnswer: "9 and 4",
      options: ["9 and 4", "6 and 6", "12 and 3", "18 and 2"],
      predictedMistakes: [
        { answer: "6 and 6", mistake: "WRONG_FACTOR_PAIR_SUM" },
        { answer: "12 and 3", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
    },
    {
      id: "PREREQ_PROBE_03_DIVIDE_TERMS",
      prerequisiteSkillId: "FAC_DIVIDE_TERMS",
      discriminatorCode: "DISCRIM_DIVIDE_ALL_TERMS",
      prompt: "When dividing (6x² + 9x) by 3x, what is the result?",
      canonicalAnswer: "2x + 3",
      options: ["2x + 3", "2x + 9x", "2x² + 3", "2x"],
      predictedMistakes: [
        { answer: "2x + 9x", mistake: "DIVIDED_FIRST_TERM_ONLY" },
        { answer: "2x", mistake: "DROPPED_THE_ONE" },
      ],
    },
    {
      id: "PREREQ_PROBE_04_PRODUCT_SUM_ROLE",
      prerequisiteSkillId: "FAC_PAIR_PRODUCT_SUM",
      discriminatorCode: "DISCRIM_PRODUCT_SUM",
      prompt: "In x² + 7x + 12 = (x + p)(x + q), what must p × q and p + q equal?",
      canonicalAnswer: "p × q = 12 and p + q = 7",
      options: [
        "p × q = 12 and p + q = 7",
        "p × q = 7 and p + q = 12",
        "p × q = 12 and p + q = 12",
        "p × q = 7 and p + q = 7",
      ],
      predictedMistakes: [
        { answer: "p × q = 7 and p + q = 12", mistake: "PRODUCT_SUM_SWAPPED" },
      ],
    },
  ],
};
