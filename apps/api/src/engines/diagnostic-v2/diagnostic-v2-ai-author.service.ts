/**
 * AI responsibility 4 (Phase A2): write the question itself.
 *
 * This is the only place in the product where a model authors mathematics a
 * child will read, and it is allowed only because `diagnostic-v2-authoring.ts`
 * can independently prove the result correct. The division of labour is
 * strict: this service gets the model to produce a candidate; it decides
 * nothing about whether that candidate is fit to serve.
 *
 * A separate round-trip from selection, deliberately. Selection is a cheap
 * choice among things already known to be correct and runs on every completed
 * item; authoring is expensive and runs only when the selector has said, in
 * its own words, that nothing available fits. Keeping them apart means the
 * ordinary path never pays for the rare one, and the audit log gets one row
 * per decision rather than one row covering two.
 *
 * Fails closed: any error, timeout, disabled flag, malformed response or
 * missing field yields no candidate at all, and the caller falls back to a
 * template or a pre-written item.
 */
import { Injectable, Logger } from "@nestjs/common";
import {
  assertDiagnosticV2AuthoredItemShape,
  containsForbiddenTerm,
  type DiagnosticV2AuthoredItem,
  type MicroSkillId,
} from "@cogna/shared";
import { AiOrchestratorService } from "../../ai/ai-orchestrator.service";
import { MAX_AUTHORED_LITERAL } from "./diagnostic-v2-authoring";

const CAPABILITY = "DIAGNOSTIC_V2_AUTHOR";

/**
 * Tighter than the selector's 3000ms on purpose. Authoring is a second wait on
 * top of selection, and the plan's rule is that the student's wait must not
 * rise to accommodate it — so the authoring path gets the slack that is left,
 * not slack of its own.
 *
 * Keep in sync with LATENCY_BUDGET_MS in ai/shadow-gate-evaluator.formulas.ts.
 */
const TIMEOUT_MS = 2500;

export interface AuthorContext {
  studentId: string;
  sessionId: string;
  targetMicroSkillId: MicroSkillId;
  /** The selector's own statement of what the available shapes were missing. */
  whyNoTemplateFits: string;
  /** Every template shape that already exists, so the model does not re-author one of them. */
  templateDescriptions: string[];
  /** Questions the student has already been given this session, verbatim. */
  alreadyServedPrompts: string[];
  /** The precise deterministic reading of the error being targeted, when there is one. */
  observedErrorDescription?: string;
}

export interface AuthorResult {
  /** null when nothing usable came back — the caller must then serve a template or a pre-written item. */
  candidate: DiagnosticV2AuthoredItem | null;
  /** Set when a response arrived but was refused before the gate ever saw it. */
  refusal?: string;
}

@Injectable()
export class DiagnosticV2AiAuthorService {
  private readonly logger = new Logger(DiagnosticV2AiAuthorService.name);

  constructor(private readonly orchestrator: AiOrchestratorService) {}

  async author(ctx: AuthorContext): Promise<AuthorResult> {
    const { system, user } = buildAuthorPrompts(ctx);

    const result = await this.orchestrator.call<DiagnosticV2AuthoredItem>({
      capability: CAPABILITY,
      studentId: ctx.studentId,
      sessionId: ctx.sessionId,
      systemPrompt: system,
      userPrompt: user,
      // There is no rule-authored equation to compare against — the rules'
      // answer to "author something new" is always "serve a template instead",
      // and that is what gets logged as the baseline.
      ruleOutput: {
        choice: "GENERATE",
        targetMicroSkillId: ctx.targetMicroSkillId,
        note: "the deterministic fallback for an authoring request is a rendered template",
      },
      parse: (raw) => this.parseAndValidate(raw, ctx.targetMicroSkillId),
      timeoutMs: TIMEOUT_MS,
    });

    if (!result.aiOutput || !result.served) {
      return { candidate: null, refusal: result.served === false && result.aiOutput ? undefined : "authoring call not served" };
    }

    this.logger.log(
      JSON.stringify({
        event: "diagnostic_v2_author.candidate",
        sessionId: ctx.sessionId,
        targetMicroSkillId: result.aiOutput.targetMicroSkillId,
      }),
    );

    return { candidate: result.aiOutput };
  }

  /**
   * Shape and voice only. Everything mathematical is left to the gate, which
   * has an independent solver; a check here that looked like verification
   * would invite the caller to trust it.
   */
  private parseAndValidate(raw: string, expectedSkill: MicroSkillId): DiagnosticV2AuthoredItem {
    const parsed: unknown = JSON.parse(raw);
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const shaped = assertDiagnosticV2AuthoredItemShape(body);

    if (shaped.targetMicroSkillId !== expectedSkill) {
      throw new Error(
        `authored item targets ${shaped.targetMicroSkillId}, but ${expectedSkill} was requested`,
      );
    }
    if (containsForbiddenTerm(shaped.equation)) {
      throw new Error("authored equation contains a forbidden term");
    }
    if (containsForbiddenTerm(shaped.claimedSolution)) {
      throw new Error("authored claimedSolution contains a forbidden term");
    }
    if (containsForbiddenTerm(shaped.whyNoTemplateFits)) {
      throw new Error("authored whyNoTemplateFits contains a forbidden term");
    }
    return shaped;
  }
}

export function buildAuthorPrompts(ctx: AuthorContext): { system: string; user: string } {
  const system =
    "You write one algebra question for a Grade 8 student, and nothing else. " +
    "Write a single linear equation in one variable, using at most one bracket, " +
    "only integers, and only the characters 0-9, one lowercase letter, + - * / ( ) and =. " +
    `Every number you write must be between -${MAX_AUTHORED_LITERAL} and ${MAX_AUTHORED_LITERAL}, ` +
    "and the equation must have exactly one solution, which must be a whole number. " +
    "It must genuinely exercise the requested skill. Solve it yourself and state the solution; " +
    "your solution is checked against an independent solver and the question is discarded if they disagree, " +
    "so do not guess. Do not write anything about the student. " +
    'Return JSON only: {"equation":string,"claimedSolution":string,"targetMicroSkillId":string,' +
    '"whyNoTemplateFits":string}. No other keys, no working, no explanation of the maths.';

  const user = [
    `Skill to exercise: ${ctx.targetMicroSkillId}`,
    `Why an existing shape will not do: ${ctx.whyNoTemplateFits}`,
    ctx.observedErrorDescription ? `What this student got wrong most recently: ${ctx.observedErrorDescription}` : "",
    "",
    "Shapes that already exist — do not reproduce one of these, that is what they are for:",
    ...ctx.templateDescriptions.map((d) => `- ${d}`),
    "",
    ctx.alreadyServedPrompts.length > 0
      ? ["Questions this student has already been given this session — none of these, and nothing equivalent:", ...ctx.alreadyServedPrompts.map((p) => `- ${p}`)].join("\n")
      : "This student has not been given anything yet this session.",
    "",
    "Write the question.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system, user };
}
