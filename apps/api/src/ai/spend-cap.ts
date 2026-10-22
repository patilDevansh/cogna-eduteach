import { isProductionLike } from "../access/cogna-access";

/**
 * Hard ceilings on a billed third-party API: per UTC day in calls and US
 * dollars, and per UTC month in US dollars. Fails closed: once a cap is hit,
 * every further call is refused until the next day (or month), and callers'
 * existing failure paths (silent scene, bank content, "try again later") take
 * over. The monthly cap is the one that keeps a prepaid balance from going
 * negative: daily caps alone still add up across a month.
 *
 * The dollar cap is enforced by reservation: each call books its worst-case
 * cost (full prompt + max output tokens) before it is sent, and is trued up to
 * the real cost from the response's usage. Calls running in parallel therefore
 * cannot jointly overshoot the cap the way a check-after-the-fact counter can.
 *
 * Env, per service prefix:
 *   <PREFIX>_DAILY_CALL_CAP  Unset → 5000 in production-like envs, unlimited in dev. 0 → block all.
 *   <PREFIX>_DAILY_USD_CAP   Unset → no dollar cap. Needs model prices (see model-pricing.ts).
 *   <PREFIX>_MONTHLY_USD_CAP Unset → no monthly cap. Same prices; set it below the account's prepaid balance.
 *
 * The running API stores the ledger in Postgres (PrismaSpendStore), shared by
 * every replica and surviving restarts. Tests and scripts fall back to memory.
 */
export class SpendCapExceededError extends Error {
  constructor(readonly service: string, readonly detail: string) {
    super(`${service} ${detail} reached; refusing further billed calls until ${detail.startsWith("monthly") ? "next month" : "tomorrow"} (UTC).`);
    this.name = "SpendCapExceededError";
  }
}

export interface SpendCaps {
  calls: number;
  usd: number;
}

/** The dollar-only caps a monthly ledger row is held to. */
function monthlyCaps(usd: number): SpendCaps {
  return { calls: Infinity, usd };
}

/** True when any dollar cap (daily or monthly) is set, so every call needs a price. */
export function hasUsdCap(envPrefix: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Number.isFinite(spendCapsFromEnv(envPrefix, env).usd) || Number.isFinite(monthlyUsdCapFromEnv(envPrefix, env));
}

export function monthlyUsdCapFromEnv(envPrefix: string, env: NodeJS.ProcessEnv = process.env): number {
  return parseCap(env[`${envPrefix}_MONTHLY_USD_CAP`], Infinity) ?? Infinity;
}

/** Atomic per-(service, UTC day) ledger. */
export interface SpendStore {
  /** Adds one call and `usd` to the day if both stay within `caps`; false (and no change) otherwise. */
  tryReserve(service: string, day: string, usd: number, caps: SpendCaps): Promise<boolean>;
  /** Corrects a reservation to the real cost once it's known. */
  adjust(service: string, day: string, deltaUsd: number): Promise<void>;
  today(service: string, day: string): Promise<{ calls: number; usd: number }>;
}

export class MemorySpendStore implements SpendStore {
  private readonly days = new Map<string, { calls: number; usd: number }>();

  async tryReserve(service: string, day: string, usd: number, caps: SpendCaps): Promise<boolean> {
    const key = `${service}:${day}`;
    const current = this.days.get(key) ?? { calls: 0, usd: 0 };
    if (current.calls >= caps.calls || current.usd + usd > caps.usd) return false;
    this.days.set(key, { calls: current.calls + 1, usd: current.usd + usd });
    return true;
  }

  async adjust(service: string, day: string, deltaUsd: number): Promise<void> {
    const current = this.days.get(`${service}:${day}`);
    if (current) current.usd = Math.max(0, current.usd + deltaUsd);
  }

  async today(service: string, day: string): Promise<{ calls: number; usd: number }> {
    return { ...(this.days.get(`${service}:${day}`) ?? { calls: 0, usd: 0 }) };
  }
}

let store: SpendStore = new MemorySpendStore();
/** Memory ledger used while the shared store is unreachable, so a database blip degrades to per-process caps rather than none. */
let fallback: SpendStore = new MemorySpendStore();

export function setSpendStore(next: SpendStore): void {
  store = next;
}

export function resetBudgetForTests(): void {
  store = new MemorySpendStore();
  fallback = new MemorySpendStore();
}

function parseCap(raw: string | undefined, unset: number): number | null {
  const value = raw?.trim();
  if (value === undefined || value === "") return unset;
  const cap = Number(value);
  return Number.isFinite(cap) && cap >= 0 ? cap : null; // malformed: ignored rather than locking everyone out
}

export function spendCapsFromEnv(envPrefix: string, env: NodeJS.ProcessEnv = process.env): SpendCaps {
  return {
    calls: parseCap(env[`${envPrefix}_DAILY_CALL_CAP`], isProductionLike(env) ? 5000 : Infinity) ?? Infinity,
    usd: parseCap(env[`${envPrefix}_DAILY_USD_CAP`], Infinity) ?? Infinity,
  };
}

/** A booked call. `settle` replaces the reserved estimate with the real cost; skipping it keeps the estimate (the safe side). */
export interface SpendReservation {
  settle(actualUsd: number): Promise<void>;
}

export async function reserveBudget(
  service: string,
  envPrefix: string,
  options: { estimateUsd?: number; env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<SpendReservation> {
  const caps = spendCapsFromEnv(envPrefix, options.env);
  const monthCap = monthlyUsdCapFromEnv(envPrefix, options.env);
  const estimate = Math.max(0, options.estimateUsd ?? 0);
  const iso = (options.now ?? new Date()).toISOString();
  const day = iso.slice(0, 10);
  // The month shares the ledger table: its row's "day" is the yyyy-mm.
  const month = Number.isFinite(monthCap) ? iso.slice(0, 7) : null;

  const reserve = async (ledger: SpendStore): Promise<"ok" | "month" | "day"> => {
    if (month && !(await ledger.tryReserve(service, month, estimate, monthlyCaps(monthCap)))) return "month";
    if (await ledger.tryReserve(service, day, estimate, caps)) return "ok";
    if (month) await ledger.adjust(service, month, -estimate); // give back the month's share of a refused call
    return "day";
  };

  let ledger = store;
  let outcome: "ok" | "month" | "day";
  try {
    outcome = await reserve(ledger);
  } catch (error) {
    console.warn(`[spend-cap] shared ledger unavailable, using this process's own: ${error instanceof Error ? error.message : String(error)}`);
    ledger = fallback;
    outcome = await reserve(ledger);
  }
  if (outcome === "month") {
    const { usd } = await ledger.today(service, month!).catch(() => ({ usd: NaN }));
    throw new SpendCapExceededError(
      service,
      `monthly spend cap ($${monthCap}; $${usd.toFixed(2)} used, next call could cost up to $${estimate.toFixed(2)})`,
    );
  }
  if (outcome === "day") {
    const { calls, usd } = await ledger.today(service, day).catch(() => ({ calls: NaN, usd: NaN }));
    throw new SpendCapExceededError(
      service,
      calls >= caps.calls ? `daily call cap (${caps.calls})` : `daily spend cap ($${caps.usd}; $${usd.toFixed(2)} used, next call could cost up to $${estimate.toFixed(2)})`,
    );
  }
  return {
    settle: async (actualUsd) => {
      const delta = Math.max(0, actualUsd) - estimate;
      if (delta === 0) return;
      await ledger.adjust(service, day, delta).catch(() => undefined);
      if (month) await ledger.adjust(service, month, delta).catch(() => undefined);
    },
  };
}
