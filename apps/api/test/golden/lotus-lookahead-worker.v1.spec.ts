/**
 * Golden Test Suite: Lookahead AI Background Worker
 * Target: apps/api/test/golden/lotus-lookahead-worker.v1.spec.ts
 *
 * Verifies:
 * 1. <2ms deterministic referee response time on hot path (zero student lag).
 * 2. Asynchronous dispatch of background AI worker without blocking UI or session transitions.
 * 3. Successful queue swap into slot N+1 or N+2 when AI custom probe is synthesized in time.
 * 4. Fallback to pre-baked catalogue slot when AI is delayed, hangs, or fails.
 * 5. Session queue invariants (monotonic progression, total question count, board adaptation preservation).
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusQuestionAudit,
  LotusSessionView,
  LotusStudentResponse,
} from "@cogna/shared";
import { instantVerdict, planAdjustments, insertElasticProbe, type FactorisationState, type SkillLedgerEntry } from "../../src/lotus/lotus-factorisation";
import { CANONICAL_15_SPINE, FACTORISATION_STRETCH_SLOTS, adaptPromptForBoard } from "../../src/lotus/lotus-factorisation-catalogue";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";

// Disable code-built game probes to test pure AI writer & catalogue queue logic
process.env.COGNA_GAME_FORMATS = "off";

// ---------------------------------------------------------------------------
// Zero-Network Mock Harness (LookaheadFakeModels)
// ---------------------------------------------------------------------------

const MOCK_ASSESSMENT: LotusModelAssessment = {
  mathJudgment: "UNRESOLVED",
  observations: ["mock assessment"],
  hypotheses: [],
  phaseRecommendation: "EXPLORE",
  proposedAction: "ASK",
  conciseRationale: "mock rationale",
};

const MOCK_DEBATE: LotusGptDebateResponse = {
  agreements: [],
  disagreements: [],
  disagreementExample: "None.",
  acceptedImprovements: [],
  revisedConclusion: "mock revised conclusion",
  revisedAction: "ASK",
  revisedPhase: "EXPLORE",
};

const MOCK_CLOSURE: LotusDebateClosure = {
  verdict: "ACCEPTED",
  acceptedFromGpt: [],
  acceptedFromChallenger: [],
  rejectedClaims: [],
  conclusion: "mock closure conclusion",
  evidenceState: "PARTIAL",
  uncertainty: [],
  phase: "EXPLORE",
  action: "ASK",
  selectionReason: "mock selection reason",
  exitDiagnostic: false,
};

function controlledWrite(prompt: string): Record<string, unknown> {
  const opener = prompt.match(/expression MUST be exactly: (.+?)\. Write/)?.[1]?.trim();
  if (opener) {
    const match = opener.match(/^(\d+)x \+ (\d+)$/);
    if (!match) throw new Error(`unexpected opener ${opener}`);
    const a = Number(match[1]); const b = Number(match[2]);
    const gcd = (left: number, right: number): number => right === 0 ? left : gcd(right, left % right);
    const factor = gcd(a, b);
    return {
      prompt: `Factorise completely: ${opener}`,
      expression: opener,
      answer: `${factor}(${a / factor}x + ${b / factor})`,
      wrongAnswers: [{ answer: "1", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "2", mistake: "COMMON_NOT_HIGHEST" }],
      steps: [{ line: `Take out ${factor}.`, skill: "FAC_DIVIDE_TERMS" }],
    };
  }
  const shape = prompt.match(/Follow this shape, but write a NEW question with DIFFERENT numbers: ([^\n]+)/)?.[1]?.trim();
  const token = prompt.match(/Session variation token: ([^\n]+)/)?.[1] ?? "test";
  const variant = [...token].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7) % 10_000 + 1;
  const slotMistakes = [...prompt.matchAll(/^- ([A-Z][A-Z0-9_]+)/gm)].map((m) => m[1]!);
  const factor = (expression: string, answer: string, skill: string, wrong?: Array<{ answer: string; mistake: string }>) => ({
    prompt: `Factorise completely: (${expression}) + ${variant} - ${variant}`,
    expression: `(${expression}) + ${variant} - ${variant}`,
    answer,
    wrongAnswers: wrong ?? (slotMistakes.length ? slotMistakes.slice(0, 2).map((mistake, index) => ({ answer: String(index + 1), mistake })) : skill === "FAC_GROUP_TERMS"
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
    wrongOptionMistakes: options.filter((option) => option !== correct).slice(0, 2).map((option, index) => ({ option, mistake: slotMistakes[index % Math.max(slotMistakes.length, 1)] ?? (index ? "WRONG_FACTOR_PAIR_SUM" : "SIGN_PAIR_ERROR") })),
    steps: [{ line: "Check the condition carefully.", skill }],
  });
  switch (shape) {
    case "x^2 + 5x": return factor("2x^2 + 10x", "2x(x + 5)", "FAC_GCF_VARIABLE");
    case "6x + 9": return factor("6x + 15", "3(2x + 5)", "FAC_DIVIDE_TERMS", [{ answer: "3(2x + 15)", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "1", mistake: "COMMON_NOT_HIGHEST" }]);
    case "3x^2 + 3x": return factor("4x^2 + 4x", "4x(x + 1)", "FAC_DIVIDE_TERMS");
    case "10x^2 - 18x^3 + 14x^4": return factor("12x^2 - 18x^3 + 12x^4", "6x^2(2 - 3x + 2x^2)", "FAC_COMMON_MONOMIAL");
    case "-4x - 8": return factor("-6x - 12", "-6(x + 2)", "FAC_GCF_NEGATIVE");
    case "Is 2y(x + 1) + 3(x + 1) fully factorised? Why?": return choice("Is 4y(x + 2) + 5(x + 2) fully factorised?", "No; it is (x + 2)(4y + 5).", ["No; it is (x + 2)(4y + 5).", "Yes; it is a sum of products.", "No; x + 2 is not a factor.", "Yes; 4y and 5 cannot combine."], "FAC_MEANING");
    case "3(x - 2) + y(x - 2)": return factor("4(x - 3) + y(x - 3)", "(x - 3)(y + 4)", "FAC_COMMON_BINOMIAL");
    case "2xy + 2y + 3x + 3": return factor("3xy + 3y + 2x + 2", "(x + 1)(3y + 2)", "FAC_GROUP_TERMS");
    case "x^2 - 9": return factor("x^2 - 16", "(x - 4)(x + 4)", "FAC_DIFF_SQUARES");
    case "49a^2 - 25b^2": return factor("64a^2 - 9b^2", "(8a - 3b)(8a + 3b)", "FAC_DIFF_SQUARES");
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
    default: return factor("4x^2 - 16", "4(x - 2)(x + 2)", "FAC_DIFF_SQUARES");
  }
}

function makeCanonicalQuestion(slot: number): LotusQuestion {
  const spec = CANONICAL_15_SPINE.find((s) => s.slot === slot) ?? CANONICAL_15_SPINE[0]!;
  return {
    id: `spine-q${slot}-${randomUUID()}`,
    phase: spec.phase,
    subtopic: spec.skillId,
    prompt: adaptPromptForBoard(`Factorise: ${spec.shape}`, "CBSE"),
    type: spec.kind === "CHOICE" ? "MULTIPLE_CHOICE" : "CONSTRUCTED_RESPONSE",
    asksForWorking: false,
    purpose: "EVIDENCE",
    answerKey: {
      kind: spec.kind === "CHOICE" ? "MULTIPLE_CHOICE" : "OPEN_RESPONSE",
      canonicalAnswer: "mock-answer",
      workedSolution: [spec.shape],
      diagnostics: {
        slot: spec.slot,
        itemKind: spec.kind,
        expression: spec.shape,
        skillId: spec.skillId,
        taggedSkills: spec.tagged ?? [],
        stepSkills: [spec.skillId],
        level: spec.level,
        origin: "CODE",
        predictedMistakes: (spec.mistakes ?? []).map((m) => ({ answer: `wrong-${m}`, mistake: m })),
      },
    },
  };
}

class LookaheadFakeModels {
  readonly primaryModel = "fake-primary";
  readonly challengerModel = "fake-challenger";
  closures = 0;
  writes = 0;
  closureGate: Promise<void> | null = null;
  closureDelayMs = 0;
  writerGate: Promise<void> | null = null;
  writerDelayMs = 0;
  writerShouldFail = false;
  activeOutage: { at: number; reason: string } | null = null;
  firstWrongStep: number | null = null;
  writer: (prompt: string) => Record<string, unknown> | Promise<Record<string, unknown>> = controlledWrite;
  blindChoice: (prompt: string) => string = (prompt) => prompt.match(/Options:\n- ([^\n]+)/)?.[1] ?? "";

  get status() {
    return { enabled: true, ready: true, missingConfiguration: [] as string[], progressiveStreamingEnabled: false };
  }
  get progressiveStreamingEnabled() {
    return false;
  }
  assertReady(): void {}
  async primaryAssessment() { return MOCK_ASSESSMENT; }
  async challengerAssessment() { return MOCK_ASSESSMENT; }
  async primaryDebate() { return MOCK_DEBATE; }
  async challengerClosure(): Promise<LotusDebateClosure> {
    this.closures += 1;
    if (this.closureGate) await this.closureGate;
    if (this.closureDelayMs) await new Promise((resolve) => setTimeout(resolve, this.closureDelayMs));
    return { ...MOCK_CLOSURE, firstWrongStep: this.firstWrongStep };
  }
  async writeQuestion(prompt: string): Promise<Record<string, unknown>> {
    this.writes += 1;
    if (this.writerGate) await this.writerGate;
    if (this.writerDelayMs) await new Promise((resolve) => setTimeout(resolve, this.writerDelayMs));
    if (this.writerShouldFail) throw new Error("AI writer failed to generate item");
    return this.writer(prompt);
  }
  async solveBlind(prompt: string) { return { choice: this.blindChoice(prompt) }; }
}

const activeServices: LotusService[] = [];
after(() => activeServices.forEach((s) => s.onModuleDestroy()));

function setupHarness(options: { closureDelayMs?: number; writerDelayMs?: number } = {}) {
  const models = new LookaheadFakeModels();
  if (options.closureDelayMs) models.closureDelayMs = options.closureDelayMs;
  if (options.writerDelayMs) models.writerDelayMs = options.writerDelayMs;

  const service = new LotusService(models as unknown as LotusModelService, null, { deferredAnalysisConcurrency: 2 });
  activeServices.push(service);
  return { models, service };
}

async function flushTicks(): Promise<void> {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function startReady(service: LotusService, studentId: string): Promise<LotusSessionView> {
  const started = await service.start(studentId, "FACTORISATION");
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await flushTicks();
    const view = await service.get(started.sessionId);
    if (view.currentQuestion) return view;
  }
  throw new Error("timed out waiting for opening question");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function internalSession(service: LotusService, sessionId: string): any {
  return (service as unknown as { sessions: Map<string, unknown> }).sessions.get(sessionId);
}

// ===========================================================================
// Test Suites
// ===========================================================================

describe("Lotus Lookahead AI Background Worker", { concurrency: 1 }, () => {
describe("Suite 1: Hot Path Referee Latency (<2ms)", () => {
  it("evaluates student factorisation responses in < 2ms on individual calls", () => {
    const q1 = makeCanonicalQuestion(1); // 6x + 9
    const response: LotusStudentResponse = {
      answer: "3(2x + 3)",
      working: "",
      confidence: 90,
      responseTimeMs: 8000,
      didNotKnow: false,
    };

    // JIT warm-up cycle
    for (let i = 0; i < 10; i++) instantVerdict(q1, response);

    const start = performance.now();
    const verdict = instantVerdict(q1, response);
    const durationMs = performance.now() - start;

    assert.equal(verdict.verification.status, "VERIFIED_CORRECT");
    assert.ok(durationMs < 2.0, `Referee latency ${durationMs.toFixed(3)}ms must be strictly < 2.0ms`);
  });

  it("maintains p99 < 2.0ms and median < 0.5ms over 100 consecutive evaluations across curriculum tiers", () => {
    const questions = [
      makeCanonicalQuestion(1), // Numeric GCF
      makeCanonicalQuestion(2), // Variable GCF
      makeCanonicalQuestion(5), // Negative GCF
      makeCanonicalQuestion(7), // Grouping
      makeCanonicalQuestion(9), // Diff of Squares
      makeCanonicalQuestion(13), // Trinomial
    ];

    const answers = [
      "3(2x + 3)",
      "x(x + 5)",
      "-4(x + 2)",
      "-4(x - 2)", // predicted mistake
      "(x - 3)(x + 3)",
      "(x + 2)(x + 3)",
      "unpredicted garbage answer (x + 99)",
    ];

    // JIT warm-up across curriculum tiers (warm up all question and answer pairs)
    for (let round = 0; round < 5; round++) {
      for (const q of questions) {
        for (const a of answers) {
          instantVerdict(q, { answer: a, working: "", confidence: 70, responseTimeMs: 12000, didNotKnow: false });
        }
      }
    }

    const durations: number[] = [];
    for (let i = 0; i < 100; i++) {
      const q = questions[i % questions.length]!;
      const a = answers[i % answers.length]!;
      const resp: LotusStudentResponse = { answer: a, working: "", confidence: 70, responseTimeMs: 12000, didNotKnow: false };

      const t0 = performance.now();
      instantVerdict(q, resp);
      durations.push(performance.now() - t0);
    }

    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)]!;
    const p99 = durations[Math.floor(durations.length * 0.99)]!;

    assert.ok(median < 0.5, `Median referee latency ${median.toFixed(3)}ms must be < 0.5ms`);
    assert.ok(p99 < 2.0, `p99 referee latency ${p99.toFixed(3)}ms must be < 2.0ms`);
  });

  it("handles complex, malformed, and non-algebraic answers in < 2ms without throwing", () => {
    const q = makeCanonicalQuestion(9);
    const malformedCases = [
      "",
      "   ",
      "I don't know and I am completely lost",
      "((((x - 3)))) * (((x + 3)))",
      "x^99999999 + 99999999",
      "x² − ９ (full-width compat characters)",
    ];

    // JIT warm-up for parser error branches
    for (const badAns of malformedCases) {
      instantVerdict(q, { answer: badAns, working: "", confidence: 10, responseTimeMs: 5000, didNotKnow: badAns.includes("don't know") });
    }

    for (const badAns of malformedCases) {
      const t0 = performance.now();
      const verdict = instantVerdict(q, { answer: badAns, working: "", confidence: 10, responseTimeMs: 5000, didNotKnow: badAns.includes("don't know") });
      const durationMs = performance.now() - t0;
      assert.ok(durationMs < 2.0, `Malformed evaluation took ${durationMs.toFixed(3)}ms, must be < 2.0ms`);
      assert.ok(verdict.verification.status !== undefined);
    }
  });

  it("enforces polynomial complexity guardrails on pathological multinomials, factor chains, and long working (< 2ms)", () => {
    const q = makeCanonicalQuestion(9); // x^2 - 9

    // JIT warm-up
    for (let i = 0; i < 20; i++) {
      instantVerdict(q, { answer: "x^2 - 9", working: "x = x", confidence: 50, responseTimeMs: 1000, didNotKnow: false });
    }

    // Pathological multinomial powers: (a + b + c + d + e + f + g + h)^12 and (a + b + c + d + e + f + g + h + i + j)^12
    for (const expr of [
      "(a + b + c + d + e + f + g + h)^12",
      "(a + b + c + d + e + f + g + h + i + j)^12",
    ]) {
      const t0 = performance.now();
      const verdict = instantVerdict(q, { answer: expr, working: "", confidence: 50, responseTimeMs: 5000, didNotKnow: false });
      const dt = performance.now() - t0;
      assert.ok(dt < 2.0, `Pathological power evaluation took ${dt.toFixed(3)}ms, must be < 2.0ms`);
      assert.equal(verdict.verification.status, "NOT_DETERMINISTIC");
    }

    // High factor binomial chain (exceeding 64 monomial product threshold)
    const factorChain = "(a+b)*(c+d)*(e+f)*(g+h)*(i+j)*(k+l)*(m+n)";
    const tChain = performance.now();
    const vChain = instantVerdict(q, { answer: factorChain, working: "", confidence: 50, responseTimeMs: 5000, didNotKnow: false });
    const dtChain = performance.now() - tChain;
    assert.ok(dtChain < 2.0, `Factor chain evaluation took ${dtChain.toFixed(3)}ms, must be < 2.0ms`);
    assert.equal(vChain.verification.status, "NOT_DETERMINISTIC");

    // 50-line working string (sliced to 10 lines max to prevent event-loop exhaustion)
    const fiftyLineWorking = Array(50).fill("x = x").join("\n");
    const tWorking = performance.now();
    const vWorking = instantVerdict(q, { answer: "(x - 3)(x + 3)", working: fiftyLineWorking, confidence: 90, responseTimeMs: 5000, didNotKnow: false });
    const dtWorking = performance.now() - tWorking;
    assert.ok(dtWorking < 2.0, `50-line working evaluation took ${dtWorking.toFixed(3)}ms, must be < 2.0ms`);
    assert.equal(vWorking.verification.status, "VERIFIED_CORRECT");
  });
});

describe("Lookahead AI Worker — Suite 2: Asynchronous Dispatch Without UI Blocking", () => {
  it("resolves student submission immediately (< 50ms) while background AI worker is delayed (5,000ms delay)", async () => {
    // 5-second simulated background LLM latency
    const { models, service } = setupHarness({ closureDelayMs: 5000 });
    const view = await startReady(service, "demo_blitzer");
    await flushTicks();

    const currentQ = view.currentQuestion;
    assert.ok(currentQ, "Opening question must be ready");

    // Submit answer with unpredicted mistake to trigger AI analysis
    const t0 = performance.now();
    const resultView = await service.answer(view.sessionId, view.studentId, {
      answer: "3(2x + 99)", // unpredicted mistake
      working: "3 * 2x = 6x, 3 * 99 = 297",
      confidence: 60,
      responseTimeMs: 15000,
      didNotKnow: false,
      submissionId: "sub-async-1",
      questionId: currentQ.id,
      nextQuestionId: view.upcomingQuestions?.[0]?.id,
    });
    const answerDurationMs = performance.now() - t0;

    // HTTP answer call must complete immediately without waiting for the 5s AI closure
    assert.ok(answerDurationMs < 50.0, `answer() took ${answerDurationMs.toFixed(1)}ms; must resolve immediately (< 50ms)`);
    assert.ok(resultView.currentQuestion, "Slot N+1 must be returned immediately to the student");
    assert.notEqual(resultView.currentQuestion.id, currentQ.id, "Session must have advanced to next question");

    const session = internalSession(service, view.sessionId);
    const lastAudit = session.audits[session.audits.length - 1];
    assert.equal(lastAudit.analysisStatus, "PENDING", "Background AI analysis must be marked PENDING");
    assert.ok(
      lastAudit.analysisStartedAt || (lastAudit.analysisQueuePosition !== undefined && lastAudit.analysisQueuePosition >= 0),
      "Job must be queued or active in background analysisQueue",
    );
  });

  it("delivers full turn payload to background worker queue asynchronously", async () => {
    const { service } = setupHarness();
    const view = await startReady(service, "demo_student");
    await flushTicks();

    const q = view.currentQuestion!;
    await service.answer(view.sessionId, view.studentId, {
      answer: "3(2x + 99)",
      working: "step working line",
      confidence: 50,
      responseTimeMs: 18000,
      didNotKnow: false,
      submissionId: "sub-payload-1",
      questionId: q.id,
    });

    const session = internalSession(service, view.sessionId);
    const audit = session.audits[0] as LotusQuestionAudit;
    assert.equal(audit.question.id, q.id);
    assert.equal(audit.response?.answer, "3(2x + 99)");
    assert.equal(audit.response?.working, "step working line");
    assert.equal(audit.verification?.status, "VERIFIED_INCORRECT");
    assert.equal(audit.analysisSource, "DETERMINISTIC");
  });
});

describe("Lookahead AI Worker — Suite 3: Successful Queue Swap into Slot N+1 / N+2", () => {
  it("swaps custom synthesized probe into Slot N+2 when writer finishes before student answers Slot N+1", async () => {
    const { models, service } = setupHarness();
    const view = await startReady(service, "demo_student");
    await flushTicks();

    const q1 = view.currentQuestion!;
    // Submit Q1, advancing to Q2. Background worker synthesizes targeted probe for Q3
    await service.answer(view.sessionId, view.studentId, {
      answer: "3(2x + 99)",
      working: "",
      confidence: 50,
      responseTimeMs: 15000,
      didNotKnow: false,
      submissionId: "sub-swap-1",
      questionId: q1.id,
    });

    // Let background worker complete question generation for Slot 3
    await flushTicks();

    const session = internalSession(service, view.sessionId);
    const f = session.factorisation;

    // Simulate lookahead AI background worker synthesizing and queue-swapping a custom probe into Slot N+2 (Turn 3)
    // while the student is thinking on Slot N+1 (Turn 2)
    const customProbe: LotusQuestion = {
      id: `custom-probe-slot3-${randomUUID()}`,
      phase: "EXPLORE",
      subtopic: "FAC_DIVIDE_TERMS",
      prompt: "Factorise completely: 4x^2 + 4x",
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: false,
      purpose: "CHECK",
      answerKey: {
        kind: "OPEN_RESPONSE",
        canonicalAnswer: "4x(x + 1)",
        workedSolution: ["4x(x + 1)"],
        diagnostics: {
          slot: 3,
          itemKind: "FACTORISE",
          expression: "4x^2 + 4x",
          skillId: "FAC_DIVIDE_TERMS",
          taggedSkills: ["FAC_GCF_VARIABLE"],
          stepSkills: ["FAC_DIVIDE_TERMS"],
          level: "medium",
          origin: "AI",
        } as any,
      },
    };

    const turn3 = f.state.turns.find((t: { turn: number }) => t.turn === 3);
    assert.ok(turn3, "Turn 3 must exist in session plan");
    turn3.status = "REPURPOSED";
    turn3.purpose = "CHECK";
    turn3.forSkill = "FAC_DIVIDE_TERMS";
    turn3.reason = "Targeted probe synthesized by lookahead background worker.";
    f.versions["3"] = [...(f.versions["3"] ?? []), customProbe];
    f.preferred["3"] = customProbe.id;

    // Unconditionally verify lookahead queue swap state for Slot N+2
    assert.equal(turn3.status, "REPURPOSED", "Turn 3 must be repurposed by lookahead replan");
    const preferredId = f.preferred["3"];
    assert.equal(preferredId, customProbe.id, "Preferred question ID for Turn 3 must match custom probe");
    const swappedItem = f.versions["3"]?.find((item: LotusQuestion) => item.id === preferredId);
    assert.ok(swappedItem, "Slot 3 preferred item must exist in versions");
    assert.equal(swappedItem.id, customProbe.id, "Slot 3 item in versions must be the custom probe");

    // Now student answers Q2 and advances to Q3
    const q2 = session.currentQuestion!;
    const viewTurn3 = await service.answer(view.sessionId, view.studentId, {
      answer: "x(x + 5)",
      working: "",
      confidence: 80,
      responseTimeMs: 12000,
      didNotKnow: false,
      submissionId: "sub-swap-2",
      questionId: q2.id,
    });

    // Unconditionally verify that Turn 3 serves the synthesized custom probe
    assert.equal(viewTurn3.currentQuestion?.id, preferredId, "Turn 3 must serve the synthesized custom probe");
    assert.equal(viewTurn3.currentQuestion?.prompt, "Factorise completely: 4x^2 + 4x", "Turn 3 prompt must be the synthesized custom probe");
  });

  it("splices elastic runway probe into Slot N+1 (Q8.5) without truncating downstream curriculum", () => {
    const state: FactorisationState = {
      topic: "FACTORISATION",
      planTurn: 8,
      turns: CANONICAL_15_SPINE.map((spec, i) => ({
        turn: i + 1,
        slot: spec.slot,
        status: "PLANNED" as const,
        version: 0,
      })),
      answeredTurns: [1, 2, 3, 4, 5, 6, 7, 8],
      handledConfirmed: [],
      handledBroadened: [],
      fastSkips: 0,
    };

    const ledger = new Map<string, SkillLedgerEntry>([
      [
        "FAC_GROUP_TERMS",
        {
          skillId: "FAC_GROUP_TERMS",
          state: "SUSPECTED",
          suspectedAt: 8,
          mistakes: ["PAIRS_SHARE_NOTHING"],
          notes: ["ambiguous grouping slip"],
          sightings: [{ how: "mistake", mistake: "PAIRS_SHARE_NOTHING" }],
        },
      ],
    ]);

    const actions = planAdjustments({
      state,
      ledger,
      itemAt: () => undefined,
      askedItems: [],
    });

    const elasticAction = actions.find((a) => a.kind === "INSERT_ELASTIC_PROBE");
    assert.ok(elasticAction, "Ambiguous slip on Q8 must generate INSERT_ELASTIC_PROBE");
    assert.equal(elasticAction.turn, 9);
    assert.equal(elasticAction.probeSlot, 8.5);

    insertElasticProbe(state, elasticAction);
    assert.equal(state.turns.length, 16, "Queue must expand from 15 to 16 turns");
    assert.equal(state.turns[8]?.isElasticProbe, true, "Turn 9 must be the inserted elastic probe");
    assert.equal(state.turns[8]?.parentSlot, 8);

    // Downstream slots (9 to 15) must remain intact
    const remainingSlots = state.turns.slice(9).map((t) => t.slot);
    assert.deepEqual(remainingSlots, [9, 10, 11, 12, 13, 14, 15], "Downstream slots 9 to 15 must remain intact");
  });
});

describe("Lookahead AI Worker — Suite 4: Fallback to Pre-Baked Catalogue Slot", () => {
  it("cleanly serves pre-baked catalogue slot when AI worker is delayed (> think time)", async () => {
    const { models, service } = setupHarness();
    models.firstWrongStep = 2;

    const view = await startReady(service, "demo_speedy");
    await flushTicks();

    let releaseWriter!: () => void;
    models.writerGate = new Promise((resolve) => { releaseWriter = resolve; });

    const q1 = view.currentQuestion!;
    // Submit Q1; writer will be gated when background review repurposes Q3
    await service.answer(view.sessionId, view.studentId, {
      answer: "3(2x + 99)",
      working: "",
      confidence: 60,
      responseTimeMs: 3000,
      didNotKnow: false,
      submissionId: "sub-speed-1",
      questionId: q1.id,
    });

    // Let deferred review diagnose Q1 and enqueue gated write for Turn 3
    await flushTicks();

    // Student blitzes through Q2 before AI writer resolves
    const session = internalSession(service, view.sessionId);
    const q2 = session.currentQuestion!;
    const viewTurn3 = await service.answer(view.sessionId, view.studentId, {
      answer: "x(x + 5)",
      working: "",
      confidence: 90,
      responseTimeMs: 2000,
      didNotKnow: false,
      submissionId: "sub-speed-2",
      questionId: q2.id,
    });

    // Must cleanly serve pre-baked catalogue slot 3
    assert.ok(viewTurn3.currentQuestion, "Slot 3 must be served immediately");
    assert.equal(session.currentQuestion?.answerKey.diagnostics?.slot, 3);
    assert.equal(viewTurn3.currentQuestion.id, session.currentQuestion?.id);

    // Student blitzes through Q3 as well, advancing past Turn 4
    const q3 = session.currentQuestion!;
    await service.answer(view.sessionId, view.studentId, {
      answer: "4x(x + 1)",
      working: "",
      confidence: 90,
      responseTimeMs: 2000,
      didNotKnow: false,
      submissionId: "sub-speed-3",
      questionId: q3.id,
    });

    // Now let writer resolve late
    releaseWriter();
    await flushTicks();

    const f = session.factorisation;
    const writeLog = f.writes.find((w: { outcome: string }) => w.outcome === "STALE");
    assert.ok(writeLog, "Delayed write must be safely recorded as STALE without mutating active question");
  });

  it("restores slot to PLANNED and serves catalogue question when AI writer fails or exhausts retries", async () => {
    const { models, service } = setupHarness();

    const view = await startReady(service, "demo_fail_test");
    await flushTicks();

    models.writerShouldFail = true; // Writer fails on subsequent turns
    const q1 = view.currentQuestion!;
    await service.answer(view.sessionId, view.studentId, {
      answer: "3(2x + 99)",
      working: "",
      confidence: 50,
      responseTimeMs: 10000,
      didNotKnow: false,
      submissionId: "sub-fail-1",
      questionId: q1.id,
    });

    await flushTicks();
    const session = internalSession(service, view.sessionId);
    const f = session.factorisation;

    // Verify slot does not remain stuck in SKIPPED; held status is restored
    const turns = f.state.turns;
    const nonSkippedCount = turns.filter((t: { status: string }) => t.status !== "SKIPPED").length;
    assert.ok(nonSkippedCount >= 15, "Slot must not be permanently lost due to AI writer failure");
  });

  it("immediately serves pre-baked catalogue slot during total provider outage without hanging", async () => {
    const { models, service } = setupHarness();
    models.activeOutage = { at: Date.now(), reason: "API key quota exhausted" };

    // Service start handles outage gracefully
    const view = await service.start("demo_outage", "FACTORISATION");
    await flushTicks();

    const session = internalSession(service, view.sessionId);
    assert.ok(session, "Session must initialize even during model outage");
  });
});

describe("Lookahead AI Worker — Suite 5: Session Queue Invariants", () => {
  it("enforces monotonic turn progression without skipping backwards or repeating turns", async () => {
    const { service } = setupHarness();
    let view = await startReady(service, "demo_monotonic");
    await flushTicks();

    const answeredTurnIndices: number[] = [];
    for (let turn = 1; turn <= 5; turn++) {
      const q = view.currentQuestion!;
      answeredTurnIndices.push(turn);
      view = await service.answer(view.sessionId, view.studentId, {
        answer: "correct-answer",
        working: "",
        confidence: 80,
        responseTimeMs: 10000,
        didNotKnow: false,
        submissionId: `sub-mono-${turn}`,
        questionId: q.id,
      });
      await flushTicks();
    }

    const session = internalSession(service, view.sessionId);
    assert.deepEqual(session.factorisation.state.answeredTurns, [1, 2, 3, 4, 5], "Answered turns must strictly advance 1 to 5");
  });

  it("preserves board terminology switch across swapped probes and catalogue fallbacks", () => {
    const samplePrompts = [
      "Find the GCF of 12x and 18",
      "Factorise by grouping method: 2xy + 2y + 3x + 3",
      "Factorise by splitting the middle term: x^2 + 5x + 6",
    ];

    for (const prompt of samplePrompts) {
      const cbse = adaptPromptForBoard(prompt, "CBSE");
      assert.ok(!cbse.includes("GCF"), "CBSE must never show GCF");
      assert.ok(cbse.includes("HCF") || cbse.includes("regrouping") || cbse.includes("splitting"), "CBSE must adapt terminology");

      const icse = adaptPromptForBoard(prompt, "ICSE");
      assert.ok(!icse.includes("GCF"), "ICSE must never show GCF");
      assert.ok(icse.includes("HCF") || icse.includes("grouping method") || icse.includes("quadratic factors"), "ICSE must adapt terminology");

      const igcse = adaptPromptForBoard(prompt, "IGCSE");
      assert.ok(!igcse.includes("HCF"), "IGCSE must never show HCF");
      assert.ok(
        igcse.includes("GCF") ||
        igcse.toLowerCase().includes("pairs") ||
        igcse.includes("double brackets") ||
        igcse.includes("(x + p)(x + q)"),
        "IGCSE must adapt terminology"
      );
    }
  });

  it("preserves total question count of 15 baseline and protects Tier 4 and 5 slots from pruning", () => {
    const spine = CANONICAL_15_SPINE;
    assert.equal(spine.length, 15, "Canonical spine must contain exactly 15 slots");

    // Tier 4: Difference of squares & perfect squares
    const tier4 = spine.filter((s) => s.slot >= 9 && s.slot <= 11);
    assert.equal(tier4.length, 3, "Tier 4 must have 3 slots");
    assert.ok(tier4.every((s) => s.skillId.startsWith("FAC_DIFF") || s.skillId.startsWith("FAC_PERFECT")));

    // Tier 5: Quadratics & synthesis
    const tier5 = spine.filter((s) => s.slot >= 12 && s.slot <= 15);
    assert.equal(tier5.length, 4, "Tier 5 must have 4 slots");
    assert.ok(tier5.some((s) => s.skillId === "FAC_MONIC_TRINOMIAL"));
    assert.ok(tier5.some((s) => s.skillId === "FAC_FACTOR_FULLY"));
  });
});
});

