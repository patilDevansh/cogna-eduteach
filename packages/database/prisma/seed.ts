import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  QuestionType,
  ReviewStatus,
  SessionMode,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const CONTENT_ROOT = join(__dirname, "../../../docs/mvp-1.0/content");
const CONTENT_V2_ROOT = join(__dirname, "../../../docs/mvp-2.0/content");
const CONTENT_V4_ROOT = join(__dirname, "../../../docs/mvp-4.0/content");
const CONTENT_V6_ROOT = join(__dirname, "../../../docs/mvp-6.0/content");
const CONTENT_V7_ROOT = join(__dirname, "../../../docs/mvp-7.0/content");
const CONTENT_V8_ROOT = join(__dirname, "../../../docs/mvp-8.0/content");
const CONTENT_V9_ROOT = join(__dirname, "../../../docs/mvp-9.0/content");

/** Milestone slice: C2 sign-handling path + baseline blueprint anchors — APPROVED for local/dev build */
const MILESTONE_APPROVED_QUESTION_IDS = new Set([
  "Q_C2_D1_001",
  "Q_C2_D2_001",
  "Q_C2_D2_002",
  "Q_C2_D3_001",
  "Q_C2_D4_001",
  "Q_C2_D2_003",
  "Q_C2_D2_R01",
  "Q_P1_D1_001",
  "Q_P1_D2_002",
  "Q_P3_D1_001",
  "Q_P4_D1_001",
  "Q_P5_D1_001",
  "Q_P5_D2_001",
  "Q_C1_D1_001",
  "Q_C3_D1_001",
  "Q_C5_D1_001",
  "Q_C5_D2_001",
]);

const MILESTONE_MISCONCEPTION_PATTERNS: Record<
  string,
  Array<{ misconceptionId: string; answers: string[] }>
> = {
  Q_C2_D2_001: [
    { misconceptionId: "SIGN_HANDLING", answers: ["4", "x=4", "x = 4", "-18", "x=-18"] },
    { misconceptionId: "INVERSE_OPERATION", answers: ["-4", "x=-4"] },
  ],
  Q_C2_D2_002: [
    { misconceptionId: "SIGN_HANDLING", answers: ["4", "x=4", "x = 4", "-16"] },
    { misconceptionId: "INVERSE_OPERATION", answers: ["-6", "x=-6"] },
  ],
  Q_C2_D3_001: [
    { misconceptionId: "SIGN_HANDLING", answers: ["-10", "x=-10", "-6"] },
    { misconceptionId: "ARITHMETIC_SLIP", answers: ["10", "x=10"] },
  ],
  Q_C2_D2_003: [
    { misconceptionId: "SIGN_HANDLING", answers: ["7", "x=7", "-17"] },
  ],
  Q_C2_D1_001: [
    { misconceptionId: "INVERSE_OPERATION", answers: ["5", "x=5", "-13"] },
  ],
};

function loadJsonFromRoot<T>(root: string, relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8")) as T;
}

function loadJson<T>(relativePath: string): T {
  return loadJsonFromRoot<T>(CONTENT_ROOT, relativePath);
}

type BankQuestion = {
  id: string;
  version?: number;
  conceptId: string;
  difficulty: number;
  questionIntent: string;
  type: string;
  stem: string;
  acceptedAnswers: string[];
  misconceptionsTested: string[];
  prerequisiteConceptIds?: string[];
  solutionSteps: string[];
  hintLadder: string[];
  reviewStatus?: string;
  itemQualityWeight?: number;
  options?: string[];
  unitId?: string;
  misconceptionAnswerPatterns?: Array<{
    misconceptionId: string;
    answers: string[];
  }>;
};

function loadAllBankQuestions(): BankQuestion[] {
  const base = loadJson<{ questions: BankQuestion[] }>("question-bank/questions.json");
  let generated: BankQuestion[] = [];
  try {
    const gen = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V2_ROOT,
      "question-bank/generated-questions.json",
    );
    generated = gen.questions ?? [];
  } catch {
    // generated bank optional until scripts/generate-approved-bank.mjs runs
  }
  let handcrafted: BankQuestion[] = [];
  try {
    const hc = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V2_ROOT,
      "question-bank/handcrafted-100.json",
    );
    handcrafted = hc.questions ?? [];
  } catch {
    // handcrafted bank optional until scripts/generate-handcrafted-bank.mjs runs
  }
  let algebraicIdentities: BankQuestion[] = [];
  try {
    const ai = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V6_ROOT,
      "question-bank/questions.json",
    );
    algebraicIdentities = ai.questions ?? [];
  } catch {
    // algebraic identities bank optional until mvp-6.0 content lands
  }
  let bulkGeneratedV6: BankQuestion[] = [];
  try {
    const gen6 = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V6_ROOT,
      "question-bank/generated-questions.json",
    );
    bulkGeneratedV6 = gen6.questions ?? [];
  } catch {
    // mvp-6.0 bulk-generated bank optional until scripts/generate-algebra-bank-v2.mjs runs
  }
  let factorisation: BankQuestion[] = [];
  try {
    const fac = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V7_ROOT,
      "question-bank/questions.json",
    );
    factorisation = fac.questions ?? [];
  } catch {
    // factorisation bank optional until mvp-7.0 content lands
  }
  let bulkGeneratedV7: BankQuestion[] = [];
  try {
    const gen7 = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V7_ROOT,
      "question-bank/generated-questions.json",
    );
    bulkGeneratedV7 = gen7.questions ?? [];
  } catch {
    // mvp-7.0 bulk-generated bank optional until scripts/generate-factorisation-bank.mjs runs
  }
  let exponents: BankQuestion[] = [];
  try {
    const exp = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V8_ROOT,
      "question-bank/questions.json",
    );
    exponents = exp.questions ?? [];
  } catch {
    // exponents bank optional until mvp-8.0 content lands
  }
  let bulkGeneratedV8: BankQuestion[] = [];
  try {
    const gen8 = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V8_ROOT,
      "question-bank/generated-questions.json",
    );
    bulkGeneratedV8 = gen8.questions ?? [];
  } catch {
    // mvp-8.0 bulk-generated bank optional until scripts/generate-exponents-bank.mjs runs
  }
  let rationalExpressions: BankQuestion[] = [];
  try {
    const rat = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V9_ROOT,
      "question-bank/questions.json",
    );
    rationalExpressions = rat.questions ?? [];
  } catch {
    // rational expressions bank optional until mvp-9.0 content lands
  }
  let bulkGeneratedV9: BankQuestion[] = [];
  try {
    const gen9 = loadJsonFromRoot<{ questions: BankQuestion[] }>(
      CONTENT_V9_ROOT,
      "question-bank/generated-questions.json",
    );
    bulkGeneratedV9 = gen9.questions ?? [];
  } catch {
    // mvp-9.0 bulk-generated bank optional until scripts/generate-rational-bank.mjs runs
  }
  return [
    ...(base.questions ?? []),
    ...generated,
    ...handcrafted,
    ...algebraicIdentities,
    ...bulkGeneratedV6,
    ...factorisation,
    ...bulkGeneratedV7,
    ...exponents,
    ...bulkGeneratedV8,
    ...rationalExpressions,
    ...bulkGeneratedV9,
  ];
}

function hashAccessCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function mapQuestionType(type: string): QuestionType {
  switch (type) {
    case "MCQ":
      return QuestionType.MCQ;
    case "WORD_PROBLEM":
      return QuestionType.WORD_PROBLEM;
    default:
      return QuestionType.NUMERIC;
  }
}

async function seedConcepts() {
  // MVP 1.0 Linear Equations concepts
  const { concepts: linearConcepts } = loadJson<{
    concepts: Array<{
      id: string;
      name: string;
      kind: "PREREQ" | "CORE";
      masteryThreshold: number;
      minimumEvidence: number;
      sortOrder: number;
      prerequisites: string[];
    }>;
  }>("concepts.json");

  // MVP 4.0 Phase 1: Systems of Equations concepts
  let systemsConcepts: typeof linearConcepts = [];
  try {
    const systems = loadJsonFromRoot<{ concepts: typeof linearConcepts }>(
      CONTENT_V4_ROOT,
      "systems-of-equations-concepts.json",
    );
    systemsConcepts = systems.concepts ?? [];
  } catch {
    // Systems concepts optional until Phase 1 completes
  }

  // MVP 6.0: Algebraic Identities concepts
  let identitiesConcepts: typeof linearConcepts = [];
  try {
    const identities = loadJsonFromRoot<{ concepts: typeof linearConcepts }>(
      CONTENT_V6_ROOT,
      "algebraic-identities-concepts.json",
    );
    identitiesConcepts = identities.concepts ?? [];
  } catch {
    // Algebraic identities concepts optional until mvp-6.0 content lands
  }

  // MVP 7.0: Factorisation concepts
  let factorisationConcepts: typeof linearConcepts = [];
  try {
    const factorisation = loadJsonFromRoot<{ concepts: typeof linearConcepts }>(
      CONTENT_V7_ROOT,
      "factorisation-concepts.json",
    );
    factorisationConcepts = factorisation.concepts ?? [];
  } catch {
    // Factorisation concepts optional until mvp-7.0 content lands
  }

  // MVP 8.0: Exponents (algebra slice) concepts
  let exponentsConcepts: typeof linearConcepts = [];
  try {
    const exponents = loadJsonFromRoot<{ concepts: typeof linearConcepts }>(
      CONTENT_V8_ROOT,
      "exponents-concepts.json",
    );
    exponentsConcepts = exponents.concepts ?? [];
  } catch {
    // Exponents concepts optional until mvp-8.0 content lands
  }

  // MVP 9.0: Rational Expressions concepts
  let rationalConcepts: typeof linearConcepts = [];
  try {
    const rational = loadJsonFromRoot<{ concepts: typeof linearConcepts }>(
      CONTENT_V9_ROOT,
      "rational-expressions-concepts.json",
    );
    rationalConcepts = rational.concepts ?? [];
  } catch {
    // Rational expressions concepts optional until mvp-9.0 content lands
  }

  const allConcepts = [
    ...linearConcepts,
    ...systemsConcepts,
    ...identitiesConcepts,
    ...factorisationConcepts,
    ...exponentsConcepts,
    ...rationalConcepts,
  ];

  for (const c of allConcepts) {
    await prisma.concept.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        kind: c.kind,
        masteryThreshold: c.masteryThreshold,
        minimumEvidence: c.minimumEvidence,
        sortOrder: c.sortOrder,
      },
      update: {
        name: c.name,
        kind: c.kind,
        masteryThreshold: c.masteryThreshold,
        minimumEvidence: c.minimumEvidence,
        sortOrder: c.sortOrder,
      },
    });
  }

  for (const c of allConcepts) {
    for (const prereqId of c.prerequisites) {
      await prisma.conceptPrerequisite.upsert({
        where: {
          conceptId_prerequisiteId: {
            conceptId: c.id,
            prerequisiteId: prereqId,
          },
        },
        create: { conceptId: c.id, prerequisiteId: prereqId },
        update: {},
      });
    }
  }
}

async function seedMisconceptions() {
  const { misconceptions } = loadJson<{
    misconceptions: Array<{
      id: string;
      conceptIds: string[];
      minimumMatchingAttempts: number;
      activationConfidence: number;
      alternativeExplanations: string[];
      maxTargetedBeforeExplanation: number;
      maxExplanationCycles: number;
      resolutionConsecutiveCorrect: number;
      resolutionMaxHintLevel: number;
    }>;
  }>("misconceptions.json");

  let identitiesMisconceptions: typeof misconceptions = [];
  try {
    const identities = loadJsonFromRoot<{ misconceptions: typeof misconceptions }>(
      CONTENT_V6_ROOT,
      "misconceptions.json",
    );
    identitiesMisconceptions = identities.misconceptions ?? [];
  } catch {
    // Algebraic identities misconceptions optional until mvp-6.0 content lands
  }

  let factorisationMisconceptions: typeof misconceptions = [];
  try {
    const factorisation = loadJsonFromRoot<{ misconceptions: typeof misconceptions }>(
      CONTENT_V7_ROOT,
      "misconceptions.json",
    );
    factorisationMisconceptions = factorisation.misconceptions ?? [];
  } catch {
    // Factorisation misconceptions optional until mvp-7.0 content lands
  }

  let exponentsMisconceptions: typeof misconceptions = [];
  try {
    const exponents = loadJsonFromRoot<{ misconceptions: typeof misconceptions }>(
      CONTENT_V8_ROOT,
      "misconceptions.json",
    );
    exponentsMisconceptions = exponents.misconceptions ?? [];
  } catch {
    // Exponents misconceptions optional until mvp-8.0 content lands
  }

  for (const m of [
    ...misconceptions,
    ...identitiesMisconceptions,
    ...factorisationMisconceptions,
    ...exponentsMisconceptions,
  ]) {
    await prisma.misconception.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        conceptIds: m.conceptIds,
        minimumMatchingAttempts: m.minimumMatchingAttempts,
        activationConfidence: m.activationConfidence,
        alternativeExplanations: m.alternativeExplanations,
        maxTargetedBeforeExplanation: m.maxTargetedBeforeExplanation,
        maxExplanationCycles: m.maxExplanationCycles,
        resolutionConsecutiveCorrect: m.resolutionConsecutiveCorrect,
        resolutionMaxHintLevel: m.resolutionMaxHintLevel,
      },
      update: {
        conceptIds: m.conceptIds,
        minimumMatchingAttempts: m.minimumMatchingAttempts,
        activationConfidence: m.activationConfidence,
        alternativeExplanations: m.alternativeExplanations,
        maxTargetedBeforeExplanation: m.maxTargetedBeforeExplanation,
        maxExplanationCycles: m.maxExplanationCycles,
        resolutionConsecutiveCorrect: m.resolutionConsecutiveCorrect,
        resolutionMaxHintLevel: m.resolutionMaxHintLevel,
      },
    });
  }
}

async function seedQuestions() {
  const questions = loadAllBankQuestions();

  for (const q of questions) {
    const version = q.version ?? 1;
    const reviewStatus =
      q.reviewStatus === "APPROVED" || MILESTONE_APPROVED_QUESTION_IDS.has(q.id)
        ? ReviewStatus.APPROVED
        : ReviewStatus.PENDING_REVIEW;

    const patterns =
      MILESTONE_MISCONCEPTION_PATTERNS[q.id] ?? q.misconceptionAnswerPatterns ?? null;

    await prisma.question.upsert({
      where: { id_version: { id: q.id, version } },
      create: {
        id: q.id,
        version,
        conceptId: q.conceptId,
        difficulty: q.difficulty,
        questionIntent: q.questionIntent,
        type: mapQuestionType(q.type),
        stem: q.stem,
        acceptedAnswers: q.acceptedAnswers,
        misconceptionsTested: q.misconceptionsTested,
        misconceptionPatterns: patterns,
        prerequisiteConceptIds: q.prerequisiteConceptIds ?? [],
        solutionSteps: q.solutionSteps,
        hintLadder: q.hintLadder,
        reviewStatus,
        itemQualityWeight: q.itemQualityWeight ?? 1.0,
        options: q.options ?? null,
        unitId: q.unitId ?? null,
      },
      update: {
        stem: q.stem,
        acceptedAnswers: q.acceptedAnswers,
        misconceptionsTested: q.misconceptionsTested,
        misconceptionPatterns: patterns,
        reviewStatus,
        hintLadder: q.hintLadder,
        solutionSteps: q.solutionSteps,
      },
    });
  }
}

async function seedExplanations() {
  const { explanations } = loadJson<{
    explanations: Array<{
      id: string;
      conceptId: string;
      misconceptionId?: string;
      style: string;
      content: string;
      checkForUnderstanding?: string;
      reviewStatus?: string;
      version?: number;
    }>;
  }>("explanations/templates.json");

  for (const e of explanations) {
    await prisma.explanation.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        conceptId: e.conceptId,
        misconceptionId: e.misconceptionId ?? null,
        style: e.style,
        content: e.content,
        checkForUnderstanding: e.checkForUnderstanding ?? null,
        reviewStatus:
          e.reviewStatus === "APPROVED"
            ? ReviewStatus.APPROVED
            : ReviewStatus.PENDING_REVIEW,
        version: e.version ?? 1,
      },
      update: {
        content: e.content,
        checkForUnderstanding: e.checkForUnderstanding ?? null,
      },
    });
  }
}

async function seedDevAccounts() {
  const demoAccessCode = "demo1234";

  const parentUser = await prisma.user.upsert({
    where: { clerkId: "dev_parent_clerk" },
    create: {
      clerkId: "dev_parent_clerk",
      role: UserRole.PARENT,
      email: "parent@demo.cogna.local",
    },
    update: {},
  });

  const parent = await prisma.parent.upsert({
    where: { userId: parentUser.id },
    create: {
      userId: parentUser.id,
      name: "Demo Parent",
      subscriptionStatus: "trial",
    },
    update: {},
  });

  const student = await prisma.student.upsert({
    where: { id: "dev_student_001" },
    create: {
      id: "dev_student_001",
      primaryParentId: parent.id,
      name: "Demo Student",
      grade: 8,
      curriculum: "CBSE",
      accessCodeHash: hashAccessCode(demoAccessCode),
    },
    update: {
      accessCodeHash: hashAccessCode(demoAccessCode),
    },
  });

  await prisma.parentStudentLink.upsert({
    where: {
      parentId_studentId: { parentId: parent.id, studentId: student.id },
    },
    create: {
      parentId: parent.id,
      studentId: student.id,
      relationship: "parent",
      canViewReports: true,
    },
    update: {},
  });

  await prisma.learnerProfile.upsert({
    where: { studentId: student.id },
    create: { studentId: student.id },
    update: {},
  });

  const conceptIds = [
    "P1_INTEGER_ADD_SUB",
    "P2_NEGATIVE_OPS",
    "P3_VARIABLES_CONSTANTS",
    "P4_SIMPLE_EXPRESSIONS",
    "P5_EQUALITY_BALANCE",
    "C1_ONE_STEP_ADDITION",
    "C2_ONE_STEP_SUBTRACTION",
    "C3_ONE_STEP_MULTIPLICATION",
    "C4_ONE_STEP_DIVISION",
    "C5_TWO_STEP_EQUATIONS",
    "C6_SIMPLE_WORD_PROBLEMS",
    "C7_VARIABLE_BOTH_SIDES",
    "ID_P1_TERM_BASICS",
    "ID_P2_BINOMIAL_MULTIPLICATION",
    "ID_C1_SQUARE_OF_SUM",
    "ID_C2_SQUARE_OF_DIFFERENCE",
    "ID_C3_DIFFERENCE_OF_SQUARES",
    "ID_C4_TWO_BINOMIAL_IDENTITY",
    "ID_C5_MENTAL_MATH_APPLICATION",
    "FAC_P1_MONOMIAL_FACTORS",
    "FAC_C1_COMMON_FACTOR",
    "FAC_C2_REGROUPING",
    "FAC_C3_IDENTITY_BASED",
    "FAC_C4_TRINOMIAL",
    "FAC_C5_DIVISION_CHECK",
    "C8_FRACTIONAL_COEFFICIENTS",
    "EXP_P1_LAWS_OF_EXPONENTS",
    "EXP_C1_NEGATIVE_EXPONENTS",
    "EXP_C2_EXPONENTS_IN_SIMPLIFICATION",
    "RAT_P1_VARIABLES_IN_FRACTIONS",
    "RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS",
  ];

  for (const conceptId of conceptIds) {
    await prisma.masteryScore.upsert({
      where: {
        studentId_conceptId: { studentId: student.id, conceptId },
      },
      create: {
        studentId: student.id,
        conceptId,
        value: 0.5,
        confidence: 0.1,
        evidenceCount: 0,
        modelVersion: "mastery-formula-v1",
      },
      update: {},
    });
  }

  console.log("Dev student id:", student.id);
  console.log("Dev access code:", demoAccessCode);
}

async function seedCurriculumUnits() {
  // MVP 4.0 Phase 0: Define initial curriculum units
  const units = [
    {
      unitId: "linear-equations-one-variable",
      title: "Linear Equations in One Variable",
      prerequisiteUnitIds: [] as string[],
      unlockRule: "DIAGNOSTIC_PLACEMENT",
      priorityWeight: 1.0,
      concepts: [
        { conceptId: "P1_INTEGER_ADD_SUB", kind: "PREREQ" },
        { conceptId: "P2_NEGATIVE_OPS", kind: "PREREQ" },
        { conceptId: "P3_VARIABLES_CONSTANTS", kind: "PREREQ" },
        { conceptId: "P4_SIMPLE_EXPRESSIONS", kind: "PREREQ" },
        { conceptId: "P5_EQUALITY_BALANCE", kind: "PREREQ" },
        { conceptId: "C1_ONE_STEP_ADDITION", kind: "CORE" },
        { conceptId: "C2_ONE_STEP_SUBTRACTION", kind: "CORE" },
        { conceptId: "C3_ONE_STEP_MULTIPLICATION", kind: "CORE" },
        { conceptId: "C4_ONE_STEP_DIVISION", kind: "CORE" },
        { conceptId: "C5_TWO_STEP_EQUATIONS", kind: "CORE" },
        { conceptId: "C6_SIMPLE_WORD_PROBLEMS", kind: "CORE" },
        // C7_VARIABLE_BOTH_SIDES is deliberately NOT listed here: golden test U01 freezes
        // this unit's original 11 concepts (see curriculum.u01.linear-ids-unchanged.spec.ts),
        // and U02/U03 unlock-threshold percentages are computed against that exact count.
        // C7 still fully works as a Concept (mastery, questions, prerequisite C5->C7) — it
        // just isn't counted toward this unit's unlock-gating math.
      ],
    },
    {
      unitId: "systems-of-equations",
      title: "Systems of Linear Equations",
      prerequisiteUnitIds: ["linear-equations-one-variable"],
      unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
      priorityWeight: 1.0,
      concepts: [
        { conceptId: "SE_P1_LINEAR_EQ_MASTERY", kind: "PREREQ" },
        { conceptId: "SE_P2_SUBSTITUTION_CONCEPT", kind: "PREREQ" },
        { conceptId: "SE_C1_GRAPHICAL_SOLUTION", kind: "CORE" },
        { conceptId: "SE_C2_SUBSTITUTION_METHOD", kind: "CORE" },
        { conceptId: "SE_C3_ELIMINATION_METHOD", kind: "CORE" },
        { conceptId: "SE_C4_SYSTEM_WORD_PROBLEMS", kind: "CORE" },
      ],
    },
    {
      unitId: "quadratic-equations",
      title: "Quadratic Equations",
      prerequisiteUnitIds: ["linear-equations-one-variable"],
      unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
      priorityWeight: 0.9,
      concepts: [
        // Placeholder: MVP 4.0 Phase 1 will define actual concepts
      ],
    },
    {
      // MVP 6.0: Algebraic Identities — first-batch content, depth-first on ID_C4 (the (x+a)(x+b) identity)
      unitId: "algebraic-identities",
      title: "Algebraic Identities",
      prerequisiteUnitIds: ["linear-equations-one-variable"],
      unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
      priorityWeight: 1.0,
      concepts: [
        { conceptId: "ID_P1_TERM_BASICS", kind: "PREREQ" },
        { conceptId: "ID_P2_BINOMIAL_MULTIPLICATION", kind: "PREREQ" },
        { conceptId: "ID_C1_SQUARE_OF_SUM", kind: "CORE" },
        { conceptId: "ID_C2_SQUARE_OF_DIFFERENCE", kind: "CORE" },
        { conceptId: "ID_C3_DIFFERENCE_OF_SQUARES", kind: "CORE" },
        { conceptId: "ID_C4_TWO_BINOMIAL_IDENTITY", kind: "CORE" },
        { conceptId: "ID_C5_MENTAL_MATH_APPLICATION", kind: "CORE" },
      ],
    },
    {
      // MVP 7.0: Factorisation — runs the Algebraic Identities unit in reverse, depth-first on FAC_C4 (the (x+a)(x+b) trinomial)
      unitId: "factorisation",
      title: "Factorisation",
      prerequisiteUnitIds: ["algebraic-identities"],
      unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
      priorityWeight: 1.0,
      concepts: [
        { conceptId: "FAC_P1_MONOMIAL_FACTORS", kind: "PREREQ" },
        { conceptId: "FAC_C1_COMMON_FACTOR", kind: "CORE" },
        { conceptId: "FAC_C2_REGROUPING", kind: "CORE" },
        { conceptId: "FAC_C3_IDENTITY_BASED", kind: "CORE" },
        { conceptId: "FAC_C4_TRINOMIAL", kind: "CORE" },
        { conceptId: "FAC_C5_DIVISION_CHECK", kind: "CORE" },
      ],
    },
    {
      // MVP 8.0: Exponents — the algebra-facing slice (product/quotient/power rules, negative exponents, simplification)
      unitId: "exponents-algebra",
      title: "Exponents",
      prerequisiteUnitIds: ["linear-equations-one-variable"],
      unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
      priorityWeight: 1.0,
      concepts: [
        { conceptId: "EXP_P1_LAWS_OF_EXPONENTS", kind: "PREREQ" },
        { conceptId: "EXP_C1_NEGATIVE_EXPONENTS", kind: "CORE" },
        { conceptId: "EXP_C2_EXPONENTS_IN_SIMPLIFICATION", kind: "CORE" },
      ],
    },
    {
      // MVP 9.0: Rational Expressions — needs factoring, so gated behind the Factorisation unit
      unitId: "rational-expressions",
      title: "Rational Expressions",
      prerequisiteUnitIds: ["factorisation"],
      unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD",
      priorityWeight: 0.9,
      concepts: [
        { conceptId: "RAT_P1_VARIABLES_IN_FRACTIONS", kind: "PREREQ" },
        { conceptId: "RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS", kind: "CORE" },
      ],
    },
  ];

  for (const unit of units) {
    const created = await prisma.curriculumUnit.upsert({
      where: { unitId: unit.unitId },
      create: {
        unitId: unit.unitId,
        title: unit.title,
        prerequisiteUnitIds: unit.prerequisiteUnitIds,
        unlockRule: unit.unlockRule,
        priorityWeight: unit.priorityWeight,
      },
      update: {
        title: unit.title,
        prerequisiteUnitIds: unit.prerequisiteUnitIds,
        unlockRule: unit.unlockRule,
        priorityWeight: unit.priorityWeight,
      },
    });

    // Seed unit concepts
    for (const uc of unit.concepts) {
      await prisma.unitConcept.upsert({
        where: {
          unitId_conceptId: {
            unitId: unit.unitId,
            conceptId: uc.conceptId,
          },
        },
        create: {
          unitId: unit.unitId,
          conceptId: uc.conceptId,
          kind: uc.kind as "PREREQ" | "CORE",
        },
        update: {
          kind: uc.kind as "PREREQ" | "CORE",
        },
      });
    }
  }

  // Backfill unitId for existing questions (all belong to linear-equations-one-variable)
  await prisma.question.updateMany({
    where: { unitId: null },
    data: { unitId: "linear-equations-one-variable" },
  });
}

async function main() {
  console.log("Seeding concepts…");
  await seedConcepts();
  console.log("Seeding misconceptions…");
  await seedMisconceptions();
  console.log("Seeding questions…");
  await seedQuestions();
  console.log("Seeding explanations…");
  await seedExplanations();
  console.log("Seeding curriculum units (MVP 4.0)…");
  await seedCurriculumUnits();
  console.log("Seeding dev accounts…");
  await seedDevAccounts();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
