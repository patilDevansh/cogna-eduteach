/** Baseline assessment blueprint — 12 slots, fixed concept order (README_RULES §8). */
export const BASELINE_SLOT_COUNT = 12;

export const BASELINE_BLUEPRINT: string[] = [
  "P1_INTEGER_ADD_SUB", // slot 1
  "P1_INTEGER_ADD_SUB", // slot 2
  "P3_VARIABLES_CONSTANTS", // slot 3
  "P4_SIMPLE_EXPRESSIONS", // slot 4
  "P5_EQUALITY_BALANCE", // slot 5
  "P5_EQUALITY_BALANCE", // slot 6
  "C1_ONE_STEP_ADDITION", // slot 7
  "C2_ONE_STEP_SUBTRACTION", // slot 8
  "C3_ONE_STEP_MULTIPLICATION", // slot 9
  "C5_TWO_STEP_EQUATIONS", // slot 10
  "C5_TWO_STEP_EQUATIONS", // slot 11
  "C5_TWO_STEP_EQUATIONS", // slot 12
];

export const BASELINE_FALLBACK_CONCEPTS: Record<string, string[]> = {
  C5_TWO_STEP_EQUATIONS: ["C2_ONE_STEP_SUBTRACTION", "C4_ONE_STEP_DIVISION"],
};

export function baselineConceptForSlot(slotIndex: number): string {
  if (slotIndex < 0 || slotIndex >= BASELINE_BLUEPRINT.length) {
    return BASELINE_BLUEPRINT[BASELINE_BLUEPRINT.length - 1];
  }
  return BASELINE_BLUEPRINT[slotIndex];
}
