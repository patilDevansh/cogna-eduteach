import { isProductionLike } from "../access/cogna-access";

/**
 * Hard daily ceiling on calls to a billed third-party API. Fails closed: once
 * the cap is hit, every further call throws until the next UTC day, and callers'
 * existing failure paths (silent scene, bank content, "try again later") take over.
 *
 * ponytail: in-process counter — resets on restart and is per replica, so N replicas
 * allow N × cap. Move the counter into Postgres/Redis before running more than one API replica.
 */
export class SpendCapExceededError extends Error {
  constructor(service: string, cap: number) {
    super(`${service} daily call cap (${cap}) reached; refusing further billed calls until tomorrow (UTC).`);
    this.name = "SpendCapExceededError";
  }
}

const counters = new Map<string, { day: string; calls: number }>();

/** Env: `<PREFIX>_DAILY_CALL_CAP`. Unset → 5000 in production-like envs, unlimited in dev. 0 → block all. */
export function consumeBudget(
  service: string,
  envPrefix: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): void {
  const raw = env[`${envPrefix}_DAILY_CALL_CAP`]?.trim();
  const cap = raw !== undefined && raw !== "" ? Number(raw) : isProductionLike(env) ? 5000 : Infinity;
  if (!Number.isFinite(cap) && cap !== Infinity) return; // malformed value: don't lock everyone out
  const day = now.toISOString().slice(0, 10);
  const entry = counters.get(service);
  const current = entry && entry.day === day ? entry : { day, calls: 0 };
  if (current.calls >= cap) throw new SpendCapExceededError(service, cap);
  current.calls += 1;
  counters.set(service, current);
}

export function resetBudgetForTests(): void {
  counters.clear();
}
