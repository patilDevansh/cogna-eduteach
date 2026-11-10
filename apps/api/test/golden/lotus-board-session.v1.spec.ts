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
