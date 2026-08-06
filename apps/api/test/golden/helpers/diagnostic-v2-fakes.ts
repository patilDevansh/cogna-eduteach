/**
 * Test doubles for the micro-skill step diagnostic (MVP 9.0.1 Phase A).
 *
 * Two things are faked, and only two:
 *  - AiOrchestratorService, so the three AI capabilities can be exercised
 *    without a network call. The fake reproduces the real orchestrator's
 *    contract exactly: it runs the caller's own `parse`, and a throw from
 *    `parse` means aiOutput=null / served=false — which is what makes bounds
 *    and forbidden-term rejection testable at all.
 *  - PrismaService, as a small in-memory store covering only the queries
 *    diagnostic-v2-session.service.ts actually issues.
 *
 * Nothing here simulates the model itself. Every "AI" response in the specs is
 * a fixture the test author wrote, chosen to prove a specific branch.
 */
import { Logger } from "@nestjs/common";
import type { AiOrchestratorService, OrchestratorCallInput } from "../../../src/ai/ai-orchestrator.service";
import type { PrismaService } from "../../../src/prisma/prisma.service";
import { DiagnosticV2AiSelectorService } from "../../../src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service";
import { DiagnosticV2AiAuthorService } from "../../../src/engines/diagnostic-v2/diagnostic-v2-ai-author.service";

// The three AI services log a structured line on every served call. Useful in
// production, pure noise in a TAP stream — silence it for any spec that pulls
// these doubles in.
Logger.overrideLogger(false);

/** Builds a selector wired to a (usually disabled) author service — Phase A2 constructor shape. */
export function makeSelectorService(
  selectorOrch: AiOrchestratorService,
  authorOrch: AiOrchestratorService = mockOrchestrator({ generate: false }).service,
): DiagnosticV2AiSelectorService {
  return new DiagnosticV2AiSelectorService(selectorOrch, new DiagnosticV2AiAuthorService(authorOrch));
}

// ─── AI orchestrator ────────────────────────────────────────────────────────

export interface RecordedCall {
  capability: string;
  ruleOutput: unknown;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}

export interface MockOrchestratorBehaviour {
  /** false = capability flag off: no call, no audit row, no output. */
  generate?: boolean;
  /** false = shadow mode: the call happens and is logged, but is not served. */
  serve?: boolean;
  /** Raw model text, or a per-call function of the recorded call. */
  raw?: string | ((call: RecordedCall) => string);
  /** Simulates a transport failure or a timeout — the orchestrator swallows it and returns no output. */
  failWith?: Error;
}

export interface MockOrchestrator {
  service: AiOrchestratorService;
  calls: RecordedCall[];
  /** Reasons the caller's own `parse` rejected a response — the bounds / forbidden-term audit trail. */
  rejections: string[];
}

export function mockOrchestrator(behaviour: MockOrchestratorBehaviour = {}): MockOrchestrator {
  const calls: RecordedCall[] = [];
  const rejections: string[] = [];

  const service = {
    async call<T>(input: OrchestratorCallInput<T>) {
      const recorded: RecordedCall = {
        capability: input.capability,
        ruleOutput: input.ruleOutput,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        timeoutMs: input.timeoutMs,
      };

      if (behaviour.generate === false) return { aiOutput: null, served: false };
      calls.push(recorded);

      if (behaviour.failWith) {
        rejections.push(behaviour.failWith.message);
        return { aiOutput: null, served: false };
      }

      const raw = typeof behaviour.raw === "function" ? behaviour.raw(recorded) : (behaviour.raw ?? "{}");
      try {
        const parsed = input.parse(raw);
        return { aiOutput: parsed, served: behaviour.serve !== false };
      } catch (err) {
        rejections.push(err instanceof Error ? err.message : String(err));
        return { aiOutput: null, served: false };
      }
    },
  };

  return { service: service as unknown as AiOrchestratorService, calls, rejections };
}

// ─── Prisma ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export interface FakeDb {
  sessions: Row[];
  attempts: Row[];
  steps: Row[];
  evidence: Row[];
  states: Row[];
  hypotheses: Row[];
  revisionItems: Row[];
}

export interface FakePrisma {
  prisma: PrismaService;
  db: FakeDb;
}

export function createFakePrisma(studentIds: string[] = ["student-1"]): FakePrisma {
  let seq = 0;
  const nextId = (prefix: string): string => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const students: Row[] = studentIds.map((id) => ({ id }));
  const db: FakeDb = {
    sessions: [],
    attempts: [],
    steps: [],
    evidence: [],
    states: [],
    hypotheses: [],
    revisionItems: [],
  };

  const matches = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, expected]) => {
      if (expected && typeof expected === "object" && "in" in (expected as Row)) {
        return ((expected as { in: unknown[] }).in ?? []).includes(row[key]);
      }
      return row[key] === expected;
    });
  };

  const sortRows = (rows: Row[], orderBy: unknown): Row[] => {
    const clauses = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Array<Record<string, "asc" | "desc">>;
    const keys = clauses.flatMap((c) => Object.entries(c));
    if (keys.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const [key, direction] of keys) {
        const av = a[key] as string | number;
        const bv = b[key] as string | number;
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return direction === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  };

  const project = (row: Row, select: Row | undefined): Row => {
    if (!select) return row;
    const out: Row = {};
    for (const key of Object.keys(select)) out[key] = row[key];
    return out;
  };

  const applyUpdate = (row: Row, data: Row): void => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as Row)) {
        row[key] = (row[key] as number) + ((value as { increment: number }).increment ?? 0);
        continue;
      }
      row[key] = value;
    }
  };

  const delegate = (rows: Row[], idPrefix: string, defaults: (data: Row) => Row) => ({
    async create({ data }: { data: Row }) {
      const row = { id: nextId(idPrefix), ...defaults(data), ...data };
      rows.push(row);
      return row;
    },
    async findUnique({ where }: { where: Row }) {
      return rows.find((r) => matches(r, flattenCompositeKey(where))) ?? null;
    },
    async findMany({ where, orderBy, select }: { where?: Row; orderBy?: unknown; select?: Row } = {}) {
      return sortRows(rows.filter((r) => matches(r, where)), orderBy).map((r) => project(r, select));
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const row = rows.find((r) => matches(r, flattenCompositeKey(where)));
      if (!row) throw new Error(`fake prisma: no ${idPrefix} row matching ${JSON.stringify(where)}`);
      applyUpdate(row, data);
      return row;
    },
    async upsert({ where, create, update }: { where: Row; create: Row; update: Row }) {
      const key = flattenCompositeKey(where);
      const row = rows.find((r) => matches(r, key));
      if (row) {
        applyUpdate(row, update);
        return row;
      }
      const created = { id: nextId(idPrefix), ...defaults(create), ...create };
      rows.push(created);
      return created;
    },
  });

  const prisma = {
    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(prisma);
    },
    student: {
      async findUnique({ where }: { where: Row }) {
        return students.find((s) => matches(s, where)) ?? null;
      },
    },
    diagnosticV2Session: delegate(db.sessions, "sess", () => ({
      status: "ACTIVE",
      stageHistory: [],
      startedAt: new Date(),
      endedAt: null,
    })),
    diagnosticV2Attempt: delegate(db.attempts, "att", () => ({
      status: "IN_PROGRESS",
      origin: "PRE_WRITTEN",
      templateId: null,
      stageId: "ENTRY_TWO_STEP",
      createdAt: new Date(),
      completedAt: null,
    })),
    diagnosticV2Step: delegate(db.steps, "step", () => ({ createdAt: new Date() })),
    microSkillEvidenceEventV2: delegate(db.evidence, "ev", () => ({ createdAt: new Date() })),
    microSkillStateV2: delegate(db.states, "state", () => ({ stateVersion: 1 })),
    diagnosticV2Hypothesis: delegate(db.hypotheses, "hyp", () => ({ createdAt: new Date() })),
    revisionQueueItem: delegate(db.revisionItems, "rev", () => ({ createdAt: new Date() })),
  };

  return { prisma: prisma as unknown as PrismaService, db };
}

/** Prisma addresses composite primary keys through a single nested field — flatten it back to plain column equality. */
function flattenCompositeKey(where: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(where)) {
    if (key.includes("_") && value && typeof value === "object" && !(value instanceof Date)) {
      Object.assign(out, value as Row);
      continue;
    }
    out[key] = value;
  }
  return out;
}
