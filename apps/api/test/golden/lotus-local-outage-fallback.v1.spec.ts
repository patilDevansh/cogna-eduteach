/** Real local staging/validation, fake models and in-memory DB; no network. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LotusService } from "../../src/lotus/lotus.service";
import { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";
import { LotusQuestionFactory, type WriteRequest, type WriteResult } from "../../src/lotus/lotus-question-factory";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";

process.env.COGNA_GAME_FORMATS = "on";
delete process.env.LOTUS_DISABLE_BANK_REUSE;
delete process.env.LOTUS_E2E_DISABLE_QUESTION_BANK;
const request = (skill: string): WriteRequest => ({ spec: FACTORISATION_SLOTS.find((s) => s.skillId === skill)!, purpose: "BASE", variation: "outage-regression", avoid: [] });
const outage = { kind: "NO_CREDITS", reason: "test provider unavailable", detail: "test", at: Date.now() };
type Job = { turn: number; version: number; request: WriteRequest; urgent: boolean };
type Block = { until: number; totalAttempts: number; episodeCount: number; providerOutage?: boolean };

function harness(req: WriteRequest) {
  const db = createPersonalizedVideoMemoryDb();
  const model = new FakeLotusModelService();
  Object.defineProperty(model, "activeOutage", { value: outage, writable: true });
  const service = new LotusService(model as unknown as LotusModelService, db as never);
  // Capture the validated handoff. Full installation/persistence remains
  // covered by the existing bank-reuse and factorisation-session suites.
  const internals = service as unknown as {
    sessions: Map<string, unknown>;
    factory: { write(req: WriteRequest): Promise<WriteResult> };
    runWrite(id: string, job: Job): Promise<void>;
    applyGenerated(id: string, job: Job, result: WriteResult, source: string): Promise<void>;
    ensureFactorisationWrites(session: unknown): void;
    enqueueWrite(id: string, job: Job): void;
    writeQueues: Map<string, { pending: Job[]; running: number; activeTurns: Set<number>; blockedTurns: Map<number, Block> }>;
  };
  const session = {
    sessionId: "outage-session", topic: "FACTORISATION", status: "ACTIVE", audits: [], currentQuestion: null,
    factorisation: { state: { topic: "FACTORISATION", planTurn: 1, answeredTurns: [], turns: [
      { turn: 1, slot: 1, status: "SKIPPED", version: 0 },
      { turn: 2, slot: req.spec.slot, status: "PLANNED", version: 0 },
    ] }, versions: {}, preferred: {} },
  };
  internals.sessions.set(session.sessionId, session);
  let writes = 0;
  internals.factory.write = async () => { writes++; return { item: null, attempts: 0, ms: 0, rejections: [] }; };
  const applied: Array<{ item: WriteResult["item"]; source: string }> = [];
  internals.applyGenerated = async (_id, _job, result, source) => { applied.push({ item: result.item, source }); };
  return { service, model, db, internals, session, applied, writes: () => writes,
    run: () => internals.runWrite(session.sessionId, { turn: 2, version: 0, request: req, urgent: false }) };
}

async function bankItem(h: ReturnType<typeof harness>, req: WriteRequest, corrupt = false) {
  const fake = new FakeLotusModelService();
  const factory = new LotusQuestionFactory({ writeQuestion: (p) => fake.writeQuestion(p), solveBlind: (p) => fake.solveBlind(p) });
  const result = await factory.write(req);
  assert.ok(result.item, result.rejections.join("; "));
  const item = structuredClone(result.item);
  if (corrupt) item.answerKey.canonicalAnswer = "999";
  await h.db.lotusQuestionBankItem.upsert({
    where: { sourceSessionId_sourceQuestionId: { sourceSessionId: "previous-session", sourceQuestionId: "previous-question" } },
    create: { topic: "FACTORISATION", skillId: req.spec.skillId, isActive: true, sourceSessionId: "previous-session", sourceQuestionId: "previous-question", question: item }, update: {},
  });
}

describe("verified local content during provider outage", () => {
  it("stages a checked code probe without calling the provider", async () => {
    const h = harness(request("FAC_PAIR_PRODUCT_SUM"));
    try { await h.run(); assert.equal(h.applied.length, 1); assert.equal(h.applied[0]!.item!.answerKey.diagnostics?.origin, "CODE"); assert.equal(h.writes(), 0); }
    finally { h.service.onModuleDestroy(); }
  });
  it("revalidates and reuses an eligible bank item without a provider call", async () => {
    const req = request("FAC_GCF_VARIABLE"); const h = harness(req);
    try {
      await bankItem(h, req); await h.run();
      assert.equal(h.applied.length, 1); assert.equal(h.applied[0]!.source, "BANK");
      assert.equal(h.applied[0]!.item!.answerKey.diagnostics?.provenance, "AI_REUSED_FROM_BANK");
      assert.equal([...h.db._store.lotusQuestionBank.values()][0]!.reuseCount, 1); assert.equal(h.writes(), 0);
    } finally { h.service.onModuleDestroy(); }
  });
  it("rejects an invalid bank answer and leaves the turn pending", async () => {
    const req = request("FAC_GCF_VARIABLE"); const h = harness(req);
    try { await bankItem(h, req, true); await h.run(); assert.equal(h.applied.length, 0); assert.equal([...h.db._store.lotusQuestionBank.values()][0]!.reuseCount, 0); assert.equal(h.writes(), 0); }
    finally { h.service.onModuleDestroy(); }
  });
  it("does not substitute an unrelated bank item for a required-expression opener", async () => {
    const req = request("FAC_GCF_VARIABLE"); const h = harness(req);
    try { await bankItem(h, req); req.requiredExpression = "8x^2 + 24x"; await h.run(); assert.equal(h.applied.length, 0); assert.equal(h.writes(), 0); }
    finally { h.service.onModuleDestroy(); }
  });
  it("preserves the game kill switch and empty-stock boundary, then permits writing after recovery", async () => {
    const h = harness(request("FAC_PAIR_PRODUCT_SUM"));
    try {
      process.env.COGNA_GAME_FORMATS = "off";
      await h.run(); assert.equal(h.applied.length, 0); assert.equal(h.writes(), 0);
      Object.defineProperty(h.model, "activeOutage", { value: null, writable: true });
      await h.run(); assert.equal(h.writes(), 1);
    } finally { process.env.COGNA_GAME_FORMATS = "on"; h.service.onModuleDestroy(); }
  });
  it("allows local staging during provider cooldown but preserves content-exhaustion backoff", () => {
    const h = harness(request("FAC_GCF_VARIABLE"));
    try {
      const queued: Job[] = []; h.internals.enqueueWrite = (_id, job) => { queued.push(job); };
      const block: Block = { until: Date.now() + 60_000, totalAttempts: 0, episodeCount: 0, providerOutage: true };
      h.internals.writeQueues.set(h.session.sessionId, { pending: [], running: 0, activeTurns: new Set(), blockedTurns: new Map([[2, block]]) });
      h.internals.ensureFactorisationWrites(h.session); assert.equal(queued.length, 1);
      queued.length = 0; delete block.providerOutage;
      h.internals.ensureFactorisationWrites(h.session); assert.equal(queued.length, 0);
    } finally { h.service.onModuleDestroy(); }
  });
  it("does not weaken fresh-session readiness when a verified opener cannot be prepared", async () => {
    const model = new LotusModelService({ isConfigured: true } as never, { get: () => undefined } as never);
    Object.defineProperty(model, "activeOutage", { value: outage });
    const service = new LotusService(model);
    try { await assert.rejects(service.start("demo_outage_fresh", "FACTORISATION"), /test provider unavailable/); }
    finally { service.onModuleDestroy(); }
  });
});
