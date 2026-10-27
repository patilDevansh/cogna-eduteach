import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LotusService } from "../../src/lotus/lotus.service";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusStudentResponse,
} from "@cogna/shared";

const DUMMY_QUESTION: LotusQuestion = {
  id: "q_test_1",
  phase: "EXPLORE",
  subtopic: "common factor",
  prompt: "Factorise: 6x + 9",
  type: "CONSTRUCTED_RESPONSE",
  asksForWorking: true,
  answerKey: {
    kind: "OPEN_RESPONSE",
    canonicalAnswer: "3(2x + 3)",
    workedSolution: ["Find HCF of 6x and 9 which is 3", "Divide each term: 6x/3=2x, 9/3=3", "Write as 3(2x + 3)"],
  },
};

describe("Lotus unified single-model review", () => {
  it("executes 1 model review call instead of the 4-stage debate by default", async () => {
    let singleReviewCalls = 0;
    let primaryAssessmentCalls = 0;
    let challengerAssessmentCalls = 0;
    let debateCalls = 0;
    let closureCalls = 0;

    const fakeModels = {
      primaryModel: "test-primary",
      challengerModel: "test-challenger",
      status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
      assertReady() {},
      async singleReview(prompt: string): Promise<LotusDebateClosure> {
        singleReviewCalls += 1;
        assert.ok(prompt.includes("Factorise: 6x + 9"));
        return {
          verdict: "ACCEPTED",
          conclusion: "Student diverged at step 2.",
          evidenceState: "SUPPORTED",
          uncertainty: [],
          phase: "EXPLORE",
          action: "ASK",
          selectionReason: "Step error observed.",
          firstWrongStep: 2,
          mistakeDescription: "Divided first term only",
          mistakeKind: "MISUNDERSTANDING",
          exitDiagnostic: false,
        };
      },
      async primaryAssessment(): Promise<LotusModelAssessment> {
        primaryAssessmentCalls += 1;
        throw new Error("should not be called in single review mode");
      },
      async challengerAssessment(): Promise<LotusModelAssessment> {
        challengerAssessmentCalls += 1;
        throw new Error("should not be called in single review mode");
      },
      async primaryDebate(): Promise<LotusGptDebateResponse> {
        debateCalls += 1;
        throw new Error("should not be called in single review mode");
      },
      async challengerClosure(): Promise<LotusDebateClosure> {
        closureCalls += 1;
        throw new Error("should not be called in single review mode");
      },
      writeQuestion: async () => ({}),
      solveBlind: async () => ({}),
    };

    const service = new LotusService(
      fakeModels as any,
      {} as any, // prisma
      {}, // options
    );

    const response: LotusStudentResponse = {
      answer: "3(2x + 9)",
      working: "3 is common\n6x/3 = 2x, 9 stays 9\n3(2x + 9)",
    };

    const result = await (service as any).runFullAnalysis(
      [],
      DUMMY_QUESTION,
      response,
      { status: "VERIFIED_INCORRECT", explanation: "Not algebraically equivalent" },
      30,
      1,
    );

    assert.equal(singleReviewCalls, 1, "must invoke singleReview exactly once");
    assert.equal(primaryAssessmentCalls, 0, "must not call primary assessment");
    assert.equal(challengerAssessmentCalls, 0, "must not call challenger assessment");
    assert.equal(debateCalls, 0, "must not call primary debate");
    assert.equal(closureCalls, 0, "must not call challenger closure");

    assert.equal(result.conclusion.firstWrongStep, 2);
    assert.equal(result.conclusion.mistakeDescription, "Divided first term only");
    assert.equal(result.conclusion.action, "ASK");
    assert.equal(result.stageAgreement.assessmentsAgreed, true);
    assert.equal(result.gpt.mathJudgment, "INCORRECT");
  });

  it("falls back to the 4-stage debate when LOTUS_REVIEW_MODE=debate", async () => {
    const prevEnv = process.env.LOTUS_REVIEW_MODE;
    process.env.LOTUS_REVIEW_MODE = "debate";

    try {
      let singleReviewCalls = 0;
      let primaryAssessmentCalls = 0;
      let challengerAssessmentCalls = 0;
      let debateCalls = 0;
      let closureCalls = 0;

      const fakeModels = {
        primaryModel: "test-primary",
        challengerModel: "test-challenger",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async singleReview(): Promise<LotusDebateClosure> {
          singleReviewCalls += 1;
          throw new Error("should not be called in debate mode");
        },
        async primaryAssessment(): Promise<LotusModelAssessment> {
          primaryAssessmentCalls += 1;
          return {
            mathJudgment: "INCORRECT",
            observations: ["error in step 2"],
            hypotheses: [],
            phaseRecommendation: "EXPLORE",
            proposedAction: "ASK",
            conciseRationale: "divided first term only",
          };
        },
        async challengerAssessment(): Promise<LotusModelAssessment> {
          challengerAssessmentCalls += 1;
          return {
            mathJudgment: "INCORRECT",
            observations: ["error in step 2"],
            hypotheses: [],
            phaseRecommendation: "EXPLORE",
            proposedAction: "ASK",
            conciseRationale: "divided first term only",
          };
        },
        async primaryDebate(): Promise<LotusGptDebateResponse> {
          debateCalls += 1;
          return {
            agreements: [],
            disagreements: [],
            disagreementExample: "None.",
            acceptedImprovements: [],
            revisedConclusion: "step 2 error",
            revisedAction: "ASK",
            revisedPhase: "EXPLORE",
          };
        },
        async challengerClosure(): Promise<LotusDebateClosure> {
          closureCalls += 1;
          return {
            verdict: "ACCEPTED",
            conclusion: "Step 2 error confirmed",
            evidenceState: "SUPPORTED",
            uncertainty: [],
            phase: "EXPLORE",
            action: "ASK",
            selectionReason: "Confirmed by debate",
            firstWrongStep: 2,
            mistakeDescription: "Divided first term only",
            mistakeKind: "MISUNDERSTANDING",
            exitDiagnostic: false,
          };
        },
        writeQuestion: async () => ({}),
        solveBlind: async () => ({}),
      };

      const service = new LotusService(fakeModels as any, {} as any, {});
      const response: LotusStudentResponse = { answer: "3(2x + 9)", working: "..." };

      const result = await (service as any).runFullAnalysis(
        [],
        DUMMY_QUESTION,
        response,
        { status: "VERIFIED_INCORRECT", explanation: "Not equal" },
        20,
        1,
      );

      assert.equal(singleReviewCalls, 0);
      assert.equal(primaryAssessmentCalls, 1);
      assert.equal(challengerAssessmentCalls, 1);
      assert.equal(debateCalls, 1);
      assert.equal(closureCalls, 1);
      assert.equal(result.conclusion.firstWrongStep, 2);
    } finally {
      if (prevEnv !== undefined) process.env.LOTUS_REVIEW_MODE = prevEnv;
      else delete process.env.LOTUS_REVIEW_MODE;
    }
  });
});
