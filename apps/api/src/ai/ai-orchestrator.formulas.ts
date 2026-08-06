/**
 * Pure flag-gating logic for AiOrchestratorService — no NestJS, no Prisma,
 * so it's testable without instantiating a decorated class. Generalizes the
 * LIVE_AGENTIC_GENERATE/LIVE_AGENTIC_SERVE_GENERATED env-flag shape to any
 * capability namespace.
 */

const DEFAULT_MODEL = "gpt-4.1-mini";

export function isGenerateEnabled(
  capability: string,
  openaiConfigured: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[`AI_${capability}_GENERATE`] === "true" && openaiConfigured;
}

export function isServeEnabled(
  capability: string,
  passed: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return passed && env[`AI_${capability}_SERVE`] === "true";
}

export function resolveModel(
  capability: string,
  requested: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requested ?? env[`AI_${capability}_MODEL`] ?? DEFAULT_MODEL;
}
