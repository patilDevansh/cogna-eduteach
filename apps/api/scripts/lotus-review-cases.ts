/**
 * Step 2 cases (Cogna Project Hub, "Testing"): wrong answers sent straight to
 * Lotus's four-call AI review, to see what the AI says went wrong.
 *
 * NCERT cases: the errors in NCERT Class 8 Mathematics, Factorisation,
 * Exercise 14.4 "Find and correct the errors" (the CBSE textbook's own list).
 * The cause is the one the textbook's correction implies.
 *
 * MESSY cases: written by Claude for this test (not independent). They model
 * how real children answer: slips, guesses, copying mistakes, working in
 * words, unreadable answers, and a lucky right answer with wrong working.
 *
 * expectedSkills: the Lotus skill(s) the AI's first wrong step should land on.
 * nature: what a careful teacher would call it. SLIP / GUESS / NO_EVIDENCE /
 * FORMAT should not become evidence of a real gap.
 */
export type CaseNature = "CONCEPT" | "SLIP" | "GUESS" | "NO_EVIDENCE" | "FORMAT" | "LUCKY_CORRECT";

export interface ReviewCase {
  id: string;
  set: "NCERT" | "MESSY";
  source: string;
  prompt: string;
  itemKind: "FACTORISE" | "EXPAND" | "SIMPLIFY";
  expression: string;
  canonicalAnswer: string;
  workedSolution: string[];
  stepSkills: string[];
  skillId: string;
  answer: string;
  working: string;
  expectedSkills: string[];
  nature: CaseNature;
  cause: string;
}

const NCERT = "NCERT Class 8 Mathematics, Ch. 14 Factorisation, Exercise 14.4";

export const REVIEW_CASES: ReviewCase[] = [
  // ---------- NCERT Exercise 14.4 ----------
  { id: "N01", set: "NCERT", source: `${NCERT}, Q1`, prompt: "Expand: 4(x - 5)", itemKind: "EXPAND", expression: "4(x - 5)", canonicalAnswer: "4x - 20",
    workedSolution: ["4 × x = 4x", "4 × (-5) = -20", "4x - 20"], stepSkills: ["EXP_EXPAND_SINGLE", "EXP_EXPAND_SINGLE", "EXP_EXPAND_SINGLE"], skillId: "EXP_EXPAND_SINGLE",
    answer: "4x - 5", working: "4 times x = 4x\nthen -5", expectedSkills: ["EXP_EXPAND_SINGLE"], nature: "CONCEPT", cause: "Multiplied only the first term inside the bracket." },
  { id: "N02", set: "NCERT", source: `${NCERT}, Q2`, prompt: "Expand: x(3x + 2)", itemKind: "EXPAND", expression: "x(3x + 2)", canonicalAnswer: "3x^2 + 2x",
    workedSolution: ["x × 3x = 3x^2", "x × 2 = 2x", "3x^2 + 2x"], stepSkills: ["EXP_EXPAND_SINGLE", "EXP_EXPAND_SINGLE", "EXP_EXPAND_SINGLE"], skillId: "EXP_EXPAND_SINGLE",
    answer: "3x^2 + 2", working: "x times 3x = 3x^2\n+ 2", expectedSkills: ["EXP_EXPAND_SINGLE"], nature: "CONCEPT", cause: "Multiplied only the first term inside the bracket." },
  { id: "N11", set: "NCERT", source: `${NCERT}, Q11`, prompt: "Expand: (y - 3)^2", itemKind: "EXPAND", expression: "(y - 3)^2", canonicalAnswer: "y^2 - 6y + 9",
    workedSolution: ["(y - 3)^2 = (y - 3)(y - 3)", "y^2 - 3y - 3y + 9", "y^2 - 6y + 9"], stepSkills: ["ID_SQUARE_DIFF", "EXP_EXPAND_BINOMIALS", "ID_SQUARE_DIFF"], skillId: "ID_SQUARE_DIFF",
    answer: "y^2 - 9", working: "square y and square 3\ny^2 - 9", expectedSkills: ["ID_SQUARE_DIFF", "EXP_EXPAND_BINOMIALS"], nature: "CONCEPT", cause: "Squared each term separately; missed the middle term." },
  { id: "N12", set: "NCERT", source: `${NCERT}, Q12`, prompt: "Expand: (z + 5)^2", itemKind: "EXPAND", expression: "(z + 5)^2", canonicalAnswer: "z^2 + 10z + 25",
    workedSolution: ["(z + 5)^2 = (z + 5)(z + 5)", "z^2 + 5z + 5z + 25", "z^2 + 10z + 25"], stepSkills: ["ID_SQUARE_DIFF", "EXP_EXPAND_BINOMIALS", "ID_SQUARE_DIFF"], skillId: "ID_SQUARE_DIFF",
    answer: "z^2 + 25", working: "z^2 + 5^2 = z^2 + 25", expectedSkills: ["ID_SQUARE_DIFF", "EXP_EXPAND_BINOMIALS"], nature: "CONCEPT", cause: "Squared each term separately; missed the middle term." },
  { id: "N13", set: "NCERT", source: `${NCERT}, Q13`, prompt: "Expand: (2a + 3b)(a - b)", itemKind: "EXPAND", expression: "(2a + 3b)(a - b)", canonicalAnswer: "2a^2 + ab - 3b^2",
    workedSolution: ["2a·a + 2a·(-b) + 3b·a + 3b·(-b)", "2a^2 - 2ab + 3ab - 3b^2", "2a^2 + ab - 3b^2"], stepSkills: ["EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS"], skillId: "EXP_EXPAND_BINOMIALS",
    answer: "2a^2 - 3b^2", working: "first times first = 2a^2, last times last = -3b^2", expectedSkills: ["EXP_EXPAND_BINOMIALS"], nature: "CONCEPT", cause: "Multiplied first terms and last terms only; missed the cross terms." },
  { id: "N14", set: "NCERT", source: `${NCERT}, Q14`, prompt: "Expand: (a + 4)(a + 2)", itemKind: "EXPAND", expression: "(a + 4)(a + 2)", canonicalAnswer: "a^2 + 6a + 8",
    workedSolution: ["a·a + a·2 + 4·a + 4·2", "a^2 + 2a + 4a + 8", "a^2 + 6a + 8"], stepSkills: ["EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS"], skillId: "EXP_EXPAND_BINOMIALS",
    answer: "a^2 + 8", working: "a × a = a^2, 4 × 2 = 8", expectedSkills: ["EXP_EXPAND_BINOMIALS"], nature: "CONCEPT", cause: "Multiplied first terms and last terms only; missed the cross terms." },
  { id: "N15", set: "NCERT", source: `${NCERT}, Q15`, prompt: "Expand: (a - 4)(a - 2)", itemKind: "EXPAND", expression: "(a - 4)(a - 2)", canonicalAnswer: "a^2 - 6a + 8",
    workedSolution: ["a·a + a·(-2) + (-4)·a + (-4)(-2)", "a^2 - 2a - 4a + 8", "a^2 - 6a + 8"], stepSkills: ["EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS"], skillId: "EXP_EXPAND_BINOMIALS",
    answer: "a^2 - 8", working: "a^2 and 4 × 2 = 8 with a minus", expectedSkills: ["EXP_EXPAND_BINOMIALS", "FND_SIGN_MUL_DIV"], nature: "CONCEPT", cause: "Missed the cross terms, and (-4)(-2) gives +8, not -8." },
  { id: "N20", set: "NCERT", source: `${NCERT}, Q20`, prompt: "Simplify: (4x + 5)/(4x)", itemKind: "SIMPLIFY", expression: "(4x + 5)/(4x)", canonicalAnswer: "1 + 5/(4x)",
    workedSolution: ["(4x + 5)/(4x) = 4x/(4x) + 5/(4x)", "1 + 5/(4x)"], stepSkills: ["FAC_CANCEL_COMMON_FACTOR", "FAC_CANCEL_COMMON_FACTOR"], skillId: "FAC_CANCEL_COMMON_FACTOR",
    answer: "5", working: "cross out the 4x on top and bottom, left with 5", expectedSkills: ["FAC_CANCEL_COMMON_FACTOR"], nature: "CONCEPT", cause: "Cancelled a term, not a factor." },
  { id: "N21", set: "NCERT", source: `${NCERT}, Q21`, prompt: "Simplify: (7x + 5)/5", itemKind: "SIMPLIFY", expression: "(7x + 5)/5", canonicalAnswer: "7x/5 + 1",
    workedSolution: ["(7x + 5)/5 = 7x/5 + 5/5", "7x/5 + 1"], stepSkills: ["FAC_CANCEL_COMMON_FACTOR", "FAC_CANCEL_COMMON_FACTOR"], skillId: "FAC_CANCEL_COMMON_FACTOR",
    answer: "7x", working: "the 5s cancel", expectedSkills: ["FAC_CANCEL_COMMON_FACTOR"], nature: "CONCEPT", cause: "Cancelled a term, not a factor." },

  // ---------- Messy answers (written for this test) ----------
  { id: "M01", set: "MESSY", source: "Written for this test: copying slip", prompt: "Factorise completely: x^2 - 9x + 20", itemKind: "FACTORISE", expression: "x^2 - 9x + 20", canonicalAnswer: "(x - 4)(x - 5)",
    workedSolution: ["Find two numbers: product 20, sum -9: -4 and -5", "(x - 4)(x - 5)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "(x - 4)(x + 5)", working: "-4 × -5 = 20, -4 + -5 = -9\nso (x - 4)(x + 5)", expectedSkills: ["FAC_MONIC_TRINOMIAL"], nature: "SLIP", cause: "Found the right pair, then miscopied one sign." },
  { id: "M02", set: "MESSY", source: "Written for this test: common factor not highest", prompt: "Factorise completely: 12x + 18", itemKind: "FACTORISE", expression: "12x + 18", canonicalAnswer: "6(2x + 3)",
    workedSolution: ["HCF of 12 and 18 is 6", "12x ÷ 6 = 2x, 18 ÷ 6 = 3", "6(2x + 3)"], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS", "FAC_COMMON_MONOMIAL"], skillId: "FAC_GCF_NUMERIC",
    answer: "3(4x + 6)", working: "both divide by 3", expectedSkills: ["FAC_GCF_NUMERIC"], nature: "CONCEPT", cause: "Took out a common factor, but not the highest." },
  { id: "M03", set: "MESSY", source: "Written for this test: negative common factor", prompt: "Factorise completely: -6x - 15", itemKind: "FACTORISE", expression: "-6x - 15", canonicalAnswer: "-3(2x + 5)",
    workedSolution: ["Take out -3", "-6x ÷ -3 = 2x, -15 ÷ -3 = 5", "-3(2x + 5)"], stepSkills: ["FAC_GCF_NEGATIVE", "FND_SIGN_MUL_DIV", "FAC_GCF_NEGATIVE"], skillId: "FAC_GCF_NEGATIVE",
    answer: "-3(2x - 5)", working: "take out -3\n-6x/-3 = 2x\n-15 stays -5", expectedSkills: ["FND_SIGN_MUL_DIV", "FAC_GCF_NEGATIVE"], nature: "CONCEPT", cause: "Didn't change the sign of the second term when dividing by -3." },
  { id: "M04", set: "MESSY", source: "Written for this test: difference of squares as a perfect square", prompt: "Factorise completely: x^2 - 16", itemKind: "FACTORISE", expression: "x^2 - 16", canonicalAnswer: "(x - 4)(x + 4)",
    workedSolution: ["x^2 - 16 = x^2 - 4^2", "(x - 4)(x + 4)"], stepSkills: ["ID_REVERSE_PATTERN", "FAC_DIFF_SQUARES"], skillId: "FAC_DIFF_SQUARES",
    answer: "(x - 4)^2", working: "16 is 4 squared so (x-4)^2", expectedSkills: ["FAC_DIFF_SQUARES", "ID_REVERSE_PATTERN"], nature: "CONCEPT", cause: "Treated a difference of squares as a perfect square." },
  { id: "M06", set: "MESSY", source: "Written for this test: guess", prompt: "Factorise completely: x^2 + 7x + 12", itemKind: "FACTORISE", expression: "x^2 + 7x + 12", canonicalAnswer: "(x + 3)(x + 4)",
    workedSolution: ["Find two numbers: product 12, sum 7: 3 and 4", "(x + 3)(x + 4)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "x + 5", working: "idk", expectedSkills: [], nature: "GUESS", cause: "A guess with no method shown." },
  { id: "M07", set: "MESSY", source: "Written for this test: working in words, product only", prompt: "Factorise completely: x^2 + 7x + 12", itemKind: "FACTORISE", expression: "x^2 + 7x + 12", canonicalAnswer: "(x + 3)(x + 4)",
    workedSolution: ["Find two numbers: product 12, sum 7: 3 and 4", "(x + 3)(x + 4)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "(x + 2)(x + 6)", working: "i need two numbers that times to 12. 2 and 6 times to 12", expectedSkills: ["FAC_PAIR_PRODUCT_SUM"], nature: "CONCEPT", cause: "Checked the product but not the sum." },
  { id: "M08", set: "MESSY", source: "Written for this test: signs swapped", prompt: "Factorise completely: x^2 - x - 12", itemKind: "FACTORISE", expression: "x^2 - x - 12", canonicalAnswer: "(x - 4)(x + 3)",
    workedSolution: ["Find two numbers: product -12, sum -1: -4 and 3", "(x - 4)(x + 3)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "(x + 4)(x - 3)", working: "4 and 3, one is minus", expectedSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], nature: "CONCEPT", cause: "Right numbers, wrong signs: the pair sums to +1, not -1." },
  { id: "M09", set: "MESSY", source: "Written for this test: grouping with a minus", prompt: "Factorise completely: 6xy - 4y - 9x + 6", itemKind: "FACTORISE", expression: "6xy - 4y - 9x + 6", canonicalAnswer: "(3x - 2)(2y - 3)",
    workedSolution: ["2y(3x - 2) - 3(3x - 2)", "(3x - 2)(2y - 3)"], stepSkills: ["FAC_GROUP_SIGN", "FAC_COMMON_BINOMIAL"], skillId: "FAC_GROUP_SIGN",
    answer: "(3x - 2)(2y + 3)", working: "2y(3x - 2) + 3(3x - 2)", expectedSkills: ["FAC_GROUP_SIGN"], nature: "CONCEPT", cause: "Took out +3 instead of -3 from the second pair." },
  { id: "M10", set: "MESSY", source: "Written for this test: stopped early", prompt: "Factorise completely: 2x^2 + 10x + 12", itemKind: "FACTORISE", expression: "2x^2 + 10x + 12", canonicalAnswer: "2(x + 2)(x + 3)",
    workedSolution: ["Take out 2: 2(x^2 + 5x + 6)", "x^2 + 5x + 6 = (x + 2)(x + 3)", "2(x + 2)(x + 3)"], stepSkills: ["FAC_COMMON_MONOMIAL", "FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY"], skillId: "FAC_FACTOR_FULLY",
    answer: "2(x^2 + 5x + 6)", working: "take out 2", expectedSkills: ["FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY"], nature: "CONCEPT", cause: "Took out the common factor but didn't factorise the bracket." },
  { id: "M11", set: "MESSY", source: "Written for this test: divided the first term only", prompt: "Factorise completely: 6x + 9", itemKind: "FACTORISE", expression: "6x + 9", canonicalAnswer: "3(2x + 3)",
    workedSolution: ["HCF of 6 and 9 is 3", "6x ÷ 3 = 2x, 9 ÷ 3 = 3", "3(2x + 3)"], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS", "FAC_COMMON_MONOMIAL"], skillId: "FAC_DIVIDE_TERMS",
    answer: "3(2x + 9)", working: "3 goes into 6x, 2x\nthen + 9", expectedSkills: ["FAC_DIVIDE_TERMS"], nature: "CONCEPT", cause: "Divided only the first term by the common factor." },
  { id: "M12", set: "MESSY", source: "Written for this test: unreadable typing", prompt: "Factorise completely: x^2 - 9x + 20", itemKind: "FACTORISE", expression: "x^2 - 9x + 20", canonicalAnswer: "(x - 4)(x - 5)",
    workedSolution: ["Find two numbers: product 20, sum -9: -4 and -5", "(x - 4)(x - 5)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "(x-4(x-5", working: "-4 -5", expectedSkills: [], nature: "FORMAT", cause: "Right idea, brackets not closed: a typing problem, not a gap." },
  { id: "M13", set: "MESSY", source: "Written for this test: wrong bracket cancelled", prompt: "Simplify: (x^2 - 9)/(x - 3)", itemKind: "SIMPLIFY", expression: "(x^2 - 9)/(x - 3)", canonicalAnswer: "x + 3",
    workedSolution: ["x^2 - 9 = (x - 3)(x + 3)", "(x - 3)(x + 3)/(x - 3) = x + 3"], stepSkills: ["FAC_DIFF_SQUARES", "FAC_CANCEL_COMMON_FACTOR"], skillId: "FAC_CANCEL_COMMON_FACTOR",
    answer: "x - 3", working: "(x-3)(x+3) over (x-3)", expectedSkills: ["FAC_CANCEL_COMMON_FACTOR"], nature: "SLIP", cause: "Factorised correctly, then kept the wrong bracket." },
  { id: "M14", set: "MESSY", source: "Written for this test: perfect square sign", prompt: "Factorise completely: 4y^2 - 12y + 9", itemKind: "FACTORISE", expression: "4y^2 - 12y + 9", canonicalAnswer: "(2y - 3)^2",
    workedSolution: ["4y^2 = (2y)^2, 9 = 3^2, 12y = 2 × 2y × 3", "(2y - 3)^2"], stepSkills: ["ID_REVERSE_PATTERN", "FAC_PERFECT_SQUARE_MINUS"], skillId: "FAC_PERFECT_SQUARE_MINUS",
    answer: "(2y + 3)^2", working: "2y squared and 3 squared", expectedSkills: ["FAC_PERFECT_SQUARE_MINUS"], nature: "CONCEPT", cause: "Ignored the minus on the middle term." },
  { id: "M15", set: "MESSY", source: "Written for this test: lucky right answer, wrong working", prompt: "Factorise completely: x^2 - 9x + 20", itemKind: "FACTORISE", expression: "x^2 - 9x + 20", canonicalAnswer: "(x - 4)(x - 5)",
    workedSolution: ["Find two numbers: product 20, sum -9: -4 and -5", "(x - 4)(x - 5)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "(x - 4)(x - 5)", working: "4 + 5 = 20 and 4 × 5 = 9", expectedSkills: ["FAC_PAIR_PRODUCT_SUM"], nature: "LUCKY_CORRECT", cause: "Right answer, but the working swaps product and sum." },
  { id: "M16", set: "MESSY", source: "Written for this test: no attempt", prompt: "Factorise completely: x^2 + 7x + 12", itemKind: "FACTORISE", expression: "x^2 + 7x + 12", canonicalAnswer: "(x + 3)(x + 4)",
    workedSolution: ["Find two numbers: product 12, sum 7: 3 and 4", "(x + 3)(x + 4)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "?", working: "", expectedSkills: [], nature: "NO_EVIDENCE", cause: "No attempt." },
  { id: "M17", set: "MESSY", source: "Written for this test: common bracket repeated", prompt: "Factorise completely: 3(x - 2) + y(x - 2)", itemKind: "FACTORISE", expression: "3(x - 2) + y(x - 2)", canonicalAnswer: "(x - 2)(y + 3)",
    workedSolution: ["(x - 2) is common to both terms", "(x - 2)(3 + y)"], stepSkills: ["FAC_COMMON_BINOMIAL", "FAC_COMMON_BINOMIAL"], skillId: "FAC_COMMON_BINOMIAL",
    answer: "(3 + y)(x - 2)(x - 2)", working: "take out (x-2) from each", expectedSkills: ["FAC_COMMON_BINOMIAL"], nature: "CONCEPT", cause: "Took the common bracket out once for each term." },
  { id: "M18", set: "MESSY", source: "Written for this test: lowest power missed", prompt: "Factorise completely: 10x^2 - 18x^3 + 14x^4", itemKind: "FACTORISE", expression: "10x^2 - 18x^3 + 14x^4", canonicalAnswer: "2x^2(5 - 9x + 7x^2)",
    workedSolution: ["HCF of 10, 18, 14 is 2; lowest power of x is x^2", "Take out 2x^2", "2x^2(5 - 9x + 7x^2)"], stepSkills: ["FND_MIN_EXP_COMMON", "FAC_COMMON_MONOMIAL", "FAC_DIVIDE_TERMS"], skillId: "FAC_COMMON_MONOMIAL",
    answer: "2x(5x - 9x^2 + 7x^3)", working: "2 and x are common", expectedSkills: ["FND_MIN_EXP_COMMON", "FAC_COMMON_MONOMIAL"], nature: "CONCEPT", cause: "Took out x instead of x^2." },
  { id: "M19", set: "MESSY", source: "Written for this test: arithmetic slip", prompt: "Factorise completely: x^2 + 13x + 42", itemKind: "FACTORISE", expression: "x^2 + 13x + 42", canonicalAnswer: "(x + 6)(x + 7)",
    workedSolution: ["Find two numbers: product 42, sum 13: 6 and 7", "(x + 6)(x + 7)"], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], skillId: "FAC_MONIC_TRINOMIAL",
    answer: "(x + 6)(x + 8)", working: "6 × 7 = 42, 6 + 7 = 13\n(x + 6)(x + 8)", expectedSkills: ["FAC_MONIC_TRINOMIAL"], nature: "SLIP", cause: "Found 6 and 7, then wrote 8." },
];
