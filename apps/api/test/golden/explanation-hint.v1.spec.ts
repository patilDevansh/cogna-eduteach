import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExplanationEngineService } from "../../src/engines/explanation-engine/explanation-engine.service";

describe("G50 — Student hint request", () => {
  it("returns next ladder level without requiring Decision Engine approval", async () => {
    const mockPrisma = {
      question: {
        findUniqueOrThrow: async () => ({
          hintLadder: [
            "What operation is on x?",
            "Use the opposite operation.",
            "Add 6 to both sides.",
          ],
        }),
      },
    };

    const engine = new ExplanationEngineService(mockPrisma as never);
    const hint = await engine.getNextHint("Q_C2_D2_001", 1, 0);

    assert.equal(hint.level, 1);
    assert.ok(hint.content.length > 0);
  });

  it("advances to level 2 from level 1", async () => {
    const mockPrisma = {
      question: {
        findUniqueOrThrow: async () => ({
          hintLadder: ["Hint 1", "Hint 2", "Hint 3"],
        }),
      },
    };

    const engine = new ExplanationEngineService(mockPrisma as never);
    const hint = await engine.getNextHint("Q_C2_D2_001", 1, 1);

    assert.equal(hint.level, 2);
    assert.equal(hint.content, "Hint 2");
  });
});

describe("G51 — Post-explanation does not auto-fetch question", () => {
  it("getExplanation returns content only, no next question", async () => {
    const mockPrisma = {
      explanation: {
        findFirst: async () => ({
          id: "exp_001",
          content: "When subtracting, add the same value to both sides.",
          style: "STEP_BY_STEP",
          checkForUnderstanding: "What do we add to both sides?",
        }),
      },
    };

    const engine = new ExplanationEngineService(mockPrisma as never);
    const result = await engine.getExplanation({
      uiAction: "SHOW_EXPLANATION",
      learningIntent: "TARGET_MISCONCEPTION",
      parameters: {
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        targetMisconception: "SIGN_HANDLING",
      },
      confidence: 0.8,
      reasoning: "test",
      decisionVersion: "decision-rules-v1",
    });

    assert.ok(result.content);
    assert.equal((result as Record<string, unknown>).question, undefined);
    assert.equal((result as Record<string, unknown>).next, undefined);
  });
});
