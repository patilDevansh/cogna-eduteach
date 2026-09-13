import type {
  PersonalizedVideoEvidenceSnapshot,
  PersonalizedVideoExitItem,
  PersonalizedVideoLesson,
  PilotStudentKey,
} from "@cogna/shared";

export interface ApprovedVideoTemplate {
  studentKey: PilotStudentKey;
  name: string;
  roll: string;
  diagnosticState: string;
  statusLabel: string;
  conceptId: string;
  learnerDecision: string;
  teacherDecision: string;
  uncertainty: "Low" | "Moderate" | "High";
  remediation: boolean;
  evidence: PersonalizedVideoEvidenceSnapshot;
  lesson: PersonalizedVideoLesson;
  exit: PersonalizedVideoExitItem;
}

export const APPROVED_VIDEO_TEMPLATES: Record<PilotStudentKey, ApprovedVideoTemplate> = {
  aarav: {
    studentKey: "aarav",
    name: "Aarav Choudhury",
    roll: "8A-19",
    diagnosticState: "supported-gap",
    statusLabel: "Targeted bridge",
    conceptId: "C3_DISTRIBUTIVE_PROPERTY",
    learnerDecision: "Teach the habit of writing both signed products before calculating.",
    teacherDecision: "Do not reteach signed multiplication. Give one changed-form bracket equation next.",
    uncertainty: "Moderate",
    remediation: true,
    evidence: {
      diagnosticState: "supported-gap",
      observedEvidence: [
        "Expanded −2(y − 5) as −2y − 10.",
        "Correctly calculated (−2)(−5) = 10 in a separate signed-number item.",
        "The contrast supports a sign-preservation difficulty in written distribution—not absence of the multiplication rule.",
      ],
      verifiedObservations: [
        {
          questionText: "Expand −2(y − 5).",
          submittedText: "−2y − 10",
          verificationStatus: "VERIFIED_INCORRECT",
          independent: true,
        },
        {
          questionText: "Calculate (−2)(−5).",
          submittedText: "10",
          verificationStatus: "VERIFIED_CORRECT",
          independent: true,
        },
      ],
    },
    lesson: {
      title: "Keep both signs visible",
      duration: "1 min 18 sec",
      objective: "Preserve both negative signs while expanding a bracket.",
      generationReason:
        "Selected because Aarav knew negative × negative, but lost the second sign inside expansion.",
      verification: "All three transformations symbolically verified.",
      scenes: [
        {
          eyebrow: "Your evidence",
          headline: "You already know the sign rule",
          equation: "(−2)(−5) = +10",
          narration:
            "Aarav, your diagnostic shows that you can multiply two negative numbers correctly. We will use that knowledge inside a bracket.",
          durationSeconds: 8,
          accent: "green",
          claims: [{ kind: "ARITHMETIC", expression: "(-2)*(-5)", expected: 10 }],
        },
        {
          eyebrow: "Make it visible",
          headline: "Write two signed products",
          equation: "−2(y − 5) = (−2)(y) + (−2)(−5)",
          narration:
            "Before calculating, write every signed multiplication. The outside negative two multiplies both terms, including negative five.",
          durationSeconds: 12,
          accent: "amber",
          claims: [
            { kind: "ALGEBRA_EQUIVALENCE", left: "-2(y-5)", right: "(-2)*y + (-2)*(-5)" },
          ],
        },
        {
          eyebrow: "Calculate",
          headline: "Now apply the rule you know",
          equation: "= −2y + 10",
          narration:
            "Negative two times y is negative two y. Negative two times negative five is positive ten.",
          durationSeconds: 10,
          accent: "green",
          claims: [{ kind: "ALGEBRA_EQUIVALENCE", left: "-2(y-5)", right: "-2y+10" }],
        },
        {
          eyebrow: "Your routine",
          headline: "Signs first. Arithmetic second.",
          equation: "outside × first  +  outside × second",
          narration:
            "Use this routine whenever a negative number sits outside a bracket: write the signed products first, then calculate.",
          durationSeconds: 9,
          accent: "violet",
        },
      ],
    },
    exit: {
      prompt: "Expand: −3(a − 4)",
      expected: "-3a+12",
      evidencePurpose: "Fresh, unassisted use of the signed-product routine.",
    },
  },
  meena: {
    studentKey: "meena",
    name: "Meena Krishnan",
    roll: "8A-29",
    diagnosticState: "procedural-error",
    statusLabel: "Targeted bridge",
    conceptId: "C3_DISTRIBUTIVE_PROPERTY",
    learnerDecision: "Teach a one-arrow-per-term distribution check for multi-bracket expressions.",
    teacherDecision: "Give two short multi-bracket items; do not assign a general fraction weakness.",
    uncertainty: "Moderate",
    remediation: true,
    evidence: {
      diagnosticState: "procedural-error",
      observedEvidence: [
        "Simplified ½(6x − 8) correctly to 3x − 4.",
        "Rewrote 3(x − 2) as 3x − 2, leaving the second term undistributed.",
        "The error appeared when a second bracket followed a fractional multiplier.",
      ],
      verifiedObservations: [
        {
          questionText: "Simplify ½(6x − 8).",
          submittedText: "3x − 4",
          verificationStatus: "VERIFIED_CORRECT",
          independent: true,
        },
        {
          questionText: "Expand 3(x − 2).",
          submittedText: "3x − 2",
          verificationStatus: "VERIFIED_INCORRECT",
          independent: true,
        },
      ],
    },
    lesson: {
      title: "Every bracket, every term",
      duration: "1 min 26 sec",
      objective: "Distribute each outside factor to every term across two brackets.",
      generationReason:
        "Selected because Meena handled the fractional bracket but stopped distributing in the second bracket.",
      verification: "Fractional simplification and combined expression verified.",
      scenes: [
        {
          eyebrow: "Your evidence",
          headline: "The fraction was not the problem",
          equation: "½(6x − 8) = 3x − 4 ✓",
          narration:
            "Meena, you correctly distributed one half across the first bracket. That useful method is already present.",
          durationSeconds: 9,
          accent: "green",
          claims: [{ kind: "ALGEBRA_EQUIVALENCE", left: "(1/2)*(6x-8)", right: "3x-4" }],
        },
        {
          eyebrow: "The missed action",
          headline: "Three must reach both terms",
          equation: "3(x − 2) = 3x − 6",
          narration:
            "In the second bracket, three multiplies x and negative two. Use one visual arrow for each term.",
          durationSeconds: 11,
          accent: "amber",
          claims: [{ kind: "ALGEBRA_EQUIVALENCE", left: "3(x-2)", right: "3x-6" }],
        },
        {
          eyebrow: "Put both results together",
          headline: "Only combine after both brackets open",
          equation: "(3x − 4) + (3x − 6) = 6x − 10",
          narration:
            "Open both brackets completely. Then combine the like terms: three x plus three x, and negative four plus negative six.",
          durationSeconds: 12,
          accent: "green",
          claims: [{ kind: "ALGEBRA_EQUIVALENCE", left: "(3x-4)+(3x-6)", right: "6x-10" }],
        },
        {
          eyebrow: "Your checklist",
          headline: "Count terms; count products",
          equation: "2 terms inside → 2 multiplications",
          narration:
            "Before moving on, count the terms inside each bracket. Two terms require two multiplications.",
          durationSeconds: 9,
          accent: "violet",
        },
      ],
    },
    exit: {
      prompt: "Simplify: ½(8m − 6) + 2(m − 4)",
      expected: "6m-11",
      evidencePurpose: "Fresh multi-bracket transfer with a fraction and no hint.",
    },
  },
  rohan: {
    studentKey: "rohan",
    name: "Rohan Sengupta",
    roll: "8A-26",
    diagnosticState: "arithmetic-slip",
    statusLabel: "Check routine",
    conceptId: "C1_BASIC_SOLVING",
    learnerDecision: "Keep the algebraic method; add a ten-second substitution check.",
    teacherDecision: "Progress to variables on both sides; continue requesting a final substitution line.",
    uncertainty: "Moderate",
    remediation: true,
    evidence: {
      diagnosticState: "arithmetic-slip",
      observedEvidence: [
        "Expanded 3(x − 4) to 3x − 12 correctly.",
        "Balanced to 3x = 33 correctly.",
        "Recorded x = 10 instead of x = 11 at the final division step.",
      ],
      verifiedObservations: [
        {
          questionText: "Solve 3(x − 4) = 21.",
          submittedText: "x = 10",
          verificationStatus: "VERIFIED_INCORRECT",
          independent: true,
        },
      ],
    },
    lesson: {
      title: "Keep your method—check the finish",
      duration: "1 min 04 sec",
      objective: "Catch final arithmetic slips by substituting into the original equation.",
      generationReason:
        "Selected because Rohan’s algebra was valid until the final numerical operation.",
      verification: "Original equation and both substitutions evaluated deterministically.",
      scenes: [
        {
          eyebrow: "Your evidence",
          headline: "Your algebraic route worked",
          equation: "3(x − 4) = 21 → 3x = 33",
          narration:
            "Rohan, your expansion and balance steps were correct. We do not need to replace your method.",
          durationSeconds: 8,
          accent: "green",
          claims: [
            { kind: "EQUATION_TRANSFORMATION", from: "3(x-4)=21", to: "3x-12=21" },
            { kind: "EQUATION_TRANSFORMATION", from: "3x-12=21", to: "3x=33" },
          ],
        },
        {
          eyebrow: "Ten-second check",
          headline: "Try your answer in the original",
          equation: "x = 10 → 3(10 − 4) = 18 ≠ 21",
          narration:
            "Substitute ten into the original equation. It gives eighteen, not twenty-one, so the final answer needs another look.",
          durationSeconds: 11,
          accent: "amber",
          claims: [{ kind: "ARITHMETIC", expression: "3*(10-4)", expected: 18 }],
        },
        {
          eyebrow: "Correct the arithmetic",
          headline: "Thirty-three divided by three",
          equation: "x = 11 → 3(11 − 4) = 21 ✓",
          narration:
            "Thirty-three divided by three is eleven. Substitution now returns twenty-one, so the solution checks.",
          durationSeconds: 11,
          accent: "green",
          claims: [
            { kind: "ARITHMETIC", expression: "33/3", expected: 11 },
            { kind: "ARITHMETIC", expression: "3*(11-4)", expected: 21 },
          ],
        },
        {
          eyebrow: "Your routine",
          headline: "Solve, substitute, confirm",
          equation: "answer → original equation → ✓",
          narration:
            "Use this quick check after multi-step equations. It catches slips without making you repeat correct algebra.",
          durationSeconds: 9,
          accent: "violet",
        },
      ],
    },
    exit: {
      prompt: "Solve and check: 4(x − 2) = 24",
      expected: "8",
      evidencePurpose: "Independent equation solving plus evidence of a final check.",
    },
  },
  divya: {
    studentKey: "divya",
    name: "Divya Kapoor",
    roll: "8A-22",
    diagnosticState: "developing",
    statusLabel: "Targeted bridge",
    conceptId: "C2_VARIABLES_BOTH_SIDES",
    learnerDecision:
      "Teach balance as the same visible operation on both sides, before using transposition shorthand.",
    teacherDecision: "Progress with one transfer probe; keep visible balance notation available.",
    uncertainty: "Moderate",
    remediation: true,
    evidence: {
      diagnosticState: "developing",
      observedEvidence: [
        "Reduced 4x − 2x to 2x correctly.",
        "Changed 4x − 6 = 2x + 8 into 2x = 2.",
        "The constant balance operation was not applied equally to both sides.",
      ],
      verifiedObservations: [
        {
          questionText: "Solve 4x − 6 = 2x + 8.",
          submittedText: "x = 1",
          verificationStatus: "VERIFIED_INCORRECT",
          independent: true,
        },
      ],
    },
    lesson: {
      title: "Keep the equation balanced",
      duration: "1 min 22 sec",
      objective: "Apply the same constant operation to both sides of an equation.",
      generationReason:
        "Selected because Divya combined variable terms correctly but changed the constants asymmetrically.",
      verification: "Every equation line checked for equivalence.",
      scenes: [
        {
          eyebrow: "Your evidence",
          headline: "You combined the x terms correctly",
          equation: "4x − 2x = 2x ✓",
          narration:
            "Divya, you correctly combined four x and negative two x. The next step is about maintaining equality.",
          durationSeconds: 8,
          accent: "green",
          claims: [{ kind: "ALGEBRA_EQUIVALENCE", left: "4x-2x", right: "2x" }],
        },
        {
          eyebrow: "Show the operation",
          headline: "Cancel negative six with positive six",
          equation: "2x − 6 + 6 = 8 + 6",
          narration:
            "To remove negative six on the left, add six. The equals sign requires the same addition on the right.",
          durationSeconds: 12,
          accent: "amber",
          claims: [
            { kind: "EQUATION_TRANSFORMATION", from: "2x-6=8", to: "2x-6+6=8+6" },
          ],
        },
        {
          eyebrow: "Finish",
          headline: "Both sides stayed equal",
          equation: "2x = 14 → x = 7",
          narration: "The balanced equation becomes two x equals fourteen, so x equals seven.",
          durationSeconds: 9,
          accent: "green",
          claims: [
            { kind: "EQUATION_TRANSFORMATION", from: "2x-6+6=8+6", to: "2x=14" },
            { kind: "EQUATION_TRANSFORMATION", from: "2x=14", to: "x=7" },
          ],
        },
        {
          eyebrow: "Your routine",
          headline: "Name it on both sides",
          equation: "+6 left  |  +6 right",
          narration:
            "Until the habit is secure, write the operation on both sides instead of saying that a term simply moves.",
          durationSeconds: 9,
          accent: "violet",
        },
      ],
    },
    exit: {
      prompt: "Solve: 5x + 3 = 2x + 15",
      expected: "4",
      evidencePurpose: "Fresh independent balance operation with variables on both sides.",
    },
  },
  kabir: {
    studentKey: "kabir",
    name: "Kabir Das",
    roll: "8A-24",
    diagnosticState: "insufficient-evidence",
    statusLabel: "Evidence check",
    conceptId: "C1_BASIC_SOLVING",
    learnerDecision: "Do not prescribe gap remediation; prepare a calm two-item evidence reset.",
    teacherDecision: "Supervise one more fresh item before assigning either remediation or advancement.",
    uncertainty: "High",
    remediation: false,
    evidence: {
      diagnosticState: "insufficient-evidence",
      lotusOutcome: "INSUFFICIENT_OR_CONFLICTING",
      observedEvidence: [
        "Skipped two diagnostic items after initially selecting answers.",
        "One correct entered answer conflicted with an ‘I don’t know’ signal.",
        "The usable evidence is too sparse and contradictory for a stable learning-gap claim.",
      ],
      verifiedObservations: [],
    },
    lesson: {
      title: "A fresh start: show one step at a time",
      duration: "0 min 54 sec",
      objective: "Prepare Kabir to provide clean, interpretable independent evidence.",
      generationReason:
        "Selected because the diagnostic evidence was insufficient—not because Cogna inferred a weakness.",
      verification: "No academic-gap claim generated; fresh items verified.",
      scenes: [
        {
          eyebrow: "No label assigned",
          headline: "Cogna needs clearer evidence",
          equation: "insufficient evidence ≠ weakness",
          narration:
            "Kabir, the first check did not give Cogna enough consistent evidence. This does not mean you cannot do the mathematics.",
          durationSeconds: 10,
          accent: "violet",
        },
        {
          eyebrow: "One task",
          headline: "Write the first useful step",
          equation: "2(x + 3) → 2x + 6",
          narration:
            "For the next question, enter one useful working step before the final answer. This lets Cogna distinguish method from guessing.",
          durationSeconds: 10,
          accent: "green",
          claims: [{ kind: "ALGEBRA_EQUIVALENCE", left: "2(x+3)", right: "2x+6" }],
        },
        {
          eyebrow: "Answer honestly",
          headline: "Not knowing is useful evidence",
          equation: "know  |  unsure  |  don’t know yet",
          narration:
            "Choose I do not know only when that describes your current state. You will not lose marks here.",
          durationSeconds: 9,
          accent: "amber",
        },
        {
          eyebrow: "Fresh check",
          headline: "Two clean questions—then Cogna decides",
          equation: "new evidence → starting point",
          narration:
            "Cogna will use two fresh questions and make a conclusion only if the evidence supports one.",
          durationSeconds: 9,
          accent: "green",
        },
      ],
    },
    exit: {
      prompt: "Expand: 2(p + 3)",
      expected: "2p+6",
      evidencePurpose: "First fresh, supervised evidence item after abstention.",
    },
  },
};

export const PILOT_TEMPLATE_KEYS = Object.keys(APPROVED_VIDEO_TEMPLATES) as PilotStudentKey[];

export function templateForKey(key: string): ApprovedVideoTemplate | undefined {
  return APPROVED_VIDEO_TEMPLATES[key as PilotStudentKey];
}

function evidenceHaystack(snapshot: PersonalizedVideoEvidenceSnapshot): string {
  const parts = [
    ...(snapshot.observedEvidence ?? []),
    ...(snapshot.verifiedObservations ?? []).flatMap((observation) => [
      observation.questionText,
      observation.submittedText,
    ]),
  ];
  return parts
    .join("\n")
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("½", "1/2")
    .replace(/\s+/g, "");
}

/**
 * Map persisted Lotus evidence onto an approved lesson. Client-supplied
 * studentKey must not participate — unmatched evidence abstains.
 */
export function selectTemplateFromEvidence(
  snapshot: PersonalizedVideoEvidenceSnapshot,
): ApprovedVideoTemplate | undefined {
  const text = evidenceHaystack(snapshot);
  if (text.includes("-2(y-5)") || (text.includes("-2y-10") && text.includes("(-2)(-5)"))) {
    return APPROVED_VIDEO_TEMPLATES.aarav;
  }
  if (text.includes("1/2(6x-8)") || text.includes("3(x-2)")) {
    return APPROVED_VIDEO_TEMPLATES.meena;
  }
  if (text.includes("3(x-4)=21") || text.includes("3x=33")) {
    return APPROVED_VIDEO_TEMPLATES.rohan;
  }
  if (text.includes("4x-6=2x+8") || text.includes("4x-2x")) {
    return APPROVED_VIDEO_TEMPLATES.divya;
  }
  return undefined;
}
