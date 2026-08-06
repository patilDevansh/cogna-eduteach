/**
 * APPROVED content bank — Grade 8 CBSE, Linear Equations in One Variable.
 * Every question, hint and explanation here is human-reviewed. The UI must
 * only ever render content from this bank (or from the real content API,
 * which enforces the same APPROVED gate). Never render LLM-generated math.
 */

export type ConceptId =
  | "C1_BALANCE"
  | "C2_SIGN_HANDLING"
  | "C3_DISTRIBUTION"
  | "C4_ISOLATION";

/** Human-friendly concept labels. Raw conceptIds must never reach a human. */
export const CONCEPT_LABELS: Record<ConceptId, string> = {
  C1_BALANCE: "Keeping both sides of an equation balanced",
  C2_SIGN_HANDLING: "Handling plus and minus signs when moving terms",
  C3_DISTRIBUTION: "Multiplying across brackets",
  C4_ISOLATION: "Getting x by itself",
};

/** Short student-facing labels for the same concepts. */
export const CONCEPT_LABELS_STUDENT: Record<ConceptId, string> = {
  C1_BALANCE: "Balancing both sides",
  C2_SIGN_HANDLING: "Plus and minus signs",
  C3_DISTRIBUTION: "Opening brackets",
  C4_ISOLATION: "Getting x on its own",
};

export interface ApprovedQuestion {
  id: string;
  prompt: string; // rendered in the math face
  answer: number;
  conceptId: ConceptId;
  difficulty: 1 | 2 | 3;
  hints: string[]; // progressive ladder — never contains the final answer
  explanation: { title: string; steps: string[] };
}

export const QUESTION_BANK: ApprovedQuestion[] = [
  {
    id: "q_add_01",
    prompt: "x + 7 = 12",
    answer: 5,
    conceptId: "C1_BALANCE",
    difficulty: 1,
    hints: [
      "What could you take away from both sides to leave x alone?",
      "Subtract 7 from both sides. What is left on each side?",
    ],
    explanation: {
      title: "Undo the +7 on both sides",
      steps: [
        "We want x by itself on the left.",
        "x has +7 with it, so subtract 7 from both sides: x + 7 − 7 = 12 − 7.",
        "The left side becomes just x. The right side becomes 5.",
        "So x = 5. Check: 5 + 7 = 12 ✓",
      ],
    },
  },
  {
    id: "q_sub_01",
    prompt: "x − 9 = 4",
    answer: 13,
    conceptId: "C2_SIGN_HANDLING",
    difficulty: 1,
    hints: [
      "x has 9 taken away from it. What would undo that?",
      "Add 9 to both sides and see what x equals.",
    ],
    explanation: {
      title: "Undo the −9 by adding 9",
      steps: [
        "x − 9 means 9 has been subtracted from x.",
        "To undo subtraction, add 9 to both sides: x − 9 + 9 = 4 + 9.",
        "The left side is just x, and 4 + 9 = 13.",
        "So x = 13. Check: 13 − 9 = 4 ✓",
      ],
    },
  },
  {
    id: "q_mul_01",
    prompt: "3x = 21",
    answer: 7,
    conceptId: "C4_ISOLATION",
    difficulty: 1,
    hints: [
      "3x means 3 times x. What undoes multiplying by 3?",
      "Divide both sides by 3.",
    ],
    explanation: {
      title: "Divide both sides by 3",
      steps: [
        "3x means 3 × x, so x has been multiplied by 3.",
        "To undo that, divide both sides by 3: 3x ÷ 3 = 21 ÷ 3.",
        "The left side is x, and 21 ÷ 3 = 7.",
        "So x = 7. Check: 3 × 7 = 21 ✓",
      ],
    },
  },
  {
    id: "q_div_01",
    prompt: "x ÷ 4 = 6",
    answer: 24,
    conceptId: "C4_ISOLATION",
    difficulty: 1,
    hints: [
      "x has been divided by 4. What undoes dividing?",
      "Multiply both sides by 4.",
    ],
    explanation: {
      title: "Multiply both sides by 4",
      steps: [
        "x ÷ 4 means x has been split into 4 equal parts.",
        "To undo dividing, multiply both sides by 4: (x ÷ 4) × 4 = 6 × 4.",
        "The left side is x, and 6 × 4 = 24.",
        "So x = 24. Check: 24 ÷ 4 = 6 ✓",
      ],
    },
  },
  {
    id: "q_twostep_01",
    prompt: "2x + 5 = 17",
    answer: 6,
    conceptId: "C1_BALANCE",
    difficulty: 2,
    hints: [
      "Two things are happening to x. Which one should you undo first?",
      "Subtract 5 from both sides first. What equation do you get?",
      "Now you have 2x = 12. One more step.",
    ],
    explanation: {
      title: "Undo the +5, then the ×2",
      steps: [
        "x is multiplied by 2, then 5 is added. Undo in reverse order.",
        "Subtract 5 from both sides: 2x + 5 − 5 = 17 − 5, so 2x = 12.",
        "Divide both sides by 2: x = 6.",
        "Check: 2 × 6 + 5 = 12 + 5 = 17 ✓",
      ],
    },
  },
  {
    id: "q_twostep_02",
    prompt: "4x − 3 = 13",
    answer: 4,
    conceptId: "C2_SIGN_HANDLING",
    difficulty: 2,
    hints: [
      "First deal with the −3. What undoes subtracting 3?",
      "Add 3 to both sides. Then what is 4x equal to?",
      "4x = 16 — one more step to get x alone.",
    ],
    explanation: {
      title: "Add 3 first, then divide by 4",
      steps: [
        "Add 3 to both sides: 4x − 3 + 3 = 13 + 3, so 4x = 16.",
        "Divide both sides by 4: x = 4.",
        "Check: 4 × 4 − 3 = 16 − 3 = 13 ✓",
      ],
    },
  },
  {
    id: "q_neg_01",
    prompt: "7 − x = 2",
    answer: 5,
    conceptId: "C2_SIGN_HANDLING",
    difficulty: 2,
    hints: [
      "Careful — here x is being subtracted from 7, not the other way round.",
      "Try adding x to both sides so x becomes positive: 7 = 2 + x.",
      "Now 7 = 2 + x. What must x be?",
    ],
    explanation: {
      title: "Make x positive first",
      steps: [
        "In 7 − x, the x is being taken away, so its sign is negative.",
        "Add x to both sides: 7 − x + x = 2 + x, which gives 7 = 2 + x.",
        "Subtract 2 from both sides: 5 = x.",
        "So x = 5. Check: 7 − 5 = 2 ✓",
      ],
    },
  },
  {
    id: "q_bothsides_01",
    prompt: "5x + 2 = 3x + 10",
    answer: 4,
    conceptId: "C2_SIGN_HANDLING",
    difficulty: 3,
    hints: [
      "There is x on both sides. Try collecting the x terms on one side first.",
      "Subtract 3x from both sides. What does the equation become?",
      "You should now have 2x + 2 = 10. Two small steps left.",
    ],
    explanation: {
      title: "Collect the x terms, then solve",
      steps: [
        "Subtract 3x from both sides: 5x − 3x + 2 = 10, so 2x + 2 = 10.",
        "Subtract 2 from both sides: 2x = 8.",
        "Divide both sides by 2: x = 4.",
        "Check: left 5×4+2 = 22, right 3×4+10 = 22 ✓",
      ],
    },
  },
  {
    id: "q_brackets_01",
    prompt: "2(x + 3) = 14",
    answer: 4,
    conceptId: "C3_DISTRIBUTION",
    difficulty: 2,
    hints: [
      "The 2 multiplies everything inside the brackets.",
      "Open the brackets: 2 × x and 2 × 3. What equation do you get?",
      "Now solve 2x + 6 = 14.",
    ],
    explanation: {
      title: "Open the brackets first",
      steps: [
        "2(x + 3) means 2 × x plus 2 × 3, so the equation is 2x + 6 = 14.",
        "Subtract 6 from both sides: 2x = 8.",
        "Divide both sides by 2: x = 4.",
        "Check: 2 × (4 + 3) = 2 × 7 = 14 ✓",
      ],
    },
  },
  {
    id: "q_brackets_02",
    prompt: "3(x − 2) = x + 8",
    answer: 7,
    conceptId: "C3_DISTRIBUTION",
    difficulty: 3,
    hints: [
      "Open the brackets first — the 3 multiplies both x and −2.",
      "That gives 3x − 6 = x + 8. Now collect the x terms on one side.",
      "Subtract x from both sides, then deal with the −6.",
    ],
    explanation: {
      title: "Open brackets, collect x terms",
      steps: [
        "3(x − 2) = 3x − 6, so the equation is 3x − 6 = x + 8.",
        "Subtract x from both sides: 2x − 6 = 8.",
        "Add 6 to both sides: 2x = 14.",
        "Divide by 2: x = 7. Check: 3 × (7 − 2) = 15 and 7 + 8 = 15 ✓",
      ],
    },
  },
];

/** Baseline uses a fixed, gentle set covering each concept once-ish. */
export const BASELINE_IDS = [
  "q_add_01",
  "q_mul_01",
  "q_sub_01",
  "q_twostep_01",
  "q_brackets_01",
];

export function getQuestion(id: string): ApprovedQuestion {
  const q = QUESTION_BANK.find((q) => q.id === id);
  if (!q) throw new Error(`Unknown approved question: ${id}`);
  return q;
}
