/**
 * A deterministic, free, no-network stand-in for LotusModelService — the
 * "controlled model adapter" the Deterministic Wiring Suite calls for
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §9.1): validated AI-style
 * questions and scripted review outcomes, so Playwright can drive the real
 * student UI and the real API against real control-flow logic without live
 * model cost or non-determinism. Only ever wired in when
 * LOTUS_E2E_FAKE_MODEL=true (see lotus.module.ts) — normal boots are
 * completely unaffected. Must never be mistaken for a measurement of
 * live-model diagnostic accuracy; it only proves the wiring.
 */
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusReserveIntent,
} from "@cogna/shared";
import { LotusCostTracker } from "./lotus-cost-tracker";

const ASSESSMENT: LotusModelAssessment = {
  mathJudgment: "UNRESOLVED",
  observations: ["fake e2e model"],
  hypotheses: [],
  phaseRecommendation: "EXPLORE",
  proposedAction: "ASK",
  conciseRationale: "fake e2e model",
};

const DEBATE: LotusGptDebateResponse = {
  agreements: [],
  disagreements: [],
  disagreementExample: "None.",
  acceptedImprovements: [],
  revisedConclusion: "fake e2e model",
  revisedAction: "ASK",
  revisedPhase: "EXPLORE",
};

function closure(): LotusDebateClosure {
  return {
    verdict: "ACCEPTED",
    acceptedFromGpt: [],
    acceptedFromChallenger: [],
    rejectedClaims: [],
    conclusion: "fake e2e model",
    evidenceState: "PARTIAL",
    uncertainty: [],
    phase: "EXPLORE",
    action: "ASK",
    selectionReason: "fake e2e model",
    exitDiagnostic: false,
  };
}

/**
 * Test-only latency injection for the Phase 4 browser gate.  It delays the
 * final review stage while leaving question writing fast, so the test can
 * prove that a student can move through already-authorized questions without
 * waiting for an earlier review.  Production boots never use this adapter.
 */
function closureDelayMs(): number {
  const value = Number(process.env.LOTUS_E2E_FAKE_CLOSURE_DELAY_MS);
  return Number.isInteger(value) && value >= 0 && value <= 30_000 ? value : 0;
}

/**
 * Browser-only controls for the action-lifecycle matrix. They are recognised
 * only by this adapter, which is wired exclusively when
 * LOTUS_E2E_FAKE_MODEL=true. That lets the test prove a failed targeted
 * write is reported honestly instead of looking like a successful plan
 * change, without adding a production switch.
 */
function configuredFirstWrongStep(): number | null {
  const value = Number(process.env.LOTUS_E2E_FAKE_FIRST_WRONG_STEP);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : null;
}

function shouldRejectWrite(prompt: string): boolean {
  return process.env.LOTUS_E2E_FAKE_WRITE_MODE === "reject-check"
    && prompt.includes("Generation purpose: CHECK");
}

/**
 * One controlled, code-verifiable item per catalogue shape. Every answer
 * here still travels through the real writer parser and the real
 * deterministic algebra checker (lotus-math.ts / lotus-question-factory.ts)
 * before it can be installed — this only replaces the network call, not the
 * validation. Ported from the same proven fixtures used by
 * lotus-factorisation-session.v1.spec.ts (100+ passing golden tests).
 */
function controlledWrite(prompt: string): Record<string, unknown> {
  const opener = prompt.match(/expression MUST be exactly: (.+?)\. Write/)?.[1]?.trim();
  if (opener) {
    const match = opener.match(/^(\d+)x \+ (\d+)$/);
    if (!match) throw new Error(`fake e2e model: unexpected opener ${opener}`);
    const a = Number(match[1]);
    const b = Number(match[2]);
    const gcd = (left: number, right: number): number => (right === 0 ? left : gcd(right, left % right));
    const factor = gcd(a, b);
    return {
      prompt: `Factorise completely: ${opener}`,
      expression: opener,
      answer: `${factor}(${a / factor}x + ${b / factor})`,
      wrongAnswers: [
        { answer: "1", mistake: "DIVIDED_FIRST_TERM_ONLY" },
        { answer: "2", mistake: "COMMON_NOT_HIGHEST" },
      ],
      steps: [{ line: `Take out ${factor}.`, skill: "FAC_DIVIDE_TERMS" }],
    };
  }
  const shape = prompt.match(/Follow this shape, but write a NEW question with DIFFERENT numbers: ([^\n]+)/)?.[1]?.trim();
  const token = prompt.match(/Session variation token: ([^\n]+)/)?.[1] ?? "test";
  const variant = [...token].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7) % 10_000 + 1;
  const factor = (expression: string, answer: string, skill: string, wrong?: Array<{ answer: string; mistake: string }>) => ({
    prompt: `Factorise completely: (${expression}) + ${variant} - ${variant}`,
    expression: `(${expression}) + ${variant} - ${variant}`,
    answer,
    wrongAnswers: wrong ?? (skill === "FAC_GROUP_TERMS"
      ? [{ answer: "1", mistake: "PAIRS_SHARE_NOTHING" }, { answer: "2", mistake: "SUM_ACCEPTED_AS_FACTORISED" }]
      : skill === "FAC_COMMON_BINOMIAL"
        ? [{ answer: "1", mistake: "BRACKET_NOT_SEEN_AS_FACTOR" }, { answer: "2", mistake: "LEFTOVERS_MULTIPLIED" }]
        : [{ answer: "1", mistake: "WRONG_FACTOR_PAIR_SUM" }, { answer: "2", mistake: "WRONG_FACTOR_PAIR_PRODUCT" }]),
    steps: [{ line: "Use the required factorisation method.", skill }],
  });
  const choice = (question: string, correct: string, options: string[], skill: string) => ({
    prompt: `${question} (Version ${variant}.)`,
    options,
    correctOption: correct,
    wrongOptionMistakes: options.filter((option) => option !== correct).slice(0, 2).map((option, index) => ({ option, mistake: index ? "WRONG_FACTOR_PAIR_SUM" : "SIGN_PAIR_ERROR" })),
    steps: [{ line: "Check the condition carefully.", skill }],
  });
  switch (shape) {
    case "x^2 + 5x": return factor("2x^2 + 10x", "2x(x + 5)", "FAC_GCF_VARIABLE", [
      { answer: "2x^2(x + 5)", mistake: "TOOK_HIGHEST_POWER" },
      { answer: "2x(x^2 + 5)", mistake: "INCLUDED_NON_COMMON_VARIABLE" },
    ]);
    case "6x + 9": return factor("6x + 15", "3(2x + 5)", "FAC_DIVIDE_TERMS", [{ answer: "3(2x + 15)", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "1", mistake: "COMMON_NOT_HIGHEST" }]);
    case "3x^2 + 3x": return factor("4x^2 + 4x", "4x(x + 1)", "FAC_DIVIDE_TERMS");
    case "10x^2 - 18x^3 + 14x^4": return factor("12x^2 - 18x^3 + 12x^4", "6x^2(2 - 3x + 2x^2)", "FAC_COMMON_MONOMIAL");
    case "-4x - 8": return factor("-6x - 12", "-6(x + 2)", "FAC_GCF_NEGATIVE", [
      { answer: "-6(-x - 2)", mistake: "KEPT_ORIGINAL_SIGNS" },
      { answer: "-6(x - 2)", mistake: "FLIPPED_ONE_SIGN" },
    ]);
    case "Is 2y(x + 1) + 3(x + 1) fully factorised? Why?": return choice("Is 4y(x + 2) + 5(x + 2) fully factorised?", "No; it is (x + 2)(4y + 5).", ["No; it is (x + 2)(4y + 5).", "Yes; it is a sum of products.", "No; x + 2 is not a factor.", "Yes; 4y and 5 cannot combine."], "FAC_MEANING");
    case "3(x - 2) + y(x - 2)": return factor("4(x - 3) + y(x - 3)", "(x - 3)(y + 4)", "FAC_COMMON_BINOMIAL");
    case "2xy + 2y + 3x + 3": return factor("3xy + 3y + 2x + 2", "(x + 1)(3y + 2)", "FAC_GROUP_TERMS");
    case "x^2 - 9": return factor("x^2 - 16", "(x - 4)(x + 4)", "FAC_DIFF_SQUARES", [
      { answer: "(x - 4)^2", mistake: "WROTE_PERFECT_SQUARE" },
      { answer: "(x - 4)(x - 4)", mistake: "DROPPED_SQUARE" },
    ]);
    case "49a^2 - 25b^2": return factor("64a^2 - 9b^2", "(8a - 3b)(8a + 3b)", "FAC_DIFF_SQUARES", [
      { answer: "(8a - 3b)^2", mistake: "WROTE_PERFECT_SQUARE" },
      { answer: "(64a - 9b)(64a + 9b)", mistake: "COEFFICIENT_NOT_ROOTED" },
    ]);
    case "x^2 + 6x + 9": return factor("x^2 + 8x + 16", "(x + 4)^2", "FAC_PERFECT_SQUARE_PLUS");
    case "Which two numbers have a product of 12 and a sum of -7?": return choice("Which two numbers have a product of 20 and a sum of -9?", "-4 and -5", ["-4 and -5", "4 and 5", "-2 and -10", "-1 and -20"], "FAC_PAIR_PRODUCT_SUM");
    case "x^2 + 5x + 6": return factor("x^2 + 7x + 12", "(x + 3)(x + 4)", "FAC_MONIC_TRINOMIAL");
    case "x^2 - 7x + 12": return factor("x^2 - 9x + 20", "(x - 4)(x - 5)", "FAC_MONIC_TRINOMIAL");
    case "x^2 - x - 12": return factor("x^2 - 2x - 15", "(x - 5)(x + 3)", "FAC_MONIC_TRINOMIAL");
    case "4y^2 - 12y + 9": return factor("4y^2 - 20y + 25", "(2y - 5)^2", "FAC_PERFECT_SQUARE_MINUS");
    case "6xy - 4y - 9x + 6": return factor("4xy - 6y - 2x + 3", "(2y - 1)(2x - 3)", "FAC_GROUP_SIGN");
    case "Riya says x^2 - 5x + 6 = (x - 2)(x + 3). Is she right?": return choice("Riya says x^2 - 7x + 12 = (x - 3)(x - 4). Is she right?", "Yes; expanding gives x^2 - 7x + 12.", ["Yes; expanding gives x^2 - 7x + 12.", "No; it gives x^2 + 7x + 12.", "No; it gives x^2 - x - 12.", "Yes; the constants multiply to 7."], "FAC_VERIFY_EXPAND");
    case "What should you do first to factorise 3x^2 - 12?": return choice("What should you do first to factorise 5x^2 - 20?", "Take out the common factor 5.", ["Take out the common factor 5.", "Use difference of squares immediately.", "Divide every term by x.", "Add 20 to both sides."], "FAC_CHOOSE_METHOD");
    case "3x^2 - 12": return factor("5x^2 - 20", "5(x - 2)(x + 2)", "FAC_FACTOR_FULLY", [{ answer: "5(x^2 - 4)", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "1", mistake: "SKIPPED_COMMON_FACTOR_CHECK" }]);
    case "2x^2 + 10x + 12": return factor("3x^2 + 15x + 18", "3(x + 2)(x + 3)", "FAC_FACTOR_FULLY", [{ answer: "3(x^2 + 5x + 6)", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "1", mistake: "SKIPPED_COMMON_FACTOR_CHECK" }]);
    case "x^4 - 16": return factor("x^4 - 81", "(x - 3)(x + 3)(x^2 + 9)", "FAC_FACTOR_FULLY", [{ answer: "(x^2 - 9)(x^2 + 9)", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "1", mistake: "FACTORED_SUM_OF_SQUARES" }]);
    case "Amit writes (7x + 5)/5 = 7x. Is he right?": return choice("Amit writes (6x + 4)/2 = 6x. Is he right?", "No; the whole numerator cannot be cancelled by 2.", ["No; the whole numerator cannot be cancelled by 2.", "Yes; cancel the 2 from both terms.", "Yes; 4 divided by 2 is zero.", "No; 6x cannot be divided by 2."], "FAC_MEANING");
    case "(x^2 - 9) / (x^2 - 6x + 9)": return factor("(x^2 - 16) / (x^2 - 8x + 16)", "(x + 4)/(x - 4)", "FAC_CANCEL_COMMON_FACTOR");
    case "2x + 3y + 6 + xy": return factor("3x + 2y + 6 + xy", "(x + 2)(y + 3)", "FAC_GROUP_TERMS");
    default: throw new Error(`fake e2e model: no controlled writer fixture for shape ${JSON.stringify(shape)}`);
  }
}

export class FakeLotusModelService {
  readonly primaryModel = "fake-e2e-primary";
  readonly challengerModel = "fake-e2e-challenger";

  get status() {
    return { enabled: true, ready: true, missingConfiguration: [] as string[], progressiveStreamingEnabled: false };
  }
  get progressiveStreamingEnabled() {
    return false;
  }
  /** No real calls happen in fake-model mode, so telemetry is always empty — matches LotusModelService's shape so a teacher hitting the endpoint during a fake-model E2E run gets a real zero-value snapshot, not undefined. */
  get costTelemetry() {
    return new LotusCostTracker().snapshot();
  }
  assertReady(): void {}
  async primaryAssessment(): Promise<LotusModelAssessment> { return ASSESSMENT; }
  async challengerAssessment(): Promise<LotusModelAssessment> { return ASSESSMENT; }
  async primaryDebate(): Promise<LotusGptDebateResponse> { return DEBATE; }
  async challengerClosure(): Promise<LotusDebateClosure> {
    const waitMs = closureDelayMs();
    if (waitMs) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    return { ...closure(), firstWrongStep: configuredFirstWrongStep() };
  }
  async reviseQuestion(): Promise<Omit<LotusQuestion, "id">> {
    throw new Error("fake e2e model: reviseQuestion is not used by the factorisation E2E suite");
  }
  async generateReserveCandidates(): Promise<Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }>> {
    return [];
  }
  async writeQuestion(prompt: string): Promise<Record<string, unknown>> {
    if (shouldRejectWrite(prompt)) {
      throw new Error("controlled targeted-write rejection");
    }
    return controlledWrite(prompt);
  }
  async solveBlind(prompt: string): Promise<Record<string, unknown>> {
    const choice = prompt.match(/Options:\n- ([^\n]+)/)?.[1] ?? "";
    return { choice };
  }
}
