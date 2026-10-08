import type { PrismaClient } from "@cogna/database";
import type { SpendCaps, SpendStore } from "./spend-cap";

/** The spend ledger in Postgres: one row per (service, UTC day), shared by every API replica. */
export class PrismaSpendStore implements SpendStore {
  constructor(private readonly prisma: PrismaClient) {}

  async tryReserve(service: string, day: string, usd: number, caps: SpendCaps): Promise<boolean> {
    // The insert branch skips the WHERE below, so refuse up front what a fresh day couldn't take either.
    if (caps.calls < 1 || usd > caps.usd) return false;
    const callCap = Number.isFinite(caps.calls) ? caps.calls : null;
    const usdCap = Number.isFinite(caps.usd) ? caps.usd : null;
    // One statement, so concurrent reservations from any replica serialise on the row.
    const rows = await this.prisma.$queryRaw<{ calls: number }[]>`
      INSERT INTO "ApiSpendDay" ("service", "day", "calls", "costUsd", "updatedAt")
      VALUES (${service}, ${day}, 1, ${usd}, NOW())
      ON CONFLICT ("service", "day") DO UPDATE
        SET "calls" = "ApiSpendDay"."calls" + 1,
            "costUsd" = "ApiSpendDay"."costUsd" + EXCLUDED."costUsd",
            "updatedAt" = NOW()
        WHERE "ApiSpendDay"."calls" < COALESCE(${callCap}::float8, 'Infinity'::float8)
          AND "ApiSpendDay"."costUsd" + EXCLUDED."costUsd" <= COALESCE(${usdCap}::float8, 'Infinity'::float8)
      RETURNING "calls"`;
    return rows.length > 0;
  }

  async adjust(service: string, day: string, deltaUsd: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ApiSpendDay" SET "costUsd" = GREATEST(0, "costUsd" + ${deltaUsd}), "updatedAt" = NOW()
      WHERE "service" = ${service} AND "day" = ${day}`;
  }

  async today(service: string, day: string): Promise<{ calls: number; usd: number }> {
    const row = await this.prisma.apiSpendDay.findUnique({ where: { service_day: { service, day } } });
    return { calls: row?.calls ?? 0, usd: row?.costUsd ?? 0 };
  }
}
