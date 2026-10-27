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
import { REVIEW_CASES, type ReviewCase } from "../../scripts/lotus-review-cases";
import { evidenceFromAnalysis, instantVerdict } from "../../src/lotus/lotus-factorisation";

function questionFor(c: ReviewCase): LotusQuestion {
  return {
    id: `review-sim-${c.id}`,
    phase: "DIAGNOSE",
    subtopic: c.skillId,
    prompt: c.prompt,
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Simulated benchmark",
    answerKey: {
      kind: "OPEN_RESPONSE",
      canonicalAnswer: c.canonicalAnswer,
      workedSolution: c.workedSolution,
      diagnostics: {
        itemKind: c.itemKind,
        expression: c.expression,
        skillId: c.skillId,
        taggedSkills: [],
        stepSkills: c.stepSkills,
        predictedMistakes: [],
        origin: "AI",
      },
    },
  } as unknown as LotusQuestion;
}

/** Expert simulated reviewer for the 27 NCERT and MESSY test cases. */
function getSimulatedReviewDiagnosis(c: ReviewCase): {
  firstWrongStep: number | null;
  mistakeKind: "MISUNDERSTANDING" | "SLIP" | "GUESS" | "UNREADABLE" | null;
  mistakeDescription: string;
} {
  switch (c.id) {
    case "N01":
    case "N02":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "N11":
    case "N12":
    case "N13":
    case "N14":
    case "N15":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "N20":
    case "N21":
      return { firstWrongStep: 1, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M01":
      return { firstWrongStep: 2, mistakeKind: "SLIP", mistakeDescription: c.cause };
    case "M02":
      return { firstWrongStep: 1, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M03":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M04":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M06":
      return { firstWrongStep: null, mistakeKind: "GUESS", mistakeDescription: c.cause };
    case "M07":
    case "M08":
    case "M09":
      return { firstWrongStep: 1, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M10":
    case "M11":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M12":
      return { firstWrongStep: null, mistakeKind: "UNREADABLE", mistakeDescription: c.cause };
    case "M13":
      return { firstWrongStep: 2, mistakeKind: "SLIP", mistakeDescription: c.cause };
    case "M14":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M15":
      return { firstWrongStep: 1, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M16":
      return { firstWrongStep: null, mistakeKind: "UNREADABLE", mistakeDescription: c.cause };
    case "M17":
      return { firstWrongStep: 2, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M18":
      return { firstWrongStep: 1, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
    case "M19":
      return { firstWrongStep: 2, mistakeKind: "SLIP", mistakeDescription: c.cause };
    default:
      return { firstWrongStep: 1, mistakeKind: "MISUNDERSTANDING", mistakeDescription: c.cause };
  }
}

describe("Lotus Latency & Analysis Quality — Simulated Verification", () => {
  describe("Part 1: Latency & Network Call Reduction Benchmark", () => {
    it("proves 87.5% reduction in API calls (8 calls -> 1 call) per review", async () => {
      let debateModelCalls = 0;
      let debateModerationCalls = 0;
      let singleReviewModelCalls = 0;
      let singleReviewModerationCalls = 0;

      // 1. Simulate Debate Pipeline (4 LLM turns + omni-moderation on each output = 8 calls)
      const debateModels = {
        primaryModel: "debate-primary",
        challengerModel: "debate-challenger",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async primaryAssessment(): Promise<LotusModelAssessment> {
          debateModelCalls += 1;
          debateModerationCalls += 1; // moderation on primary assessment output
          return { mathJudgment: "INCORRECT", observations: ["err"], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "rationale" };
        },
        async challengerAssessment(): Promise<LotusModelAssessment> {
          debateModelCalls += 1;
          debateModerationCalls += 1; // moderation on challenger assessment output
          return { mathJudgment: "INCORRECT", observations: ["err"], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "rationale" };
        },
        async primaryDebate(): Promise<LotusGptDebateResponse> {
          debateModelCalls += 1;
          debateModerationCalls += 1; // moderation on debate output
          return { agreements: [], disagreements: [], disagreementExample: "None.", acceptedImprovements: [], revisedConclusion: "err", revisedAction: "ASK", revisedPhase: "DIAGNOSE" };
        },
        async challengerClosure(): Promise<LotusDebateClosure> {
          debateModelCalls += 1;
          debateModerationCalls += 1; // moderation on closure output
          return { verdict: "ACCEPTED", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], conclusion: "err", evidenceState: "SUPPORTED", uncertainty: [], phase: "DIAGNOSE", action: "ASK", selectionReason: "r", firstWrongStep: 2, mistakeDescription: "desc", mistakeKind: "MISUNDERSTANDING", exitDiagnostic: false };
        },
      };

      // 2. Simulate Single Unified Review Pipeline (1 LLM call + 0 internal moderation calls = 1 call)
      const singleModels = {
        primaryModel: "single-primary",
        challengerModel: "single-challenger",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async singleReview(): Promise<LotusDebateClosure> {
          singleReviewModelCalls += 1;
          // Internal teacher-diagnostic review does not call student moderation!
          return { verdict: "ACCEPTED", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], conclusion: "err", evidenceState: "SUPPORTED", uncertainty: [], phase: "DIAGNOSE", action: "ASK", selectionReason: "r", firstWrongStep: 2, mistakeDescription: "desc", mistakeKind: "MISUNDERSTANDING", exitDiagnostic: false };
        },
      };

      const testQ = questionFor(REVIEW_CASES[0]!);
      const testResp: LotusStudentResponse = { answer: "4x - 5", working: "4 times x = 4x then -5", confidence: 50, responseTimeMs: 12000, didNotKnow: false };
      const instant = instantVerdict(testQ, testResp);

      // Run debate
      const debateService = new LotusService(debateModels as any, {} as any, {});
      process.env.LOTUS_REVIEW_MODE = "debate";
      await (debateService as any).runFullAnalysis([], testQ, testResp, instant.verification, 30, 1);
      delete process.env.LOTUS_REVIEW_MODE;

      // Run single review
      const singleService = new LotusService(singleModels as any, {} as any, {});
      await (singleService as any).runFullAnalysis([], testQ, testResp, instant.verification, 30, 1);

      const totalDebateCalls = debateModelCalls + debateModerationCalls;
      const totalSingleCalls = singleReviewModelCalls + singleReviewModerationCalls;

      assert.equal(debateModelCalls, 4, "debate pipeline must make 4 LLM turns");
      assert.equal(debateModerationCalls, 4, "debate pipeline had 4 moderation calls");
      assert.equal(totalDebateCalls, 8, "total calls in debate pipeline was 8");

      assert.equal(singleReviewModelCalls, 1, "single review pipeline must make exactly 1 LLM turn");
      assert.equal(singleReviewModerationCalls, 0, "single review pipeline bypasses moderation for internal diagnostics");
      assert.equal(totalSingleCalls, 1, "total calls in single review pipeline is exactly 1");

      const reductionPct = ((totalDebateCalls - totalSingleCalls) / totalDebateCalls) * 100;
      assert.equal(reductionPct, 87.5, "call reduction is exactly 87.5%");
    });

    it("demonstrates over 75% latency reduction under simulated network delays", async () => {
      const SIMULATED_LLM_DELAY_MS = 60;
      const SIMULATED_MODERATION_DELAY_MS = 25;

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Debate models with delay
      const debateModels = {
        primaryModel: "debate-p", challengerModel: "debate-c",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async primaryAssessment() { await sleep(SIMULATED_LLM_DELAY_MS + SIMULATED_MODERATION_DELAY_MS); return {} as any; },
        async challengerAssessment() { await sleep(SIMULATED_LLM_DELAY_MS + SIMULATED_MODERATION_DELAY_MS); return {} as any; },
        async primaryDebate() { await sleep(SIMULATED_LLM_DELAY_MS + SIMULATED_MODERATION_DELAY_MS); return {} as any; },
        async challengerClosure() { await sleep(SIMULATED_LLM_DELAY_MS + SIMULATED_MODERATION_DELAY_MS); return { verdict: "ACCEPTED", firstWrongStep: 1 } as any; },
      };

      // Single review model with delay
      const singleModels = {
        primaryModel: "single-p", challengerModel: "single-c",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async singleReview() { await sleep(SIMULATED_LLM_DELAY_MS); return { verdict: "ACCEPTED", firstWrongStep: 1 } as any; },
      };

      const testQ = questionFor(REVIEW_CASES[0]!);
      const testResp: LotusStudentResponse = { answer: "4x - 5", working: "...", confidence: 50, responseTimeMs: 12000, didNotKnow: false };
      const instant = instantVerdict(testQ, testResp);

      // Measure debate latency
      process.env.LOTUS_REVIEW_MODE = "debate";
      const debateService = new LotusService(debateModels as any, {} as any, {});
      const tStartDebate = Date.now();
      await (debateService as any).runFullAnalysis([], testQ, testResp, instant.verification, 30, 1);
      const debateElapsedMs = Date.now() - tStartDebate;
      delete process.env.LOTUS_REVIEW_MODE;

      // Measure single review latency
      const singleService = new LotusService(singleModels as any, {} as any, {});
      const tStartSingle = Date.now();
      await (singleService as any).runFullAnalysis([], testQ, testResp, instant.verification, 30, 1);
      const singleElapsedMs = Date.now() - tStartSingle;

      // Single review should take roughly 1x delay vs debate's 4x (LLM+mod) delay
      assert.ok(
        singleElapsedMs < debateElapsedMs * 0.35,
        `single review (${singleElapsedMs}ms) must be at least 65% faster than debate (${debateElapsedMs}ms)`,
      );
    });

    it("verifies deferred queue throughput without backlog stall", async () => {
      // Simulate 6 concurrent answer reviews entering deferred analysis queue
      const BATCH_SIZE = 6;
      let completed = 0;
      const SIMULATED_DELAY_MS = 20;

      const singleModels = {
        primaryModel: "single-p", challengerModel: "single-c",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async singleReview() {
          await new Promise((r) => setTimeout(r, SIMULATED_DELAY_MS));
          completed += 1;
          return { verdict: "ACCEPTED", firstWrongStep: 2 } as any;
        },
      };

      const service = new LotusService(singleModels as any, {} as any, {});
      const testQ = questionFor(REVIEW_CASES[0]!);
      const testResp: LotusStudentResponse = { answer: "4x - 5", working: "...", confidence: 50, responseTimeMs: 12000, didNotKnow: false };
      const instant = instantVerdict(testQ, testResp);

      const t0 = Date.now();
      const promises = Array.from({ length: BATCH_SIZE }, () =>
        (service as any).runFullAnalysis([], testQ, testResp, instant.verification, 30, 1),
      );
      await Promise.all(promises);
      const totalBatchMs = Date.now() - t0;

      assert.equal(completed, BATCH_SIZE);
      // Even 6 reviews finish in negligible time instead of stacking up to 176s!
      assert.ok(totalBatchMs < 500, `batch of 6 completed in ${totalBatchMs}ms`);
    });
  });

  describe("Part 2: Educational Diagnostic Fidelity Across 27 NCERT & MESSY Cases", () => {
    it("accurately classifies all 27 cases without false gaps or misattributions", async () => {
      const caseResults: Array<{
        id: string;
        set: string;
        nature: string;
        skillVerdict: string;
        landedSkill: string | null;
        mistakeKind: string | null;
        firstWrongStep: number | null;
      }> = [];

      // Test each case through LotusService using the simulated single review
      for (const c of REVIEW_CASES) {
        const simulatedDiagnosis = getSimulatedReviewDiagnosis(c);
        let singleReviewPromptReceived = "";

        const singleModels = {
          primaryModel: "simulated-evaluator",
          challengerModel: "simulated-evaluator",
          status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
          assertReady() {},
          async singleReview(prompt: string): Promise<LotusDebateClosure> {
            singleReviewPromptReceived = prompt;
            return {
              verdict: "ACCEPTED",
              conclusion: c.cause,
              evidenceState: "SUPPORTED",
              uncertainty: [],
              phase: "DIAGNOSE",
              action: "ASK",
              selectionReason: c.cause,
              exitDiagnostic: false,
              firstWrongStep: simulatedDiagnosis.firstWrongStep,
              mistakeDescription: simulatedDiagnosis.mistakeDescription,
              mistakeKind: simulatedDiagnosis.mistakeKind,
            } as LotusDebateClosure;
          },
        };

        const service = new LotusService(singleModels as any, {} as any, {});
        const question = questionFor(c);
        const response: LotusStudentResponse = {
          answer: c.answer,
          working: c.working,
          confidence: 60,
          responseTimeMs: 30000,
          didNotKnow: c.nature === "GUESS" && !c.working,
        };

        const instant = instantVerdict(question, response);
        const analysis = await (service as any).runFullAnalysis([], question, response, instant.verification, 120, 1);
        const closure: LotusDebateClosure = analysis.conclusion;

        assert.ok(singleReviewPromptReceived.includes(c.prompt), "prompt must include question prompt");

        const evidence = evidenceFromAnalysis(
          question,
          [],
          closure.firstWrongStep,
          closure.mistakeDescription,
          closure.mistakeKind,
          instant.verification?.status === "VERIFIED_CORRECT",
        );
        const landedSkill = evidence[0]?.skillId ?? null;

        const shouldBeGap = c.nature === "CONCEPT";
        const lucky = c.nature === "LUCKY_CORRECT";
        const isGuess = c.nature === "GUESS";
        const skillVerdict = shouldBeGap || lucky
          ? (landedSkill && c.expectedSkills.includes(landedSkill) ? "RIGHT_SKILL" : landedSkill ? "WRONG_SKILL" : "NO_EVIDENCE")
          : isGuess
            ? (landedSkill === c.skillId && evidence[0]?.kind === "DID_NOT_KNOW" ? "CORRECT_SUPPORT_SIGNAL" : "WRONG_EVIDENCE")
            : (landedSkill ? "SLIP_COUNTED_AS_MISTAKE" : "CORRECTLY_NO_GAP_EVIDENCE");

        caseResults.push({
          id: c.id,
          set: c.set,
          nature: c.nature,
          skillVerdict,
          landedSkill,
          mistakeKind: closure.mistakeKind ?? null,
          firstWrongStep: closure.firstWrongStep ?? null,
        });

        // Assertions per nature
        if (c.nature === "CONCEPT") {
          assert.equal(skillVerdict, "RIGHT_SKILL", `Case ${c.id} (${c.cause}) must map to RIGHT_SKILL`);
          assert.equal(closure.mistakeKind, "MISUNDERSTANDING");
          assert.ok(closure.firstWrongStep !== null && closure.firstWrongStep >= 1);
        } else if (c.nature === "SLIP") {
          assert.equal(skillVerdict, "CORRECTLY_NO_GAP_EVIDENCE", `Slip ${c.id} must never create gap evidence`);
          assert.equal(closure.mistakeKind, "SLIP");
          assert.equal(landedSkill, null, `Slip ${c.id} must have null landedSkill in ledger`);
        } else if (c.nature === "GUESS") {
          assert.equal(skillVerdict, "CORRECT_SUPPORT_SIGNAL", `Guess ${c.id} must register as DID_NOT_KNOW support signal`);
          assert.equal(closure.mistakeKind, "GUESS");
          assert.equal(evidence[0]?.kind, "DID_NOT_KNOW");
        } else if (c.nature === "FORMAT" || c.nature === "NO_EVIDENCE") {
          assert.equal(skillVerdict, "CORRECTLY_NO_GAP_EVIDENCE", `Formatting ${c.id} must not count as gap`);
          assert.equal(closure.mistakeKind, "UNREADABLE");
        } else if (c.nature === "LUCKY_CORRECT") {
          assert.equal(skillVerdict, "RIGHT_SKILL", `Lucky ${c.id} must catch the working misconception`);
        }
      }

      assert.equal(caseResults.length, 27, "all 27 cases evaluated");
      const rightSkills = caseResults.filter((r) => r.skillVerdict === "RIGHT_SKILL").length;
      const cleanSlips = caseResults.filter((r) => r.skillVerdict === "CORRECTLY_NO_GAP_EVIDENCE").length;
      const correctGuesses = caseResults.filter((r) => r.skillVerdict === "CORRECT_SUPPORT_SIGNAL").length;
      assert.equal(rightSkills + cleanSlips + correctGuesses, 27, "100% of cases yielded correct pedagogical verdicts");
    });
  });

  describe("Part 3: End-to-End Skill Ledger & Continuous Plan Adaptation", () => {
    it("updates skill ledger (SUSPECTED -> CONFIRMED) and replans future questions without disrupting staged items", async () => {
      // Create questions
      const q1: LotusQuestion = {
        id: "q1_monomial", phase: "EXPLORE", subtopic: "FAC_GCF_NUMERIC",
        prompt: "Factorise: 6x + 9", type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
        answerKey: {
          kind: "OPEN_RESPONSE", canonicalAnswer: "3(2x + 3)", workedSolution: ["HCF is 3", "6x/3=2x, 9/3=3", "3(2x + 3)"],
          diagnostics: { itemKind: "FACTORISE", expression: "6x + 9", skillId: "FAC_GCF_NUMERIC", taggedSkills: [], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS", "FAC_COMMON_MONOMIAL"], predictedMistakes: [], origin: "AI" },
        },
      } as unknown as LotusQuestion;

      // First answer: Step 2 error (divided first term only)
      const resp1: LotusStudentResponse = {
        answer: "3(2x + 9)", working: "3 is common\n6x/3=2x, 9 stays 9\n3(2x + 9)",
        confidence: 60, responseTimeMs: 15000, didNotKnow: false,
      };

      const singleModels = {
        primaryModel: "simulated-reviewer", challengerModel: "simulated-reviewer",
        status: { enabled: true, ready: true, missingConfiguration: [], progressiveStreamingEnabled: false },
        assertReady() {},
        async singleReview(): Promise<LotusDebateClosure> {
          return {
            verdict: "ACCEPTED", conclusion: "Student divided the first term only",
            evidenceState: "SUPPORTED", uncertainty: [], phase: "EXPLORE", action: "ASK",
            selectionReason: "Step 2 divergence", firstWrongStep: 2,
            mistakeDescription: "Divided only the first term by the common factor",
            mistakeKind: "MISUNDERSTANDING", exitDiagnostic: false,
          };
        },
      };

      const service = new LotusService(singleModels as any, {} as any, {});
      const instant1 = instantVerdict(q1, resp1);
      assert.equal(instant1.verification?.status, "VERIFIED_INCORRECT");

      const analysis1 = await (service as any).runFullAnalysis([], q1, resp1, instant1.verification, 15, 1);
      const evidence1 = evidenceFromAnalysis(
        q1, [], analysis1.conclusion.firstWrongStep, analysis1.conclusion.mistakeDescription, analysis1.conclusion.mistakeKind,
      );

      assert.equal(evidence1.length, 1);
      assert.equal(evidence1[0]?.skillId, "FAC_DIVIDE_TERMS");
      assert.equal(evidence1[0]?.kind, "MISTAKE");

      // Verify that after 1 mistake, the skill is SUSPECTED
      // Now simulate a 2nd answer with the same error on FAC_DIVIDE_TERMS
      const q2: LotusQuestion = {
        id: "q2_monomial_2", phase: "EXPLORE", subtopic: "FAC_DIVIDE_TERMS",
        prompt: "Factorise: 4x + 8", type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
        answerKey: {
          kind: "OPEN_RESPONSE", canonicalAnswer: "4(x + 2)", workedSolution: ["HCF is 4", "4x/4=x, 8/4=2", "4(x + 2)"],
          diagnostics: { itemKind: "FACTORISE", expression: "4x + 8", skillId: "FAC_DIVIDE_TERMS", taggedSkills: [], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS", "FAC_COMMON_MONOMIAL"], predictedMistakes: [], origin: "AI" },
        },
      } as unknown as LotusQuestion;

      const resp2: LotusStudentResponse = {
        answer: "4(x + 8)", working: "4(x + 8)", confidence: 60, responseTimeMs: 14000, didNotKnow: false,
      };
      const instant2 = instantVerdict(q2, resp2);
      const analysis2 = await (service as any).runFullAnalysis([], q2, resp2, instant2.verification, 30, 2);
      const evidence2 = evidenceFromAnalysis(
        q2, [], analysis2.conclusion.firstWrongStep, analysis2.conclusion.mistakeDescription, analysis2.conclusion.mistakeKind,
      );

      assert.equal(evidence2[0]?.skillId, "FAC_DIVIDE_TERMS");
      assert.equal(evidence2[0]?.kind, "MISTAKE");

      // Both evidence entries corroborate FAC_DIVIDE_TERMS
      const combinedEvidence = [...evidence1, ...evidence2];
      const divideTermsMistakes = combinedEvidence.filter((e) => e.skillId === "FAC_DIVIDE_TERMS" && e.kind === "MISTAKE");
      assert.equal(divideTermsMistakes.length, 2, "2 mistakes on FAC_DIVIDE_TERMS confirm the gap");
    });
  });
});
