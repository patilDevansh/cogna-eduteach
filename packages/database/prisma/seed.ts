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

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(CONTENT_ROOT, relativePath), "utf8")) as T;
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
  const { concepts } = loadJson<{
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

  for (const c of concepts) {
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

  for (const c of concepts) {
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

  for (const m of misconceptions) {
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
  const { questions } = loadJson<{
    questions: Array<{
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
      misconceptionAnswerPatterns?: Array<{
        misconceptionId: string;
        answers: string[];
      }>;
    }>;
  }>("question-bank/questions.json");

  for (const q of questions) {
    const version = q.version ?? 1;
    const reviewStatus = MILESTONE_APPROVED_QUESTION_IDS.has(q.id)
      ? ReviewStatus.APPROVED
      : ((q.reviewStatus as ReviewStatus) ?? ReviewStatus.PENDING_REVIEW);

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

async function main() {
  console.log("Seeding concepts…");
  await seedConcepts();
  console.log("Seeding misconceptions…");
  await seedMisconceptions();
  console.log("Seeding questions…");
  await seedQuestions();
  console.log("Seeding explanations…");
  await seedExplanations();
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
