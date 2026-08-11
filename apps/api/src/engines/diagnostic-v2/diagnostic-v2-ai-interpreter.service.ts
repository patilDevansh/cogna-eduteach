/**
 * AI responsibility 2: explain what the evidence means.
 *
 * The deterministic counts in MicroSkillStateV2 are the ground truth and are
 * never written by this service — it only adds the interpretation layer on
 * top ("is this a slip or a real gap, and how would you say that to a child").
 *
 * Unlike student-analysis (shadow-only), this one is meant to be served, so
 * the forbidden-term re-check matters more here, not less: its output is the
 * text a student actually reads.
 */
import { Injectable, Logger } from "@nestjs/common";
import {
  assertDiagnosticV2HypothesisOutputShape,
  containsForbiddenTerm,
  type DiagnosticV2HypothesisOutput,
} from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import { buildRuleHypothesis, interpreterAgreesWithRule, type MicroSkillCounts } from "./diagnostic-v2.formulas";

const CAPABILITY = "DIAGNOSTIC_V2_INTERPRETER";
const TIMEOUT_MS = 3000;

export interface InterpreterContext {
  studentId: string;
  sessionId: string;
  microSkillId: string;
  microSkillName: string;
  /**
   * Counts shown to the AI prompt. Prefer lifetime after this step so the
   * model sees the full picture; rule hypothesis wording uses sessionCounts.
   */
  counts: MicroSkillCounts;
  /** This-session counters — drive present-tense rule hypothesis wording. */
  sessionCounts: MicroSkillCounts;
  /** All-time counters after applying this step's evidence. */
  lifetimeCounts: MicroSkillCounts;
  observedContextStrengths: string[];
  observedContextGaps: string[];
  firstInvalidActionDescription?: string;
}

export interface InterpreterResult {
  hypothesisLabel: string;
  confidence: number;
  reasoning: string;
  childFacingSummary: string;
  source: "RULE" | "AI";
}

@Injectable()
export class DiagnosticV2AiInterpreterService {
  private readonly logger = new Logger(DiagnosticV2AiInterpreterService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  /** Always returns a hypothesis — the deterministic one when AI is off, fails, times out, or is rejected. A skill under investigation is never left without an interpretation. */
  async interpret(ctx: InterpreterContext): Promise<InterpreterResult> {
    const rule = buildRuleHypothesis({
      microSkillId: ctx.microSkillId,
      microSkillName: ctx.microSkillName,
      sessionCounts: ctx.sessionCounts,
      lifetimeCounts: ctx.lifetimeCounts,
      firstInvalidActionDescription: ctx.firstInvalidActionDescription,
    });
    const ruleResult: InterpreterResult = { ...rule, source: "RULE" };

    const { system, user } = buildInterpreterPrompts(ctx, rule.hypothesisLabel);

    const result = await this.orchestrator.call<DiagnosticV2HypothesisOutput>({
      capability: CAPABILITY,
      studentId: ctx.studentId,
      sessionId: ctx.sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput: {
        hypothesisLabel: rule.hypothesisLabel,
        confidence: rule.confidence,
        microSkillId: ctx.microSkillId,
      },
      parse: (raw) => this.parseAndValidate(raw, ctx.microSkillId),
      timeoutMs: TIMEOUT_MS,
    });

    if (!result.aiOutput || !result.served) return ruleResult;

    this.logger.log(
      JSON.stringify({
        event: "diagnostic_v2_interpreter.served",
        sessionId: ctx.sessionId,
        microSkillId: ctx.microSkillId,
        ruleLabel: rule.hypothesisLabel,
        aiLabel: result.aiOutput.hypothesisLabel,
        agrees: interpreterAgreesWithRule(rule.hypothesisLabel, result.aiOutput.hypothesisLabel),
      }),
    );

    return {
      hypothesisLabel: result.aiOutput.hypothesisLabel,
      confidence: result.aiOutput.confidence,
      reasoning: result.aiOutput.reasoning,
      childFacingSummary: result.aiOutput.childFacingSummary,
      source: "AI",
    };
  }

  /** Shape first, then a forbidden-term re-check on both free-text fields — a leak fails the whole call even when the JSON was otherwise valid, because childFacingSummary is read by a child. */
  private parseAndValidate(raw: string, microSkillId: string): DiagnosticV2HypothesisOutput {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertDiagnosticV2HypothesisOutputShape({ ...body, microSkillId });

    if (containsForbiddenTerm(shaped.reasoning)) {
      throw new Error(`reasoning for ${microSkillId} contains a forbidden term`);
    }
    if (containsForbiddenTerm(shaped.childFacingSummary)) {
      throw new Error(`childFacingSummary for ${microSkillId} contains a forbidden term`);
    }
    return shaped;
  }
}

export function buildInterpreterPrompts(
  ctx: InterpreterContext,
  ruleLabel: string,
): { system: string; user: string } {
  const system =
    "You explain what a student's algebra practice shows about one specific skill. " +
    "You are given counts that were computed by checking their written work — treat those as facts " +
    "you must not contradict. Your job is only to interpret them: is this most likely a one-off slip, " +
    "a repeating pattern, or is the student handling it well? " +
    "Never infer attention, mood, effort, intelligence, or any clinical trait. " +
    "Never state that an untested skill is weak. " +
    "childFacingSummary is read by a 13-year-old: warm, one or two short sentences, no jargon, no scores, " +
    "no percentages, and never the words used in internal labels. " +
    'Return JSON only: {"hypothesisLabel":"POSSIBLE_SLIP"|"REPEATED_PATTERN"|"WORKING_WELL",' +
    '"confidence":number 0..1,"reasoning":string one sentence,"childFacingSummary":string}. No other keys.';

  const lines = [
    `Skill: ${ctx.microSkillName}`,
    `Got it right on their own: ${ctx.counts.independentSuccessCount} time(s)`,
    `Got it wrong on their own: ${ctx.counts.independentFailureCount} time(s)`,
    `Got it right with help: ${ctx.counts.assistedSuccessCount} time(s)`,
  ];
  if (ctx.firstInvalidActionDescription) {
    lines.push(`What went wrong most recently: ${ctx.firstInvalidActionDescription}`);
  }
  if (ctx.observedContextStrengths.length > 0) {
    lines.push(`Held up under: ${ctx.observedContextStrengths.join(", ")}`);
  }
  if (ctx.observedContextGaps.length > 0) {
    lines.push(`Struggled under: ${ctx.observedContextGaps.join(", ")}`);
  }
  lines.push(`The rule-based reading of this is: ${ruleLabel}`);

  return { system, user: lines.join("\n") };
}
