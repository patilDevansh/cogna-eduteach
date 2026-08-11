/**
 * The three fixed problems used by every session, and the ten scripted
 * demo paths (section 11 of the spec). Each scenario is a sequence of the
 * exact inputs a student would type or choose — fed through the *same*
 * real parsing/classification code a live student's input goes through.
 * Nothing here short-circuits validation; it only removes the randomness
 * of what gets typed, so a specific path can be reproduced on demand.
 */
import type { QuadraticProblem } from "./types";

export const MAIN_PROBLEM: QuadraticProblem = {
  id: "main",
  presented: "(x+3)(x+5)",
  factors: { p: 3, q: 5 },
};

export const PROBE_PROBLEM: QuadraticProblem = {
  id: "probe",
  presented: "(x+2)(x+4)",
  factors: { p: 2, q: 4 },
};

export const TRANSFER_PROBLEM: QuadraticProblem = {
  id: "transfer",
  presented: "(x-2)(x+5)",
  factors: { p: -2, q: 5 },
};

export const WARMUP_1 = { presented: "3(x+4)", expected: "3x+12" };
export const WARMUP_2 = { presented: "x(x+3)", expected: "x^2+3x" };

export type ScenarioStep =
  | { kind: "ANSWER"; target: "WARMUP_1" | "WARMUP_2" | "PROBE"; input: string }
  | { kind: "WORKED_LINES"; target: "MAIN_EXPANSION" | "TRANSFER_EXPANSION"; lines: string[] }
  | { kind: "STUCK"; target: "MAIN_EXPANSION" | "PROBE" }
  | { kind: "FACTOR_ATTEMPT"; target: "FACTORISATION" | "TRANSFER_FACTOR"; p: number; q: number; writtenForm: string };

export type ScenarioId =
  | "FULLY_CORRECT"
  | "MISSING_CROSS_PRODUCTS"
  | "APPARENT_SLIP_THEN_CORRECT_PROBE"
  | "X_SQUARED_MISREAD"
  | "COMBINING_LIKE_TERMS_DIFFICULTY"
  | "NEGATIVE_SIGN_DIFFICULTY"
  | "PRODUCT_SUM_CONFUSION"
  | "STUCK"
  | "SUCCESSFUL_TRANSFER"
  | "DIFFICULT_TRANSFER";

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  steps: ScenarioStep[];
}

const WARM = (): ScenarioStep[] => [
  { kind: "ANSWER", target: "WARMUP_1", input: "3x+12" },
  { kind: "ANSWER", target: "WARMUP_2", input: "x^2+3x" },
];

export const SCENARIOS: Scenario[] = [
  {
    id: "FULLY_CORRECT",
    label: "Completely correct, start to finish",
    description: "Expands and factorises correctly on the first try, no probe or intervention needed.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x(x+5)+3(x+5)", "x^2+5x+3x+15", "x^2+8x+15"] },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+5x-2x-10", "x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "MISSING_CROSS_PRODUCTS",
    label: "Missing cross-products",
    description: "Only multiplies the outer and last terms (F and L), missing both cross terms — repeated on the probe, so the area model appears.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+15"] },
      { kind: "ANSWER", target: "PROBE", input: "x^2+8" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "APPARENT_SLIP_THEN_CORRECT_PROBE",
    label: "One apparent slip, then a correct probe",
    description: "The main answer looks like missing cross-products, but the quick follow-up is fully correct — treated as a slip, not a pattern. No lesson shown.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+15"] },
      { kind: "ANSWER", target: "PROBE", input: "x^2+6x+8" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "X_SQUARED_MISREAD",
    label: "Incorrect interpretation of x²",
    description: "Treats x·x as \"2x\" (adding instead of multiplying) rather than x². Repeats on the probe, so the area model appears.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["2x+8x+15"] },
      { kind: "ANSWER", target: "PROBE", input: "2x+6x+8" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "COMBINING_LIKE_TERMS_DIFFICULTY",
    label: "Combining-like-terms difficulty",
    description: "Reaches the right four partial products both times but never merges the two x-terms into one.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+3x+5x+15"] },
      { kind: "ANSWER", target: "PROBE", input: "x^2+2x+4x+8" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "NEGATIVE_SIGN_DIFFICULTY",
    label: "Negative-sign difficulty (during transfer)",
    description: "Handles the taught example cleanly, but drops a negative sign the first time a minus appears in a new expression.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+8x+15"] },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x+10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: 2, q: 5, writtenForm: "(x+2)(x+5)" },
    ],
  },
  {
    id: "PRODUCT_SUM_CONFUSION",
    label: "Product-versus-sum confusion",
    description: "Expands correctly, but in reverse first picks a pair that multiplies to 15 while ignoring the sum condition — then self-corrects.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+8x+15"] },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 1, q: 15, writtenForm: "(x+1)(x+15)" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "STUCK",
    label: '"I\'m stuck"',
    description: "Doesn't attempt the main problem at all — the area model appears as direct support rather than a probe.",
    steps: [
      ...WARM(),
      { kind: "STUCK", target: "MAIN_EXPANSION" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "SUCCESSFUL_TRANSFER",
    label: "Successful independent transfer",
    description: "An early slip resolves as uncertain (no lesson shown), then the new expression — including its negative sign — is expanded and factorised correctly, unaided.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+15"] },
      { kind: "ANSWER", target: "PROBE", input: "x^2+6x+8" },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x(x+5)-2(x+5)", "x^2+5x-2x-10", "x^2+3x-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: -2, q: 5, writtenForm: "(x-2)(x+5)" },
    ],
  },
  {
    id: "DIFFICULT_TRANSFER",
    label: "Difficulty during independent transfer",
    description: "Handles the taught example cleanly, but the new expression's structure doesn't transfer — a general (non-sign-specific) miss.",
    steps: [
      ...WARM(),
      { kind: "WORKED_LINES", target: "MAIN_EXPANSION", lines: ["x^2+8x+15"] },
      { kind: "FACTOR_ATTEMPT", target: "FACTORISATION", p: 3, q: 5, writtenForm: "(x+3)(x+5)" },
      { kind: "WORKED_LINES", target: "TRANSFER_EXPANSION", lines: ["x^2-10"] },
      { kind: "FACTOR_ATTEMPT", target: "TRANSFER_FACTOR", p: 1, q: -10, writtenForm: "(x+1)(x-10)" },
    ],
  },
];

export function getScenario(id: ScenarioId): Scenario {
  const s = SCENARIOS.find((sc) => sc.id === id);
  if (!s) throw new Error(`Unknown scenario: ${id}`);
  return s;
}
