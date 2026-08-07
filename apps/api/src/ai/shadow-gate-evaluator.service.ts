import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateGate, type GateReport } from "./shadow-gate-evaluator.formulas";

/** Every capability that logs to AiDecisionAuditLog — kept as one list so a new agent can't silently go unevaluated. */
export const KNOWN_CAPABILITIES = [
  "STUDENT_ANALYSIS",
  "BREAK_ADVISOR",
  "QUESTION_RECOMMENDER",
  "PRACTICE_RECOMMENDER",
  // MVP 9.0.1 Phase A — micro-skill step diagnostic
  "DIAGNOSTIC_V2_SELECTOR",
  "DIAGNOSTIC_V2_INTERPRETER",
  "DIAGNOSTIC_V2_GRADER",
  "DIAGNOSTIC_V2_AUTHOR",
  // MVP 9.0.1 Phase D — LLM-assisted report prose (LearningSession reports)
  "REPORT_GENERATOR",
] as const;

const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class ShadowGateEvaluatorService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateCapability(capability: string, windowDays = DEFAULT_WINDOW_DAYS): Promise<GateReport> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.aiDecisionAuditLog.findMany({
      where: { capability, createdAt: { gte: since } },
      select: { ruleOutput: true, aiOutput: true, passed: true, failureReason: true, latencyMs: true },
    });
    return evaluateGate(capability, rows);
  }

  async evaluateAll(windowDays = DEFAULT_WINDOW_DAYS): Promise<GateReport[]> {
    return Promise.all(KNOWN_CAPABILITIES.map((c) => this.evaluateCapability(c, windowDays)));
  }
}
