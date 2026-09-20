/**
 * Whole factorisation sessions through LotusService, with a fake AI — no
 * network, no cost. Checks the promises the design makes: the next question
 * is always the one the browser already holds, nothing about the diagnosis
 * leaks while the test is running, AI-written questions replace the fixed
 * ones before the student reaches them, a background review never swaps the
 * question the browser holds, and gaps change the rest of the test.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusSessionView,
} from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";
import { LotusQuestionFactory, prettyPowers } from "../../src/lotus/lotus-question-factory";

const ASSESSMENT: LotusModelAssessment = {
  mathJudgment: "UNRESOLVED",
  observations: ["fake"],
  hypotheses: [],
  phaseRecommendation: "EXPLORE",
  proposedAction: "ASK",
  conciseRationale: "fake",
};

const DEBATE: LotusGptDebateResponse = {
  agreements: [],
  disagreements: [],
  disagreementExample: "None.",
  acceptedImprovements: [],
  revisedConclusion: "fake",
  revisedAction: "ASK",
  revisedPhase: "EXPLORE",
};

const CLOSURE: LotusDebateClosure = {
  verdict: "ACCEPTED",
  acceptedFromGpt: [],
  acceptedFromChallenger: [],
  rejectedClaims: [],
  conclusion: "fake",
  evidenceState: "PARTIAL",
  uncertainty: [],
  phase: "EXPLORE",
  action: "ASK",
  selectionReason: "fake",
  exitDiagnostic: false,
};

const DIFF_SQUARES_WRITE = {
  prompt: "Factorise completely: x^2 - 25",
  expression: "x^2 - 25",
  answer: "(x - 5)(x + 5)",
  wrongAnswers: [
    { answer: "(x - 5)^2", mistake: "WROTE_PERFECT_SQUARE" },
    { answer: "(x - 25)(x + 25)", mistake: "DROPPED_SQUARE" },
  ],
  steps: [
    { line: "x^2 - 25 = x^2 - 5^2", skill: "FAC_DIFF_SQUARES" },
    { line: "(x - 5)(x + 5)", skill: "FAC_DIFF_SQUARES" },
  ],
};

/**
 * A controlled stand-in for the question-writing model. These are test data,
 * not a product question bank: each response still travels through the same
 * writer parser and deterministic algebra checks as a live model response.
 */
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
    default: throw new Error(`no controlled writer fixture for ${shape}`);
  }
}

class FakeModels {
  readonly primaryModel = "fake-primary";
  readonly challengerModel = "fake-challenger";
  closures = 0;
  writes = 0;
  closureGate: Promise<void> | null = null;
  firstWrongStep: number | null = null;
  writer: (prompt: string) => Record<string, unknown> = controlledWrite;
  blindChoice: (prompt: string) => string = (prompt) => prompt.match(/Options:\n- ([^\n]+)/)?.[1] ?? "";

  get status() {
    return { enabled: true, ready: true, missingConfiguration: [] as string[], progressiveStreamingEnabled: false };
  }
  get progressiveStreamingEnabled() {
    return false;
  }
  assertReady(): void {}
  async primaryAssessment() { return ASSESSMENT; }
  async challengerAssessment() { return ASSESSMENT; }
  async primaryDebate() { return DEBATE; }
  async challengerClosure(): Promise<LotusDebateClosure> {
    this.closures += 1;
    if (this.closureGate) await this.closureGate;
    return { ...CLOSURE, firstWrongStep: this.firstWrongStep };
  }
  async writeQuestion(prompt: string) {
    this.writes += 1;
    return this.writer(prompt);
  }
  async solveBlind(prompt: string) { return { choice: this.blindChoice(prompt) }; }
  async generateReserveCandidates() { return []; }
  async reviseQuestion(): Promise<never> { throw new Error("not used"); }
}

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

function setup() {
  const models = new FakeModels();
  const service = new LotusService(models as unknown as LotusModelService, null);
  services.push(service);
  return { models, service };
}

/** Lets background work (question writes, AI reviews) run to completion. */
async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Start only returns a preparation view; wait for the validated AI opener. */
async function startReady(service: LotusService, studentId: string): Promise<LotusSessionView> {
  const started = await service.start(studentId, "FACTORISATION");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flush();
    const view = await service.get(started.sessionId);
    if (view.currentQuestion && view.preparation?.ready) return view;
  }
  throw new Error("controlled AI writer did not prepare the factorisation diagnostic");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function internal(service: LotusService, sessionId: string): any {
  return (service as unknown as { sessions: Map<string, unknown> }).sessions.get(sessionId);
}

/** A wrong answer the current question predicts, read from the server's own copy (the browser never has it). */
function predictedWrong(service: LotusService, view: LotusSessionView): string {
  return internal(service, view.sessionId).currentQuestion.answerKey.diagnostics.predictedMistakes[0].answer;
}

let submissionCounter = 0;
async function submit(
  service: LotusService,
  view: LotusSessionView,
  answer: string,
  extra: { working?: string; didNotKnow?: boolean; responseTimeMs?: number } = {},
): Promise<LotusSessionView> {
  return service.answer(view.sessionId, view.studentId, {
    answer,
    working: extra.working ?? answer,
    confidence: 60,
    responseTimeMs: extra.responseTimeMs ?? 45_000,
    didNotKnow: extra.didNotKnow ?? false,
    submissionId: `sub-${(submissionCounter += 1)}`,
    questionId: view.currentQuestion?.id,
    nextQuestionId: view.upcomingQuestions?.[0]?.id,
  });
}

/** Plays a demo persona to the end, checking on every Submit that the question shown is the one the browser already had. */
async function playPersona(service: LotusService, studentId: string) {
  let view = await startReady(service, studentId);
  let answered = 0;
  while (view.status === "ACTIVE") {
    await flush();
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    const fill = await service.demoFill(view.sessionId, studentId);
    view = await submit(service, view, fill.answer, { working: fill.working });
    answered += 1;
    if (view.status === "ACTIVE") assert.equal(view.currentQuestion?.id, staged?.id, `Q${answered + 1} must be the staged question`);
    assert.ok(answered <= 25, "the plan never grows past 25 questions");
  }
  await flush();
  return { view: await service.get(view.sessionId), answered };
}

describe("factorisation session — start", () => {
  it("the checked reserve is ready while all 25 questions are prepared, and no key or diagnosis leaks", async () => {
    const { service } = setup();
    const view = await service.start("demo_aarav", "FACTORISATION");
    assert.equal(view.topic, "FACTORISATION");
    assert.equal(view.status, "ACTIVE");
    assert.equal(view.currentQuestion, null, "the diagnostic remains in preparation until the first AI item passes validation");
    assert.equal(view.upcomingQuestions!.length, 0);
    for (const item of view.upcomingQuestions!) assert.equal(item.answerKey.canonicalAnswer, "");
    const wire = JSON.stringify(view);
    for (const secret of ["diagnostics", "predictedMistakes", "\"factorisation\":", "stepSkills", "workedSolution\":[\""]) {
      assert.ok(!wire.includes(secret), `the browser must not receive ${secret}`);
    }
  });

  it("the brackets diagnostic is unchanged when no topic is given", async () => {
    const { service } = setup();
    const view = await service.start("demo_aarav");
    assert.notEqual(view.topic, "FACTORISATION");
    assert.equal(internal(service, view.sessionId).factorisation, undefined);
  });

  it("the first question varies across sessions, and every question is AI-generated — never a hardcoded fallback (Phase 3)", async () => {
    const a = setup();
    const b = setup();
    const viewA = await startReady(a.service, "demo_aarav");
    const viewB = await startReady(b.service, "demo_meena");
    assert.notEqual(viewA.currentQuestion!.prompt, viewB.currentQuestion!.prompt, "two sessions must not share the same opening question");
    for (const view of [viewA, viewB]) {
      const session = internal(view === viewA ? a.service : b.service, view.sessionId);
      const allQuestions = [session.openingAudit?.question, session.currentQuestion, ...Object.values(session.factorisation.versions).flat()]
        .filter((q: unknown): q is { answerKey: { diagnostics?: { origin?: string } } } => !!q);
      assert.ok(allQuestions.length > 0);
      for (const question of allQuestions) {
        assert.equal(question.answerKey.diagnostics?.origin, "AI", "every factorisation item must be AI-generated; a hardcoded provenance is never eligible for display");
      }
    }
  });
});

describe("factorisation session — the AI writes each student's own questions", () => {
  it("an AI-written, code-proven question replaces the fixed one before the student reaches it", async () => {
    const { models, service } = setup();
    models.writer = (prompt) => {
      if (prompt.includes("Skill tested: FAC_DIFF_SQUARES") && prompt.includes("Difficulty: easy")) return DIFF_SQUARES_WRITE;
      throw new Error("writer offline");
    };
    const started = await service.start("demo_meena", "FACTORISATION");
    await flush();
    const view = await service.get(started.sessionId);
    const prompts = view.upcomingQuestions!.map((item) => item.prompt);
    assert.ok(prompts.includes("Factorise completely: x² - 25"), "turn 9 now shows the AI's version, with x² rather than x^2");
    assert.ok(!prompts.includes("Factorise completely: x² − 9"), "the fixed version is no longer shown");
    const writes = internal(service, started.sessionId).factorisation.writes;
    assert.equal(writes.filter((w: { outcome: string }) => w.outcome === "USED").length, 1);
    assert.ok(writes.length >= 15, "the preparation attempt covers the 15-question start threshold");
  });

  it("when every AI write fails, the test still runs on the fixed, proven questions", async () => {
    const { models, service } = setup();
    models.writer = () => { throw new Error("writer offline"); };
    const view = await service.start("demo_divya", "FACTORISATION");
    await flush();
    const after = await service.get(view.sessionId);
    assert.equal(after.currentQuestion, null);
    assert.equal(after.preparation?.ready, false);
  });
});

describe("factorisation session — every Submit is instant", () => {
  it("a student who gets everything right sees all 25 questions and is reported secure", async () => {
    const { service } = setup();
    const { view, answered } = await playPersona(service, "demo_divya");
    assert.equal(answered, 25);
    assert.equal(view.finalReport!.outcome, "ADVANCEMENT");
    assert.deepEqual(view.finalReport!.notTested, []);
    assert.ok(view.audits.every((audit) => audit.analysisStatus === "COMPLETE"));
  });

  for (const persona of ["demo_aarav", "demo_meena", "demo_rohan"]) {
    it(`${persona}: a repeated mistake is confirmed as a gap and the rest of the test changes`, async () => {
      const { service } = setup();
      const { view, answered } = await playPersona(service, persona);
      const report = view.finalReport!;
      const confirmed = report.skills!.filter((skill) => skill.state === "CONFIRMED");
      assert.ok(confirmed.length > 0, `${persona} should have a confirmed gap`);
      assert.equal(report.outcome, "SOLID_GAP");
      const turns = internal(service, view.sessionId).factorisation.state.turns;
      const changed = turns.filter((turn: { status: string }) => turn.status !== "PLANNED");
      assert.ok(changed.length > 0, "a confirmed gap changes later questions");
      // Released with the report, not before.
      assert.ok(view.audits.every((audit) => Array.isArray(audit.skillEvidence)));
      console.log(`    ${persona}: ${answered} answered; confirmed ${confirmed.map((s) => s.skillId).join(", ")}; ` +
        `changed turns ${changed.map((t: { turn: number; status: string; purpose?: string }) => `${t.turn}:${t.purpose ?? t.status}`).join(" ")}`);
    });
  }
});

describe("factorisation session — safety of the running test", () => {
  it("while the test runs, the browser never sees what each answer said about a skill", async () => {
    const { service } = setup();
    let view = await startReady(service, "demo_aarav");
    view = await submit(service, view, predictedWrong(service, view));
    await flush();
    view = await service.get(view.sessionId);
    assert.equal(view.audits[0]!.skillEvidence, undefined);
    assert.equal(view.audits[0]!.questionSelection.reason, "");
    assert.equal(view.audits[0]!.verification!.status, "VERIFIED_INCORRECT");
    assert.ok(internal(service, view.sessionId).audits[0].skillEvidence.length > 0, "the server still has it");
  });

  it("an explicit I-don't-know response is recorded as a support signal", async () => {
    const { models, service } = setup();
    let view = await startReady(service, "demo_divya");
    view = await submit(service, view, "I don't know", { didNotKnow: true, working: "", responseTimeMs: 3_000 });
    await flush();
    const session = internal(service, view.sessionId);
    assert.equal(session.factorisation.state.fastSkips, 0);
    assert.equal(session.audits[0].skillEvidence[0]?.kind, "DID_NOT_KNOW");
    assert.equal(session.audits[0].analysisStatus, "NOT_REQUIRED");
    assert.equal(session.audits[0].analysisSource, "SUPPORT_SIGNAL");
    assert.equal(session.audits[0].gpt, undefined);
    assert.equal(session.audits[0].challenger, undefined);
    assert.equal(session.audits[0].debate, undefined);
    assert.ok(session.audits[0].adaptiveDecision, "the support signal still receives a transparent, validated plan decision");
    assert.equal(session.audits[0].adaptiveDecision.source, "RULE_VALIDATED_PLAN");
    assert.match(session.audits[0].adaptiveDecision.observedError, /do not know/i);
    assert.ok(
      ["EASIER_PREREQUISITE", "TARGETED_PROBE", "KEEP"].includes(session.audits[0].adaptiveDecision.action),
      "the action must be an explicit safe-plan outcome, never an invisible placeholder",
    );
    assert.equal(models.closures, 0);
  });

  it("sending the same answer twice records it once", async () => {
    const { service } = setup();
    const view = await startReady(service, "demo_divya");
    const response = {
      answer: "3(2x + 3)", working: "", confidence: 80, responseTimeMs: 30_000, didNotKnow: false,
      submissionId: "same-submission", questionId: view.currentQuestion!.id, nextQuestionId: view.upcomingQuestions![0]!.id,
    };
    const first = await service.answer(view.sessionId, view.studentId, response);
    const second = await service.answer(view.sessionId, view.studentId, response);
    assert.equal(second.audits.length, 1);
    assert.equal(second.currentQuestion!.id, first.currentQuestion!.id);
  });

  it("a next question the server never offered is refused", async () => {
    const { service } = setup();
    const view = await startReady(service, "demo_divya");
    await assert.rejects(
      service.answer(view.sessionId, view.studentId, {
        answer: "3(2x + 3)", working: "", confidence: 80, responseTimeMs: 30_000, didNotKnow: false,
        submissionId: "x", questionId: view.currentQuestion!.id, nextQuestionId: "made-up",
      }),
      /not authorized/,
    );
  });

  it("a background review never swaps the question the browser already holds, but changes the ones after it", async () => {
    const { models, service } = setup();
    let release!: () => void;
    models.closureGate = new Promise((resolve) => { release = resolve; });
    models.firstWrongStep = 2; // the opener's step 2 is "divide each term"
    let view = await startReady(service, "demo_aarav");
    // Q1: a wrong answer code can't explain — only the (delayed) AI review will blame dividing the terms.
    view = await submit(service, view, "3(2x + 4)");
    // Q2 (x² + 5x): the predicted "divided the first term only" — the same skill, caught instantly.
    view = await submit(service, view, "x(x + 5x)");
    const before = view.upcomingQuestions!.map((item) => item.id);
    assert.match(view.upcomingQuestions![0]!.prompt, /12x²/, "turn 4 needs dividing every term");

    release();
    await flush();
    view = await service.get(view.sessionId);
    const afterIds = view.upcomingQuestions!.map((item) => item.id);
    assert.equal(afterIds[0], before[0], "the question the browser holds is never swapped");
    assert.notDeepEqual(afterIds.slice(1), before.slice(1), "later questions changed");
    const session = internal(service, view.sessionId);
    assert.ok(session.audits.some((audit: { analysisStatus: string }) => audit.analysisStatus === "COMPLETE"), "the delayed review completed");
    assert.ok(session.factorisation.writes.some((write: { purpose: string; outcome: string }) => write.purpose === "CHECK" && write.outcome === "USED"), "the review caused a fresh future check");
  });

  it("an AI-found mistake installs its check in the earliest unseen slot, never a distant Q24/Q25 rewrite (the observed Q2 case)", async () => {
    // Replays the failure mode from COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md
    // §8: a mistake code alone couldn't explain was correctly picked up by
    // the AI review, but the plan change previously landed at a distant,
    // unrelated Q24/Q25 slot instead of near the current turn.
    const { models, service } = setup();
    let release!: () => void;
    models.closureGate = new Promise((resolve) => { release = resolve; });
    models.firstWrongStep = 2;
    let view = await startReady(service, "demo_aarav");
    view = await submit(service, view, "3(2x + 4)"); // unpredicted — only the AI review can explain it
    release();
    await flush();
    view = await service.get(view.sessionId);
    const session = internal(service, view.sessionId);
    const check = session.factorisation.state.turns.find((t: { purpose?: string }) => t.purpose === "CHECK");
    assert.ok(check, "expected the AI's finding to install a targeted check");
    assert.ok(check.turn <= session.audits.length + 6,
      `check installed at turn ${check.turn}, expected it within a few turns of the current one (Q${session.audits.length + 1}), not far in the plan`);
    assert.ok(![24, 25].includes(check.turn), "must never land at the distant Q24/Q25 slots merely because they were still unseen");
    const decision = session.audits[0].adaptiveDecision;
    assert.ok(decision, "the later AI review must leave an explicit, observer-visible decision record");
    assert.equal(decision!.action, "TARGETED_PROBE");
    assert.equal(decision!.targetTurn, check.turn, "the visible requested placement must be the actual validated plan slot");
    assert.match(decision!.requestedPlacement ?? "", new RegExp(`Question ${check.turn}`));
    assert.equal(decision!.implementation, "APPLIED", "the decision must distinguish a ready installed question from an unimplemented recommendation");
    assert.match(decision!.implementationDetail, /generated and installed/i);
  });

  it("shows the adaptation tag only on the installed changed item, never on an unchanged coverage question", async () => {
    const { models, service } = setup();
    let release!: () => void;
    models.closureGate = new Promise((resolve) => { release = resolve; });
    models.firstWrongStep = 2;
    let view = await startReady(service, "demo_aarav");
    view = await submit(service, view, "3(2x + 4)"); // unpredicted — only the AI review can explain it
    release();
    await flush();
    view = await service.get(view.sessionId);
    let session = internal(service, view.sessionId);
    const check = session.factorisation.state.turns.find((t: { purpose?: string }) => t.purpose === "CHECK");
    assert.ok(check, "expected the AI's finding to install a targeted check");

    let taggedAudit: { questionSelection: { adaptationTag?: { kind: string; skill?: string } } } | undefined;
    for (let i = 0; i < 10 && session.factorisation.state.planTurn < check.turn; i += 1) {
      const before = session.factorisation.state.planTurn;
      view = await submit(service, view, predictedWrong(service, view));
      session = internal(service, view.sessionId);
      if (before < check.turn && session.factorisation.state.planTurn === check.turn) {
        taggedAudit = view.audits.at(-1);
      }
    }
    assert.ok(taggedAudit, "never reached the installed check turn within the loop budget");
    assert.equal(taggedAudit!.questionSelection.adaptationTag?.kind, "TARGETED_CHECK");
    assert.match(String((taggedAudit!.questionSelection.adaptationTag as { skill: string }).skill), /\S/, "the tag must name the skill it targets");

    // Every other, unchanged turn in this same response must carry no tag at all.
    const untaggedCount = view.audits.filter((audit) => audit !== taggedAudit && audit.questionSelection.adaptationTag).length;
    assert.equal(untaggedCount, 0, "an adaptation tag must never appear on an unchanged, originally-planned coverage item");
  });

  it("rapid progress through several turns while an earlier review is still pending doesn't corrupt the plan or duplicate a probe", async () => {
    const { models, service } = setup();
    let release!: () => void;
    models.closureGate = new Promise((resolve) => { release = resolve; });
    models.firstWrongStep = 2;
    let view = await startReady(service, "demo_aarav");
    // Q1's review is held open while the student races ahead to Q5.
    view = await submit(service, view, "3(2x + 4)");
    for (let i = 0; i < 4; i += 1) {
      const predicted = predictedWrong(service, view);
      view = await submit(service, view, predicted);
    }
    assert.equal(view.audits.length, 5);
    assert.ok(view.status === "ACTIVE" || view.status === "COMPLETE");
    release();
    await flush();
    view = await service.get(view.sessionId);
    const session = internal(service, view.sessionId);
    assert.ok(session.audits[0].analysisStatus === "COMPLETE", "Q1's late review still completes");
    const checks = session.factorisation.state.turns.filter((t: { purpose?: string }) => t.purpose === "CHECK") as
      Array<{ forSkill?: string }>;
    const skillsChecked = checks.map((t) => t.forSkill);
    assert.equal(skillsChecked.length, new Set(skillsChecked).size, "the same skill must never claim two targeted-check slots");
    for (let i = 1; i < 5; i += 1) {
      assert.equal(session.audits[i].analysisStatus, "COMPLETE", `Q${i + 1}'s own instant/AI evidence is unaffected by Q1's delayed result`);
    }
  });

  it("does not serialise Q2 behind a slow Q1 review", async () => {
    const { models, service } = setup();
    let release!: () => void;
    models.closureGate = new Promise((resolve) => { release = resolve; });
    let view = await startReady(service, "demo_meera");
    view = await submit(service, view, "3(2x + 4)");
    view = await submit(service, view, predictedWrong(service, view));
    await flush();
    assert.equal(
      models.closures,
      2,
      "both Q1 and Q2 must reach the model closure while Q1 is blocked; a per-session serial queue would leave this at one",
    );
    release();
    await flush();
    const session = internal(service, view.sessionId);
    assert.equal(session.audits[0].analysisStatus, "COMPLETE");
    assert.equal(session.audits[1].analysisStatus, "COMPLETE");
    assert.ok(session.audits[0].analysisQueuedAt && session.audits[0].analysisStartedAt, "queue timing is durable observer evidence");
  });

  it("keeps a late review as report evidence without letting it rewrite an obsolete plan", async () => {
    const { models, service } = setup();
    let release!: () => void;
    models.closureGate = new Promise((resolve) => { release = resolve; });
    models.firstWrongStep = 2;
    let view = await startReady(service, "demo_nikhil");
    view = await submit(service, view, "3(2x + 4)");
    const session = internal(service, view.sessionId);
    session.audits[0].analysisDeadlineAt = new Date(0).toISOString();
    const before = session.factorisation.state.turns.map((turn: { turn: number; status: string; purpose?: string }) => ({ ...turn }));
    release();
    await flush();
    const audit = session.audits[0];
    assert.equal(audit.analysisStatus, "COMPLETE");
    assert.equal(audit.analysisLate, true);
    assert.equal(audit.adaptiveDecision?.action, "KEEP");
    assert.match(audit.adaptiveDecision?.implementationDetail ?? "", /evidence was added only/i);
    assert.deepEqual(
      session.factorisation.state.turns.map((turn: { turn: number; status: string; purpose?: string }) => ({ ...turn })),
      before,
      "a stale analysis must not revise an unseen-plan slot",
    );
  });

  it("when a secure skill has no different representation to check, the decision is an explicit KEEP, never an invented probe", async () => {
    const { service } = setup();
    let view = await startReady(service, "demo_divya"); // gets everything right
    // FAC_PERFECT_SQUARE_PLUS (slot 11) is the only catalogue slot for that skill — no widen target exists.
    while (view.status === "ACTIVE" && internal(service, view.sessionId).audits.length < 11) {
      const canonical = internal(service, view.sessionId).currentQuestion.answerKey.canonicalAnswer;
      view = await submit(service, view, canonical);
      await flush();
      view = await service.get(view.sessionId);
    }
    const session = internal(service, view.sessionId);
    const audit = session.audits.find((a: { question: { answerKey: { diagnostics?: { skillId: string } } } }) =>
      a.question.answerKey.diagnostics?.skillId === "FAC_PERFECT_SQUARE_PLUS");
    assert.ok(audit?.adaptiveDecision, "a completed response must always expose the validated plan decision");
    assert.equal(audit!.adaptiveDecision!.action, "KEEP", "no widen target is available, so the decision must be an explicit KEEP");
  });

  it("an observer can end the test early; the report says what wasn't reached", async () => {
    const { service } = setup();
    let view = await startReady(service, "demo_aarav");
    view = await submit(service, view, predictedWrong(service, view));
    await assert.rejects(service.override(view.sessionId, view.studentId, "REPLACE_QUESTION"), /planned skill map/);
    view = await service.override(view.sessionId, view.studentId, "END_NOW");
    assert.equal(view.status, "COMPLETE");
    assert.match(view.finalReport!.limitations[0]!, /ended the test after 1 of 25/);
    assert.notEqual(view.finalReport!.outcome, "SOLID_GAP", "one mistake is never a confirmed gap");
  });
});

describe("question factory — AI writes, code checks", () => {
  const spec9 = FACTORISATION_SLOTS[8]!; // difference of squares, easy
  const spec12 = FACTORISATION_SLOTS[11]!; // product-and-sum, multiple choice

  it("rejects an answer key that isn't equal to the expression, then gives up so the fixed question stays", async () => {
    const factory = new LotusQuestionFactory({
      writeQuestion: async () => ({ ...DIFF_SQUARES_WRITE, answer: "(x - 5)(x - 5)" }),
      solveBlind: async () => ({}),
    });
    const result = await factory.write({ spec: spec9, purpose: "BASE", avoid: [] });
    assert.equal(result.item, null);
    assert.equal(result.attempts, 2);
    assert.match(result.rejections.join(" "), /attempt 1/);
  });

  it("a targeted CHECK that doesn't actually cover the requested mistake is rejected — a valid item isn't enough if it can't re-elicit the suspicion", async () => {
    // DIFF_SQUARES_WRITE's predicted wrong answers cover WROTE_PERFECT_SQUARE
    // and DROPPED_SQUARE, never NOT_DIFF_OF_SQUARES — a perfectly valid item
    // that still can't distinguish this specific suspected mistake.
    const factory = new LotusQuestionFactory({ writeQuestion: async () => DIFF_SQUARES_WRITE, solveBlind: async () => ({}) });
    const missCoverage = await factory.write({ spec: spec9, purpose: "CHECK", targetMistake: "NOT_DIFF_OF_SQUARES", avoid: [] });
    assert.equal(missCoverage.item, null);
    assert.match(missCoverage.rejections.join(" "), /does not cover the requested mistake NOT_DIFF_OF_SQUARES/);

    const withCoverage = await factory.write({ spec: spec9, purpose: "CHECK", targetMistake: "WROTE_PERFECT_SQUARE", avoid: [] });
    assert.ok(withCoverage.item, "the same item is accepted once the requested mistake is actually one of its predicted wrong answers");
  });

  it("rejects a worded question the blind solver answers differently", async () => {
    const write = {
      prompt: "Which two numbers have a product of 10 and a sum of -7?",
      options: ["-2 and -5", "2 and 5", "-1 and -10", "-3 and -4"],
      correctOption: "-2 and -5",
      wrongOptionMistakes: [
        { option: "2 and 5", mistake: "SIGN_PAIR_ERROR" },
        { option: "-1 and -10", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
      steps: [
        { line: "Pairs with product 10: (1, 10), (2, 5)", skill: "FND_FACTOR_PAIRS" },
        { line: "-2 + -5 = -7", skill: "FAC_PAIR_PRODUCT_SUM" },
      ],
    };
    const agree = new LotusQuestionFactory({ writeQuestion: async () => write, solveBlind: async () => ({ choice: "-2 and -5" }) });
    assert.ok((await agree.write({ spec: spec12, purpose: "BASE", avoid: [] })).item);
    const disagree = new LotusQuestionFactory({ writeQuestion: async () => write, solveBlind: async () => ({ choice: "2 and 5" }) });
    const result = await disagree.write({ spec: spec12, purpose: "BASE", avoid: [] });
    assert.equal(result.item, null);
    assert.match(result.rejections.join(" "), /blind solver chose/);
  });

  it("a rewrite that still needs the student's confirmed gap is rejected", async () => {
    const factory = new LotusQuestionFactory({ writeQuestion: async () => DIFF_SQUARES_WRITE, solveBlind: async () => ({}) });
    assert.ok((await factory.write({ spec: spec9, purpose: "AVOID", avoidSkill: "FAC_DIVIDE_TERMS", avoid: [] })).item);
    const result = await factory.write({ spec: spec9, purpose: "AVOID", avoidSkill: "FND_RECOGNISE_SQUARE", avoid: [] });
    assert.equal(result.item, null);
    assert.match(result.rejections.join(" "), /still needs FND_RECOGNISE_SQUARE/);
  });

  it("students see x², not x^2, and the checker still reads it", async () => {
    assert.equal(prettyPowers("Factorise 3x^2 - 12 and x^10"), "Factorise 3x² - 12 and x¹⁰");
    const factory = new LotusQuestionFactory({ writeQuestion: async () => DIFF_SQUARES_WRITE, solveBlind: async () => ({}) });
    const result = await factory.write({ spec: spec9, purpose: "BASE", avoid: [] });
    assert.equal(result.item!.prompt, "Factorise completely: x² - 25");
    assert.equal(result.item!.answerKey.diagnostics!.expression, "x^2 - 25", "machine fields keep ^");
  });

  it("a question already in this student's test is rejected", async () => {
    const factory = new LotusQuestionFactory({ writeQuestion: async () => DIFF_SQUARES_WRITE, solveBlind: async () => ({}) });
    const result = await factory.write({ spec: spec9, purpose: "BASE", avoid: ["x² − 25"] });
    assert.equal(result.item, null);
    assert.match(result.rejections.join(" "), /repeats a question/);
  });
});
