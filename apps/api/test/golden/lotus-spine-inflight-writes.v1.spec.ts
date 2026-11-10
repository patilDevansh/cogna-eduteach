// AI-written questions (no instant code-built games), so planned turns are still being written when a follow-up is inserted.
process.env.LOTUS_CODE_BUILT_QUESTIONS = "false";
process.env.LOTUS_E2E_DISABLE_QUESTION_BANK = "true";
/**
 * Remediation Phase 2 regression (gate run of Nov 10, 2026, session 0b470310): a live P01 run served
 * slots 1,2,1,3.5,3.5,3.5,4,… and never finished. A follow-up insert shifts every later turn number
 * up by one; a write already in flight for slot 3 then landed on the follow-up that took its old
 * turn number. The fake writer answers instantly, so the other specs could not see it. Here every
 * write takes a little time, so follow-ups are inserted while later turns are still being written.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PERSONA_CATALOGUE, PersonaFakeModels, chooseResponse } from "../fixtures/lotus-factorisation-personas";
import { CANONICAL_15_SPINE } from "../../src/lotus/lotus-factorisation-catalogue";
import { checkWrittenItem } from "../../src/lotus/lotus-question-factory";
import { codeProbeFor } from "../../src/lotus/lotus-probes";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class SlowWriter extends PersonaFakeModels {
  override async writeQuestion(prompt: string): Promise<Record<string, unknown>> {
    await sleep(60);
    return super.writeQuestion(prompt);
  }
}

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, id: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(id);

let submission = 0;
async function playWhileWriting(personaId: string) {
  const persona = PERSONA_CATALOGUE.find((p) => p.id === personaId)!;
  const service = new LotusService(new SlowWriter() as unknown as LotusModelService, null);
  services.push(service);
  const studentId = `demo_inflight_${personaId}`;
  let view: LotusSessionView = await service.start(studentId, "FACTORISATION");
  let answered = 0;
  for (let spins = 0; view.status === "ACTIVE" && answered < 20 && spins < 2_000; spins += 1) {
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    if (!view.currentQuestion || !view.preparation?.ready || (!staged && answered < 14)) { await sleep(5); continue; }
    const plan = chooseResponse(persona, internal(service, view.sessionId).currentQuestion, answered + 1);
    answered += 1;
    view = await service.answer(view.sessionId, studentId, {
      ...plan, confidence: 4, responseTimeMs: persona.paceMsBand[1], submissionId: `inflight-${(submission += 1)}`,
      questionId: view.currentQuestion.id, nextQuestionId: staged?.id,
    });
    if (view.status === "ACTIVE" && staged) assert.equal(view.currentQuestion?.id, staged.id, "the staged question never changes");
  }
  const session = internal(service, view.sessionId);
  return { view, questions: session.audits.map((a: { question: LotusQuestion }) => a.question) as LotusQuestion[] };
}

const slotOf = (q: LotusQuestion) => q.answerKey.diagnostics?.slot ?? -1;
const isFollowUp = (q: LotusQuestion) => (q.answerKey.diagnostics as { isElasticProbe?: boolean } | undefined)?.isElasticProbe === true;

describe("Phase 2 — follow-ups inserted while later questions are still being written", () => {
  for (const id of ["P04_DIVIDE_FIRST_TERM_ONLY", "P05_NEGATIVE_SIGN_ERROR", "P09_ONE_OFF_SLIP"]) {
    it(`${id}: spine slots 1–15 once each, in order; follow-ups stay .5 and number at most two; the test finishes`, async () => {
      const { view, questions } = await playWhileWriting(id);
      assert.equal(view.status, "COMPLETE", `still ${view.status} after ${questions.length} answers`);
      const spine = questions.filter((q) => !isFollowUp(q) && q.purpose !== "STRETCH").map(slotOf);
      const followUps = questions.filter(isFollowUp).map(slotOf);
      assert.deepEqual(spine, Array.from({ length: 15 }, (_, i) => i + 1), `slots asked: ${questions.map(slotOf).join(", ")}`);
      assert.ok(followUps.length <= 2 && followUps.every((s) => s % 1 === 0.5), `follow-ups: ${followUps.join(", ")}`);
    });
  }
});

/**
 * The likelier live cause (bank reuse needs a database, which the persona specs don't have): spine
 * slots 1 and 3 both test FAC_DIVIDE_TERMS, and the bank was searched by skill alone, so slot 3 was
 * filled with an old slot-1 item ("slot 1 twice, slot 3 missing"). A bank item must match the slot.
 */
describe("Phase 2 — the question bank only fills a turn with an item written for that slot", () => {
  it("a slot-1 bank item is not served for slot 3, even though both test the same skill", async () => {
    const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
    services.push(service);
    let view: LotusSessionView = await service.start("demo_bank_slot", "FACTORISATION");
    for (let i = 0; i < 400 && !view.preparation?.ready; i += 1) { await sleep(5); view = await service.get(view.sessionId); }
    const session = internal(service, view.sessionId);
    const f = session.factorisation;
    const itemFor = (slot: number) => {
      const turn = f.state.turns.find((t: { slot: number }) => t.slot === slot);
      return { turn: turn.turn as number, item: f.versions[String(turn.turn)].find((q: LotusQuestion) => q.id === f.preferred[String(turn.turn)]) as LotusQuestion };
    };
    const one = itemFor(1);
    const three = itemFor(3);
    assert.equal(one.item.answerKey.diagnostics?.skillId, three.item.answerKey.diagnostics?.skillId, "the premise: slots 1 and 3 share a skill");
    // A fresh, valid slot-1 question the student has not seen, as an earlier session's AI item in the bank.
    const fresh = codeProbeFor({ spec: CANONICAL_15_SPINE.find((x) => x.slot === 1)!, purpose: "BASE", avoid: [], variation: "bank-row" } as never, { ...process.env, LOTUS_CODE_BUILT_QUESTIONS: "true" })!;
    fresh.answerKey.diagnostics!.origin = "AI";
    assert.deepEqual(checkWrittenItem({ spec: CANONICAL_15_SPINE.find((x) => x.slot === 3)!, purpose: "BASE", avoid: [] } as never, fresh), [], "the premise: the item checker alone accepts it for slot 3");
    const rows = [{ id: "row-slot-1", question: fresh }];
    (service as unknown as { prisma: unknown }).prisma = {
      lotusQuestionBankItem: { findMany: async () => rows, update: async () => ({}) },
    };
    const spec = f.state.turns.find((t: { slot: number }) => t.slot === 3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const take = (service as any).takeFactorisationBankItem.bind(service);
    const job = { turn: three.turn, version: spec.version, urgent: true, request: { spec: { ...slotSpecOf(three.item, f) }, purpose: "BASE" } };
    assert.equal(await take(session, job), null, "a slot-1 item must not fill slot 3");
    (service as unknown as { prisma: unknown }).prisma = null;
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slotSpecOf(item: LotusQuestion, _f: any) {
  return CANONICAL_15_SPINE.find((s) => s.slot === item.answerKey.diagnostics?.slot);
}
