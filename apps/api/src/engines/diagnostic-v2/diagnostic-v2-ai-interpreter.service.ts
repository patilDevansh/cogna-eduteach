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
import { MICRO_SKILL_CATALOGUE, findMicroSkill } from "./micro-skills.catalog";

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
  questionPrompt: string;
  previousLine: string;
  submittedLine: string;
  sessionSkillEvidence: Array<{
    microSkillId: string;
    microSkillName: string;
    independentSuccessCount: number;
    independentFailureCount: number;
    assistedSuccessCount: number;
  }>;
}

export interface InterpreterResult {
  microSkillId: string;
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
    const ruleResult: InterpreterResult = { ...rule, microSkillId: ctx.microSkillId, source: "RULE" };

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
      parse: (raw) => this.parseAndValidate(raw, ctx),
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

    const independentTrials =
      ctx.sessionCounts.independentSuccessCount + ctx.sessionCounts.independentFailureCount;
    // A short diagnostic cannot support near-certainty. In particular, two
    // wrong quotient calculations are two observations, not proof that the
    // student misunderstands why division isolates the variable.
    const confidenceCeiling = independentTrials < 3 ? 0.7 : 0.9;

    return {
      microSkillId: result.aiOutput.microSkillId,
      hypothesisLabel: result.aiOutput.hypothesisLabel,
      confidence: Math.min(result.aiOutput.confidence, confidenceCeiling),
      reasoning: result.aiOutput.reasoning,
      childFacingSummary: result.aiOutput.childFacingSummary,
      source: "AI",
    };
  }

  /** Shape first, then a forbidden-term re-check on both free-text fields — a leak fails the whole call even when the JSON was otherwise valid, because childFacingSummary is read by a child. */
  private parseAndValidate(raw: string, ctx: InterpreterContext): DiagnosticV2HypothesisOutput {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertDiagnosticV2HypothesisOutputShape(body);
    if (!findMicroSkill(shaped.microSkillId)) {
      throw new Error(`interpreter selected unknown micro-skill ${shaped.microSkillId}`);
    }

    const independentTrials =
      ctx.sessionCounts.independentSuccessCount + ctx.sessionCounts.independentFailureCount;
    if (shaped.hypothesisLabel === "REPEATED_PATTERN" && independentTrials < 3) {
      throw new Error("repeated pattern requires at least three independent opportunities");
    }

    if (containsForbiddenTerm(shaped.reasoning)) {
      throw new Error(`reasoning for ${shaped.microSkillId} contains a forbidden term`);
    }
    if (containsForbiddenTerm(shaped.childFacingSummary)) {
      throw new Error(`childFacingSummary for ${shaped.microSkillId} contains a forbidden term`);
    }
    if (!reasoningGroundsCurrentStep(shaped.reasoning, ctx)) {
      throw new Error("interpreter reasoning must cite both sides of the current equation change and describe this step's result");
    }
    return shaped;
  }
}

function normalizeMathEvidence(value: string): string {
  return value.toLowerCase().replace(/[\s`*_]/g, "").replace(/[−–—]/g, "-");
}

/** Prevent session-count summaries from being pasted onto two different steps. */
export function reasoningGroundsCurrentStep(reasoning: string, ctx: InterpreterContext): boolean {
  const normalized = normalizeMathEvidence(reasoning);
  const previous = normalizeMathEvidence(ctx.previousLine);
  const submitted = normalizeMathEvidence(ctx.submittedLine);
  if (!normalized.includes(previous) || !normalized.includes(submitted)) return false;

  if (ctx.firstInvalidActionDescription) {
    const lower = reasoning.toLowerCase();
    const describesError = /\b(?:incorrect|invalid|error|mistake|wrong|not divided|without.*divid)\b/.test(lower);
    const descriptionNumbers = ctx.firstInvalidActionDescription.match(/-?\d+(?:\.\d+)?/g) ?? [];
    return describesError && descriptionNumbers.every((number) => normalized.includes(normalizeMathEvidence(number)));
  }
  return /\b(?:correct|correctly|valid|succeed|succeeded|success|self-correct|corrected)\b/i.test(reasoning);
}

export function buildInterpreterPrompts(
  ctx: InterpreterContext,
  ruleLabel: string,
): { system: string; user: string } {
  const system =
    "You explain what a student's algebra work on this question shows, using their wider session record for context. " +
    "You must independently choose the best matching micro-skill from the supplied catalogue based on the exact mathematical change; no target micro-skill has been selected for you. " +
    "You are given counts that were computed by checking their written work — treat those as facts " +
    "you must not contradict. Your job is only to interpret them: is this most likely a one-off slip, " +
    "a repeating pattern, or is the student handling it well? " +
    "Two incorrect answers show that an outcome occurred twice; they do not by themselves prove a conceptual gap. " +
    "Call a conceptual repeated pattern only after at least three independent opportunities, with the same error mechanism " +
    "appearing on more than half of them or surviving a transfer check. Otherwise use POSSIBLE_SLIP and say another check is needed. " +
    "For coefficient-division work, distinguish choosing the correct operation but computing the wrong quotient " +
    "(a calculation error while dividing) from failing to understand that both sides must be divided. " +
    "Do not claim a cause such as rushing, attention, arithmetic recall, transcription, or sign handling; these are possible causes, " +
    "not observed facts. When a quotient calculation is wrong, recommend writing the divisor on both sides, calculating the quotient " +
    "separately, and checking by multiplying or substituting back. " +
    "Never infer attention, mood, effort, intelligence, or any clinical trait. " +
    "Never state that an untested skill is weak. In reasoning, cite the exact equation change and numerical " +
    "success/failure counts. Compare demonstrated strengths with the specific error when the evidence supports it. " +
    "Keep this-session evidence separate from lifetime totals: never imply that lifetime attempts occurred in this session, " +
    "and if this is the first session attempt, explicitly call it the first attempt this session. " +
    "Do not use vague claims such as 'the student struggled' without saying exactly what operation changed incorrectly. " +
    "Begin the reasoning with the current exact equation change (previous line -> submitted line). Explain this current step first, " +
    "then use the session counts as context. On an incorrect step, state the numerical calculation error; on a correction, explicitly " +
    "say that the new line corrects the earlier error. Never reuse a session-level sentence that could describe a different step. " +
    "childFacingSummary is read by a 13-year-old: warm, one or two short sentences, no jargon, no scores, " +
    "no percentages, and never the words used in internal labels. " +
    'Return JSON only: {"microSkillId":string from the supplied catalogue,"hypothesisLabel":"POSSIBLE_SLIP"|"REPEATED_PATTERN"|"WORKING_WELL",' +
    '"confidence":number 0..1,"reasoning":string one sentence,"childFacingSummary":string}. No other keys.';

  const lines = [
    `Question: ${ctx.questionPrompt}`,
    `Exact submitted change: ${ctx.previousLine} -> ${ctx.submittedLine}`,
    `Available micro-skills: ${MICRO_SKILL_CATALOGUE.map((skill) => `${skill.id} = ${skill.name}`).join("; ")}`,
    `Evidence counters associated by the rule engine with this step: ${ctx.sessionCounts.independentSuccessCount} independent success(es), ${ctx.sessionCounts.independentFailureCount} independent failure(s), ${ctx.sessionCounts.assistedSuccessCount} assisted success(es) this session; ${ctx.lifetimeCounts.independentSuccessCount} lifetime independent success(es), ${ctx.lifetimeCounts.independentFailureCount} lifetime independent failure(s). Use these as evidence, not as a prescribed micro-skill label.`,
  ];
  if (ctx.sessionSkillEvidence.length > 0) {
    lines.push("Other numerical evidence from this session:");
    for (const skill of ctx.sessionSkillEvidence) {
      lines.push(
        `- ${skill.microSkillId} (${skill.microSkillName}): ${skill.independentSuccessCount} independent success(es), ` +
        `${skill.independentFailureCount} independent failure(s), ${skill.assistedSuccessCount} assisted success(es)`,
      );
    }
  }
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
