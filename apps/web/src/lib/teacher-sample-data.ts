import type { ClassRosterStudent, ClassroomRunReport, PilotClassReport, ProductionClassroom } from "./api";

/**
 * Sample classes for demos (the "Sample data" switch in the teacher sidebar). Two Grade 8 sections,
 * each with a history of quick checks, built from the real skill catalogue. Deterministic: the same
 * page always shows the same numbers. Every total is counted from the student rows, so pages agree.
 */

type Row = PilotClassReport["students"][number];
type Skill = { skillId: string; name: string };

const FACTORISATION: Skill[] = [
  { skillId: "FAC_READ_ABC_SIGNS", name: "Reading signed numbers in a trinomial" },
  { skillId: "FAC_COMMON_MONOMIAL", name: "Taking out the full common factor" },
  { skillId: "FAC_GROUP_TERMS", name: "Grouping four terms into pairs" },
  { skillId: "FAC_DIFF_SQUARES", name: "Difference of two squares" },
  { skillId: "FAC_PAIR_PRODUCT_SUM", name: "Two numbers with a given product and sum" },
  { skillId: "FAC_FACTOR_FULLY", name: "Factorising fully" },
];
const LINEAR: Skill[] = [
  { skillId: "LIN_DISTRIBUTE_NEG", name: "Keeping both signs when expanding" },
  { skillId: "P5_EQUALITY_BALANCE", name: "Doing the same to both sides" },
  { skillId: "LIN_COMBINE_LIKE", name: "Collecting like terms" },
  { skillId: "LIN_DISTRIBUTE_POS", name: "Multiplying every term in the bracket" },
];
const EXPANDING: Skill[] = [
  { skillId: "EXP_EXPAND_SINGLE", name: "Expanding one bracket" },
  { skillId: "EXP_EXPAND_BINOMIALS", name: "Expanding two brackets" },
  { skillId: "ID_SQUARE_DIFF", name: "Using the identities forwards" },
];

const SECTION_A = [
  "Aadya Sharma", "Aarav Choudhury", "Ananya Patel", "Arjun Nair", "Aryan Gupta", "Bhavya Joshi", "Chirag Menon", "Diya Kapoor",
  "Esha Sen", "Gauri Deshmukh", "Harsh Vardhan", "Ishaan Mehta", "Jhanvi Iyer", "Kabir Das", "Karan Singhal", "Lavanya Reddy",
  "Meena Krishnan", "Mira Pillai", "Nikhil Rao", "Pooja Verma", "Pranav Kulkarni", "Riya Bose", "Rohan Sengupta", "Saanvi Agarwal",
  "Siddharth Jain", "Tanvi Mishra", "Utkarsh Pandey", "Vihaan Malhotra", "Yash Thakur", "Zara Khan",
];
const SECTION_B = [
  "Aditi Saxena", "Akash Yadav", "Anika Ghosh", "Ayaan Qureshi", "Dev Chauhan", "Divya Kapoor", "Farhan Ali", "Gayatri Hegde",
  "Hrithik Bansal", "Ira Mukherjee", "Jai Rathore", "Kavya Srinivasan", "Lakshya Goel", "Mahika Dutta", "Naina Arora", "Om Prakash",
  "Parth Shah", "Rhea D'Souza", "Sahil Bhatt", "Sana Siddiqui", "Shaurya Tiwari", "Shreya Nambiar", "Tara Kohli", "Varun Chopra",
  "Vedika Rawat", "Vivaan Sinha", "Yuvraj Gill", "Zoya Mirza",
];

/** Small seeded generator so the sample never changes between visits. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const daysAgo = (days: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

type CheckPlan = {
  runId: string;
  title: string;
  skills: Skill[];
  weights: number[]; // how often each skill is the need
  live: boolean;
  seed: number;
  startedDaysAgo: number;
  /** Shares of students: finished the check / no need found / answers unclear. */
  finished: number;
  noGap: number;
  unclear: number;
  improvedRate: number;
};

type SampleClass = { classroom: ProductionClassroom; roster: ClassRosterStudent[]; checks: CheckPlan[] };

function rosterFor(classroomId: string, names: string[], section: string): ClassRosterStudent[] {
  return names.map((name, i) => ({
    studentId: `sample_${classroomId}_${i + 1}`,
    name,
    rollNumber: `8${section}-${String(i + 1).padStart(2, "0")}`,
    joinedAt: daysAgo(60),
    alsoIn: [],
    schoolIssuedCode: true,
  }));
}

function pick<T>(items: T[], weights: number[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function buildReport(sample: SampleClass, plan: CheckPlan): ClassroomRunReport {
  const random = rng(plan.seed);
  const rows: Row[] = sample.roster.map((student) => {
    const base = { studentId: student.studentId, name: student.name, rollNumber: student.rollNumber };
    const roll = random();
    const answered = 6 + Math.floor(random() * 7);
    const minutes = 6 + Math.floor(random() * 9);
    if (roll > plan.finished) {
      return plan.live
        ? { ...base, stage: "DIAGNOSTIC", stageStatus: "IN_PROGRESS", answered: Math.floor(answered / 2), progress: "PENDING" }
        : { ...base, stage: "DONE", stageStatus: "SKIPPED", progress: "PENDING" };
    }
    const kind = random();
    if (kind < plan.noGap) {
      return { ...base, stage: "DONE", stageStatus: "COMPLETE", outcome: "ADVANCEMENT", answered, correct: answered - 1, minutes, progress: "NO_GAP" };
    }
    if (kind < plan.noGap + plan.unclear) {
      return { ...base, stage: "DONE", stageStatus: "COMPLETE", outcome: "INSUFFICIENT_OR_CONFLICTING", answered, correct: Math.floor(answered / 2), minutes, progress: "UNCLEAR" };
    }
    const skill = pick(plan.skills, plan.weights, random());
    const total = 4;
    const practiceCorrect = 2 + Math.floor(random() * 3);
    const lesson = { title: `Your lesson: ${skill.name.toLowerCase()}`, status: "READY", authoredBy: "AI" as const, practice: { attempted: total, correct: practiceCorrect, total } };
    const gap = { ...base, outcome: "SOLID_GAP", startingPoint: skill, answered, correct: answered - 3, minutes };
    if (plan.live) {
      const step = random();
      if (step < 0.35) return { ...gap, stage: "LESSON", stageStatus: "IN_PROGRESS", lesson: { ...lesson, practice: { attempted: 1, correct: 1, total } }, progress: "PENDING" };
      if (step < 0.6) return { ...gap, stage: "EXIT", stageStatus: "READY", lesson, progress: "PENDING" };
      const ok = random() < plan.improvedRate;
      return { ...gap, stage: "DONE", stageStatus: "COMPLETE", lesson, exitCorrect: ok, progress: ok ? "IMPROVED" : "NOT_YET" };
    }
    const ok = random() < plan.improvedRate;
    return { ...gap, stage: "DONE", stageStatus: "COMPLETE", lesson, exitCorrect: ok, progress: ok ? "IMPROVED" : "NOT_YET" };
  });

  const finished = rows.filter((r) => r.outcome);
  const gapRows = finished.filter((r) => r.startingPoint);
  const lessonDone = gapRows.filter((r) => r.stage === "EXIT" || r.stage === "DONE").length;
  const exitDone = gapRows.filter((r) => r.exitCorrect !== undefined && r.exitCorrect !== null).length;
  const totals = {
    enrolled: rows.length,
    diagnosticDone: finished.length,
    gapFound: gapRows.length,
    noGap: rows.filter((r) => r.progress === "NO_GAP").length,
    unclear: rows.filter((r) => r.progress === "UNCLEAR").length,
    lessonDone,
    exitDone,
    improved: rows.filter((r) => r.progress === "IMPROVED").length,
  };
  const gapGroups = plan.skills
    .map((skill) => {
      const members = gapRows.filter((r) => r.startingPoint?.skillId === skill.skillId);
      const done = members.filter((r) => r.exitCorrect !== undefined && r.exitCorrect !== null);
      return { skillId: skill.skillId, name: skill.name, students: members.map((r) => r.name), exitDone: done.length, exitCorrect: done.filter((r) => r.exitCorrect).length };
    })
    .filter((g) => g.students.length)
    .sort((a, b) => b.students.length - a.students.length);
  const skills = plan.skills.map((skill) => {
    const gap = gapRows.filter((r) => r.startingPoint?.skillId === skill.skillId).length;
    const suspected = Math.min(totals.unclear, Math.round(totals.unclear * 0.5 + (skill.skillId.length % 2)));
    return { skillId: skill.skillId, name: skill.name, gap, suspected, secure: Math.max(0, finished.length - gap - suspected) };
  });
  const top = gapGroups[0];
  const headline = !totals.diagnosticDone
    ? `${totals.enrolled} students in class. Results appear as each one finishes the quick check.`
    : top && top.students.length > 1
      ? `Most common need: ${top.name.toLowerCase()} (${top.students.length} of the ${totals.diagnosticDone} who finished).`
      : `${totals.diagnosticDone} finished. No shared need so far.`;

  const run = sample.classroom.runs!.find((r) => r.id === plan.runId)!;
  return {
    run: { id: run.id, title: run.title, phase: run.phase, status: run.status, topicId: "factorisation", classroom: sample.classroom },
    autoAdvance: true,
    classReport: { totals, gapGroups, skills, headline, students: rows },
    progress: [],
    summary: { enrolled: rows.length, diagnosticOutcomes: {}, observedStrengths: {}, uncertaintyAreas: {}, lessonDeliveries: {}, independentExit: { completed: exitDone, verified: totals.improved, needsReview: 0 } },
    students: [],
  };
}

function sampleClass(id: string, name: string, section: string, joinCode: string, names: string[], checks: CheckPlan[]): SampleClass {
  const runs = checks.map((c) => ({
    id: c.runId,
    title: c.title,
    phase: c.live ? "DIAGNOSTIC" : "FINAL_REPORT",
    status: c.live ? "LIVE" : "COMPLETE",
    createdAt: daysAgo(c.startedDaysAgo),
    startedAt: daysAgo(c.startedDaysAgo),
    completedAt: c.live ? null : daysAgo(c.startedDaysAgo, 11),
  }));
  const classroom: ProductionClassroom = { id, name, grade: 8, subjectId: "mathematics", joinCode, isDemo: true, _count: { enrollments: names.length }, runs };
  return { classroom, roster: rosterFor(id, names, section), checks };
}

const CLASSES: SampleClass[] = [
  sampleClass("sample-8a", "Grade 8 · Section A", "A", "CG-8A2026", SECTION_A, [
    { runId: "sample-8a-fac", title: "Factorisation · quick check", skills: FACTORISATION, weights: [5, 3, 3, 1, 1, 1], live: false, seed: 11, startedDaysAgo: 0, finished: 0.94, noGap: 0.38, unclear: 0.1, improvedRate: 0.72 },
    { runId: "sample-8a-lin", title: "Linear equations · quick check", skills: LINEAR, weights: [4, 3, 2, 1], live: false, seed: 23, startedDaysAgo: 21, finished: 0.97, noGap: 0.45, unclear: 0.07, improvedRate: 0.78 },
    { runId: "sample-8a-exp", title: "Expanding brackets · quick check", skills: EXPANDING, weights: [3, 4, 2], live: false, seed: 37, startedDaysAgo: 42, finished: 1, noGap: 0.52, unclear: 0.06, improvedRate: 0.81 },
  ]),
  sampleClass("sample-8b", "Grade 8 · Section B", "B", "CG-8B2026", SECTION_B, [
    { runId: "sample-8b-fac", title: "Factorisation · quick check", skills: FACTORISATION, weights: [4, 4, 2, 2, 1, 1], live: true, seed: 53, startedDaysAgo: 0, finished: 0.55, noGap: 0.35, unclear: 0.1, improvedRate: 0.7 },
    { runId: "sample-8b-lin", title: "Linear equations · quick check", skills: LINEAR, weights: [3, 4, 2, 1], live: false, seed: 61, startedDaysAgo: 20, finished: 0.93, noGap: 0.4, unclear: 0.08, improvedRate: 0.74 },
  ]),
];
// One student typed both codes: shows the "also in another class" flag.
CLASSES[1]!.roster[6]!.alsoIn = [{ id: "sample-8a", name: "Grade 8 · Section A" }];

const REPORTS = new Map<string, ClassroomRunReport>();

export const SAMPLE_CLASSES: ProductionClassroom[] = CLASSES.map((c) => c.classroom);

export function sampleRunReport(runId: string): ClassroomRunReport {
  if (!REPORTS.has(runId)) {
    const sample = CLASSES.find((c) => c.checks.some((p) => p.runId === runId));
    if (!sample) throw new Error("Sample check not found.");
    REPORTS.set(runId, buildReport(sample, sample.checks.find((p) => p.runId === runId)!));
  }
  return REPORTS.get(runId)!;
}

export function sampleRoster(classroomId: string): ClassRosterStudent[] {
  return CLASSES.find((c) => c.classroom.id === classroomId)?.roster ?? [];
}
