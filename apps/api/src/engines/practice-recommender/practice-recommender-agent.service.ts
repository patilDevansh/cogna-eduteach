import { Injectable, Logger } from "@nestjs/common";
import { assertPracticeRecommendationShape, type PracticeRecommendation } from "@cogna/shared";
import type { RevisionProposal } from "../../revision/revision.service";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import {
  buildPracticeRecommenderPrompts,
  isValidPermutation,
  topChoiceAgrees,
} from "./practice-recommender.formulas";

const CAPABILITY = "PRACTICE_RECOMMENDER";

/**
 * Shadow-mode agent: re-orders the exact RevisionProposal[] list that
 * proposeOnSessionEnd() already computed, filtered, and capped — never
 * generates a new proposal. Any returned order that isn't an exact
 * permutation of the given concept ids is rejected outright. Nothing here
 * changes which proposals actually get applied via RevisionService.
 */
@Injectable()
export class PracticeRecommenderAgentService {
  private readonly logger = new Logger(PracticeRecommenderAgentService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  /** Call from SessionsService.end() after proposals are computed — fire-and-forget. */
  evaluateInBackground(studentId: string, sessionId: string, proposals: RevisionProposal[]): void {
    this.evaluate(studentId, sessionId, proposals).catch((err) => {
      this.logger.warn(
        `Practice recommender shadow run failed for session ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  async evaluate(
    studentId: string,
    sessionId: string,
    proposals: RevisionProposal[],
  ): Promise<PracticeRecommendation | null> {
    if (proposals.length === 0) return null;

    const candidateIds = proposals.map((p) => p.conceptId);
    const { system, user } = buildPracticeRecommenderPrompts(proposals);
    const ruleOutput = { orderedConceptIds: candidateIds };

    const result = await this.orchestrator.call<PracticeRecommendation>({
      capability: CAPABILITY,
      studentId,
      sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput,
      parse: (raw) => this.parseAndValidate(raw, candidateIds),
      timeoutMs: 3000,
    });

    if (!result.aiOutput) return null;

    this.logger.log(
      JSON.stringify({
        event: "practice_recommender.shadow",
        studentId,
        sessionId,
        served: result.served,
        ruleOrder: candidateIds,
        aiOrder: result.aiOutput.orderedConceptIds,
        topChoiceAgrees: topChoiceAgrees(candidateIds, result.aiOutput.orderedConceptIds),
      }),
    );

    return result.aiOutput;
  }

  private parseAndValidate(raw: string, candidateIds: string[]): PracticeRecommendation {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertPracticeRecommendationShape(body);
    if (!isValidPermutation(candidateIds, shaped.orderedConceptIds)) {
      throw new Error(
        `orderedConceptIds is not a permutation of the ${candidateIds.length} approved concepts`,
      );
    }
    return shaped;
  }
}
