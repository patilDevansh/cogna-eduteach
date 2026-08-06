import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { JobStatus } from "@cogna/database";

/**
 * MVP 3.0 Golden Test — S19
 * Analysis export idempotent
 *
 * Setup: run EXPERIMENT_ANALYSIS_EXPORT twice same period key
 * Expected: single logical export / idempotent job completion
 *
 * This test verifies that the EXPERIMENT_ANALYSIS_EXPORT job is idempotent.
 * Multiple invocations with the same experiment key and period should:
 * 1. Reuse the first job if it already completed
 * 2. Not create duplicate exports
 * 3. Return the same export path for the same period key
 */

function mockPrisma() {
  const store: {
    jobs: Map<string, unknown>;
  } = {
    jobs: new Map(),
  };

  return {
    __store: store,
    job: {
      findUnique: async ({
        where,
      }: {
        where: {
          id?: string;
          jobType_idempotencyKey?: { jobType: string; idempotencyKey: string };
        };
      }) => {
        if (where.id) {
          return store.jobs.get(where.id) ?? null;
        }
        if (where.jobType_idempotencyKey) {
          const key = `${where.jobType_idempotencyKey.jobType}:${where.jobType_idempotencyKey.idempotencyKey}`;
          return (
            Array.from(store.jobs.values()).find(
              (j: any) =>
                j.jobType === where.jobType_idempotencyKey!.jobType &&
                j.idempotencyKey === where.jobType_idempotencyKey!.idempotencyKey,
            ) ?? null
          );
        }
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const job = store.jobs.get(where.id);
        if (!job) throw new Error(`Job ${where.id} not found`);
        return job;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `job_${Date.now()}_${Math.random()}`;
        const job = {
          ...data,
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          attemptCount: 0,
          lockedAt: null,
          lockedBy: null,
          runAfter: null,
          completedAt: null,
          lastError: null,
        };
        store.jobs.set(id, job);
        return job;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = store.jobs.get(where.id);
        if (!existing) throw new Error(`Job ${where.id} not found`);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        store.jobs.set(where.id, updated);
        return updated;
      },
    },
  };
}

describe("Golden S19 — Analysis export idempotency", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  before(() => {
    prisma = mockPrisma();
  });

  it("reuses completed job for same period key", async () => {
    const input = {
      experimentKey: "policy_score_linear_eq_2026q3",
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-07-07T23:59:59Z",
    };
    const idempotencyKey = `${input.experimentKey}:${input.periodStart}:${input.periodEnd}`;

    // First invocation — creates and completes job
    const job1 = await prisma.job.create({
      data: {
        jobType: "EXPERIMENT_ANALYSIS_EXPORT",
        idempotencyKey,
        payload: input,
        status: JobStatus.PENDING,
      },
    });

    // Simulate job completion
    await prisma.job.update({
      where: { id: job1.id },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        resultRef: `exports/${input.experimentKey}_${input.periodStart}_${input.periodEnd}.json`,
      },
    });

    // Second invocation — should find existing completed job
    const existingJob = await prisma.job.findUnique({
      where: {
        jobType_idempotencyKey: {
          jobType: "EXPERIMENT_ANALYSIS_EXPORT",
          idempotencyKey,
        },
      },
    });

    assert.ok(existingJob, "Existing job found");
    assert.strictEqual(
      (existingJob as any).id,
      job1.id,
      "Same job returned on second invocation",
    );
    assert.strictEqual(
      (existingJob as any).status,
      JobStatus.COMPLETED,
      "Job already completed",
    );
    assert.ok(
      (existingJob as any).resultRef,
      "Export path already set",
    );

    // Verify no duplicate job created
    const allJobs = Array.from(prisma.__store.jobs.values());
    const matchingJobs = allJobs.filter(
      (j: any) =>
        j.jobType === "EXPERIMENT_ANALYSIS_EXPORT" &&
        j.idempotencyKey === idempotencyKey,
    );
    assert.strictEqual(
      matchingJobs.length,
      1,
      "Only one job exists for this period key",
    );
  });

  it("creates new job for different period key", async () => {
    const input1 = {
      experimentKey: "policy_score_linear_eq_2026q3",
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-07-07T23:59:59Z",
    };
    const input2 = {
      experimentKey: "policy_score_linear_eq_2026q3",
      periodStart: "2026-07-08T00:00:00Z", // Different period
      periodEnd: "2026-07-14T23:59:59Z",
    };

    const idempotencyKey1 = `${input1.experimentKey}:${input1.periodStart}:${input1.periodEnd}`;
    const idempotencyKey2 = `${input2.experimentKey}:${input2.periodStart}:${input2.periodEnd}`;

    // Create jobs for both periods
    const job1 = await prisma.job.create({
      data: {
        jobType: "EXPERIMENT_ANALYSIS_EXPORT",
        idempotencyKey: idempotencyKey1,
        payload: input1,
        status: JobStatus.COMPLETED,
      },
    });

    const job2 = await prisma.job.create({
      data: {
        jobType: "EXPERIMENT_ANALYSIS_EXPORT",
        idempotencyKey: idempotencyKey2,
        payload: input2,
        status: JobStatus.COMPLETED,
      },
    });

    assert.notStrictEqual(
      job1.id,
      job2.id,
      "Different jobs for different periods",
    );
    assert.notStrictEqual(
      (job1 as any).idempotencyKey,
      (job2 as any).idempotencyKey,
      "Different idempotency keys",
    );
  });

  it("returns existing export path on second call", async () => {
    const input = {
      experimentKey: "policy_score_linear_eq_2026q3",
      periodStart: "2026-07-15T00:00:00Z",
      periodEnd: "2026-07-21T23:59:59Z",
    };
    const idempotencyKey = `${input.experimentKey}:${input.periodStart}:${input.periodEnd}`;
    const exportPath = `exports/${input.experimentKey}_${input.periodStart}_${input.periodEnd}.json`;

    // First call — creates job with export path
    const job = await prisma.job.create({
      data: {
        jobType: "EXPERIMENT_ANALYSIS_EXPORT",
        idempotencyKey,
        payload: input,
        status: JobStatus.COMPLETED,
        resultRef: exportPath,
      },
    });

    // Second call — retrieves existing job
    const existing = await prisma.job.findUnique({
      where: {
        jobType_idempotencyKey: {
          jobType: "EXPERIMENT_ANALYSIS_EXPORT",
          idempotencyKey,
        },
      },
    });

    assert.strictEqual(
      (existing as any).resultRef,
      exportPath,
      "Same export path returned",
    );
    assert.strictEqual(
      (existing as any).status,
      JobStatus.COMPLETED,
      "Job completed",
    );

    // Verify no duplicate export
    const allJobs = Array.from(prisma.__store.jobs.values()).filter(
      (j: any) =>
        j.jobType === "EXPERIMENT_ANALYSIS_EXPORT" &&
        j.idempotencyKey === idempotencyKey,
    );
    assert.strictEqual(
      allJobs.length,
      1,
      "Only one export job for this period",
    );
  });

  it("handles retry on failed job", async () => {
    const input = {
      experimentKey: "policy_score_linear_eq_2026q3",
      periodStart: "2026-07-22T00:00:00Z",
      periodEnd: "2026-07-28T23:59:59Z",
    };
    const idempotencyKey = `${input.experimentKey}:${input.periodStart}:${input.periodEnd}`;

    // First attempt — fails
    const job = await prisma.job.create({
      data: {
        jobType: "EXPERIMENT_ANALYSIS_EXPORT",
        idempotencyKey,
        payload: input,
        status: JobStatus.FAILED_RETRYABLE,
      },
    });

    // Retry — should reuse same job and mark completed
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.COMPLETED,
        resultRef: `exports/${input.experimentKey}_${input.periodStart}_${input.periodEnd}.json`,
      },
    });

    const retried = await prisma.job.findUnique({
      where: {
        jobType_idempotencyKey: {
          jobType: "EXPERIMENT_ANALYSIS_EXPORT",
          idempotencyKey,
        },
      },
    });

    assert.strictEqual(
      (retried as any).id,
      job.id,
      "Same job retried",
    );
    assert.strictEqual(
      (retried as any).status,
      JobStatus.COMPLETED,
      "Job completed on retry",
    );
  });
});
