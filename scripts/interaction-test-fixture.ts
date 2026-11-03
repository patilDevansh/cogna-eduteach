/** Opt-in local synthetic fixtures; no providers, no production database or reset. */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../packages/database/src";
import type { LotusSessionView, LotusQuestion, StudentInteractionContext } from "../packages/shared/src";
import { LearningLoopService } from "../apps/api/src/learning-loop/learning-loop.service";
import { ExplanationEngineService } from "../apps/api/src/engines/explanation-engine/explanation-engine.service";
import { GraderService } from "../apps/api/src/grading/grader.service";
import { PracticeController } from "../apps/api/src/learning-loop/practice.controller";
import { StudentAccessService } from "../apps/api/src/access/student-access.service";
import { buildTileInteraction } from "../apps/api/src/interaction-formats/tile-builder";
import { persistLotusSession } from "../apps/api/src/lotus/lotus-persistence";
import { LotusController } from "../apps/api/src/lotus/lotus.controller";
import { LotusService } from "../apps/api/src/lotus/lotus.service";
import { issueStudentToken } from "../apps/api/src/access/cogna-access";

export function isolatedDatabase(): PrismaClient {
  const url = process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL;
  if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/cogna_s1") throw new Error("Explicit disposable 127.0.0.1:55439/cogna_s1 database required.");
  return new PrismaClient({ datasourceUrl: url });
}
export function sampleContext(source: "EXERCISE" | "LOTUS", questionId: string): StudentInteractionContext {
  return { schemaVersion: 1, observationId: randomUUID(), source, questionId, questionVersion: source === "EXERCISE" ? 1 : null, format: source === "EXERCISE" ? "TYPED_ANSWER" : "CONSTRUCTED_RESPONSE", presentedAt: new Date().toISOString(), timing: { basis: "CLIENT_ITEM_MOUNT", elapsedMs: 3000, firstInputMs: null, hiddenMs: 400, visibilityChanges: 2, complete: true }, revisionsAfterFirstInput: 0, confidence: { status: "NOT_ASKED", value: null, scale: source === "EXERCISE" ? "ONE_TO_FIVE" : "ZERO_TO_HUNDRED" }, technical: { offlineMs: 0, offlineTransitions: 0, pageReloaded: false } };
}
export async function createInteractionFixture(prisma: PrismaClient) {
  process.env.COGNA_SESSION_SECRET = "s1-local-verification-only-not-production";
  const prefix = `context_${randomUUID()}`;
  const studentId = `${prefix}_learner`;
  const sessionId = `${prefix}_exercise`, lotusId = `${prefix}_lotus`, questionId = `${prefix}_question`, conceptId = `${prefix}_concept`;
  await prisma.student.create({ data: { id: studentId, primaryParentId: `${prefix}_parent`, name: "Synthetic context learner", accessCodeHash: "fixture-no-login" } });
  await prisma.concept.create({ data: { id: conceptId, name: "Synthetic algebra", kind: "CORE", masteryThreshold: .8, minimumEvidence: 3, sortOrder: 9999 } });
  const question = await prisma.question.create({ data: { id: questionId, version: 1, conceptId, difficulty: 1, questionIntent: "PRACTICE", type: "NUMERIC", stem: "What is 2 + 3?", acceptedAnswers: ["5"], misconceptionsTested: [], prerequisiteConceptIds: [], solutionSteps: [], hintLadder: ["Add the two numbers."], reviewStatus: "APPROVED" } });
  await prisma.learningSession.create({ data: { id: sessionId, studentId, sessionMode: "ADAPTIVE_PRACTICE" } });
  if(process.env.COGNA_INTERACTION_FIXTURE_BANK === "true")await prisma.question.create({data:{...question,id:`${questionId}_fresh`,stem:"What is 2 + 4?",acceptedAnswers:["6"],createdAt:undefined,updatedAt:undefined}});
  const fail = () => { throw new Error("Intentional no-provider fixture: downstream diagnostic unavailable"); };
  const loop = new LearningLoopService(prisma as any, new GraderService(), { diagnose: fail } as any, {} as any, {} as any, new ExplanationEngineService(prisma as any), {} as any, {} as any, {} as any, {} as any);
  const practice = new PracticeController(loop, new StudentAccessService(prisma as any, {} as any));
  const models = new Proxy({ primaryModel: "local-fixture", challengerModel: "local-fixture" }, { get: (target, key) => key in target ? target[key as keyof typeof target] : fail });
  const lotus = new LotusService(models as any, prisma);
  const lotusController = new LotusController(lotus, {} as any);
  const questions: LotusQuestion[] = [1, 2, 3, 4].map(n => ({ id: `${prefix}_lotus_q${n}`, phase: "EXPLORE", subtopic: "brackets", prompt: `Expand ${n + 1}(x+3)`, type: "CONSTRUCTED_RESPONSE", asksForWorking: true, requiresConfidenceProbe: n === 2, purpose: "verified fixture", answerKey: { kind: "NUMERIC", canonicalAnswer: `${n+1}x+${(n+1)*3}`, workedSolution: [] } } as LotusQuestion));
  const assessment = { mathJudgment: "UNRESOLVED", observations: [], hypotheses: [], phaseRecommendation: "EXPLORE", proposedAction: "ASK", conciseRationale: "fixture" };
  const session = { sessionId: lotusId, studentId, grade: 8, board: "CBSE", status: "ACTIVE", experimental: true, phase: "EXPLORE", startedAt: new Date().toISOString(), currentQuestion: questions[0], coveragePlan: questions, authorizedVariants: {}, preferredFuture: {}, audits: [], openingAudit: { question: questions[0], response: null, verification: null, gpt: assessment, challenger: assessment, debate: { agreements: [], disagreements: [], disagreementExample: "", acceptedImprovements: [], revisedConclusion: "fixture", revisedAction: "ASK", revisedPhase: "EXPLORE" }, conclusion: { verdict: "ACCEPTED", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], conclusion: "fixture", evidenceState: "PARTIAL", uncertainty: [], phase: "EXPLORE", action: "ASK", selectionReason: "fixture", exitDiagnostic: false }, questionSelection: { selectedFrom: "PRIMARY", reason: "fixture", informationGain: { passed: true, explanation: "fixture" } }, analysisStatus: "COMPLETE", analysisSource: "DETERMINISTIC", createdAt: new Date().toISOString() } } as unknown as LotusSessionView;
  if(process.env.COGNA_INTERACTION_FIXTURE_TILE === "true") {
    questions[0]!.prompt="Factorise 6x+9";
    questions[0]!.answerKey.canonicalAnswer="3(2x+3)";
    questions[0]!.interaction=buildTileInteraction({stage:"DIAGNOSTIC",task:"factorise",expression:"6x+9",answer:"3(2x+3)",mistakes:["3(2x+9)"],seed:prefix})??undefined;
    if(!questions[0]!.interaction)throw new Error("Verified tile fixture unavailable");
  }
  await persistLotusSession(prisma, session);
  (lotus as any).sessions.set(lotusId, session);
  (lotus as any).lastTouchedAt.set(lotusId, Date.now());
  const next = { decision: { uiAction: "SHOW_QUESTION", learningIntent: "PRACTICE", contentStyle: {}, parameters: {} }, decisionId: `${prefix}_decision`, studentMessage: "Try this question.", payload: { id: questionId, version: 1, stem: question.stem, conceptId, difficulty: 1, type: "NUMERIC", hintLadder: question.hintLadder } };
  await prisma.rawEvent.create({data:{eventId:`current-delivery-${sessionId}`,eventType:"EXERCISE_CURRENT_DELIVERY",studentId,sessionId,payload:{next}}});
  const token = issueStudentToken(studentId);
  const headers = { "x-cogna-student-id": studentId, "x-cogna-student-token": token };
  return { studentId, sessionId, lotusId, questionId, question, questions, session, token, headers, loop, practice, lotus, lotusController,
    next: { decision: { uiAction: "SHOW_QUESTION", learningIntent: "PRACTICE", contentStyle: {}, parameters: {} }, decisionId: `${prefix}_decision`, studentMessage: "Try this question.", payload: { id: questionId, version: 1, stem: question.stem, conceptId, difficulty: 1, type: "NUMERIC", hintLadder: question.hintLadder } },
    async cleanup() {
      lotus.onModuleDestroy();
      // Deferred fixture work is intentionally provider-free and may write its failure state briefly.
      await new Promise(resolve => setTimeout(resolve, 100));
      await prisma.job.deleteMany({ where: { idempotencyKey: { contains: lotusId } } });
      await prisma.lotusSessionRecord.deleteMany({ where: { studentId } });
      await prisma.student.delete({ where: { id: studentId } });
      await prisma.rawEvent.deleteMany({ where: { studentId } });
      await prisma.question.deleteMany({ where: { conceptId } });
      await prisma.concept.delete({ where: { id: conceptId } });
    } };
}
