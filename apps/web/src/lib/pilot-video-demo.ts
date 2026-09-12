export type PilotStudentKey = "aarav" | "meena" | "rohan" | "divya" | "kabir";

export type VideoScene = {
  eyebrow: string;
  headline: string;
  equation: string;
  narration: string;
  durationSeconds: number;
  accent: "green" | "amber" | "violet";
};

export type PilotStudentStory = {
  key: PilotStudentKey;
  name: string;
  roll: string;
  diagnosticState: "supported-gap" | "procedural-error" | "arithmetic-slip" | "developing" | "insufficient-evidence";
  statusLabel: string;
  observedEvidence: string[];
  learnerDecision: string;
  uncertainty: "Low" | "Moderate" | "High";
  video: {
    title: string;
    duration: string;
    objective: string;
    generationReason: string;
    verification: string;
    scenes: VideoScene[];
  };
  exit: {
    prompt: string;
    expected: string;
    evidencePurpose: string;
    mockOutcome: string;
  };
  teacherDecision: string;
};

export const PILOT_STUDENT_STORIES: Record<PilotStudentKey, PilotStudentStory> = {
  aarav: {
    key: "aarav",
    name: "Aarav Choudhury",
    roll: "8A-19",
    diagnosticState: "supported-gap",
    statusLabel: "Targeted bridge",
    observedEvidence: [
      "Expanded −2(y − 5) as −2y − 10.",
      "Correctly calculated (−2)(−5) = 10 in a separate signed-number item.",
      "The contrast supports a sign-preservation difficulty in written distribution—not absence of the multiplication rule.",
    ],
    learnerDecision: "Teach the habit of writing both signed products before calculating.",
    uncertainty: "Moderate",
    video: {
      title: "Keep both signs visible",
      duration: "1 min 18 sec",
      objective: "Preserve both negative signs while expanding a bracket.",
      generationReason: "Selected because Aarav knew negative × negative, but lost the second sign inside expansion.",
      verification: "All three transformations symbolically verified.",
      scenes: [
        { eyebrow: "Your evidence", headline: "You already know the sign rule", equation: "(−2)(−5) = +10", narration: "Aarav, your diagnostic shows that you can multiply two negative numbers correctly. We will use that knowledge inside a bracket.", durationSeconds: 8, accent: "green" },
        { eyebrow: "Make it visible", headline: "Write two signed products", equation: "−2(y − 5) = (−2)(y) + (−2)(−5)", narration: "Before calculating, write every signed multiplication. The outside negative two multiplies both terms, including negative five.", durationSeconds: 12, accent: "amber" },
        { eyebrow: "Calculate", headline: "Now apply the rule you know", equation: "= −2y + 10", narration: "Negative two times y is negative two y. Negative two times negative five is positive ten.", durationSeconds: 10, accent: "green" },
        { eyebrow: "Your routine", headline: "Signs first. Arithmetic second.", equation: "outside × first  +  outside × second", narration: "Use this routine whenever a negative number sits outside a bracket: write the signed products first, then calculate.", durationSeconds: 9, accent: "violet" },
      ],
    },
    exit: { prompt: "Expand: −3(a − 4)", expected: "-3a+12", evidencePurpose: "Fresh, unassisted use of the signed-product routine.", mockOutcome: "Correct independently; transfer to an equation remains to be checked." },
    teacherDecision: "Do not reteach signed multiplication. Give one changed-form bracket equation next.",
  },
  meena: {
    key: "meena",
    name: "Meena Krishnan",
    roll: "8A-29",
    diagnosticState: "procedural-error",
    statusLabel: "Targeted bridge",
    observedEvidence: [
      "Simplified ½(6x − 8) correctly to 3x − 4.",
      "Rewrote 3(x − 2) as 3x − 2, leaving the second term undistributed.",
      "The error appeared when a second bracket followed a fractional multiplier.",
    ],
    learnerDecision: "Teach a one-arrow-per-term distribution check for multi-bracket expressions.",
    uncertainty: "Moderate",
    video: {
      title: "Every bracket, every term",
      duration: "1 min 26 sec",
      objective: "Distribute each outside factor to every term across two brackets.",
      generationReason: "Selected because Meena handled the fractional bracket but stopped distributing in the second bracket.",
      verification: "Fractional simplification and combined expression verified.",
      scenes: [
        { eyebrow: "Your evidence", headline: "The fraction was not the problem", equation: "½(6x − 8) = 3x − 4 ✓", narration: "Meena, you correctly distributed one half across the first bracket. That useful method is already present.", durationSeconds: 9, accent: "green" },
        { eyebrow: "The missed action", headline: "Three must reach both terms", equation: "3(x − 2) = 3x − 6", narration: "In the second bracket, three multiplies x and negative two. Use one visual arrow for each term.", durationSeconds: 11, accent: "amber" },
        { eyebrow: "Put both results together", headline: "Only combine after both brackets open", equation: "(3x − 4) + (3x − 6) = 6x − 10", narration: "Open both brackets completely. Then combine the like terms: three x plus three x, and negative four plus negative six.", durationSeconds: 12, accent: "green" },
        { eyebrow: "Your checklist", headline: "Count terms; count products", equation: "2 terms inside → 2 multiplications", narration: "Before moving on, count the terms inside each bracket. Two terms require two multiplications.", durationSeconds: 9, accent: "violet" },
      ],
    },
    exit: { prompt: "Simplify: ½(8m − 6) + 2(m − 4)", expected: "6m-11", evidencePurpose: "Fresh multi-bracket transfer with a fraction and no hint.", mockOutcome: "Familiar routine improved; changed-form transfer remains developing." },
    teacherDecision: "Give two short multi-bracket items; do not assign a general fraction weakness.",
  },
  rohan: {
    key: "rohan",
    name: "Rohan Sengupta",
    roll: "8A-26",
    diagnosticState: "arithmetic-slip",
    statusLabel: "Check routine",
    observedEvidence: [
      "Expanded 3(x − 4) to 3x − 12 correctly.",
      "Balanced to 3x = 33 correctly.",
      "Recorded x = 10 instead of x = 11 at the final division step.",
    ],
    learnerDecision: "Keep the algebraic method; add a ten-second substitution check.",
    uncertainty: "Moderate",
    video: {
      title: "Keep your method—check the finish",
      duration: "1 min 04 sec",
      objective: "Catch final arithmetic slips by substituting into the original equation.",
      generationReason: "Selected because Rohan’s algebra was valid until the final numerical operation.",
      verification: "Original equation and both substitutions evaluated deterministically.",
      scenes: [
        { eyebrow: "Your evidence", headline: "Your algebraic route worked", equation: "3(x − 4) = 21 → 3x = 33", narration: "Rohan, your expansion and balance steps were correct. We do not need to replace your method.", durationSeconds: 8, accent: "green" },
        { eyebrow: "Ten-second check", headline: "Try your answer in the original", equation: "x = 10 → 3(10 − 4) = 18 ≠ 21", narration: "Substitute ten into the original equation. It gives eighteen, not twenty-one, so the final answer needs another look.", durationSeconds: 11, accent: "amber" },
        { eyebrow: "Correct the arithmetic", headline: "Thirty-three divided by three", equation: "x = 11 → 3(11 − 4) = 21 ✓", narration: "Thirty-three divided by three is eleven. Substitution now returns twenty-one, so the solution checks.", durationSeconds: 11, accent: "green" },
        { eyebrow: "Your routine", headline: "Solve, substitute, confirm", equation: "answer → original equation → ✓", narration: "Use this quick check after multi-step equations. It catches slips without making you repeat correct algebra.", durationSeconds: 9, accent: "violet" },
      ],
    },
    exit: { prompt: "Solve and check: 4(x − 2) = 24", expected: "8", evidencePurpose: "Independent equation solving plus evidence of a final check.", mockOutcome: "Correct independently with valid substitution; ready to progress." },
    teacherDecision: "Progress to variables on both sides; continue requesting a final substitution line.",
  },
  divya: {
    key: "divya",
    name: "Divya Kapoor",
    roll: "8A-22",
    diagnosticState: "developing",
    statusLabel: "Targeted bridge",
    observedEvidence: [
      "Reduced 4x − 2x to 2x correctly.",
      "Changed 4x − 6 = 2x + 8 into 2x = 2.",
      "The constant balance operation was not applied equally to both sides.",
    ],
    learnerDecision: "Teach balance as the same visible operation on both sides, before using transposition shorthand.",
    uncertainty: "Moderate",
    video: {
      title: "Keep the equation balanced",
      duration: "1 min 22 sec",
      objective: "Apply the same constant operation to both sides of an equation.",
      generationReason: "Selected because Divya combined variable terms correctly but changed the constants asymmetrically.",
      verification: "Every equation line checked for equivalence.",
      scenes: [
        { eyebrow: "Your evidence", headline: "You combined the x terms correctly", equation: "4x − 2x = 2x ✓", narration: "Divya, you correctly combined four x and negative two x. The next step is about maintaining equality.", durationSeconds: 8, accent: "green" },
        { eyebrow: "Show the operation", headline: "Cancel negative six with positive six", equation: "2x − 6 + 6 = 8 + 6", narration: "To remove negative six on the left, add six. The equals sign requires the same addition on the right.", durationSeconds: 12, accent: "amber" },
        { eyebrow: "Finish", headline: "Both sides stayed equal", equation: "2x = 14 → x = 7", narration: "The balanced equation becomes two x equals fourteen, so x equals seven.", durationSeconds: 9, accent: "green" },
        { eyebrow: "Your routine", headline: "Name it on both sides", equation: "+6 left  |  +6 right", narration: "Until the habit is secure, write the operation on both sides instead of saying that a term simply moves.", durationSeconds: 9, accent: "violet" },
      ],
    },
    exit: { prompt: "Solve: 5x + 3 = 2x + 15", expected: "4", evidencePurpose: "Fresh independent balance operation with variables on both sides.", mockOutcome: "Correct independently; one harder transfer item is recommended." },
    teacherDecision: "Progress with one transfer probe; keep visible balance notation available.",
  },
  kabir: {
    key: "kabir",
    name: "Kabir Das",
    roll: "8A-24",
    diagnosticState: "insufficient-evidence",
    statusLabel: "Evidence check",
    observedEvidence: [
      "Skipped two diagnostic items after initially selecting answers.",
      "One correct entered answer conflicted with an ‘I don’t know’ signal.",
      "The usable evidence is too sparse and contradictory for a stable learning-gap claim.",
    ],
    learnerDecision: "Do not prescribe gap remediation; prepare a calm two-item evidence reset.",
    uncertainty: "High",
    video: {
      title: "A fresh start: show one step at a time",
      duration: "0 min 54 sec",
      objective: "Prepare Kabir to provide clean, interpretable independent evidence.",
      generationReason: "Selected because the diagnostic evidence was insufficient—not because Cogna inferred a weakness.",
      verification: "No academic-gap claim generated; fresh items verified.",
      scenes: [
        { eyebrow: "No label assigned", headline: "Cogna needs clearer evidence", equation: "insufficient evidence ≠ weakness", narration: "Kabir, the first check did not give Cogna enough consistent evidence. This does not mean you cannot do the mathematics.", durationSeconds: 10, accent: "violet" },
        { eyebrow: "One task", headline: "Write the first useful step", equation: "2(x + 3) → 2x + 6", narration: "For the next question, enter one useful working step before the final answer. This lets Cogna distinguish method from guessing.", durationSeconds: 10, accent: "green" },
        { eyebrow: "Answer honestly", headline: "Not knowing is useful evidence", equation: "know  |  unsure  |  don’t know yet", narration: "Choose I do not know only when that describes your current state. You will not lose marks here.", durationSeconds: 9, accent: "amber" },
        { eyebrow: "Fresh check", headline: "Two clean questions—then Cogna decides", equation: "new evidence → starting point", narration: "Cogna will use two fresh questions and make a conclusion only if the evidence supports one.", durationSeconds: 9, accent: "green" },
      ],
    },
    exit: { prompt: "Expand: 2(p + 3)", expected: "2p+6", evidencePurpose: "First fresh, supervised evidence item after abstention.", mockOutcome: "One correct fresh item; conclusion remains open pending a second item." },
    teacherDecision: "Supervise one more fresh item before assigning either remediation or advancement.",
  },
};

export const PILOT_STUDENT_KEYS = Object.keys(PILOT_STUDENT_STORIES) as PilotStudentKey[];

export type VideoLearningEvent = {
  studentKey: PilotStudentKey;
  watchedAt: string;
  exitAnswer?: string;
  exitWorking?: string;
  exitCorrect?: boolean;
};

const VIDEO_EVENTS_KEY = "cogna_pilot_video_events_v1";

export function getVideoLearningEvents(): VideoLearningEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(VIDEO_EVENTS_KEY) ?? "[]") as VideoLearningEvent[];
  } catch {
    return [];
  }
}

export function saveVideoLearningEvent(event: VideoLearningEvent): void {
  const rest = getVideoLearningEvents().filter((item) => item.studentKey !== event.studentKey);
  localStorage.setItem(VIDEO_EVENTS_KEY, JSON.stringify([event, ...rest]));
  window.dispatchEvent(new Event("cogna-video-events"));
}

export function normalizeAlgebra(value: string): string {
  return value.toLowerCase().replaceAll("−", "-").replaceAll("×", "*").replace(/\s+/g, "");
}
