export type DemoStudentKey = "aarav" | "meena" | "rohan" | "aadya";

export type DemoResponse = {
  questionId: string;
  prompt: string;
  answer: string;
  working: string;
  confidence: number;
  skipped: boolean;
  correct: boolean;
  timeSeconds: number;
};

export type DemoConclusion = {
  kind: "sign-preservation" | "balance-model" | "arithmetic-slip" | "advancement" | "insufficient";
  status: "likely-learning-need" | "procedural-error" | "arithmetic-slip" | "demonstrated" | "insufficient-evidence";
  headline: string;
  observation: string;
  interpretation: string;
  uncertainty: "low" | "moderate" | "high";
  teachingTitle: string;
  teachingExplanation: string;
  workedExample: string[];
  guidedPrompt: string;
  guidedAnswer: string;
  hint: string;
};

export type DemoExitResponse = DemoResponse & { form: "familiar" | "changed" };

export type DemoStudentResult = {
  id: string;
  studentKey: DemoStudentKey;
  studentName: string;
  rollNumber: string;
  startedAt: string;
  completedAt?: string;
  diagnostic: DemoResponse[];
  conclusion: DemoConclusion;
  assistanceUsed: number;
  guidedResponse?: string;
  exit: DemoExitResponse[];
  outcome: "in-progress" | "independent-familiar" | "independent-transfer" | "needs-reinforcement" | "insufficient-evidence";
};

export const DEMO_STUDENTS: Record<DemoStudentKey, { name: string; roll: string; demoAnswers: Record<string, { answer: string; working: string; confidence: number }> }> = {
  aarav: { name: "Aarav Choudhury", roll: "8A-19", demoAnswers: {
    d1: { answer: "-2y-10", working: "-2 × y = -2y\n2 × 5 = 10\n-2y - 10", confidence: 78 },
    d2: { answer: "11", working: "3x - 12 = 21\n3x = 33\nx = 11", confidence: 82 },
    d3: { answer: "10", working: "(-2)(-5) = 10", confidence: 91 },
  }},
  meena: { name: "Meena Krishnan", roll: "8A-29", demoAnswers: {
    d1: { answer: "-2y+10", working: "-2y + 10", confidence: 64 },
    d2: { answer: "3", working: "3x - 4 = 21\n3x = 25\nx = 3", confidence: 41 },
    d3: { answer: "10", working: "negative times negative is positive", confidence: 87 },
  }},
  rohan: { name: "Rohan Sengupta", roll: "8A-26", demoAnswers: {
    d1: { answer: "-2y+10", working: "-2(y-5) = -2y+10", confidence: 76 },
    d2: { answer: "10", working: "3x - 12 = 21\n3x = 33\nx = 10", confidence: 68 },
    d3: { answer: "10", working: "(-2)(-5)=10", confidence: 92 },
  }},
  aadya: { name: "Aadya Sharma", roll: "8A-01", demoAnswers: {
    d1: { answer: "-2y+10", working: "(-2)y + (-2)(-5) = -2y+10", confidence: 94 },
    d2: { answer: "11", working: "3x-12=21\n3x=33\nx=11", confidence: 91 },
    d3: { answer: "10", working: "(-2)(-5)=10", confidence: 96 },
  }},
};

export const DIAGNOSTIC_QUESTIONS = [
  { id: "d1", skill: "Negative bracket expansion", prompt: "Expand: −2(y − 5)", expected: "-2y+10", why: "Checks whether both signs are preserved during written distribution." },
  { id: "d2", skill: "Equation with brackets", prompt: "Solve: 3(x − 4) = 21", expected: "11", why: "Checks distribution and maintaining equality across several steps." },
  { id: "d3", skill: "Signed multiplication", prompt: "Calculate: (−2)(−5)", expected: "10", why: "Separates knowledge of the sign rule from using it inside expansion." },
] as const;

export const EXIT_QUESTIONS = [
  { id: "e1", form: "familiar" as const, prompt: "Expand: −3(a − 4)", expected: "-3a+12" },
  { id: "e2", form: "changed" as const, prompt: "Solve: −2(x − 6) = 8", expected: "2" },
];

function normalize(value: string) { return value.toLowerCase().replace(/[\s×*−]/g, (c) => c === "−" ? "-" : "").replace(/\^1/g, ""); }
export function answerIsCorrect(answer: string, expected: string) { return normalize(answer) === normalize(expected); }

export function buildConclusion(responses: DemoResponse[]): DemoConclusion {
  const byId = Object.fromEntries(responses.map((r) => [r.questionId, r]));
  const usable = responses.filter((r) => !r.skipped);
  if (usable.length < 2) return {
    kind: "insufficient", status: "insufficient-evidence", headline: "Cogna needs another short check before choosing a learning path.",
    observation: `${3 - usable.length} anchor questions were skipped or incomplete.`, interpretation: "There is not enough independent evidence to assign a stable learning need.", uncertainty: "high",
    teachingTitle: "A calm evidence check", teachingExplanation: "We’ll use two simpler, fresh questions to find a dependable starting point.", workedExample: ["Take one line at a time.", "Write the sign with every number.", "Choose ‘I don’t know’ instead of guessing."], guidedPrompt: "Calculate: (−3)(−4)", guidedAnswer: "12", hint: "Write both signed factors before multiplying.",
  };
  if (!byId.d1?.correct && byId.d3?.correct) return {
    kind: "sign-preservation", status: "likely-learning-need", headline: "Keep both signs visible during negative bracket expansion.",
    observation: `The signed product was correct in “${byId.d3.prompt}”, but the expansion in “${byId.d1.prompt}” was not.`, interpretation: "The multiplication rule appears available; the difficulty is preserving both signs in the written distribution step.", uncertainty: "moderate",
    teachingTitle: "Make every signed multiplication visible", teachingExplanation: "Do not multiply in your head when a negative sits outside a bracket. First write the two signed products.", workedExample: ["−2(y − 5)", "= (−2)(y) + (−2)(−5)", "= −2y + 10"], guidedPrompt: "Expand: −4(m − 3)", guidedAnswer: "-4m+12", hint: "Write (−4)(m) + (−4)(−3) first.",
  };
  if (!byId.d2?.correct && /3x\s*-\s*4/i.test(byId.d2?.working ?? "")) return {
    kind: "balance-model", status: "procedural-error", headline: "Distribute to every term before solving the equation.",
    observation: "The multiplier was applied to x but not to the constant inside the bracket.", interpretation: "This is a procedural distribution error that blocks the later balance steps.", uncertainty: "moderate",
    teachingTitle: "Open the bracket before balancing", teachingExplanation: "Treat the bracket as two tiles. The outside number multiplies both tiles before you change either side of the equation.", workedExample: ["3(x − 4) = 21", "3x − 12 = 21", "3x = 33", "x = 11"], guidedPrompt: "Solve: 2(x − 5) = 14", guidedAnswer: "12", hint: "First rewrite the left side as 2x − 10.",
  };
  if (!byId.d2?.correct) return {
    kind: "arithmetic-slip", status: "arithmetic-slip", headline: "The method is present; slow down for the final arithmetic check.",
    observation: "The bracket was expanded and the equation was balanced correctly, but the final numerical operation was inaccurate.", interpretation: "This looks more like an arithmetic slip than absence of the algebraic method.", uncertainty: "moderate",
    teachingTitle: "Keep the method—add a ten-second check", teachingExplanation: "Your algebraic steps are useful. Substitute the final value into the original equation before moving on.", workedExample: ["3(x − 4) = 21", "Try x = 11", "3(11 − 4) = 3 × 7 = 21 ✓"], guidedPrompt: "Solve and check: 4(x − 2) = 24", guidedAnswer: "8", hint: "After solving, put your value back into 4(x − 2).",
  };
  return {
    kind: "advancement", status: "demonstrated", headline: "The target foundations were demonstrated independently.",
    observation: "All three anchor questions were correct with usable working.", interpretation: "The student is ready for a changed-form challenge rather than repeated teaching.", uncertainty: "low",
    teachingTitle: "Advance to variables on both sides", teachingExplanation: "You’ve shown the foundations. Now combine distribution with balancing variable terms.", workedExample: ["3(x − 2) = x + 10", "3x − 6 = x + 10", "2x = 16", "x = 8"], guidedPrompt: "Solve: 4(x − 1) = 2x + 10", guidedAnswer: "7", hint: "Expand first, then subtract 2x from both sides.",
  };
}

const RESULTS_KEY = "cogna_gurukul_demo_results_v1";
export function getDemoResults(): DemoStudentResult[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "[]") as DemoStudentResult[]; } catch { return []; }
}
export function saveDemoResult(result: DemoStudentResult) {
  const current = getDemoResults().filter((item) => item.studentKey !== result.studentKey);
  localStorage.setItem(RESULTS_KEY, JSON.stringify([result, ...current]));
  window.dispatchEvent(new Event("cogna-demo-results"));
}
export function getLatestDemoResult() { return getDemoResults()[0] ?? null; }
