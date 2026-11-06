import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusDebateClosure, LotusQuestionAudit, LotusSessionView } from "@cogna/shared";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { checkedAiFormat, DRESSABLE_KINDS, evidenceFormatNeed, FORMAT_GUIDE, formatGuideForPrompt } from "../../src/lotus/lotus-format-guide";
import { singleReviewPrompt } from "../../src/lotus/lotus-prompts";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";

process.env.LOTUS_E2E_DISABLE_QUESTION_BANK = "true";
const flush = async () => { for (let i = 0; i < 80; i += 1) await new Promise((r) => setImmediate(r)); };

function answered(over: { kind?: string; status?: string; didNotKnow?: boolean; confidence?: number; ms?: number; mistake?: string; signals?: string[]; options?: string[] }): LotusQuestionAudit {
  return {
    question: { game: over.kind ? { kind: over.kind } : undefined, options: over.options, prompt: "Factorise" },
    response: { answer: "a", working: "", confidence: over.confidence ?? 80, responseTimeMs: over.ms ?? 30_000, didNotKnow: !!over.didNotKnow, gameReading: over.signals ? { signals: over.signals } : undefined },
    verification: { status: over.status ?? "VERIFIED_CORRECT" },
    skillEvidence: over.mistake ? [{ skillId: "S", kind: "MISTAKE", mistake: over.mistake, source: "INSTANT" }] : [],
  } as unknown as LotusQuestionAudit;
}
const need = (...audits: LotusQuestionAudit[]) => evidenceFormatNeed(audits);

describe("what the last answer asks of the next format", () => {
  it("a sign mistake asks for the signs on their own", () => {
    assert.equal(need(answered({ status: "VERIFIED_INCORRECT", mistake: "SIGNS_SWAPPED" }))?.kinds[0], "FOUR_SIGNS");
  });
  it("a sign slip hiding under a right answer asks for the same", () => {
    assert.equal(need(answered({ kind: "TWO_MOVES", signals: ["two_slips_cancel"] }))?.kinds[0], "FOUR_SIGNS");
  });
  it("a wrong pair asks to watch the search", () => {
    assert.equal(need(answered({ status: "VERIFIED_INCORRECT", mistake: "WRONG_FACTOR_PAIR_SUM" }))?.kinds[0], "TWO_NUMBERS");
  });
  it("not knowing asks for something that needs no recall", () => {
    assert.equal(need(answered({ status: "VERIFIED_INCORRECT", didNotKnow: true }))?.kinds[0], "RECTANGLE");
  });
  it("right but unsure asks where the doubt is", () => {
    assert.equal(need(answered({ confidence: 30 }))?.kinds[0], "SPLIT_CONFIDENCE");
    assert.equal(need(answered({ kind: "SPLIT_CONFIDENCE", signals: ["torn"] }))?.kinds.includes("SPLIT_CONFIDENCE"), false, "never the format that raised it");
  });
  it("right from options asks them to produce it", () => {
    assert.equal(need(answered({ options: ["a", "b"] }))?.kinds[0], "COMMIT_THEN_CHOOSE");
  });
  it("a game with its own question, or a staged choice, isn't 'chose from options'", () => {
    assert.equal(need(answered({ kind: "FIND_EVERY_B", options: ["a"] })), null);
    assert.equal(need(answered({ kind: "TEST_CLAIM", options: ["a"] })), null);
    const staged = answered({ options: ["a", "b"] });
    (staged.question as { presentation?: string }).presentation = "DETECTIVE";
    assert.equal(need(staged), null);
  });
  it("asking them to produce it stops once they have, and never asks for more typing", () => {
    const on = (a: LotusQuestionAudit, skillId: string) => { (a.question as { answerKey?: unknown }).answerKey = { diagnostics: { skillId } }; return a; };
    assert.equal(need(on(answered({}), "S"), on(answered({ options: ["a"] }), "S")), null);
    const kinds = need(on(answered({}), "OTHER"), on(answered({ options: ["a"] }), "S"))!.kinds;
    assert.deepEqual(kinds, ["COMMIT_THEN_CHOOSE", "TWO_MOVES"]);
  });
  it("fast and right twice asks whether it is autopilot", () => {
    assert.equal(need(answered({ ms: 4000 }), answered({ ms: 4000 }))?.kinds[0], "TRUE_FALSE");
  });
  it("a wrong answer is checked in a different format from the one that raised it", () => {
    const kinds = need(answered({ kind: "COMMIT_THEN_CHOOSE", status: "VERIFIED_INCORRECT" }))!.kinds;
    assert.ok(kinds.length > 0);
    assert.equal(kinds.includes("COMMIT_THEN_CHOOSE"), false);
  });
  it("a readable wrong answer asks for a format that tells a slip from a misconception, never a typing check", () => {
    const kinds = need(answered({ status: "VERIFIED_INCORRECT", mistake: "DIVIDED_FIRST_TERM_ONLY" }))!.kinds;
    assert.equal(kinds[0], "EDIT_HISTORY");
    assert.equal(kinds.includes("READBACK"), false);
  });
  it("an answer that couldn't be read is asked again with the drafts kept, never a read-back check", () => {
    assert.deepEqual(need(answered({ status: "NOT_DETERMINISTIC" }))?.kinds, ["EDIT_HISTORY"]);
    assert.equal(checkedAiFormat("READBACK"), null, "the AI can't ask for it either");
  });
  it("a sure, careful right answer asks nothing", () => {
    assert.equal(need(answered({})), null);
  });
  it("every format it can ask for is in the guide", () => {
    const cases = [answered({ didNotKnow: true }), answered({ status: "VERIFIED_INCORRECT" }), answered({ confidence: 10 }), answered({ options: ["a"] })];
    for (const c of cases) for (const kind of evidenceFormatNeed([c])!.kinds) assert.ok(FORMAT_GUIDE[kind], kind);
  });
});

describe("what the AI is told, and what it is allowed", () => {
  it("only a format that can dress a question gets through", () => {
    assert.equal(checkedAiFormat("four_signs"), "FOUR_SIGNS");
    assert.equal(checkedAiFormat("REPLAY"), null, "comes with its own question");
    assert.equal(checkedAiFormat("MAKE_IT_EASIER"), null);
    assert.equal(checkedAiFormat(null), null);
    assert.equal(checkedAiFormat(7), null);
  });
  it("the review prompt carries the guide, how the student played and the formats already seen", () => {
    const question = { phase: "DIAGNOSE", subtopic: "s", prompt: "Factorise x^2 + x - 12", options: undefined, answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "x", workedSolution: [] }, game: { kind: "TWO_MOVES" } };
    const prompt = singleReviewPrompt({
      audits: [answered({ kind: "SPLIT_CONFIDENCE" })], currentQuestion: question as never,
      currentResponse: { answer: "a", working: "", confidence: 70, responseTimeMs: 1000, didNotKnow: false, gameReading: { summary: "Two slips cancelled out.", signals: ["two_slips_cancel"] } } as never,
      currentVerification: { status: "VERIFIED_CORRECT" } as never, elapsedSeconds: 10, answeredCount: 1, phase: "DIAGNOSE" as never,
    });
    for (const kind of DRESSABLE_KINDS) assert.ok(prompt.includes(`- ${kind}:`), kind);
    assert.match(prompt, /Two slips cancelled out/);
    assert.match(prompt, /two_slips_cancel/);
    assert.match(prompt, /"format":"TWO_MOVES"/);
    assert.match(prompt, /already seen, oldest first: SPLIT_CONFIDENCE/);
    assert.match(prompt, /"nextFormat"/);
    assert.ok(formatGuideForPrompt().length < 2600, "small enough to add to every review");
  });
});

describe("in a running test", () => {
  const services: LotusService[] = [];
  after(() => { for (const s of services) (s as unknown as { onModuleDestroy?: () => void }).onModuleDestroy?.(); });

  class Reviewer extends FakeLotusModelService {
    prompts: string[] = [];
    constructor(private readonly format: unknown, private readonly why = "To separate the numbers from the signs.") { super(); }
    override async singleReview(prompt: string): Promise<LotusDebateClosure> {
      this.prompts.push(prompt);
      return { ...(await this.challengerClosure()), action: "ASK", exitDiagnostic: false, nextFormat: this.format as string, nextFormatReason: this.why };
    }
  }
  const internal = (service: LotusService, id: string) => (service as unknown as { sessions: Map<string, any> }).sessions.get(id);

  /** Plays right up to `upTo` answers, then gives one wrong answer no question predicted, which goes to the review. */
  async function wrongAt(format: unknown, upTo: number) {
    const reviewer = new Reviewer(format);
    const service = new LotusService(reviewer as unknown as LotusModelService, null);
    services.push(service);
    const student = `format_${String(format)}_${upTo}`;
    const started = await service.start(student, "FACTORISATION");
    let view: LotusSessionView = started;
    for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
    let n = 0;
    const send = async (answer: string, cur: any) => service.answer(view.sessionId, student, { answer, working: "", confidence: 70, responseTimeMs: 30_000, didNotKnow: false, submissionId: `s-${(n += 1)}`, questionId: cur.id, nextQuestionId: view.upcomingQuestions?.[0]?.id } as never);
    while (view.audits.length < upTo) {
      await flush(); view = await service.get(view.sessionId);
      const cur = internal(service, view.sessionId).currentQuestion;
      view = await send(cur.answerKey.canonicalAnswer, cur);
    }
    await flush(); view = await service.get(view.sessionId);
    const shownNext = view.upcomingQuestions?.[0]?.id;
    const cur = internal(service, view.sessionId).currentQuestion;
    const held = cur.id;
    view = await send("x + 99", cur);
    for (let i = 0; i < 6; i += 1) await flush();
    view = await service.get(view.sessionId);
    const session = internal(service, view.sessionId);
    const audit = session.audits.at(-1) as LotusQuestionAudit;
    return { service, session, audit, view, shownNext, held, reviewer };
  }

  it("follows a usable AI suggestion, on a later question, and says so", async () => {
    const { session, audit, view } = await wrongAt("FOUR_SIGNS", 10);
    const d = audit.formatDecision!;
    assert.equal(d.source, "AI");
    assert.equal(d.proposed, "FOUR_SIGNS");
    assert.equal(d.status, "APPLIED");
    assert.equal(d.reason, "To separate the numbers from the signs.");
    const f = session.factorisation;
    const item = f.versions[String(d.targetTurn)].find((q: any) => q.id === f.preferred[String(d.targetTurn)]);
    assert.equal(item.game.kind, d.chosen);
    assert.equal(d.chosen, "FOUR_SIGNS");
    assert.ok(d.targetTurn! > f.state.planTurn, "a later question, never the one on screen");
    assert.match(audit.questionSelection.planningNote ?? "", /FOUR_SIGNS/);
    assert.equal(view.upcomingQuestions?.some((q) => JSON.stringify(q).includes("separate the numbers")), false);
  });

  it("puts the format on the question that re-checks the skill that went wrong, when one is in reach", async () => {
    const { session, audit } = await wrongAt("EDIT_HISTORY", 10);
    const d = audit.formatDecision!;
    assert.equal(d.status, "APPLIED");
    const f = session.factorisation;
    const skill = audit.question.answerKey.diagnostics!.skillId;
    const about = (turn: number) => {
      const item = f.versions[String(turn)]?.find((q: any) => q.id === f.preferred[String(turn)]);
      return f.state.turns.find((t: any) => t.turn === turn)?.forSkill === skill || item?.answerKey.diagnostics?.skillId === skill;
    };
    const ahead = f.state.turns.filter((t: any) => t.turn > d.targetTurn! - 6 && t.turn < d.targetTurn! && t.turn > f.state.planTurn + 1 && t.status !== "SKIPPED");
    // Either the chosen question is about that skill, or none of the earlier candidates was.
    assert.ok(about(d.targetTurn!) || !ahead.some((t: any) => about(t.turn)));
  });

  it("tells the review which formats each upcoming question really takes, and what the server does by default", async () => {
    const { session, reviewer } = await wrongAt("FOUR_SIGNS", 10);
    const f = session.factorisation;
    const { fittingFormats, redressedQuestion } = await import("../../src/lotus/lotus-interactions");
    for (const t of f.state.turns.filter((turn: any) => turn.turn > f.state.planTurn && turn.status !== "SKIPPED")) {
      const item = f.versions[String(t.turn)]?.find((q: any) => q.id === f.preferred[String(t.turn)]);
      if (!item) continue;
      for (const kind of fittingFormats(item)) {
        assert.ok(item.game?.kind === kind || redressedQuestion(item, [kind], undefined, "probe"), `turn ${t.turn}: ${kind} is listed, so it must build`);
      }
    }
    const prompt = reviewer.prompts.at(-1)!;
    assert.match(prompt, /"formatsThatFit":\["/, "the real fits of each written upcoming question");
    assert.match(prompt, /"serverFormatDefault":\{"tries":\[[^\]]+\],"because":"Wrong once/, "a readable wrong answer: the server's own choice");
    assert.match(prompt, /slip or a held misconception/);
  });

  it("never changes the question the browser may already be showing next, and an old version can still be submitted", async () => {
    const { session, audit, shownNext } = await wrongAt("FOUR_SIGNS", 10);
    const f = session.factorisation;
    const frozen = session.currentQuestion;
    assert.equal(frozen.id, shownNext, "the staged question is what the student got");
    assert.notEqual(audit.formatDecision!.targetTurn, f.state.planTurn);
    const versions = f.versions[String(audit.formatDecision!.targetTurn)];
    // Formats are dealt at random, so the later question is sometimes already the one wanted and nothing is redressed.
    if (versions[0].game?.kind === audit.formatDecision!.chosen) {
      assert.equal(versions.length, 1, "already the wanted format, so nothing is replaced");
      return;
    }
    assert.ok(versions.length >= 2, "the older version stays valid");
    assert.notEqual(versions[0].id, versions.at(-1).id);
  });

  it("refuses a made-up format, records that, and falls back on the evidence", async () => {
    const { audit } = await wrongAt("MAKE_IT_EASIER", 12);
    const d = audit.formatDecision!;
    assert.equal(d.proposed, "MAKE_IT_EASIER");
    assert.equal(d.source, "EVIDENCE");
    assert.notEqual(d.chosen, "MAKE_IT_EASIER");
  });

  it("an AI choice that fits no upcoming question gives way to the evidence, and it says whose choice was used", async () => {
    const { audit } = await wrongAt("ORDER_STEPS", 18);
    const d = audit.formatDecision!;
    assert.equal(d.proposed, "ORDER_STEPS");
    if (d.chosen === "ORDER_STEPS") assert.equal(d.source, "AI");
    else assert.equal(d.source, "EVIDENCE");
    if (d.status !== "APPLIED") assert.equal(d.chosen, undefined);
  });

  it("a right, sure answer leaves the plan's formats alone", async () => {
    const service = new LotusService(new Reviewer("FOUR_SIGNS") as unknown as LotusModelService, null);
    services.push(service);
    const started = await service.start("format_quiet", "FACTORISATION");
    let view: LotusSessionView = started;
    for (let i = 0; i < 40 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(started.sessionId); }
    const cur = internal(service, view.sessionId).currentQuestion;
    await service.answer(view.sessionId, "format_quiet", { answer: cur.answerKey.canonicalAnswer, working: "", confidence: 90, responseTimeMs: 30_000, didNotKnow: false, submissionId: "q1", questionId: cur.id } as never);
    await flush();
    const audit = internal(service, view.sessionId).audits[0] as LotusQuestionAudit;
    // The first question offers chips, so it does ask them to produce the answer next; a sure typed answer asks nothing.
    assert.ok(!audit.formatDecision || audit.formatDecision.source === "EVIDENCE");
  });

  it("the student's copy never shows what was suspected", async () => {
    const { view } = await wrongAt("FOUR_SIGNS", 10);
    const text = JSON.stringify(view.audits);
    assert.equal(text.includes("formatDecision"), false);
    assert.equal(text.includes("nextFormat"), false);
    assert.equal(text.includes("separate the numbers"), false);
  });
});
