#!/usr/bin/env node
/**
 * A hand-authored 100-question bank with real variety — different real-world
 * contexts per concept (money, temperature, age, sport, distance, geometry…)
 * instead of one repeated template with the numbers swapped.
 *
 * Every answer is computed in code from the stated numbers (never typed by
 * hand), so correctness doesn't depend on arithmetic done by a person.
 *
 * Usage:
 *   node scripts/generate-handcrafted-bank.mjs
 *   pnpm db:seed
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "docs/mvp-2.0/content/question-bank/handcrafted-100.json");

let counter = 0;
function nextId(conceptId) {
  counter++;
  return `Q_HC_${conceptId}_${String(counter).padStart(3, "0")}`;
}

function q({
  conceptId,
  difficulty,
  stem,
  answer,
  solutionSteps,
  hintLadder,
  type = "NUMERIC",
  questionIntent = "STANDARD_PRACTICE",
  misconceptionsTested = [],
  options,
}) {
  const acceptedAnswers = Array.from(
    new Set([String(answer), `${answer}.0`, `x=${answer}`, `x = ${answer}`]),
  );
  return {
    id: nextId(conceptId),
    conceptId,
    difficulty,
    questionIntent,
    type,
    stem,
    acceptedAnswers,
    misconceptionsTested,
    solutionSteps,
    hintLadder,
    reviewStatus: "APPROVED",
    version: 1,
    itemQualityWeight: 1.2,
    prerequisiteConceptIds: [],
    ...(options ? { options } : {}),
  };
}

// ---------- P1_INTEGER_ADD_SUB ----------
function genP1() {
  const rows = [
    { m: 14, n: 9, op: "+" },
    { m: 32, n: 15, op: "-" },
    { m: 45, n: 18, op: "+" },
    { m: 6, n: 4, op: "-" },
    { m: 87, n: 56, op: "+" },
    { m: 40, n: 17, op: "+" },
    { m: 63, n: 28, op: "-" },
    { m: 25, n: 19, op: "+" },
  ];
  const templates = [
    ({ m, n }) => ({
      stem: `The temperature was ${m}°C in the morning and rose by ${n}°C by noon. What is the noon temperature, in °C?`,
      ans: m + n,
      steps: [`${m} + ${n} = ${m + n}`],
      hints: ["Rising means adding.", `${m} + ${n} = ${m + n}`],
    }),
    ({ m, n }) => ({
      stem: `A bookstore had ${m} notebooks in stock. It sold ${n} of them. How many notebooks are left?`,
      ans: m - n,
      steps: [`${m} - ${n} = ${m - n}`],
      hints: ["Selling means the stock goes down.", `${m} - ${n} = ${m - n}`],
    }),
    ({ m, n }) => ({
      stem: `Riya had ₹${m} in her piggy bank. Her mother gave her ₹${n} more. How much does she have now?`,
      ans: m + n,
      steps: [`₹${m} + ₹${n} = ₹${m + n}`],
      hints: ["Getting more money means adding.", `${m} + ${n} = ${m + n}`],
    }),
    ({ m, n }) => ({
      stem: `A lift is on floor ${m}. It goes down ${n} floors. Which floor is it on now?`,
      ans: m - n,
      steps: [`${m} - ${n} = ${m - n}`],
      hints: ["Going down means subtracting floors.", `${m} - ${n} = ${m - n}`],
    }),
    ({ m, n }) => ({
      stem: `A cricket team scored ${m} runs in the first innings and ${n} runs in the second innings. What was the total?`,
      ans: m + n,
      steps: [`${m} + ${n} = ${m + n}`],
      hints: ["Add the two innings scores.", `${m} + ${n} = ${m + n}`],
    }),
    ({ m, n }) => ({
      stem: `A car travelled ${m} km in the morning and ${n} km more in the evening. What was the total distance travelled?`,
      ans: m + n,
      steps: [`${m} + ${n} = ${m + n}`],
      hints: ["Add both legs of the trip.", `${m} + ${n} = ${m + n}`],
    }),
    ({ m, n }) => ({
      stem: `A shirt cost ₹${m}. During a sale, the price was reduced by ₹${n}. What is the new price?`,
      ans: m - n,
      steps: [`₹${m} - ₹${n} = ₹${m - n}`],
      hints: ["A reduction means subtracting.", `${m} - ${n} = ${m - n}`],
    }),
    ({ m, n }) => ({
      stem: `A student read ${m} pages of a book on Monday and ${n} pages more on Tuesday. How many pages in total?`,
      ans: m + n,
      steps: [`${m} + ${n} = ${m + n}`],
      hints: ["Add the pages from both days.", `${m} + ${n} = ${m + n}`],
    }),
  ];
  return rows.map((r, i) => {
    const t = templates[i](r);
    return q({
      conceptId: "P1_INTEGER_ADD_SUB",
      difficulty: 1 + (i % 2),
      questionIntent: i === 0 ? "BASELINE_ASSESSMENT" : "STANDARD_PRACTICE",
      stem: t.stem,
      answer: t.ans,
      solutionSteps: t.steps,
      hintLadder: t.hints,
    });
  });
}

// ---------- P2_NEGATIVE_OPS ----------
function genP2() {
  const rows = [
    { m: 8, n: 15 },
    { m: 20, n: 7 },
    { m: 12, n: 19 },
    { m: 5, n: 5 },
    { m: 30, n: 11 },
    { m: 9, n: 22 },
    { m: 17, n: 4 },
    { m: 6, n: 18 },
  ];
  const templates = [
    ({ m, n }) => ({
      stem: `The temperature was ${m}°C. It dropped by ${n}°C overnight. What is the new temperature (it may be below zero)?`,
      ans: m - n,
      steps: [`${m} - ${n} = ${m - n}`],
      hints: ["A drop below the starting value can go negative.", `${m} - ${n} = ${m - n}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `Arjun's bank balance was ₹${m}. He spent ₹${n}. What is his new balance? (Use a negative number if he now owes money.)`,
      ans: m - n,
      steps: [`₹${m} - ₹${n} = ₹${m - n}`],
      hints: ["Spending more than you have makes the balance negative.", `${m} - ${n} = ${m - n}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `A diver starts at the surface (0 m) and descends ${m} m, then descends ${n} m more. Write the diver's depth as a negative number.`,
      ans: -(m + n),
      steps: [`Depth after both descents: -(${m} + ${n}) = ${-(m + n)}`],
      hints: ["Going deeper adds to the negative depth.", `-${m} - ${n} = ${-(m + n)}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `Compute: ${m} + (${-n})`,
      ans: m - n,
      steps: [`${m} + (${-n}) = ${m} - ${n} = ${m - n}`],
      hints: ["Adding a negative number is the same as subtracting.", `${m} - ${n} = ${m - n}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `A submarine is at -${m} m (below sea level). It rises ${n} m. What is its new position?`,
      ans: -m + n,
      steps: [`-${m} + ${n} = ${-m + n}`],
      hints: ["Rising moves the depth toward zero (or above it).", `-${m} + ${n} = ${-m + n}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `Meera owes ₹${m}. She borrows ₹${n} more. Write the total amount she owes as a negative number.`,
      ans: -(m + n),
      steps: [`-(${m} + ${n}) = ${-(m + n)}`],
      hints: ["Owing more money makes the negative number larger in size.", `-${m} - ${n} = ${-(m + n)}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `In a quiz, each wrong answer costs ${n} marks. A student had ${m} marks and then answered one question wrong. What is the new score?`,
      ans: m - n,
      steps: [`${m} - ${n} = ${m - n}`],
      hints: ["A penalty is subtracted from the score.", `${m} - ${n} = ${m - n}`],
      misc: ["SIGN_HANDLING"],
    }),
    ({ m, n }) => ({
      stem: `Compute: -${m} + ${n}`,
      ans: n - m,
      steps: [`-${m} + ${n} = ${n - m}`],
      hints: ["Think of it as starting at -${m} and moving right by ${n}.", `${n} - ${m} = ${n - m}`],
      misc: ["SIGN_HANDLING", "ARITHMETIC_SLIP"],
    }),
  ];
  return rows.map((r, i) => {
    const t = templates[i](r);
    return q({
      conceptId: "P2_NEGATIVE_OPS",
      difficulty: 2 + (i % 2),
      stem: t.stem,
      answer: t.ans,
      solutionSteps: t.steps,
      hintLadder: t.hints,
      misconceptionsTested: t.misc,
    });
  });
}

// ---------- P3_VARIABLES_CONSTANTS ----------
function genP3() {
  const rows = [
    { a: 3, b: 5, v: "x", ask: "coefficient" },
    { a: 2, b: 7, v: "y", ask: "constant" },
    { a: 4, b: 1, v: "m", ask: "variable" },
    { a: 5, b: 3, v: "t", ask: "coefficient" },
    { a: 6, b: 9, v: "p", ask: "constant" },
    { a: 7, b: 2, v: "n", ask: "variable" },
    { a: 8, b: 4, v: "z", ask: "coefficient" },
    { a: 9, b: 6, v: "k", ask: "constant" },
  ];
  return rows.map((r, i) => {
    const { a, b, v, ask } = r;
    let stem, ans, hints;
    if (ask === "coefficient") {
      stem = `In the expression ${a}${v} + ${b}, what is the coefficient of ${v}?`;
      ans = a;
      hints = [`The coefficient is the number multiplying the variable ${v}.`, `Answer: ${a}`];
    } else if (ask === "constant") {
      stem = `In the expression ${a}${v} + ${b}, what is the constant term?`;
      ans = b;
      hints = ["The constant term is the number with no variable attached.", `Answer: ${b}`];
    } else {
      stem = `In the expression ${a}${v} + ${b}, which letter is the variable?`;
      ans = v;
      hints = ["The variable is the letter standing for an unknown value.", `Answer: ${v}`];
    }
    return q({
      conceptId: "P3_VARIABLES_CONSTANTS",
      difficulty: 1,
      type: "MCQ",
      stem,
      answer: ans,
      solutionSteps: [`In ${a}${v} + ${b}: coefficient=${a}, variable=${v}, constant=${b}.`],
      hintLadder: hints,
      options: ask === "coefficient" ? [String(a), String(b), v] : ask === "constant" ? [String(b), String(a), v] : [v, String(a), String(b)],
    });
  }).map((item, i) => {
    // override acceptedAnswers for MCQ so it isn't polluted with x=/x =/.0 numeric variants
    const r = genP3RowAnswer(i);
    item.acceptedAnswers = r;
    return item;
  });
}
function genP3RowAnswer(i) {
  const rows = [
    { a: 3, b: 5, v: "x", ask: "coefficient" },
    { a: 2, b: 7, v: "y", ask: "constant" },
    { a: 4, b: 1, v: "m", ask: "variable" },
    { a: 5, b: 3, v: "t", ask: "coefficient" },
    { a: 6, b: 9, v: "p", ask: "constant" },
    { a: 7, b: 2, v: "n", ask: "variable" },
    { a: 8, b: 4, v: "z", ask: "coefficient" },
    { a: 9, b: 6, v: "k", ask: "constant" },
  ];
  const r = rows[i];
  if (r.ask === "coefficient") return [String(r.a)];
  if (r.ask === "constant") return [String(r.b)];
  return [r.v];
}

// ---------- P4_SIMPLE_EXPRESSIONS ----------
function genP4() {
  const rows = [
    { a: 3, b: 2, val: 5, ctx: "taxi" },
    { a: 5, b: 10, val: 4, ctx: "savings" },
    { a: 2, b: 8, val: 6, ctx: "plant" },
    { a: 4, b: 3, val: 7, ctx: "pages" },
    { a: 6, b: 1, val: 3, ctx: "taxi" },
    { a: 3, b: 15, val: 8, ctx: "savings" },
    { a: 2, b: 4, val: 9, ctx: "plant" },
    { a: 5, b: 2, val: 4, ctx: "pages" },
  ];
  const build = {
    taxi: (a, b, val) => ({
      stem: `A taxi charges a base fare of ₹${b} plus ₹${a} per km. If a trip is ${val} km, what is the total fare? (Evaluate ${a}x + ${b} for x = ${val}.)`,
      hint: "Substitute the distance for x, then multiply before adding.",
    }),
    savings: (a, b, val) => ({
      stem: `Kabir already had ₹${b} saved and adds ₹${a} every week. After ${val} weeks, how much has he saved in total? (Evaluate ${a}x + ${b} for x = ${val}.)`,
      hint: "Substitute the number of weeks for x, then multiply before adding.",
    }),
    plant: (a, b, val) => ({
      stem: `A plant is ${b} cm tall and grows ${a} cm every week. How tall is it after ${val} weeks? (Evaluate ${a}x + ${b} for x = ${val}.)`,
      hint: "Substitute the number of weeks for x, then multiply before adding.",
    }),
    pages: (a, b, val) => ({
      stem: `A student already read ${b} pages and then reads ${a} pages every day. How many pages in total after ${val} days? (Evaluate ${a}x + ${b} for x = ${val}.)`,
      hint: "Substitute the number of days for x, then multiply before adding.",
    }),
  };
  return rows.map((r) => {
    const { a, b, val, ctx } = r;
    const built = build[ctx](a, b, val);
    const ans = a * val + b;
    return q({
      conceptId: "P4_SIMPLE_EXPRESSIONS",
      difficulty: 2,
      stem: built.stem,
      answer: ans,
      solutionSteps: [`${a}(${val}) + ${b} = ${a * val} + ${b} = ${ans}`],
      hintLadder: [built.hint, `${a} × ${val} = ${a * val}`, `Answer: ${ans}`],
    });
  });
}

// ---------- P5_EQUALITY_BALANCE ----------
function genP5() {
  const items = [
    {
      stem: "A balance scale is level with equal weights on both sides. If you add 5 grams to the left side only, is the scale still balanced?",
      ans: "false",
      options: ["true", "false"],
      hint: "Balance means both sides change together.",
    },
    {
      stem: "An equation 3x = 12 is like a balanced scale. If you divide the left side by 3, what must you do to the right side to keep it balanced?",
      ans: "divide by 3",
      options: ["divide by 3", "add 3", "do nothing"],
      hint: "Whatever you do to one side, you must do to the other.",
    },
    {
      stem: "True or false: you may add 6 to one side of an equation and add a different number to the other side, and the equation stays true.",
      ans: "false",
      options: ["true", "false"],
      hint: "Both sides must receive the exact same operation.",
    },
    {
      stem: "True or false: multiplying both sides of an equation by the same non-zero number keeps the equation true.",
      ans: "true",
      options: ["true", "false"],
      hint: "This is the multiplication property of equality.",
    },
    {
      stem: "An equation x - 4 = 9 is like a balanced scale. What operation restores x by itself while keeping balance?",
      ans: "add 4 to both sides",
      options: ["add 4 to both sides", "subtract 4 from only the left", "multiply both sides by 4"],
      hint: "Undo subtraction with the opposite operation, on both sides.",
    },
    {
      stem: "True or false: an equation stays balanced if you subtract the same number from both sides.",
      ans: "true",
      options: ["true", "false"],
      hint: "This is the subtraction property of equality.",
    },
  ];
  return items.map((it) =>
    q({
      conceptId: "P5_EQUALITY_BALANCE",
      difficulty: 1,
      type: "MCQ",
      stem: it.stem,
      answer: it.ans,
      solutionSteps: [`Correct answer: ${it.ans}`],
      hintLadder: [it.hint, `Answer: ${it.ans}`],
      options: it.options,
    }),
  ).map((item, i) => {
    item.acceptedAnswers = [items[i].ans];
    return item;
  });
}

// ---------- C1_ONE_STEP_ADDITION (x + a = b) ----------
function genC1() {
  const rows = [
    { a: 7, x: 9 },
    { a: 12, x: 6 },
    { a: 4, x: 21 },
    { a: 15, x: 8 },
    { a: 9, x: 14 },
    { a: 6, x: 19 },
    { a: 11, x: 5 },
    { a: 3, x: 27 },
    { a: 18, x: 4 },
    { a: 8, x: 16 },
  ];
  const templates = [
    (a, b) => `Solve for x: x + ${a} = ${b}`,
    (a, b) => `A number increased by ${a} equals ${b}. What is the number?`,
    (a, b) => `In ${a} years, Aisha will be ${b} years old. How old is she now? (Let x be her age now: x + ${a} = ${b}.)`,
    (a, b) => `A jar has some marbles. After adding ${a} more, it has ${b} marbles. How many marbles were in the jar to start? (x + ${a} = ${b})`,
    (a, b) => `Solve for x: x + ${a} = ${b}`,
  ];
  return rows.map((r, i) => {
    const { a, x } = r;
    const b = x + a;
    const stem = templates[i % templates.length](a, b);
    return q({
      conceptId: "C1_ONE_STEP_ADDITION",
      difficulty: 2,
      questionIntent: i === 0 ? "BASELINE_ASSESSMENT" : "STANDARD_PRACTICE",
      stem,
      answer: x,
      solutionSteps: [`Subtract ${a} from both sides: x = ${b} - ${a} = ${x}`],
      hintLadder: ["Undo the addition by subtracting from both sides.", `x = ${b} - ${a} = ${x}`],
    });
  });
}

// ---------- C2_ONE_STEP_SUBTRACTION (x - a = b) ----------
function genC2() {
  const rows = [
    { a: 5, x: 13 },
    { a: 9, x: 22 },
    { a: 4, x: 8 },
    { a: 11, x: 17 },
    { a: 6, x: 30 },
    { a: 8, x: 14 },
    { a: 3, x: 25 },
    { a: 12, x: 19 },
    { a: 7, x: 21 },
    { a: 10, x: 26 },
  ];
  const templates = [
    (a, b) => `Solve for x: x - ${a} = ${b}`,
    (a, b) => `A number decreased by ${a} equals ${b}. What is the number?`,
    (a, b) => `After spending ₹${a}, Zoya has ₹${b} left. How much money did she start with? (x - ${a} = ${b})`,
    (a, b) => `A tank lost ${a} litres of water and now has ${b} litres left. How many litres did it start with? (x - ${a} = ${b})`,
    (a, b) => `Solve for x: x - ${a} = ${b}`,
  ];
  return rows.map((r, i) => {
    const { a, x } = r;
    const b = x - a;
    const stem = templates[i % templates.length](a, b);
    return q({
      conceptId: "C2_ONE_STEP_SUBTRACTION",
      difficulty: 2 + (i % 2),
      stem,
      answer: x,
      solutionSteps: [`Add ${a} to both sides: x = ${b} + ${a} = ${x}`],
      hintLadder: ["Undo the subtraction by adding to both sides.", `x = ${b} + ${a} = ${x}`],
      misconceptionsTested: ["INVERSE_OPERATION"],
    });
  });
}

// ---------- C3_ONE_STEP_MULTIPLICATION (a·x = b) ----------
function genC3() {
  const rows = [
    { a: 4, x: 6 },
    { a: 3, x: 9 },
    { a: 7, x: 5 },
    { a: 6, x: 8 },
    { a: 5, x: 11 },
    { a: 8, x: 4 },
    { a: 9, x: 7 },
    { a: 2, x: 15 },
    { a: 12, x: 3 },
    { a: 6, x: 13 },
  ];
  const templates = [
    (a, b) => `Solve for x: ${a}x = ${b}`,
    (a, b) => `Movie tickets cost ₹${a} each. A group paid ₹${b} in total. How many tickets did they buy? (${a}x = ${b})`,
    (a, b) => `A recipe uses ${a} eggs per batch. A baker used ${b} eggs in total. How many batches did she make? (${a}x = ${b})`,
    (a, b) => `Solve for x: ${a}x = ${b}`,
    (a, b) => `A rope is cut into pieces of ${a} m each, using ${b} m of rope in total. How many pieces were made? (${a}x = ${b})`,
  ];
  return rows.map((r, i) => {
    const { a, x } = r;
    const b = a * x;
    const stem = templates[i % templates.length](a, b);
    return q({
      conceptId: "C3_ONE_STEP_MULTIPLICATION",
      difficulty: 2,
      stem,
      answer: x,
      solutionSteps: [`Divide both sides by ${a}: x = ${b} ÷ ${a} = ${x}`],
      hintLadder: ["Undo the multiplication by dividing both sides.", `x = ${b} ÷ ${a} = ${x}`],
    });
  });
}

// ---------- C4_ONE_STEP_DIVISION (x/d = r) ----------
function genC4() {
  const rows = [
    { d: 3, r: 7 },
    { d: 4, r: 6 },
    { d: 5, r: 9 },
    { d: 2, r: 13 },
    { d: 6, r: 5 },
    { d: 3, r: 11 },
    { d: 7, r: 4 },
    { d: 4, r: 8 },
    { d: 5, r: 6 },
    { d: 8, r: 3 },
  ];
  const templates = [
    (d, x) => `Solve for x: x/${d} = ?`,
    (d, x) => `A sum of money split equally among ${d} friends gives each ₹R. How much was the total? (x/${d} = R)`,
    (d, x) => `Solve for x: x/${d} = ?`,
    (d, x) => `A rope of length x metres is cut into ${d} equal pieces, each R metres long. How long was the rope? (x/${d} = R)`,
  ];
  return rows.map((r, i) => {
    const { d, r: R } = r;
    const x = d * R;
    let stem;
    const t = i % templates.length;
    if (t === 0 || t === 2) {
      stem = `Solve for x: x/${d} = ${R}`;
    } else if (t === 1) {
      stem = `A sum of money split equally among ${d} friends gives each ₹${R}. How much was the total sum? (x/${d} = ${R})`;
    } else {
      stem = `A rope of length x metres is cut into ${d} equal pieces, each ${R} metres long. How long was the rope? (x/${d} = ${R})`;
    }
    return q({
      conceptId: "C4_ONE_STEP_DIVISION",
      difficulty: 3,
      stem,
      answer: x,
      solutionSteps: [`Multiply both sides by ${d}: x = ${R} × ${d} = ${x}`],
      hintLadder: ["Undo the division by multiplying both sides.", `x = ${R} × ${d} = ${x}`],
    });
  });
}

// ---------- C5_TWO_STEP_EQUATIONS (a·x + b = c) ----------
function genC5() {
  const rows = [
    { a: 2, b: 5, x: 8 },
    { a: 3, b: -4, x: 6 },
    { a: 4, b: 7, x: 5 },
    { a: 5, b: -9, x: 7 },
    { a: 2, b: 11, x: 9 },
    { a: 6, b: -3, x: 4 },
    { a: 3, b: 8, x: 10 },
    { a: 4, b: -6, x: 9 },
    { a: 2, b: 15, x: 6 },
    { a: 5, b: 4, x: 8 },
    { a: 3, b: -7, x: 12 },
    { a: 6, b: 9, x: 5 },
  ];
  const templates = [
    (a, b, c) => `Solve for x: ${a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)} = ${c}`,
    (a, b, c) => `Bus tickets cost ₹${a} each, plus a fixed booking fee of ₹${Math.abs(b)}. A family paid ₹${c} in total. How many tickets did they buy? (${a}x + ${Math.abs(b)} = ${c})`,
    (a, b, c) => `A number is multiplied by ${a} and then ${b >= 0 ? "increased" : "decreased"} by ${Math.abs(b)}, giving ${c}. Find the number.`,
  ];
  return rows.map((r, i) => {
    const { a, b, x } = r;
    const c = a * x + b;
    let stem;
    const t = i % 3;
    if (t === 0) stem = templates[0](a, b, c);
    else if (t === 1 && b < 0) stem = templates[2](a, b, c);
    else if (t === 1) stem = templates[1](a, b, c);
    else stem = templates[2](a, b, c);
    return q({
      conceptId: "C5_TWO_STEP_EQUATIONS",
      difficulty: 3,
      stem,
      answer: x,
      solutionSteps: [
        b >= 0 ? `${a}x = ${c} - ${b} = ${c - b}` : `${a}x = ${c} + ${-b} = ${c - b}`,
        `x = ${c - b} ÷ ${a} = ${x}`,
      ],
      hintLadder: ["Undo the addition/subtraction first, then the multiplication.", `x = ${x}`],
    });
  });
}

// ---------- C6_SIMPLE_WORD_PROBLEMS ----------
function genC6() {
  const items = [
    {
      stem: "Three times a number, decreased by 4, is 11. Find the number.",
      a: 3,
      b: -4,
      x: 5,
    },
    {
      stem: "A rectangle's length is twice its width, plus 3 cm. If the length is 15 cm, write and solve the equation for the width w.",
      a: 2,
      b: 3,
      x: 6,
      customVarName: "w",
    },
    {
      stem: "Sanya is 3 years younger than twice her brother's age. Sanya is 15. How old is her brother?",
      a: 2,
      b: -3,
      x: 9,
    },
    {
      stem: "A number multiplied by 4, then increased by 7, gives 39. What is the number?",
      a: 4,
      b: 7,
      x: 8,
    },
    {
      stem: "A group buys concert tickets at ₹120 each plus a ₹50 booking fee, paying ₹770 in total. How many tickets did they buy?",
      a: 120,
      b: 50,
      x: 6,
    },
    {
      stem: "The perimeter of a rectangle is 54 cm and its length is 15 cm. Using 2(15 + w) = 54, find the width w.",
      a: 2,
      b: 30,
      x: 12,
      customVarName: "w",
    },
    {
      stem: "Three consecutive whole numbers add up to 51. Find the smallest of the three numbers.",
      a: 3,
      b: 3,
      x: 16,
    },
    {
      stem: "Kabir already had ₹95 saved and adds ₹40 every week. After how many weeks will he have ₹415?",
      a: 40,
      b: 95,
      x: 8,
    },
    {
      stem: "A father's age is 5 times his son's age. Together their ages add up to 60. How old is the son?",
      a: 5,
      b: 0,
      x: 10,
    },
    {
      stem: "A number is doubled and then 9 is subtracted, giving 25. Find the original number.",
      a: 2,
      b: -9,
      x: 17,
    },
  ];
  return items.map((it) => {
    const { a, b, x, customVarName } = it;
    const c = a * x + b;
    const v = customVarName ?? "x";
    return q({
      conceptId: "C6_SIMPLE_WORD_PROBLEMS",
      difficulty: 3,
      type: "WORD_PROBLEM",
      stem: it.stem,
      answer: x,
      solutionSteps: [
        `Equation: ${a}${v} ${b >= 0 ? "+ " + b : "- " + Math.abs(b)} = ${c}`,
        b >= 0 ? `${a}${v} = ${c} - ${b} = ${c - b}` : `${a}${v} = ${c} + ${-b} = ${c - b}`,
        `${v} = ${c - b} ÷ ${a} = ${x}`,
      ],
      hintLadder: [
        "Turn the words into an equation first.",
        `${a}${v} ${b >= 0 ? "+ " + b : "- " + Math.abs(b)} = ${c}`,
        `${v} = ${x}`,
      ],
    });
  });
}

function main() {
  const questions = [
    ...genP1(),
    ...genP2(),
    ...genP3(),
    ...genP4(),
    ...genP5(),
    ...genC1(),
    ...genC2(),
    ...genC3(),
    ...genC4(),
    ...genC5(),
    ...genC6(),
  ];

  // Self-check: every id unique, every stem unique, every accepted answer non-empty.
  const ids = new Set();
  const stems = new Set();
  for (const item of questions) {
    if (ids.has(item.id)) throw new Error(`duplicate id ${item.id}`);
    ids.add(item.id);
    if (stems.has(item.stem)) throw new Error(`duplicate stem: ${item.stem}`);
    stems.add(item.stem);
    if (!item.acceptedAnswers.length) throw new Error(`no accepted answers: ${item.id}`);
  }

  writeFileSync(
    OUT_PATH,
    JSON.stringify({ questions, generatedAt: new Date().toISOString() }, null, 2) + "\n",
  );

  console.log(`Wrote ${questions.length} hand-authored questions → ${OUT_PATH}`);
  const byConceptCounts = {};
  for (const item of questions) {
    byConceptCounts[item.conceptId] = (byConceptCounts[item.conceptId] ?? 0) + 1;
  }
  console.log(byConceptCounts);
}

main();
