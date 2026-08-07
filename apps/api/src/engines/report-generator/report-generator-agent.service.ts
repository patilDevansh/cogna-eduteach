/**
 * AI polish for student/parent report prose (MVP 9.0.1 Phase D).
 *
 * Data assembly stays in ReportGeneratorService. This agent only rewrites
 * renderedText: ruleOutput is today's template string, and any parse /
 * forbidden-term / numeric-gate failure falls back to that template.
 *
 * INTERNAL audience is never polished in D.v1.
 */
import { Injectable, Logger } from "@nestjs/common";
import { containsForbiddenTerm } from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import { numericCrossCheck } from "./report-numeric-gate";

const CAPABILITY = "REPORT_GENERATOR";
/** Off-path (session end / weekly job) — keep in sync with LATENCY_BUDGET_MS. */
const TIMEOUT_MS = 5000;

export type ReportPolishAudience = "STUDENT" | "PARENT" | "WEEKLY_PARENT";

export interface ReportPolishInput {
  audience: ReportPolishAudience;
  studentId: string;
  sessionId?: string;
  structuredData: unknown;
  ruleText: string;
}

export interface ReportPolishOutput {
  renderedText: string;
}

@Injectable()
export class ReportGeneratorAgentService {
  private readonly logger = new Logger(ReportGeneratorAgentService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  /**
   * Returns polished prose when GENERATE+SERVE succeed and gates pass;
   * otherwise null so the caller keeps the template `ruleText`.
   */
  async polishSummary(input: ReportPolishInput): Promise<string | null> {
    const { system, user } = buildReportPolishPrompts(input);

    const result = await this.orchestrator.call<ReportPolishOutput>({
      capability: CAPABILITY,
      studentId: input.studentId,
      sessionId: input.sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput: {
        renderedText: input.ruleText,
        audience: input.audience,
      },
      parse: (raw) => this.parseAndValidate(raw, input.structuredData),
      timeoutMs: TIMEOUT_MS,
    });

    if (!result.aiOutput || !result.served) return null;

    this.logger.log(
      JSON.stringify({
        event: "report_generator.served",
        audience: input.audience,
        studentId: input.studentId,
        sessionId: input.sessionId ?? null,
      }),
    );

    return result.aiOutput.renderedText;
  }

  private parseAndValidate(raw: string, structuredData: unknown): ReportPolishOutput {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const renderedText = body.renderedText;

    if (typeof renderedText !== "string" || renderedText.trim().length === 0) {
      throw new Error("renderedText must be a non-empty string");
    }
    if (renderedText.length > 4000) {
      throw new Error("renderedText exceeds 4000 characters");
    }
    if (containsForbiddenTerm(renderedText)) {
      throw new Error("renderedText contains a forbidden term");
    }

    const numeric = numericCrossCheck(renderedText, structuredData);
    if (!numeric.ok) {
      throw new Error(numeric.reason ?? "numeric cross-check failed");
    }

    return { renderedText: renderedText.trim() };
  }
}

export function buildReportPolishPrompts(input: ReportPolishInput): {
  system: string;
  user: string;
} {
  const audienceLabel =
    input.audience === "STUDENT"
      ? "a student (warm, first person plural or second person, age ~13)"
      : "a parent (warm, clear, no jargon)";

  const system =
    "You polish a short learning-practice report for " +
    audienceLabel +
    ". " +
    "You are given structured facts and a template draft. Rewrite the draft so it sounds natural, " +
    "but you must not invent any numbers, counts, percentages, mastery values, or confidence figures " +
    "that are not present in the structured facts. " +
    "Do not invent recommendations beyond what the structured facts already imply " +
    "(revisionPlan / parentActions when present). " +
    "Never use clinical, diagnostic, IQ, or internal label jargon. " +
    'Return JSON only: {"renderedText": string}. No other keys.';

  const user = [
    `Audience: ${input.audience}`,
    "Structured facts (JSON):",
    JSON.stringify(input.structuredData),
    "",
    "Template draft (fallback if you fail):",
    input.ruleText,
  ].join("\n");

  return { system, user };
}
