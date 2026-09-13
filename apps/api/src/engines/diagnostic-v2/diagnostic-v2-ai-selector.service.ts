/**
 * AI responsibility 1: decide what to ask next.
 *
 * Bounded three ways, all enforced here rather than trusted to the prompt:
 *  - EXISTING must be an index into the legal candidate array the rules built
 *    (same reject-don't-clamp rule as question-recommender.formulas.ts).
 *  - GENERATE must name a known template; the rendered instance must be
 *    distinct from everything already served this session and must pass
 *    independent re-verification before it can be shown.
 *  - AUTHOR names a skill and why no template fits; a second model call
 *    writes the equation, and `gateAuthoredItem` must clear every check
 *    before anything reaches a student. Failure falls back to a template
 *    or the rule pick — never to showing the rejected equation.
 *
 * On any rejection, failure, timeout, or disabled flag, the caller keeps the
 * rule-based pick — which is always what `ruleOutput` carries.
 */
import { Injectable, Logger } from "@nestjs/common";
import {
  assertDiagnosticV2SelectorChoiceShape,
  containsForbiddenTerm,
  findForbiddenTerm,
  type DiagnosticV2SelectorChoice,
  type MicroSkillId,
} from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import { selectorAgreesWithRule } from "./diagnostic-v2.formulas";
import {
  DiagnosticV2AiAuthorService,
  type AuthorContext,
} from "./diagnostic-v2-ai-author.service";
import { gateAuthoredItem } from "./diagnostic-v2-authoring";
import {
  isKnownTemplateId,
  KNOWN_TEMPLATE_IDS,
  normalizedQuestionKey,
  renderFreshInstance,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_STAGES,
  type DiagnosticV2Item,
  type DiagnosticV2ItemStageId,
  type DiagnosticV2TemplateId,
} from "./diagnostic-v2-template-render";
import { takeBufferedItem } from "./diagnostic-v2-next-item-buffer";

const CAPABILITY = "DIAGNOSTIC_V2_SELECTOR";
/**
 * Raised 2000 -> 3000 after a live Phase A session showed two of three
 * selector calls landing at 2002ms and 2015ms — just over the old budget —
 * so the student was silently getting the rule-chosen item most of the time.
 * Raised again to 3500 after live combined-algebra calls repeatedly reached
 * the 3000ms boundary. This buys enough headroom to see the AI path actually
 * run while keeping the student wait bounded. This is a
 * deliberate Phase A observation setting, not a permanent answer: the real
 * fix for latency is pre-generating a verified buffer in the background
 * (Phase C), not making the student wait longer.
 *
 * Keep in sync with LATENCY_BUDGET_MS in ai/shadow-gate-evaluator.formulas.ts.
 */
const TIMEOUT_MS = 3500;

/** How slow an authoring call may be before the next AUTHOR request is refused up front and a template is preferred. */
const AUTHOR_P95_BUDGET_MS = 2500;

export interface SelectorCandidate {
  item: DiagnosticV2Item;
  /** Why the rules consider this a legal next item — shown to the model so its choice is grounded in the same reasons. */
  legalityReason: string;
}

/**
 * One micro-skill line for the prompt. Counts alone are not enough: the model
 * must be able to tell "never tested" from "tested twice, failed twice", see
 * the precise last error, and weigh this-session evidence against earlier
 * sessions (D3).
 */
export interface SelectorSkillLine {
  microSkillId: string;
  status: string;
  independentSuccessCount: number;
  independentFailureCount: number;
  assistedSuccessCount: number;
  observedContextStrengths: string[];
  observedContextGaps: string[];
  /** `this session` vs `earlier` — D3 owner-locked labelling. */
  scope: "this session" | "earlier";
  recentErrorDescription?: string;
  /**
   * The stable taxonomy code behind `recentErrorDescription`. Passing the code
   * as well as the sentence lets the model reason over error *categories* —
   * two students with the same misconception and different numbers look alike
   * by code and unrelated by prose.
   */
  recentErrorCode?: string;
  hypothesisLabel?: string;
  hypothesisConfidence?: number;
  /**
   * Root causes, from the catalogue's prerequisite graph. Without these the
   * selector can only chase the failing skill itself: a student who cannot
   * expand `-2(x - 5)` gets another bracket question, never the far smaller
   * question of what `-2 x -5` is. Each carries its own status so the model can
   * see whether the prerequisite is solid, shaky, or never tested.
   */
  prerequisites: Array<{ microSkillId: string; status: string }>;
  /**
   * The most help this skill has already been given in this session. A skill
   * that has failed twice with no teaching yet, and one that has failed twice
   * *after* being taught, need opposite responses — and were indistinguishable
   * to the selector before this.
   */
  highestAssistanceGiven?: string;
}

export interface AlreadyServedItem {
  prompt: string;
  templateId: string | null;
  origin: string;
}

export interface SelectorContext {
  studentId: string;
  sessionId: string;
  candidates: SelectorCandidate[];
  /** Index into `candidates` the deterministic stage sequence would pick. */
  ruleSelectedIndex: number;
  /**
   * Stage the rule wants next — used when GENERATE/AUTHOR lands so the served
   * item occupies the right place in the sequence without guessing from a key.
   */
  ruleStageId: DiagnosticV2ItemStageId;
  /** Rich per-skill lines (G1.1 + D3). Prefer over bare counts. */
  skillLines: SelectorSkillLine[];
  /** Every question already shown this session (G1.2). */
  alreadyServed: AlreadyServedItem[];
  /**
   * Advances as the session does so a second GENERATE of the same template
   * cannot replay the same seed (D2). Typically the count of attempts so far.
   */
  serveOrdinal: number;
  /** The deterministic reading of the student's most recent step, if any. */
  lastStepSummary?: string;
  /** Exact earlier submitted transitions, with question/step and rule result. */
  workEvidenceLines?: string[];
  /**
   * Observed authoring-path latencies for this process, newest last. When the
   * recent p95 exceeds the authoring budget, AUTHOR is refused before the
   * second round-trip and a template is preferred (G2.4).
   */
  recentAuthorLatenciesMs?: number[];
}

export interface SelectorResult {
  item: DiagnosticV2Item;
  source: "RULE" | "AI";
  reasoning?: string;
  /** Set when the AI asked to generate/author and the candidate was discarded. */
  discardedGeneration?: string;
  /** Wall time of the authoring round-trip when one ran, for the audit trail. */
  authorLatencyMs?: number;
  /** Phase C: true when the item was taken from the verified next-item buffer. */
  fromBuffer?: boolean;
  /** Phase C: template slot that was consumed — session service refills this. */
  consumedBufferTemplateId?: DiagnosticV2TemplateId;
  /**
   * Debug-only: what the AI chose before gates / fallbacks. Null when the
   * orchestrator never returned a served choice (flag off / timeout / reject).
   */
  aiDecision?: {
    choice: "EXISTING" | "GENERATE" | "AUTHOR";
    chosenIndex: number | null;
    templateId: string | null;
    targetMicroSkillId: string | null;
    confidence: number | null;
    reasoning: string;
    agreedWithRule: boolean;
  } | null;
}

@Injectable()
export class DiagnosticV2AiSelectorService {
  private readonly logger = new Logger(DiagnosticV2AiSelectorService.name);

  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly author: DiagnosticV2AiAuthorService,
  ) {}

  async selectNext(ctx: SelectorContext): Promise<SelectorResult> {
    const ruleItem = ctx.candidates[ctx.ruleSelectedIndex]?.item;
    if (!ruleItem) {
      throw new Error("selector called with an empty or out-of-range rule selection");
    }
    const ruleLegality =
      ctx.candidates[ctx.ruleSelectedIndex]?.legalityReason ??
      "next planned question in the rule sequence";
    const ruleFallback: SelectorResult = {
      item: ruleItem,
      source: "RULE",
      // Always explain RULE picks (including AI timeout / reject fallbacks) so
      // the debug "Why this question" panel is never blank on the rule path.
      reasoning: `Rule sequence: ${ruleLegality}.`,
      aiDecision: null,
    };

    if (ctx.candidates.length === 0) return ruleFallback;

    const { system, user } = buildSelectorPrompts(ctx);
    const ruleOutput = {
      choice: "EXISTING" as const,
      index: ctx.ruleSelectedIndex,
      candidateCount: ctx.candidates.length,
    };

    const result = await this.orchestrator.call<DiagnosticV2SelectorChoice>({
      capability: CAPABILITY,
      studentId: ctx.studentId,
      sessionId: ctx.sessionId,
      systemPrompt: system,
      userPrompt: user,
      ruleOutput,
      parse: (raw) => this.parseAndValidate(raw, ctx),
      timeoutMs: TIMEOUT_MS,
    });

    if (!result.aiOutput || !result.served) {
      return ruleFallback;
    }

    const choice = result.aiOutput;
    const agreedWithRule = selectorAgreesWithRule(ruleOutput, choice);
    this.logger.log(
      JSON.stringify({
        event: "diagnostic_v2_selector.served",
        sessionId: ctx.sessionId,
        ruleSelectedIndex: ctx.ruleSelectedIndex,
        aiChoice: choice.choice,
        agrees: agreedWithRule,
      }),
    );

    const aiDecision: NonNullable<SelectorResult["aiDecision"]> = {
      choice: choice.choice,
      chosenIndex: choice.choice === "EXISTING" ? choice.index : null,
      templateId: choice.choice === "GENERATE" ? choice.templateId : null,
      targetMicroSkillId: choice.choice === "AUTHOR" ? choice.targetMicroSkillId : null,
      confidence: choice.confidence ?? null,
      reasoning: choice.reasoning,
      agreedWithRule,
    };

    if (choice.choice === "EXISTING") {
      return {
        item: ctx.candidates[choice.index]!.item,
        source: "AI",
        reasoning: choice.reasoning,
        aiDecision,
      };
    }

    if (choice.choice === "GENERATE") {
      const generated = await this.serveGenerated(
        choice.templateId as DiagnosticV2TemplateId,
        choice.reasoning,
        ctx,
        ruleFallback,
      );
      return { ...generated, aiDecision };
    }

    // AUTHOR
    const authored = await this.serveAuthored(choice, ctx, ruleFallback);
    return { ...authored, aiDecision };
  }

  private async serveGenerated(
    templateId: DiagnosticV2TemplateId,
    reasoning: string,
    ctx: SelectorContext,
    ruleFallback: SelectorResult,
  ): Promise<SelectorResult> {
    // Phase C: consume a pre-verified buffer hit before sync render / LLM wait.
    const buffered = takeBufferedItem(ctx.sessionId, templateId);
    if (buffered) {
      const alreadyServed = alreadyServedKeys(ctx);
      if (alreadyServed.has(normalizedQuestionKey(buffered.openingLine))) {
        this.logger.log(
          JSON.stringify({
            event: "diagnostic_v2_buffer.stale",
            sessionId: ctx.sessionId,
            templateId,
            itemKey: buffered.itemKey,
          }),
        );
        // Entry already consumed via take; fall through to sync generate.
      } else {
        this.logger.log(
          JSON.stringify({
            event: "diagnostic_v2_buffer.hit",
            sessionId: ctx.sessionId,
            templateId,
            itemKey: buffered.itemKey,
          }),
        );
        return {
          item: buffered,
          source: "AI",
          reasoning,
          fromBuffer: true,
          consumedBufferTemplateId: templateId,
          discardedGeneration: ruleFallback.discardedGeneration,
          authorLatencyMs: ruleFallback.authorLatencyMs,
        };
      }
    }

    this.logger.log(
      JSON.stringify({
        event: "diagnostic_v2_buffer.miss",
        sessionId: ctx.sessionId,
        templateId,
      }),
    );

    const alreadyServed = alreadyServedKeys(ctx);
    const fresh = renderFreshInstance({
      templateId,
      seedBase: `${ctx.sessionId}:${templateId}:${ctx.serveOrdinal}`,
      alreadyServed,
    });
    if (!fresh.item) {
      this.logger.warn(
        `Generated item for ${templateId} could not be served, falling back: ${fresh.failure}`,
      );
      return {
        ...ruleFallback,
        discardedGeneration: [ruleFallback.discardedGeneration, fresh.failure].filter(Boolean).join("; "),
      };
    }
    return {
      item: fresh.item,
      source: "AI",
      reasoning,
      // Keep any prior author/gate rejection reason so observability still sees it
      // even though a template instance was served instead.
      discardedGeneration: ruleFallback.discardedGeneration,
      authorLatencyMs: ruleFallback.authorLatencyMs,
    };
  }

  private async serveAuthored(
    choice: Extract<DiagnosticV2SelectorChoice, { choice: "AUTHOR" }>,
    ctx: SelectorContext,
    ruleFallback: SelectorResult,
  ): Promise<SelectorResult> {
    if (authoringOverBudget(ctx.recentAuthorLatenciesMs)) {
      this.logger.warn(
        `Authoring path over p95 budget (${AUTHOR_P95_BUDGET_MS}ms); preferring a template for session ${ctx.sessionId}`,
      );
      const preferred = templateForSkill(choice.targetMicroSkillId as MicroSkillId) ?? "TPL_NEG_DISTRIBUTION";
      return this.serveGenerated(preferred, choice.reasoning, ctx, {
        ...ruleFallback,
        discardedGeneration: `authoring deferred: recent p95 exceeds ${AUTHOR_P95_BUDGET_MS}ms`,
      });
    }

    const authorCtx: AuthorContext = {
      studentId: ctx.studentId,
      sessionId: ctx.sessionId,
      targetMicroSkillId: choice.targetMicroSkillId as MicroSkillId,
      whyNoTemplateFits: choice.whyNoTemplateFits,
      templateDescriptions: KNOWN_TEMPLATE_IDS.map((id) => `${id}: ${TEMPLATE_DESCRIPTIONS[id]}`),
      alreadyServedPrompts: ctx.alreadyServed.map((s) => s.prompt),
      observedErrorDescription: ctx.skillLines.find((l) => l.recentErrorDescription)?.recentErrorDescription,
    };

    const started = Date.now();
    const authored = await this.author.author(authorCtx);
    const authorLatencyMs = Date.now() - started;

    if (!authored.candidate) {
      this.logger.warn(
        `Authoring produced nothing usable for session ${ctx.sessionId}${authored.refusal ? `: ${authored.refusal}` : ""}`,
      );
      const preferred = templateForSkill(choice.targetMicroSkillId as MicroSkillId) ?? "TPL_NEG_DISTRIBUTION";
      return this.serveGenerated(preferred, choice.reasoning, ctx, {
        ...ruleFallback,
        discardedGeneration: authored.refusal ?? "authoring returned no candidate",
        authorLatencyMs,
      });
    }

    const gate = gateAuthoredItem({
      authored: authored.candidate,
      stageId: ctx.ruleStageId,
      isTransferCheck:
        ctx.ruleStageId === "TRANSFER_NEG_DIST" || ctx.ruleStageId === "TRANSFER_FRAC_CLEAR",
      alreadyServed: alreadyServedKeys(ctx),
    });

    if (!gate.passed) {
      this.logger.warn(
        `Authored item rejected (${gate.rejection.code}): ${gate.rejection.detail}`,
      );
      const preferred = templateForSkill(choice.targetMicroSkillId as MicroSkillId) ?? "TPL_NEG_DISTRIBUTION";
      return this.serveGenerated(preferred, choice.reasoning, ctx, {
        ...ruleFallback,
        discardedGeneration: `${gate.rejection.code}: ${gate.rejection.detail}`,
        authorLatencyMs,
      });
    }

    return {
      item: gate.item,
      source: "AI",
      reasoning: choice.reasoning,
      authorLatencyMs,
    };
  }

  private parseAndValidate(raw: string, ctx: SelectorContext): DiagnosticV2SelectorChoice {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertDiagnosticV2SelectorChoiceShape(body);

    if (containsForbiddenTerm(shaped.reasoning)) {
      throw new Error(`selector reasoning contains forbidden term "${findForbiddenTerm(shaped.reasoning) ?? "unknown"}"`);
    }
    // G1.4: when there is something to cite, reasoning must cite it. On a blank
    // slate (no skill lines and no prior step) there is nothing observed yet.
    const hasObservable =
      ctx.skillLines.length > 0 || Boolean(ctx.lastStepSummary && ctx.lastStepSummary.trim());
    if (hasObservable && !reasoningCitesEvidence(shaped.reasoning, ctx)) {
      throw new Error("selector reasoning must cite an observed skill status or an exact observed step");
    }

    if (shaped.choice === "EXISTING") {
      if (shaped.index >= ctx.candidates.length) {
        throw new Error(
          `selectedIndex ${shaped.index} is not a legal candidate (only 0..${ctx.candidates.length - 1} exist)`,
        );
      }
      return shaped;
    }

    if (shaped.choice === "GENERATE") {
      if (!isKnownTemplateId(shaped.templateId)) {
        throw new Error(`templateId "${shaped.templateId}" is not a legal candidate template`);
      }
      return shaped;
    }

    // AUTHOR
    if (containsForbiddenTerm(shaped.whyNoTemplateFits)) {
      throw new Error("whyNoTemplateFits contains a forbidden term");
    }
    return shaped;
  }
}

function alreadyServedKeys(ctx: SelectorContext): Set<string> {
  const keys = new Set<string>();
  for (const served of ctx.alreadyServed) {
    keys.add(normalizedQuestionKey(openingLineFromPrompt(served.prompt)));
  }
  for (const c of ctx.candidates) {
    // Candidates themselves are not "already served", but their opening lines
    // that match prior prompts are covered above. Nothing else to add.
    void c;
  }
  return keys;
}

function openingLineFromPrompt(prompt: string): string {
  const idx = prompt.indexOf(":");
  return (idx === -1 ? prompt : prompt.slice(idx + 1)).trim();
}

function templateForSkill(skill: MicroSkillId): DiagnosticV2TemplateId | null {
  switch (skill) {
    case "LIN_DISTRIBUTE_NEG":
      return "TPL_NEG_DISTRIBUTION";
    case "LIN_SOLVE_TWO_STEP":
      return "TPL_TWO_STEP";
    case "LIN_SOLVE_VARIABLE_BOTH":
      return "TPL_VARIABLE_BOTH";
    case "LIN_CLEAR_FRACTIONS":
      return "TPL_FRAC_CLEAR";
    case "LIN_SOLVE_FRACTIONS":
      return "TPL_FRAC_SIMPLE";
    case "FND_FRACTION_EQUIV":
    case "FND_FRACTION_OPS":
      return "TPL_FRAC_CLEAR";
    case "ID_DIFF_SQUARES":
      return "TPL_DIFF_SQUARES";
    case "EXP_EXPAND_BINOMIALS":
      return "TPL_EXPAND_BINOMIAL";
    case "ALG_IDENTIFY_STRUCTURE":
    case "ID_VERIFY_EXPANSION":
      return "TPL_DIFF_SQUARES";
    default:
      return null;
  }
}

function authoringOverBudget(latencies: number[] | undefined): boolean {
  if (!latencies || latencies.length < 3) return false;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return (sorted[idx] ?? 0) > AUTHOR_P95_BUDGET_MS;
}

/** Reasoning must name a status or ground itself in a concrete submitted step — not a generic platitude (G1.4). */
export function reasoningCitesEvidence(reasoning: string, ctx: SelectorContext): boolean {
  const lower = reasoning.toLowerCase();
  for (const line of ctx.skillLines) {
    if (lower.includes(line.microSkillId.toLowerCase())) return true;
    if (lower.includes(line.status.toLowerCase())) return true;
    if (line.recentErrorDescription) {
      const snippet = line.recentErrorDescription.slice(0, 24).toLowerCase();
      if (snippet.length >= 8 && lower.includes(snippet)) return true;
    }
    if (line.hypothesisLabel && lower.includes(line.hypothesisLabel.toLowerCase())) return true;
  }
  if (ctx.lastStepSummary && lower.includes(ctx.lastStepSummary.slice(0, 24).toLowerCase())) {
    return true;
  }
  // The current submission is routed before its evidence transaction commits,
  // so its micro-skill may not be in skillLines yet. Accept a paraphrase only
  // when it names the exact skill from the current summary and explicitly
  // describes an error; a generic "student made an error" still fails.
  if (ctx.lastStepSummary) {
    const summaryLower = ctx.lastStepSummary.toLowerCase();
    const currentSkillIds = ctx.lastStepSummary.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? [];
    const summaryIsIncorrect = /\b(?:incorrect|invalid|wrong|error)\b/.test(summaryLower);
    const reasoningNamesError = /\b(?:incorrect|invalid|wrong|error|mistake)\b/.test(lower);
    if (
      summaryIsIncorrect &&
      reasoningNamesError &&
      currentSkillIds.some((id) => lower.includes(id.toLowerCase()))
    ) {
      return true;
    }

    // A correct current step has not committed its skill line yet. Accept a
    // paraphrase when it cites both sides of the exact submitted transition.
    // The selector may choose another next skill, so requiring it to repeat
    // the rule engine's skill id would reject otherwise grounded reasoning.
    const exactChange = ctx.lastStepSummary.match(/exact submitted change:\s*(.*?)\s*->\s*(.+)$/i);
    const summaryIsCorrect = /\bcorrect\b/.test(summaryLower);
    const reasoningNamesSuccess = /\b(?:correct|correctly|valid|succeed|succeeded|success)\b/.test(lower);
    if (summaryIsCorrect && reasoningNamesSuccess && exactChange) {
      const normalizeMathEvidence = (value: string) =>
        value.toLowerCase().replace(/[\s`*_]/g, "").replace(/[−–—]/g, "-");
      const normalizedReasoning = normalizeMathEvidence(reasoning);
      const previous = normalizeMathEvidence(exactChange[1]!);
      const submitted = normalizeMathEvidence(exactChange[2]!);
      if (
        previous.length >= 3 &&
        submitted.length >= 3 &&
        normalizedReasoning.includes(previous) &&
        normalizedReasoning.includes(submitted)
      ) {
        return true;
      }
    }
  }
  // Status words that only appear when a skill line carried them.
  for (const status of ["unknown", "emerging", "developing", "reliable", "likely_gap", "likely gap"]) {
    if (lower.includes(status) && ctx.skillLines.some((l) => l.status.toLowerCase().replace("_", " ") === status.replace("_", " ") || l.status.toLowerCase() === status)) {
      return true;
    }
  }
  return false;
}

export function formatSkillLine(line: SelectorSkillLine): string {
  const parts = [
    `${line.microSkillId} [${line.scope}] status=${line.status}`,
    `right alone ${line.independentSuccessCount}`,
    `wrong alone ${line.independentFailureCount}`,
    `right with help ${line.assistedSuccessCount}`,
  ];
  if (line.observedContextStrengths.length > 0) {
    parts.push(`strengths=${line.observedContextStrengths.join(",")}`);
  }
  if (line.observedContextGaps.length > 0) {
    parts.push(`gaps=${line.observedContextGaps.join(",")}`);
  }
  if (line.recentErrorDescription) {
    parts.push(
      `recent error${line.recentErrorCode ? ` [${line.recentErrorCode}]` : ""}: ${line.recentErrorDescription}`,
    );
  }
  if (line.highestAssistanceGiven && line.highestAssistanceGiven !== "NONE") {
    parts.push(`ALREADY TAUGHT: reached ${line.highestAssistanceGiven} for this skill`);
  }
  // Defensive: a missing prerequisite list must degrade to "say nothing about
  // prerequisites", never throw. This runs on the path that chooses the
  // student's next question — a crash here means no question at all.
  const prerequisites = line.prerequisites ?? [];
  if (prerequisites.length > 0) {
    parts.push(`built on: ${prerequisites.map((p) => `${p.microSkillId}(${p.status})`).join(", ")}`);
  }
  if (line.hypothesisLabel) {
    parts.push(
      `hypothesis="${line.hypothesisLabel}"${
        line.hypothesisConfidence !== undefined ? ` conf=${line.hypothesisConfidence}` : ""
      }`,
    );
  }
  return parts.join("; ");
}

export function buildSelectorPrompts(ctx: SelectorContext): { system: string; user: string } {
  const system =
    "You choose the next algebra question for one student in a short algebra check. " +
    "Every listed option has already been checked as mathematically correct and appropriate. " +
    "Prefer a listed EXISTING option or a GENERATE of a listed template whenever one fits. " +
    "AUTHOR only when you can state what specifically the available template shapes cannot cover. " +
    "Never request a repeat of a question already shown this session. " +
    // Root-cause probing. Without this the model chases the failing skill and
    // never asks the smaller question underneath it.
    "A skill line's `built on:` lists that skill's prerequisites and their statuses. When a skill keeps " +
    "failing and one of its prerequisites is UNKNOWN or also weak, prefer a question targeting the " +
    "prerequisite — the likely root cause — over another question on the failing skill itself. " +
    // Don't re-teach the same way to a student who already had it.
    "`ALREADY TAUGHT` means this skill has been explained in this session. If it is still failing after " +
    "that, do not pick something that would simply repeat the same explanation — go to a prerequisite, " +
    "or to a different form of the same skill. " +
    // Two constraints that pull against each other, so both are stated
    // concretely: the reasoning has to name something checkable, but asking for
    // root-cause reasoning drags the model toward the exact assessment
    // vocabulary the voice check rejects ("diagnose the misconception", "weak
    // in signs"). Naming the skill id satisfies the first without touching the
    // second. The debug UI can display this verbatim to staff, so keep it
    // readable even though exact ids remain useful for auditing.
    "Your reasoning must name the exact micro-skill id it is about (for example LIN_DISTRIBUTE_NEG) " +
    "and say what the student actually did — a generic statement is rejected. " +
    "Describe the mathematical step in plain words. Do not use the words diagnose, diagnostic, " +
    "misconception, mastery, threshold, retention, fatigue, failure or clinical, and never say a " +
    "student is \"weak in\" something. " +
    "In reasoning, refer to the next question by its itemKey or template id — never write \"option 0\", " +
    "\"option 1\", or any choice-index phrase. " +
    "You may never invent an index, a template id, or a micro-skill id that is not listed. " +
    "Never infer attention, mood, effort, or any clinical trait. " +
    'Return JSON only: {"choice":"EXISTING","index":integer,"confidence":number 0..1,"reasoning":string} ' +
    'or {"choice":"GENERATE","templateId":string,"confidence":number 0..1,"reasoning":string} ' +
    'or {"choice":"AUTHOR","targetMicroSkillId":string,"whyNoTemplateFits":string,"confidence":number 0..1,"reasoning":string}. ' +
    "One plain sentence of reasoning. No other keys.";

  const candidateLines = ctx.candidates.map(
    (c, i) =>
      `[${i}] itemKey=${c.item.itemKey} template=${c.item.templateId ?? "none"} origin=${c.item.origin} targets=${c.item.primaryMicroSkillId} prompt="${c.item.prompt}" legality="${c.legalityReason}"`,
  );

  const templateLines = KNOWN_TEMPLATE_IDS.map((t) => `- ${t}: ${TEMPLATE_DESCRIPTIONS[t]}`);

  const servedLines =
    ctx.alreadyServed.length > 0
      ? ctx.alreadyServed.map(
          (s) =>
            `- ALREADY SEEN this session: template=${s.templateId ?? "none"} origin=${s.origin} prompt="${s.prompt}"`,
        )
      : ["- (none yet this session)"];

  const skillBlock =
    ctx.skillLines.length > 0
      ? ctx.skillLines.map(formatSkillLine).join("\n")
      : "Nothing observed yet.";

  const user = [
    "What this student has shown so far (labelled this session vs earlier):",
    skillBlock,
    ctx.lastStepSummary ? `\nMost recent step: ${ctx.lastStepSummary}` : "",
    ctx.workEvidenceLines?.length
      ? `\nExact earlier work from this session:\n${ctx.workEvidenceLines.join("\n")}`
      : "",
    "\nQuestions already shown this session (do not repeat):",
    servedLines.join("\n"),
    "\nOptions:",
    candidateLines.join("\n"),
    "\nTemplates you may request a fresh instance of (prefer these over AUTHOR when one fits):",
    templateLines.join("\n"),
    "\nPick the single most informative next question.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/** Exported for tests that need the stage a template occupies. */
export function stageForKnownTemplate(templateId: DiagnosticV2TemplateId): DiagnosticV2ItemStageId {
  return TEMPLATE_STAGES[templateId];
}
