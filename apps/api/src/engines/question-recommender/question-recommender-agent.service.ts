import { Injectable, Logger } from "@nestjs/common";
import type { ScoredCandidate } from "@cogna/shared";
import { assertQuestionRecommendationShape, type QuestionRecommendation } from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import {
  agreesWithRule,
  buildRecommenderPrompts,
  isValidCandidateIndex,
} from "./question-recommender.formulas";

const CAPABILITY = "QUESTION_RECOMMENDER";

export interface QuestionRecommenderResult {
  recommendation: QuestionRecommendation | null;
  /** True only when SERVE flag is on and the call passed validation. */
  served: boolean;
}

/**
 * Bounded re-ranker over the exact ScoredCandidate[] legal set that
 * decideWithScoring() already computed. Never invents a new candidate.
 * Shadow (GENERATE): fire-and-forget compare vs rules.
 * Serve (SERVE): awaited; decision engine may apply selectedIndex when served.
 */
@Injectable()
export class QuestionRecommenderAgentService {
  private readonly logger = new Logger(QuestionRecommenderAgentService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  /** Shadow path — fire-and-forget, never awaited by the caller. */
  evaluateInBackground(
    studentId: string,
    sessionId: string,
    candidates: ScoredCandidate[],
    ruleSelectedIndex: number,
  ): void {
    this.evaluate(studentId, sessionId, candidates, ruleSelectedIndex).catch((err) => {
      this.logger.warn(
        `Question recommender shadow run failed for session ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  async evaluate(
    studentId: string,
    sessionId: string,
    candidates: ScoredCandidate[],
    ruleSelectedIndex: number,
  ): Promise<QuestionRecommenderResult> {
    if (candidates.length === 0) {
      return { recommendation: null, served: false };
    }

    const { system, user } = buildRecommenderPrompts(candidates);
    const ruleOutput = {
      selectedIndex: ruleSelectedIndex,
      candidateCount: candidates.length,
    };

    const result = await this.orchestrator.call<QuestionRecommendation>({
      capability: CAPABILITY,
      studentId,
      sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput,
      parse: (raw) => this.parseAndValidate(raw, candidates.length),
      timeoutMs: 2000,
    });

    if (!result.aiOutput) {
      return { recommendation: null, served: false };
    }

    this.logger.log(
      JSON.stringify({
        event: result.served
          ? "question_recommender.served"
          : "question_recommender.shadow",
        studentId,
        sessionId,
        served: result.served,
        ruleSelectedIndex,
        aiSelectedIndex: result.aiOutput.selectedIndex,
        agrees: agreesWithRule(ruleSelectedIndex, result.aiOutput.selectedIndex),
      }),
    );

    return { recommendation: result.aiOutput, served: result.served };
  }

  private parseAndValidate(raw: string, candidateCount: number): QuestionRecommendation {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertQuestionRecommendationShape(body);
    if (!isValidCandidateIndex(shaped.selectedIndex, candidateCount)) {
      throw new Error(
        `selectedIndex ${shaped.selectedIndex} is not a legal candidate (only 0..${candidateCount - 1} exist)`,
      );
    }
    return shaped;
  }
}
