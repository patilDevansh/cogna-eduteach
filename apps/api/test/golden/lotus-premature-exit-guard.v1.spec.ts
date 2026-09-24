import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusModelAssessment,
  LotusQuestion,
  LotusReserveIntent,
} from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";

function question(prompt: string, expression: string): Omit<LotusQuestion, "id"> {
  return {
    phase: "DIAGNOSE",
    subtopic: "test",
    prompt,
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "test",
    answerKey: { kind: "NUMERIC", canonicalAnswer: "", expression, workedSolution: [] },
  };
}

const ASSESSMENT: LotusModelAssessment = {
  mathJudgment: "INCORRECT",
  observations: ["The student made a sign error."],
  hypotheses: [],
  phaseRecommendation: "DIAGNOSE",
  proposedAction: "EXIT_GAP",
  conciseRationale: "test",
};

const DEBATE: LotusGptDebateResponse = {
  agreements: ["Both agree this is a confirmed sign-error gap."],
  disagreements: [],
  disagreementExample: "None.",
  acceptedImprovements: [],
  revisedConclusion: "Confident gap found.",
  revisedAction: "EXIT_GAP",
  revisedPhase: "DIAGNOSE",
};

function prematureExitClosure(): LotusDebateClosure {
  return {
    verdict: "ACCEPTED",
    acceptedFromGpt: [],
    acceptedFromChallenger: [],
    rejectedClaims: [],
    conclusion: "The student has a confirmed sign-error gap.",
    evidenceState: "SUPPORTED",
    uncertainty: [],
    phase: "DIAGNOSE",
    action: "EXIT_GAP",
    selectionReason: "Confident after one answer.",
    exitDiagnostic: true,
    report: {
      outcome: "SOLID_GAP",
      startingPoint: "Sign errors in bracket expansion.",
      observedStrengths: [],
      uncertainAreas: [],
      evidenceSummary: [],
      recommendedNextStep: "Teach sign rules.",
      limitations: [],
    },
  };
}

/**
 * A hand-rolled stand-in for LotusModelService that always tries to exit
 * confidently after the very first answer — exactly the failure mode
 * MIN_QUESTIONS_BEFORE_CONFIDENT_EXIT exists to catch. No network calls, so
 * this test costs nothing and runs deterministically.
 */
class FakeModelService {
  readonly primaryModel = "fake-primary";
  readonly challengerModel = "fake-challenger";
  closureCallCount = 0;
  reviseQuestionCallCount = 0;

  get status() {
    return { enabled: true, ready: true, missingConfiguration: [] as string[], progressiveStreamingEnabled: false };
  }
  get progressiveStreamingEnabled() {
    return false;
  }
  assertReady(): void {}
  async primaryAssessment(): Promise<LotusModelAssessment> {
    return ASSESSMENT;
  }
  async challengerAssessment(): Promise<LotusModelAssessment> {
    return ASSESSMENT;
  }
  async primaryDebate(): Promise<LotusGptDebateResponse> {
    return DEBATE;
  }
  async challengerClosure(): Promise<LotusDebateClosure> {
    this.closureCallCount += 1;
    return prematureExitClosure();
  }
  async reviseQuestion(): Promise<Omit<LotusQuestion, "id">> {
    this.reviseQuestionCallCount += 1;
    // Both the literal value AND the structure vary per call — a real model
    // varies its follow-up questions; fixed ones (or even ones sharing the
    // same digit-masked shape) would look like reruns of the same probe and
    // get rejected by the unrelated structural-duplicate check, which isn't
    // what this test is about.
    const variants = ["4-1", "5+2", "3*2", "9/3", "6-4", "2+7"];
    const expression = variants[(this.reviseQuestionCallCount - 1) % variants.length]!;
    return question(`One more discriminating probe on the same pattern, take ${this.reviseQuestionCallCount}.`, expression);
  }
  async generateReserveCandidates(): Promise<Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }>> {
    return [];
  }
}

describe("Lotus staged curriculum completion", () => {
  it("shows the next verified question before a premature AI exit can end the session", async () => {
    const models = new FakeModelService();
    const service = new LotusService(models as unknown as LotusModelService, null);
    const session = await service.start("test_student_premature");
    assert.ok(session.currentQuestion, "opener bank must have produced a question with no model calls");
    assert.equal(session.upcomingQuestions?.length, 15);
    const staged = session.upcomingQuestions![0]!;
    for (const future of session.upcomingQuestions!) {
      assert.equal(future.answerKey.canonicalAnswer, "", "future answers must not reach the browser");
      assert.equal(future.answerKey.expression, undefined, "future key expressions must stay on the server");
      assert.equal(future.answerKey.workedSolution?.length ?? 0, 0, "future worked solutions must stay on the server");
    }
    assert.equal("coveragePlan" in session, false, "the private coverage plan must not reach the browser");
    assert.equal("authorizedVariants" in session, false, "private alternatives must not reach the browser");

    const answered = await service.answer(session.sessionId, "test_student_premature", {
      answer: "wrong",
      working: "some working",
      confidence: 50,
      responseTimeMs: 5000,
      didNotKnow: false,
      questionId: session.currentQuestion!.id,
      nextQuestionId: staged.id,
      submissionId: "first-submit",
    });

    assert.equal(answered.status, "ACTIVE", "must not have exited the diagnostic after just one question");
    assert.equal(answered.currentQuestion?.id, staged.id, "the exact staged item must become visible");
    assert.equal(answered.audits[0]!.analysisStatus, "PENDING", "deep analysis must be outside the next-question path");
    assert.equal(answered.finalReport, null);
    const retry = await service.answer(session.sessionId, "test_student_premature", {
      answer: "wrong", working: "some working", confidence: 50, responseTimeMs: 5000, didNotKnow: false,
      questionId: session.currentQuestion!.id, nextQuestionId: staged.id, submissionId: "first-submit",
    });
    assert.equal(retry.audits.length, 1, "retrying a committed response must not double-count it");
    service.onModuleDestroy();
  });

  it("keeps curriculum coverage moving and reports only at the planned boundary", async () => {
    const models = new FakeModelService();
    const service = new LotusService(models as unknown as LotusModelService, null);
    let session = await service.start("test_student_allowed");

    for (let i = 0; i < 15; i += 1) {
      const currentId = session.currentQuestion!.id;
      const stagedId = session.upcomingQuestions![0]!.id;
      session = await service.answer(session.sessionId, "test_student_allowed", {
        answer: "wrong",
        working: "some working",
        confidence: 50,
        responseTimeMs: 5000,
        didNotKnow: false,
        questionId: currentId,
        nextQuestionId: stagedId,
        submissionId: `submit-${i}`,
      });
      assert.equal(session.status, "ACTIVE", `must still be ACTIVE after answer ${i + 1}`);
      assert.equal(session.currentQuestion?.id, stagedId);
    }

    const final = await service.answer(session.sessionId, "test_student_allowed", {
      answer: "wrong",
      working: "some working",
      confidence: 50,
      responseTimeMs: 5000,
      didNotKnow: false,
      questionId: session.currentQuestion!.id,
      submissionId: "submit-final",
    });
    assert.equal(final.status, "COMPLETE");
    assert.ok(final.finalReport);
    assert.equal(final.audits.length, 16);
    service.onModuleDestroy();
  });
});
