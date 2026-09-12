import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusMathVerification,
  LotusModelAssessment,
  LotusOverrideAction,
  LotusPhase,
  LotusQuestion,
  LotusQuestionAudit,
  LotusQuestionSelection,
  LotusSessionView,
  LotusStatusResponse,
  LotusStudentResponse,
} from "@cogna/shared";
import { randomUUID } from "crypto";
import {
  challengerClosurePrompt,
  gptDebatePrompt,
  independentPrompt,
} from "./lotus-prompts";
import type { PrismaClient } from "@cogna/database";
import { LotusModelService } from "./lotus-model.service";
import {
  appendLotusEvidence,
  loadLotusSession,
  lotusPersistenceEnabled,
  persistLotusSession,
} from "./lotus-persistence";
import {
  normalizeQuestionAnswerKey,
  questionFingerprints,
  verifyLotusResponse,
} from "./lotus-math";

interface LotusSessionState extends LotusSessionView {}

const MAX_QUESTIONS = 16;
const MAX_DURATION_MS = 20 * 60 * 1000;

function withQuestionId(question: Omit<LotusQuestion, "id">): LotusQuestion {
  if (
    !question ||
    typeof question.prompt !== "string" ||
    !question.prompt.trim() ||
    !question.answerKey ||
    typeof question.answerKey.canonicalAnswer !== "string"
  ) {
    throw new ServiceUnavailableException("The AI conclusion did not provide a usable next question.");
  }
  return { ...normalizeQuestionAnswerKey(question), id: randomUUID() };
}

function questionsEquivalent(
  left: Omit<LotusQuestion, "id"> | undefined,
  right: Omit<LotusQuestion, "id"> | undefined,
): boolean {
  if (!left || !right) return false;
  return questionFingerprints(left).exact === questionFingerprints(right).exact;
}

function withoutId(question: LotusQuestion): Omit<LotusQuestion, "id"> {
  const { id: _id, ...rest } = question;
  return rest;
}

function publicCopy(session: LotusSessionState): LotusSessionView {
  return structuredClone(session);
}

export class LotusService {
  private readonly sessions = new Map<string, LotusSessionState>();

  constructor(
    private readonly models: LotusModelService,
    private readonly prisma?: PrismaClient | null,
  ) {}

  status(): LotusStatusResponse {
    const status = this.models.status;
    return {
      ...status,
      models: {
        primary: `${this.models.primaryModel} · GPT primary`,
        challenger: `${this.models.challengerModel} · GPT challenger`,
      },
    };
  }

  async start(studentId: string): Promise<LotusSessionView> {
    this.models.assertReady();
    const startedAt = new Date().toISOString();
    const phase: LotusPhase = "EXPLORE";
    const base = {
      audits: [] as LotusQuestionAudit[],
      elapsedSeconds: 0,
      answeredCount: 0,
      phase,
    };

    const [gpt, challenger] = await Promise.all([
      this.models.primaryAssessment(
        independentPrompt({ ...base, role: "GPT primary" }),
      ),
      this.models.challengerAssessment(
        independentPrompt({ ...base, role: "GPT challenger" }),
      ),
    ]);
    const debate = await this.models.primaryDebate(
      gptDebatePrompt({ gpt, challenger, audits: [], elapsedSeconds: 0, answeredCount: 0 }),
    );
    const conclusion = await this.models.challengerClosure(
      challengerClosurePrompt({
        gpt,
        challenger,
        debate,
        audits: [],
        elapsedSeconds: 0,
        answeredCount: 0,
      }),
    );
    if (conclusion.exitDiagnostic || conclusion.action !== "ASK" || !conclusion.nextQuestion) {
      throw new ServiceUnavailableException("Lotus could not agree on an opening question.");
    }
    const questionSelection = await this.resolveQuestionSelection({
      gpt,
      challenger,
      debate,
      conclusion,
      previousQuestions: [],
    });
    if (!questionSelection.selectedQuestion) {
      throw new ServiceUnavailableException("Lotus could not select an opening question.");
    }
    conclusion.nextQuestion = questionSelection.selectedQuestion;
    const question = withQuestionId(questionSelection.selectedQuestion);
    const openingAudit: LotusQuestionAudit = {
      question,
      response: null,
      verification: null,
      gpt,
      challenger,
      debate,
      conclusion,
      questionSelection,
      createdAt: startedAt,
    };
    const session: LotusSessionState = {
      sessionId: randomUUID(),
      studentId,
      grade: 8,
      board: "CBSE",
      status: "ACTIVE",
      experimental: true,
      phase: question.phase,
      startedAt,
      currentQuestion: question,
      openingAudit,
      audits: [],
      finalReport: null,
      modelConfiguration: {
        primary: `${this.models.primaryModel} · GPT primary`,
        challenger: `${this.models.challengerModel} · GPT challenger`,
      },
    };
    this.sessions.set(session.sessionId, session);
    await this.persist(session);
    return publicCopy(session);
  }

  async get(sessionId: string): Promise<LotusSessionView> {
    return publicCopy(await this.requireSession(sessionId));
  }

  async answer(
    sessionId: string,
    studentId: string,
    response: LotusStudentResponse,
  ): Promise<LotusSessionView> {
    this.models.assertReady();
    const session = await this.requireSession(sessionId);
    if (session.studentId !== studentId) {
      throw new BadRequestException("This Lotus session belongs to a different student.");
    }
    if (session.status !== "ACTIVE" || !session.currentQuestion) {
      throw new BadRequestException("This Lotus diagnostic is already complete.");
    }

    const currentQuestion = session.currentQuestion;
    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000,
    );
    const answeredCount = session.audits.length + 1;
    const verification = verifyLotusResponse(currentQuestion, response);
    const independentArgs = {
      audits: session.audits,
      currentQuestion,
      currentResponse: response,
      currentVerification: verification,
      elapsedSeconds,
      answeredCount,
      phase: session.phase,
    };
    let [gpt, challenger] = await Promise.all([
      this.models.primaryAssessment(independentPrompt({ ...independentArgs, role: "GPT primary" })),
      this.models.challengerAssessment(independentPrompt({ ...independentArgs, role: "GPT challenger" })),
    ]);
    gpt = this.groundMathJudgment(gpt, verification);
    challenger = this.groundMathJudgment(challenger, verification);
    const debate = await this.models.primaryDebate(
      gptDebatePrompt({
        gpt,
        challenger,
        audits: session.audits,
        currentEvidence: { question: currentQuestion, response, verification },
        elapsedSeconds,
        answeredCount,
      }),
    );
    let conclusion = await this.models.challengerClosure(
      challengerClosurePrompt({
        gpt,
        challenger,
        debate,
        audits: session.audits,
        currentEvidence: { question: currentQuestion, response, verification },
        elapsedSeconds,
        answeredCount,
      }),
    );

    conclusion = this.applyHardLimitExit(
      conclusion,
      session,
      gpt,
      verification,
      elapsedSeconds,
      answeredCount,
    );
    this.assertOperationalConclusion(conclusion);
    let questionSelection = conclusion.exitDiagnostic
      ? this.exitSelection(conclusion)
      : await this.resolveQuestionSelection({
          gpt,
          challenger,
          debate,
          conclusion,
          previousQuestions: [...session.audits.map((audit) => audit.question), currentQuestion],
        });
    if (!conclusion.exitDiagnostic && !questionSelection.selectedQuestion) {
      conclusion = this.forcedUncertainExit(
        conclusion,
        session,
        gpt,
        "The agents could not produce a question that added new evidence.",
      );
      questionSelection = this.exitSelection(conclusion);
    }
    if (!conclusion.exitDiagnostic) {
      if (!questionSelection.selectedQuestion) {
        throw new ServiceUnavailableException("Lotus did not select a usable next question.");
      }
      conclusion.nextQuestion = questionSelection.selectedQuestion;
    }
    const audit: LotusQuestionAudit = {
      question: currentQuestion,
      response,
      verification,
      gpt,
      challenger,
      debate,
      conclusion,
      questionSelection,
      createdAt: new Date().toISOString(),
    };
    session.audits.push(audit);

    if (conclusion.exitDiagnostic) {
      session.status = "COMPLETE";
      session.currentQuestion = null;
      session.finalReport = conclusion.report ?? null;
      session.phase = conclusion.phase;
    } else {
      const nextQuestion = withQuestionId(questionSelection.selectedQuestion!);
      session.currentQuestion = nextQuestion;
      session.phase = nextQuestion.phase;
    }
    await this.persist(session, audit);
    return publicCopy(session);
  }

  async override(
    sessionId: string,
    studentId: string,
    action: LotusOverrideAction,
  ): Promise<LotusSessionView> {
    this.models.assertReady();
    const session = await this.requireSession(sessionId);
    if (session.studentId !== studentId) {
      throw new BadRequestException("This Lotus session belongs to a different student.");
    }
    if (session.status !== "ACTIVE" || !session.currentQuestion) {
      throw new BadRequestException("This Lotus diagnostic is already complete.");
    }

    const latestAudit = session.audits.at(-1) ?? session.openingAudit;
    if (action === "END_NOW") {
      const conclusion = this.forcedUncertainExit(
        latestAudit.conclusion,
        session,
        latestAudit.gpt,
        "An observer ended the diagnostic and requested the best available report.",
      );
      latestAudit.conclusion = conclusion;
      latestAudit.questionSelection = this.exitSelection(conclusion);
      session.status = "COMPLETE";
      session.currentQuestion = null;
      session.finalReport = conclusion.report ?? null;
      await this.persist(session);
      return publicCopy(session);
    }

    const previousQuestions = [
      ...session.audits.map((audit) => audit.question),
      session.currentQuestion,
    ];
    const replacement = normalizeQuestionAnswerKey(
      await this.models.reviseQuestion(`You are GPT primary replacing a Cogna Lotus question at an observer's request.
Current question: ${JSON.stringify(session.currentQuestion)}
Previously asked questions: ${JSON.stringify(previousQuestions.map((question) => ({ prompt: question.prompt, expression: question.answerKey.expression, purpose: question.purpose })))}

Create one materially different question that adds new diagnostic evidence. Test a competing explanation, another representation, or another area of the soft coverage spine. Ask one clear task in 28 words or fewer. Do not reuse the expression or merely change numbers. Include phase, subtopic, prompt, type, options when needed, asksForWorking, purpose, and answerKey with kind, canonicalAnswer, expression when arithmetic, and workedSolution. Return JSON only as {"question": {...}}.`),
    );
    const informationGain = this.informationGain(replacement, previousQuestions);
    if (!informationGain.passed) {
      throw new ServiceUnavailableException(
        `The replacement still did not add new evidence: ${informationGain.explanation}`,
      );
    }
    session.currentQuestion = withQuestionId(replacement);
    session.phase = replacement.phase;
    latestAudit.questionSelection = {
      ...latestAudit.questionSelection,
      selectedQuestion: replacement,
      selectedFrom: "REVISED_FOR_INFORMATION_GAIN",
      reason: "An observer rejected the prior question and requested a materially different diagnostic opportunity.",
      informationGain,
    };
    latestAudit.conclusion.nextQuestion = replacement;
    latestAudit.conclusion.selectionReason = latestAudit.questionSelection.reason;
    await this.persist(session);
    return publicCopy(session);
  }

  private assertOperationalConclusion(conclusion: LotusDebateClosure): void {
    if (conclusion.exitDiagnostic) {
      if (conclusion.action === "ASK" || !conclusion.report) {
        throw new ServiceUnavailableException("The AI exit decision did not include a final report.");
      }
      return;
    }
    if (conclusion.action !== "ASK" || !conclusion.nextQuestion) {
      throw new ServiceUnavailableException("The AI continuation decision did not include a next question.");
    }
  }

  private groundMathJudgment(
    assessment: LotusModelAssessment,
    verification: LotusMathVerification,
  ): LotusModelAssessment {
    const requiredJudgment = verification.status === "VERIFIED_CORRECT"
      ? "CORRECT"
      : verification.status === "VERIFIED_INCORRECT"
        ? "INCORRECT"
        : verification.status === "NO_ANSWER"
          ? "UNRESOLVED"
          : null;
    if (!requiredJudgment || assessment.mathJudgment === requiredJudgment) return assessment;
    return {
      ...assessment,
      mathJudgment: requiredJudgment,
      observations: [
        `Authoritative answer check: ${verification.explanation}`,
        ...(assessment.observations ?? []),
      ],
      conciseRationale: `The answer status is grounded by the arithmetic check. ${assessment.conciseRationale}`,
    };
  }

  private applyHardLimitExit(
    conclusion: LotusDebateClosure,
    session: LotusSessionState,
    gpt: LotusModelAssessment,
    verification: LotusMathVerification,
    elapsedSeconds: number,
    answeredCount: number,
  ): LotusDebateClosure {
    if (
      conclusion.exitDiagnostic ||
      (elapsedSeconds < MAX_DURATION_MS / 1000 && answeredCount < MAX_QUESTIONS)
    ) {
      return conclusion;
    }
    return this.forcedUncertainExit(
      conclusion,
      session,
      gpt,
      `The application ended the diagnostic at its ${
        elapsedSeconds >= MAX_DURATION_MS / 1000 ? "20-minute" : "16-question"
      } limit. Latest math status: ${verification.status}.`,
    );
  }

  private forcedUncertainExit(
    conclusion: LotusDebateClosure,
    session: LotusSessionState,
    gpt: LotusModelAssessment,
    reason: string,
  ): LotusDebateClosure {
    return {
      ...conclusion,
      verdict: "ACCEPTED_WITH_UNCERTAINTY",
      conclusion: `${conclusion.conclusion} ${reason}`,
      evidenceState: conclusion.evidenceState === "SUPPORTED" ? "PARTIAL" : conclusion.evidenceState,
      uncertainty: [...(conclusion.uncertainty ?? []), reason],
      action: "EXIT_UNCERTAIN",
      selectionReason: reason,
      nextQuestion: undefined,
      exitDiagnostic: true,
      report: {
        outcome: "INSUFFICIENT_OR_CONFLICTING",
        startingPoint: conclusion.conclusion || "Continue from the strongest current evidence.",
        observedStrengths: gpt.observations?.slice(0, 4) ?? [],
        uncertainAreas: [...(conclusion.uncertainty ?? []), reason],
        evidenceSummary: session.audits.slice(-5).map(
          (audit, index) =>
            `Q${Math.max(1, session.audits.length - 4 + index)}: ${audit.question.prompt} — ${audit.response?.answer ?? "no answer"}`,
        ),
        recommendedNextStep: "Review the evidence and begin with the strongest supported or partial learning need.",
        limitations: [
          "The diagnostic ended before the agents resolved every competing explanation.",
          "This is an experimental AI-generated conclusion.",
        ],
      },
    };
  }

  private exitSelection(conclusion: LotusDebateClosure): LotusQuestionSelection {
    return {
      selectedFrom: "NONE_EXIT",
      reason: conclusion.selectionReason || conclusion.conclusion,
      informationGain: {
        passed: true,
        explanation: "No next question was selected because the diagnostic ended.",
      },
    };
  }

  private async resolveQuestionSelection(args: {
    gpt: LotusModelAssessment;
    challenger: LotusModelAssessment;
    debate: LotusGptDebateResponse;
    conclusion: LotusDebateClosure;
    previousQuestions: LotusQuestion[];
  }): Promise<LotusQuestionSelection> {
    const primaryProposal = args.gpt.proposedQuestion;
    const challengerProposal = args.challenger.proposedQuestion;
    let selectedQuestion = args.conclusion.nextQuestion
      ? normalizeQuestionAnswerKey(args.conclusion.nextQuestion)
      : undefined;
    if (!selectedQuestion) {
      return {
        primaryProposal,
        challengerProposal,
        selectedFrom: "NONE_EXIT",
        reason: "The closing agent did not provide a next question.",
        informationGain: { passed: false, explanation: "No candidate was available." },
      };
    }

    let informationGain = this.informationGain(selectedQuestion, args.previousQuestions);
    let revised = false;
    if (!informationGain.passed) {
      const revisionPrompt = `You are GPT primary revising one rejected Cogna Lotus question.
The candidate was rejected because: ${informationGain.explanation}
Previously asked questions: ${JSON.stringify(args.previousQuestions.map((question) => ({ prompt: question.prompt, expression: question.answerKey.expression, purpose: question.purpose })))}
Rejected candidate: ${JSON.stringify(selectedQuestion)}

Create one materially different question that tests a competing explanation or a different representation. Ask one clear task in 28 words or fewer. Do not reuse an expression or merely change numbers. Include phase, subtopic, prompt, type, options when needed, asksForWorking, purpose, and answerKey with kind, canonicalAnswer, expression when arithmetic, and workedSolution. Return JSON only as {"question": {...}}.`;
      selectedQuestion = normalizeQuestionAnswerKey(await this.models.reviseQuestion(revisionPrompt));
      informationGain = this.informationGain(selectedQuestion, args.previousQuestions);
      revised = true;
    }

    const matchesPrimary = questionsEquivalent(selectedQuestion, primaryProposal);
    const matchesChallenger = questionsEquivalent(selectedQuestion, challengerProposal);
    const selectedFrom: LotusQuestionSelection["selectedFrom"] = revised
      ? "REVISED_FOR_INFORMATION_GAIN"
      : matchesPrimary && matchesChallenger
        ? "BOTH"
        : matchesPrimary
          ? "PRIMARY"
          : matchesChallenger
            ? "CHALLENGER"
            : "SYNTHESIZED";
    return {
      primaryProposal,
      challengerProposal,
      selectedQuestion: informationGain.passed ? selectedQuestion : undefined,
      selectedFrom: informationGain.passed ? selectedFrom : "NONE_EXIT",
      reason: revised
        ? `The original selection was rejected for low information gain. ${args.conclusion.selectionReason}`
        : args.conclusion.selectionReason || args.conclusion.conclusion,
      informationGain,
    };
  }

  private informationGain(
    candidate: Omit<LotusQuestion, "id">,
    previousQuestions: LotusQuestion[],
  ): { passed: boolean; explanation: string } {
    const candidatePrint = questionFingerprints(candidate);
    const prior = previousQuestions.map(questionFingerprints);
    if (prior.some((fingerprint) => fingerprint.exact === candidatePrint.exact)) {
      return { passed: false, explanation: "The same expression or prompt has already been asked." };
    }
    const recentSameStructure = prior
      .slice(-2)
      .filter((fingerprint) => fingerprint.structure === candidatePrint.structure).length;
    if (recentSameStructure >= 2) {
      return {
        passed: false,
        explanation: "The previous two questions already used the same mathematical structure.",
      };
    }
    return {
      passed: true,
      explanation: "The selected question is not an exact repeat and does not extend a two-item structural run.",
    };
  }

  private async requireSession(sessionId: string): Promise<LotusSessionState> {
    const memory = this.sessions.get(sessionId);
    if (memory) return memory;
    if (lotusPersistenceEnabled(this.prisma)) {
      try {
        const loaded = await loadLotusSession(this.prisma, sessionId);
        if (loaded) {
          this.sessions.set(sessionId, loaded);
          return loaded;
        }
      } catch {
        // Persistence is best-effort; a missing database must not invent a session.
      }
    }
    throw new NotFoundException(
      "Lotus session not found. If this API restarted before the session was persisted, start a new diagnostic.",
    );
  }

  private async persist(session: LotusSessionState, audit?: LotusQuestionAudit): Promise<void> {
    if (!lotusPersistenceEnabled(this.prisma)) return;
    try {
      await persistLotusSession(this.prisma, session);
      if (audit) await appendLotusEvidence(this.prisma, session, audit);
    } catch {
      // Keep serving from memory so a database blip never blocks the next safe item.
    }
  }
}
