import { Controller, Get, Param, Query } from "@nestjs/common";
import { ShadowGateEvaluatorService } from "./shadow-gate-evaluator.service";

/**
 * Read-only reporting for whether any AI agent has earned graduation out of
 * shadow mode — see AiOrchestratorService / packages/database AiDecisionAuditLog.
 * Never flips a SERVE flag itself; a human reads this, then edits the env
 * flag by hand, same as the existing LIVE_AGENTIC_SERVE_GENERATED pattern.
 *
 * Ops-only surface — no production auth wired yet, same known gap already
 * flagged on /policy (see COGNA 5.0/SKIPPED.md). Fine for local/pilot use;
 * needs a real auth guard before this is ever exposed outside the team.
 */
@Controller("ai/shadow-gates")
export class ShadowGateController {
  constructor(private readonly evaluator: ShadowGateEvaluatorService) {}

  @Get()
  getAll(@Query("windowDays") windowDays?: string) {
    return this.evaluator.evaluateAll(windowDays ? Number(windowDays) : undefined);
  }

  @Get(":capability")
  getOne(@Param("capability") capability: string, @Query("windowDays") windowDays?: string) {
    return this.evaluator.evaluateCapability(
      capability.toUpperCase(),
      windowDays ? Number(windowDays) : undefined,
    );
  }
}
