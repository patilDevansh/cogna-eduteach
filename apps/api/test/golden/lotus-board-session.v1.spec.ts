process.env.LOTUS_CODE_BUILT_QUESTIONS = "true";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PersonaFakeModels } from "../fixtures/lotus-factorisation-personas";

describe("Board survives session start and question delivery", () => {
  for (const board of ["CBSE", "ICSE", "IGCSE"] as const) {
    it(board, async () => {
      const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
      try {
        let view = await service.start(`demo_board_${board}`, "FACTORISATION", undefined, board);
        for (let attempt = 0; attempt < 100 && !view.currentQuestion; attempt++) {
          await new Promise(resolve => setImmediate(resolve));
          view = await service.get(view.sessionId);
        }
        assert.equal(view.board, board);
        assert.ok(view.currentQuestion, "prepared question available");
        const internal = (service as unknown as { sessions: Map<string, { currentQuestion: { prompt: string } }> }).sessions.get(view.sessionId)!;
        internal.currentQuestion.prompt = "Find the HCF and factorise by grouping method.";
        view = await service.get(view.sessionId);
        assert.match(view.currentQuestion!.prompt, board === "IGCSE" ? /GCF/ : /HCF/);
        if (board === "ICSE") assert.match(view.currentQuestion!.prompt, /grouping method/);
      } finally { service.onModuleDestroy(); }
    });
  }
});

describe("Where the board comes from (remediation 4.1)", () => {
  // A class test (record wins over the picker) needs the database for the assignment; see the classroom database spec.
  async function startWith(recorded: string | undefined, chosen: "CBSE" | "ICSE" | "IGCSE" | undefined) {
    const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
    try {
      // Stand-in for the student's school record, which needs the database.
      Object.assign(service as object, { recordedBoard: async () => recorded });
      const view = await service.start(`demo_board_src_${recorded}_${chosen}`, "FACTORISATION", undefined, chosen);
      return view.board;
    } finally { service.onModuleDestroy(); }
  }

  it("uses the board on the student's record when the student picks none", async () => {
    assert.equal(await startWith("ICSE", undefined), "ICSE");
  });
  it("a board the student picks for their own test wins over the record", async () => {
    assert.equal(await startWith("ICSE", "IGCSE"), "IGCSE");
  });
  it("falls back to CBSE only when nothing is known", async () => {
    assert.equal(await startWith(undefined, undefined), "CBSE");
  });
});
