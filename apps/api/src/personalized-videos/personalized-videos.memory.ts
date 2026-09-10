import { randomUUID } from "crypto";
import { JobStatus, PersonalizedVideoAssignmentStatus } from "@cogna/database";

type Row = Record<string, unknown>;

function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value && typeof value === "object" && !Array.isArray(value) && "in" in value) {
      return (value.in as unknown[]).includes(row[key]);
    }
    return row[key] === value;
  });
}

export function createPersonalizedVideoMemoryDb() {
  const assignments = new Map<string, Row>();
  const events = new Map<string, Row>();
  const jobs = new Map<string, Row>();
  const assets = new Map<string, Row>();
  const outcomes: Row[] = [];
  const lotusSessions = new Map<string, Row>();
  const lotusEvidence: Row[] = [];

  return {
    personalizedVideoAssignment: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          ...data,
          id: (data.id as string) ?? randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          status: data.status ?? PersonalizedVideoAssignmentStatus.PREPARING,
        };
        assignments.set(row.id as string, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return assignments.get(where.id) ?? null;
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt: "asc" | "desc" };
      }) => {
        const rows = [...assignments.values()].filter((row) => matchesWhere(row, where));
        if (orderBy?.createdAt === "desc") rows.reverse();
        rows.sort((a, b) => {
          const da = (a.createdAt as Date).getTime();
          const db = (b.createdAt as Date).getTime();
          return orderBy?.createdAt === "asc" ? da - db : db - da;
        });
        return rows[0] ?? null;
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt: "asc" | "desc" };
      } = {}) => {
        const rows = [...assignments.values()].filter((row) => matchesWhere(row, where));
        rows.sort((a, b) => {
          const da = (a.createdAt as Date).getTime();
          const db = (b.createdAt as Date).getTime();
          return orderBy?.createdAt === "asc" ? da - db : db - da;
        });
        return rows;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const existing = assignments.get(where.id);
        if (!existing) throw new Error("Assignment not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        assignments.set(where.id, updated);
        return updated;
      },
    },
    personalizedVideoEvent: {
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        events.set(row.id as string, row);
        return row;
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt: "asc" | "desc" };
      }) => {
        const rows = [...events.values()].filter((row) => matchesWhere(row, where));
        rows.sort((a, b) => {
          const da = (a.createdAt as Date).getTime();
          const db = (b.createdAt as Date).getTime();
          return orderBy?.createdAt === "asc" ? da - db : db - da;
        });
        return rows;
      },
    },
    job: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          ...data,
          id: randomUUID(),
          status: data.status ?? JobStatus.PENDING,
          attemptCount: data.attemptCount ?? 0,
          lastError: data.lastError ?? null,
          runAfter: data.runAfter ?? null,
          payload: data.payload ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        jobs.set(row.id as string, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => jobs.get(where.id) ?? null,
      findMany: async ({
        where,
      }: {
        where?: Record<string, unknown>;
      } = {}) => [...jobs.values()].filter((row) => matchesWhere(row, where)),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Row & { attemptCount?: { increment: number } };
      }) => {
        const existing = jobs.get(where.id);
        if (!existing) throw new Error("Job not found");
        const increment = data.attemptCount && typeof data.attemptCount === "object"
          ? (existing.attemptCount as number) + data.attemptCount.increment
          : data.attemptCount;
        const updated = {
          ...existing,
          ...data,
          attemptCount: increment ?? existing.attemptCount,
          updatedAt: new Date(),
        };
        jobs.set(where.id, updated);
        return updated;
      },
    },
    modalityAsset: {
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        assets.set(data.assetId as string, row);
        return row;
      },
      findUnique: async ({ where }: { where: { assetId: string } }) =>
        assets.get(where.assetId) ?? null,
    },
    modalityOutcome: {
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        outcomes.push(row);
        return row;
      },
      findMany: async () => outcomes,
    },
    lotusSessionRecord: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { sessionId: string };
        create: Row;
        update: Row;
      }) => {
        const existing = [...lotusSessions.values()].find(
          (row) => row.sessionId === where.sessionId,
        );
        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          lotusSessions.set(existing.id as string, updated);
          return updated;
        }
        const row = { ...create, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
        lotusSessions.set(row.id as string, row);
        return row;
      },
      findUnique: async ({
        where,
        select,
      }: {
        where: { sessionId: string };
        select?: { id: true };
      }) => {
        const row =
          [...lotusSessions.values()].find((item) => item.sessionId === where.sessionId) ?? null;
        if (!row) return null;
        if (select?.id) return { id: row.id };
        return row;
      },
    },
    lotusEvidenceRecord: {
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        lotusEvidence.push(row);
        return row;
      },
    },
    _store: { assignments, events, jobs, assets, outcomes },
  };
}
