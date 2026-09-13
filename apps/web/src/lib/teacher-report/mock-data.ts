import { MOCK_CLASSROOM } from "@/lib/mock-classroom";

export type ReadinessCategory = "ready" | "reinforcement" | "probe";

export type EvidenceStatus = "solid" | "developing" | "assisted" | "conflict" | "sparse";

export interface StudentStep {
  stepIndex: number;
  prompt: string;
  submittedLine: string;
  previousLine: string;
  valid: boolean;
  transformationType?: string;
  diagnosticNote?: string;
  errorActionCode?: string;
}

export interface StudentAttemptEvidence {
  questionTitle: string;
  questionPrompt: string;
  category: "familiar" | "independent" | "transfer";
  timeMs: number;
  hintsUsed: number;
  isCorrect: boolean;
  steps: StudentStep[];
}

export interface StudentReportItem {
  id: string;
  name: string;
  rollNumber: string;
  readiness: ReadinessCategory;
  evidenceStatus: EvidenceStatus;
  familiarSolved: boolean;
  independentSolved: boolean;
  transferSolved: boolean;
  demonstratedSkills: string[];
  candidateLearningNeed: string | null;
  errorPatternSummary?: string;
  recommendedFollowUp: string;
  uncertaintyRating: "low" | "moderate" | "high";
  isInputConflict?: boolean;
  conflictDetails?: {
    enteredAnswer: string;
    actionTaken: string;
    exclusionReason: string;
  };
  attempts: StudentAttemptEvidence[];
}

export interface MisconceptionStepExample {
  canonicalProblem: string;
  correctStep: string;
  observedStep: string;
  explanation: string;
  teacherPrompt: string;
  affectedCount: number;
  studentIds: string[];
}

export interface TeacherReportData {
  classInfo: {
    teacherName: string;
    schoolName: string;
    shareCode: string;
    className: string;
    grade: string;
    totalStudents: number;
    lessonTitle: string;
    lessonDate: string;
    assessmentTime: string;
    evidenceFreshness: string;
  };
  comprehension: {
    overallStatus: "Developing" | "Proficient" | "Early Stage";
    familiarCount: number;
    independentCount: number;
    transferCount: number;
    headline: string;
    subtext: string;
  };
  readinessSummary: {
    readyCount: number;
    reinforcementCount: number;
    probeCount: number;
    headline: string;
  };
  mainDifficulty: {
    title: string;
    shortCode: string;
    studentCount: number;
    description: string;
    secondaryIssue: string;
    secondaryCount: number;
    stepExample: MisconceptionStepExample;
  };
  recommendedAction: {
    timeMinutes: number;
    headline: string;
    actionSummary: string;
    rationale: string;
    lessonPlan: {
      phase: string;
      durationMinutes: number;
      activity: string;
      boardExample: string;
      teacherNote: string;
    }[];
    readyGroupActivity: {
      title: string;
      description: string;
      challengeProblem: string;
    };
  };
  evidenceAudit: {
    totalInteractions: number;
    independentLinesVerified: number;
    assistedHintsDelivered: number;
    excludedConflictsCount: number;
    confidenceReliability: string;
    evidenceLimitations: string[];
  };
  students: StudentReportItem[];
}

export const MOCK_TEACHER_REPORT_DATA: TeacherReportData = {
  classInfo: {
    teacherName: MOCK_CLASSROOM.teacherName,
    schoolName: MOCK_CLASSROOM.schoolName,
    shareCode: MOCK_CLASSROOM.shareCode,
    className: MOCK_CLASSROOM.className,
    grade: MOCK_CLASSROOM.grade,
    totalStudents: 30,
    lessonTitle: "Signed Bracket Expansion",
    lessonDate: "Today (4 Sep 2026)",
    assessmentTime: "Supervised diagnostic, learning and exit session",
    evidenceFreshness: "Generated immediately",
  },
  comprehension: {
    overallStatus: "Developing",
    familiarCount: 26,
    independentCount: 21,
    transferCount: 16,
    headline: "21 of 30 students demonstrated the taught method independently.",
    subtext:
      "26 students solved familiar one-side equations with scaffolds. 21 succeeded with zero hints, and 16 successfully transferred to novel multi-bracket structures.",
  },
  readinessSummary: {
    readyCount: 18,
    reinforcementCount: 8,
    probeCount: 4,
    headline: "18 ready to progress · 8 need targeted reinforcement · 4 need more evidence",
  },
  mainDifficulty: {
    title: "Variables on Both Sides",
    shortCode: "LIN_VARIABLE_BOTH",
    studentCount: 11,
    description:
      "When subtracting variable terms from both sides (e.g. 4x - 6 = 2x + 8), students frequently combine the coefficients on one side instead of balancing both sides, or drop the negative sign on constant terms.",
    secondaryIssue: "Sign inversion during negative term transposition",
    secondaryCount: 5,
    stepExample: {
      canonicalProblem: "4x - 6 = 2x + 8",
      correctStep: "Subtract 2x from both sides → 2x - 6 = 8, then 2x = 14 → x = 7",
      observedStep: "4x - 6 = 2x + 8 → 2x = 2 (treated −6 as +6 or subtracted 8−6)",
      explanation:
        "Students isolated the 2x variable correctly on the left, but subtracted the constant 6 from 8 instead of adding 6 to balance the -6.",
      teacherPrompt:
        "To cancel −6, add 6 to both sides. What you do on the left, do on the right.",
      affectedCount: 11,
      studentIds: ["std-04", "std-07", "std-09", "std-12", "std-15", "std-18", "std-22", "std-24", "std-25", "std-27", "std-29"],
    },
  },
  recommendedAction: {
    timeMinutes: 10,
    headline: "Spend 10 minutes reinforcing variables on both sides, then allow the ready group to progress.",
    actionSummary:
      "Conduct a brief 2-problem guided whiteboard comparison focusing on isolating variable terms before constants. Then let 18 students progress, give 8 targeted practice, and run a fresh three-question evidence check with 4 students.",
    rationale:
      "18 of 30 students demonstrated the prerequisites needed for tomorrow and do not need full-period re-teaching. Eight have enough evidence for targeted support on balancing constants; four still need a short fresh check before Cogna assigns a learning gap.",
    lessonPlan: [
      {
        phase: "Phase 1: Spot the Balance",
        durationMinutes: 3,
        activity: "Display 4x - 6 = 2x + 8 on the board. Ask students which term they want to move first and highlight the '+6' balance step in amber.",
        boardExample: "4x - 6 = 2x + 8  →  (4x - 2x) - 6 = 8  →  2x - 6 (+ 6) = 8 (+ 6)",
        teacherNote: "Emphasize: 'Balance variables first, then check the signs of the constants.'",
      },
      {
        phase: "Phase 2: Paired Quick-Check",
        durationMinutes: 4,
        activity: "Give 1 check problem: 5x + 3 = 2x + 15. Students solve in pairs on mini-whiteboards/notebooks.",
        boardExample: "5x + 3 = 2x + 15  →  3x = 12  →  x = 4",
        teacherNote: "Circulate directly to Aarav, Divya, Kabir, and Rohan during this 4-minute check.",
      },
      {
        phase: "Phase 3: Smooth Split",
        durationMinutes: 3,
        activity: "Release the 18 ready students to Extension Sheet 8.2 (Equations with Fractional Coefficients). Pull the 8 reinforcement students for one 5-minute table drill.",
        boardExample: "Ready Group: 3(x - 2) = 2(x + 4) + 1  |  Targeted Group: 3x - 4 = x + 6",
        teacherNote: "4 probe students will complete a 3-question calm check to establish baseline.",
      },
    ],
    readyGroupActivity: {
      title: "Extension 8.2: Multi-Bracket Balancing",
      description: "Equations with nested parentheses and distribution before isolating variables.",
      challengeProblem: "3(2x - 4) - 2(x + 1) = x + 14",
    },
  },
  evidenceAudit: {
    totalInteractions: 142,
    independentLinesVerified: 98,
    assistedHintsDelivered: 24,
    excludedConflictsCount: 1,
    confidenceReliability: "High (94% deterministic verifier matches)",
    evidenceLimitations: [
      "Diagnostic measures algebraic line transformation validity, not mental arithmetic speed.",
      "Post-lesson comprehension compares against pre-lesson baseline; retention decay will be tested on Day 4.",
      "1 student attempt had conflicting input (entered correct solution but toggled 'I don't know') and was completely excluded from learner gap conclusions.",
    ],
  },
  students: [
    // 18 Ready to progress
    {
      id: "std-01",
      name: "Aadya Sharma",
      rollNumber: "8A-01",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Linear brackets", "Two-step isolation", "Transfer balancing", "Sign rules"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Progress to Equations with Fractional Terms (Unit 4.2).",
      uncertaintyRating: "low",
      attempts: [
        {
          questionTitle: "Exit Check #1",
          questionPrompt: "Solve for x:  3(x + 4) = 27",
          category: "familiar",
          timeMs: 14200,
          hintsUsed: 0,
          isCorrect: true,
          steps: [
            { stepIndex: 1, prompt: "3(x + 4) = 27", previousLine: "3(x + 4) = 27", submittedLine: "3x + 12 = 27", valid: true, transformationType: "DISTRIBUTE" },
            { stepIndex: 2, prompt: "3x + 12 = 27", previousLine: "3x + 12 = 27", submittedLine: "3x = 15", valid: true, transformationType: "SUBTRACT_BOTH_SIDES" },
            { stepIndex: 3, prompt: "3x = 15", previousLine: "3x = 15", submittedLine: "x = 5", valid: true, transformationType: "DIVIDE_BOTH_SIDES" },
          ],
        },
        {
          questionTitle: "Transfer Check",
          questionPrompt: "Solve for x:  5x - 3 = 2x + 18",
          category: "transfer",
          timeMs: 22000,
          hintsUsed: 0,
          isCorrect: true,
          steps: [
            { stepIndex: 1, prompt: "5x - 3 = 2x + 18", previousLine: "5x - 3 = 2x + 18", submittedLine: "3x - 3 = 18", valid: true, transformationType: "SUBTRACT_BOTH_SIDES" },
            { stepIndex: 2, prompt: "3x - 3 = 18", previousLine: "3x - 3 = 18", submittedLine: "3x = 21", valid: true, transformationType: "ADD_BOTH_SIDES" },
            { stepIndex: 3, prompt: "3x = 21", previousLine: "3x = 21", submittedLine: "x = 7", valid: true, transformationType: "DIVIDE_BOTH_SIDES" },
          ],
        },
      ],
    },
    {
      id: "std-02",
      name: "Ananya Patel",
      rollNumber: "8A-02",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Linear brackets", "Two-step isolation", "Transfer balancing"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Progress to Unit 4.2 extension.",
      uncertaintyRating: "low",
      attempts: [
        {
          questionTitle: "Exit Check #1",
          questionPrompt: "Solve for x:  4(x - 2) = 16",
          category: "familiar",
          timeMs: 16400,
          hintsUsed: 0,
          isCorrect: true,
          steps: [
            { stepIndex: 1, prompt: "4(x - 2) = 16", previousLine: "4(x - 2) = 16", submittedLine: "4x - 8 = 16", valid: true, transformationType: "DISTRIBUTE" },
            { stepIndex: 2, prompt: "4x - 8 = 16", previousLine: "4x - 8 = 16", submittedLine: "4x = 24", valid: true, transformationType: "ADD_BOTH_SIDES" },
            { stepIndex: 3, prompt: "4x = 24", previousLine: "4x = 24", submittedLine: "x = 6", valid: true, transformationType: "DIVIDE_BOTH_SIDES" },
          ],
        },
      ],
    },
    {
      id: "std-03",
      name: "Aryan Gupta",
      rollNumber: "8A-03",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Sign arithmetic", "Variables on both sides", "Independent solving"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Progress to Unit 4.2 extension.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-05",
      name: "Bhavya Joshi",
      rollNumber: "8A-05",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Brackets expansion", "Inverse operations", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-06",
      name: "Chirag Nair",
      rollNumber: "8A-06",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Two-step equations", "Sign consistency", "Transfer check"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-08",
      name: "Esha Sen",
      rollNumber: "8A-08",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Variable balancing", "Signed distribution", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-10",
      name: "Gauri Deshmukh",
      rollNumber: "8A-10",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Two-step isolation", "Linear brackets", "Independent"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-11",
      name: "Harsh Vardhan",
      rollNumber: "8A-11",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Two-step equations", "Variables on both sides", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-13",
      name: "Ishaan Mehta",
      rollNumber: "8A-13",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Distribution", "Inverse operations", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-14",
      name: "Jhanvi Iyer",
      rollNumber: "8A-14",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Variables balancing", "Sign rules", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-16",
      name: "Karan Singhal",
      rollNumber: "8A-16",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Two-step isolation", "Linear brackets", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-17",
      name: "Lavanya Reddy",
      rollNumber: "8A-17",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Signed operations", "Variables on both sides", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-19",
      name: "Nandini Pillai",
      rollNumber: "8A-19",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: false,
      demonstratedSkills: ["Linear brackets", "Two-step equations"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for progression with standard practice.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-20",
      name: "Omkar Kulkarni",
      rollNumber: "8A-20",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Variables balancing", "Sign rules", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-21",
      name: "Prisha Bhatia",
      rollNumber: "8A-21",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Two-step equations", "Distribution", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-23",
      name: "Rhea Mukherjee",
      rollNumber: "8A-23",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Linear brackets", "Variables on both sides", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-26",
      name: "Sneha Menon",
      rollNumber: "8A-26",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Variables balancing", "Two-step isolation", "Transfer"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-30",
      name: "Zoya Khan",
      rollNumber: "8A-30",
      readiness: "ready",
      evidenceStatus: "solid",
      familiarSolved: true,
      independentSolved: true,
      transferSolved: true,
      demonstratedSkills: ["Distribution", "Signed terms", "Transfer check"],
      candidateLearningNeed: null,
      recommendedFollowUp: "Ready for next topic.",
      uncertaintyRating: "low",
      attempts: [],
    },

    // 8 Need targeted reinforcement
    {
      id: "std-04",
      name: "Aarav Choudhury",
      rollNumber: "8A-04",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Single-variable isolation", "Positive brackets"],
      candidateLearningNeed: "Balancing constant signs after moving variable term across =",
      errorPatternSummary: "4x - 6 = 2x + 8 → 2x = 2 (subtracted 8 - 6 instead of 8 + 6)",
      recommendedFollowUp: "10-minute whiteboard balancing drill with teacher.",
      uncertaintyRating: "moderate",
      attempts: [
        {
          questionTitle: "Check #2: Variables on both sides",
          questionPrompt: "Solve for x:  4x - 6 = 2x + 8",
          category: "independent",
          timeMs: 28400,
          hintsUsed: 1,
          isCorrect: false,
          steps: [
            { stepIndex: 1, prompt: "4x - 6 = 2x + 8", previousLine: "4x - 6 = 2x + 8", submittedLine: "2x - 6 = 8", valid: true, transformationType: "SUBTRACT_BOTH_SIDES" },
            {
              stepIndex: 2,
              prompt: "2x - 6 = 8",
              previousLine: "2x - 6 = 8",
              submittedLine: "2x = 2",
              valid: false,
              transformationType: "ARITHMETIC_ERROR",
              diagnosticNote: "Subtracted 6 from 8 instead of adding 6 to cancel -6.",
              errorActionCode: "SIGN_FLIP_ON_MOVE",
            },
          ],
        },
      ],
    },
    {
      id: "std-07",
      name: "Divya Kapoor",
      rollNumber: "8A-07",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Two-step equations with positive coefficients"],
      candidateLearningNeed: "Variables on both sides — combining like terms across =",
      errorPatternSummary: "5x - 4 = 2x + 11 → 7x = 15 (added variable terms instead of subtracting)",
      recommendedFollowUp: "Practice moving smaller variable term first.",
      uncertaintyRating: "low",
      attempts: [
        {
          questionTitle: "Check #2",
          questionPrompt: "Solve for x:  5x - 4 = 2x + 11",
          category: "independent",
          timeMs: 26000,
          hintsUsed: 1,
          isCorrect: false,
          steps: [
            {
              stepIndex: 1,
              prompt: "5x - 4 = 2x + 11",
              previousLine: "5x - 4 = 2x + 11",
              submittedLine: "7x - 4 = 11",
              valid: false,
              transformationType: "INVALID_COMBINE",
              diagnosticNote: "Added 2x to 5x instead of subtracting 2x from both sides.",
              errorActionCode: "INCORRECT_INVERSE_OP",
            },
          ],
        },
      ],
    },
    {
      id: "std-09",
      name: "Farhan Ali",
      rollNumber: "8A-09",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Single-variable isolation", "Basic bracket distribution"],
      candidateLearningNeed: "Sign error when transposing negative constant term",
      errorPatternSummary: "3x - 7 = x + 5 → 2x = -2 (subtracted 5 - 7)",
      recommendedFollowUp: "Review: adding the opposite to both sides.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-12",
      name: "Himanshu Rawat",
      rollNumber: "8A-12",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Two-step equations", "Positive numbers"],
      candidateLearningNeed: "Variables on both sides with negative coefficients",
      errorPatternSummary: "Stumbled on -2x term movement.",
      recommendedFollowUp: "Guided practice on negative variable terms.",
      uncertaintyRating: "moderate",
      attempts: [],
    },
    {
      id: "std-15",
      name: "Kabir Das",
      rollNumber: "8A-15",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["One-variable equations with scaffolds"],
      candidateLearningNeed: "Balancing constant signs after moving variable term across =",
      errorPatternSummary: "4x - 6 = 2x + 8 → 2x = 2",
      recommendedFollowUp: "Targeted 10-minute mini-lesson.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-18",
      name: "Manish Tiwari",
      rollNumber: "8A-18",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Positive bracket expansion"],
      candidateLearningNeed: "Variables on both sides — isolating variable before constant",
      errorPatternSummary: "Tried to divide before collecting like terms on both sides.",
      recommendedFollowUp: "Step-by-step checklist: 1. Expand 2. Collect x 3. Collect numbers 4. Divide.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-22",
      name: "Raghav Varma",
      rollNumber: "8A-22",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Basic linear equation solving"],
      candidateLearningNeed: "Sign inversion during negative term transposition",
      errorPatternSummary: "2x - 5 = x + 3 → x = -2",
      recommendedFollowUp: "Focus on balancing negative terms explicitly on both sides.",
      uncertaintyRating: "low",
      attempts: [],
    },
    {
      id: "std-24",
      name: "Rohan Sengupta",
      rollNumber: "8A-24",
      readiness: "reinforcement",
      evidenceStatus: "developing",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Bracket expansion", "Two-step isolation"],
      candidateLearningNeed: "Balancing constant signs after moving variable term across =",
      errorPatternSummary: "4x - 6 = 2x + 8 → 2x = 2",
      recommendedFollowUp: "Join the 10-minute targeted table group.",
      uncertaintyRating: "low",
      attempts: [],
    },

    // 4 Need more evidence / probe / conflict
    {
      id: "std-25",
      name: "Samaira Dixit",
      rollNumber: "8A-25",
      readiness: "probe",
      evidenceStatus: "sparse",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Familiar two-step equation with 2 hints"],
      candidateLearningNeed: "Insufficient attempts to isolate specific gap (session ended early)",
      recommendedFollowUp: "Administer 3-item quick probe before concluding gap.",
      uncertaintyRating: "high",
      attempts: [
        {
          questionTitle: "Check #1",
          questionPrompt: "Solve for x:  2(x + 3) = 14",
          category: "familiar",
          timeMs: 45000,
          hintsUsed: 2,
          isCorrect: true,
          steps: [{ stepIndex: 1, prompt: "2(x + 3) = 14", previousLine: "2(x + 3) = 14", submittedLine: "2x + 6 = 14", valid: true, transformationType: "DISTRIBUTE" }],
        },
      ],
    },
    {
      id: "std-27",
      name: "Tanvi Saxena",
      rollNumber: "8A-27",
      readiness: "probe",
      evidenceStatus: "sparse",
      familiarSolved: false,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["None recorded in current window (joined 5 mins late)"],
      candidateLearningNeed: "Only 1 question attempted — insufficient evidence for topic conclusion",
      recommendedFollowUp: "Give 5-minute standalone check during homeroom.",
      uncertaintyRating: "high",
      attempts: [],
    },
    {
      id: "std-28",
      name: "Mira Krishnan",
      rollNumber: "8A-28",
      readiness: "probe",
      evidenceStatus: "conflict",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Solved 3x + 5 = 20 correctly (x = 5)"],
      candidateLearningNeed: "Input conflict recorded — excluded from conclusions",
      recommendedFollowUp: "Brief 1-minute 1-on-1 check: Mira wrote the correct steps but clicked 'I don't know' simultaneously.",
      uncertaintyRating: "high",
      isInputConflict: true,
      conflictDetails: {
        enteredAnswer: "x = 5 (mathematically valid step line)",
        actionTaken: "Selected 'I don't know / Need assistance' button immediately before submit",
        exclusionReason:
          "Input conflict — excluded from learner conclusions. Cogna detected conflicting signal (correct working entered + help button clicked). Stored as an observational anomaly to prevent erroneous gap attribution.",
      },
      attempts: [
        {
          questionTitle: "Check #1",
          questionPrompt: "Solve for x:  3x + 5 = 20",
          category: "familiar",
          timeMs: 18000,
          hintsUsed: 0,
          isCorrect: true,
          steps: [
            { stepIndex: 1, prompt: "3x + 5 = 20", previousLine: "3x + 5 = 20", submittedLine: "3x = 15", valid: true, transformationType: "SUBTRACT_BOTH_SIDES" },
            { stepIndex: 2, prompt: "3x = 15", previousLine: "3x = 15", submittedLine: "x = 5", valid: true, transformationType: "DIVIDE_BOTH_SIDES" },
          ],
        },
      ],
    },
    {
      id: "std-29",
      name: "Yusuf Qureshi",
      rollNumber: "8A-29",
      readiness: "probe",
      evidenceStatus: "sparse",
      familiarSolved: true,
      independentSolved: false,
      transferSolved: false,
      demonstratedSkills: ["Familiar single-step"],
      candidateLearningNeed:
        "Response pattern unclear: one answer was submitted unusually quickly, then the next question received no response before the session ended. This is not evidence of a learning gap.",
      recommendedFollowUp: "Give 2 fresh standard questions before drawing any skill conclusion.",
      uncertaintyRating: "high",
      attempts: [],
    },
  ],
};
