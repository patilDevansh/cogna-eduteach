import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ExperimentsService } from "../../src/experiments/experiments.service";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import {
  ExperimentDefinition,
  EXPERIMENT_RULES_V1,
  DECISION_RULES_V3,
} from "@cogna/shared";

/**
 * MVP 3.0 — Experiment golden tests
 * S01 — Sticky assignment
 * S02 — Ineligible stays control
 * S03 — Hash allocation within tolerance
 * S16 — Decision snapshot includes experiment fields
 * S20 — Control arm matches R01 retention path
 */

function mockPrisma() {
  const store: {
    experimentDefinitions: Map<string, unknown>;
    experimentAssignments: Map<string, unknown>;
    sessions: Map<string, unknown[]>;
  } = {
    experimentDefinitions: new Map<string, unknown>(),
    experimentAssignments: new Map<string, unknown>(),
    sessions: new Map<string, unknown[]>(),
  };

  return {
    __store: store, // Expose store for test setup
    experimentDefinition: {
      findUnique: async ({ where }: { where: { experimentKey: string } }) => {
        return store.experimentDefinitions.get(where.experimentKey) ?? null;
      },
      findMany: async () => {
        return Array.from(store.experimentDefinitions.values());
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { experimentKey: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = store.experimentDefinitions.get(where.experimentKey);
        const data = existing ? { ...existing, ...update } : create;
        store.experimentDefinitions.set(where.experimentKey, data);
        return data;
      },
    },
    experimentAssignment: {
      findUnique: async ({
        where,
      }: {
        where: { studentId_experimentKey: { studentId: string; experimentKey: string } };
      }) => {
        const key = `${where.studentId_experimentKey.studentId}:${where.studentId_experimentKey.experimentKey}`;
        return store.experimentAssignments.get(key) ?? null;
      },
      findMany: async ({ where }: { where?: { experimentKey: string } }) => {
        const all = Array.from(store.experimentAssignments.values());
        if (where?.experimentKey) {
          return all.filter((a: any) => a.experimentKey === where.experimentKey);
        }
        return all;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `assign_${Date.now()}_${Math.random()}`;
        const record = {
          ...data,
          id,
          assignedAt: new Date(),
          createdAt: new Date(),
        };
        const key = `${(data as any).studentId}:${(data as any).experimentKey}`;
        store.experimentAssignments.set(key, record);
        return record;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { studentId_experimentKey: { studentId: string; experimentKey: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = `${where.studentId_experimentKey.studentId}:${where.studentId_experimentKey.experimentKey}`;
        const existing = store.experimentAssignments.get(key);
        const data = existing
          ? { ...existing, ...update }
          : {
              ...create,
              id: `assign_${Date.now()}_${Math.random()}`,
              assignedAt: new Date(),
              createdAt: new Date(),
            };
        store.experimentAssignments.set(key, data);
        return data;
      },
    },
    learningSession: {
      count: async ({
        where,
      }: {
        where: { studentId: string; status?: string };
      }) => {
        const sessions = store.sessions.get(where.studentId) ?? [];
        if (where.status) {
          return sessions.filter((s: any) => s.status === where.status).length;
        }
        return sessions.length;
      },
      findFirst: async ({
        where,
      }: {
        where: { studentId: string; sessionMode?: string; status?: string };
      }) => {
        const sessions = store.sessions.get(where.studentId) ?? [];
        return (
          sessions.find(
            (s: any) =>
              (!where.sessionMode || s.sessionMode === where.sessionMode) &&
              (!where.status || s.status === where.status),
          ) ?? null
        );
      },
    },
  };
}

describe("S01 — Sticky assignment", () => {
  it("should assign same arm across two sessions", async () => {
    const prisma = mockPrisma();
    const service = new ExperimentsService(prisma as any);

    // Set up eligible student
    (prisma as any).__store.sessions.set("student_eligible", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    // Seed experiment
    const definition: ExperimentDefinition = {
      experimentKey: "test_sticky_50_50",
      status: "RUNNING",
      arms: ["control", "scored_v1"],
      allocation: {
        control: 0.5,
        scored_v1: 0.5,
      },
      eligibility: {
        minSessionsCompleted: 1,
        excludeBaselineOnly: true,
      },
      startAt: new Date().toISOString(),
      rulesVersion: EXPERIMENT_RULES_V1,
    };

    await service.upsertExperimentDefinition(definition);

    // First resolve
    const assignment1 = await service.resolveAssignment({
      studentId: "student_eligible",
      experimentKey: "test_sticky_50_50",
    });

    assert.ok(assignment1, "Assignment 1 should exist");
    assert.equal(assignment1.sticky, true, "Assignment should be sticky");

    // Second resolve
    const assignment2 = await service.resolveAssignment({
      studentId: "student_eligible",
      experimentKey: "test_sticky_50_50",
    });

    assert.ok(assignment2, "Assignment 2 should exist");
    assert.equal(
      assignment2.arm,
      assignment1.arm,
      "Arm should be sticky across sessions",
    );
    assert.equal(assignment2.id, assignment1.id, "Should return same assignment row");

    // Verify single assignment row
    const allAssignments = await service.listAssignments("test_sticky_50_50");
    assert.equal(
      allAssignments.length,
      1,
      "Only one assignment row should exist",
    );
  });
});

describe("S02 — Ineligible stays control", () => {
  it("should not assign baseline-only student to scored arm", async () => {
    const prisma = mockPrisma();
    const service = new ExperimentsService(prisma as any);

    // Set up baseline-only student (no ADAPTIVE_PRACTICE)
    (prisma as any).__store.sessions.set("student_baseline_only", [
      { sessionMode: "BASELINE", status: "ENDED" },
    ]);

    const definition: ExperimentDefinition = {
      experimentKey: "test_eligibility",
      status: "RUNNING",
      arms: ["control", "scored_v1"],
      allocation: {
        control: 0.5,
        scored_v1: 0.5,
      },
      eligibility: {
        minSessionsCompleted: 1,
        excludeBaselineOnly: true,
      },
      startAt: new Date().toISOString(),
      rulesVersion: EXPERIMENT_RULES_V1,
    };

    await service.upsertExperimentDefinition(definition);

    // Attempt resolve
    const assignment = await service.resolveAssignment({
      studentId: "student_baseline_only",
      experimentKey: "test_eligibility",
    });

    assert.equal(
      assignment,
      null,
      "Baseline-only student should not be assigned",
    );

    // Verify no assignment row
    const allAssignments = await service.listAssignments("test_eligibility");
    assert.equal(
      allAssignments.length,
      0,
      "No assignment row should exist for ineligible student",
    );
  });
});

describe("S03 — Hash allocation within tolerance", () => {
  it("should allocate 10,000 synthetic students within [48%, 52%]", async () => {
    const prisma = mockPrisma();
    const service = new ExperimentsService(prisma as any);

    const definition: ExperimentDefinition = {
      experimentKey: "test_allocation_10k",
      status: "RUNNING",
      arms: ["control", "scored_v1"],
      allocation: {
        control: 0.5,
        scored_v1: 0.5,
      },
      eligibility: {
        minSessionsCompleted: 0,
        excludeBaselineOnly: false,
      },
      startAt: new Date().toISOString(),
      rulesVersion: EXPERIMENT_RULES_V1,
    };

    await service.upsertExperimentDefinition(definition);

    const armCounts: Record<string, number> = {
      control: 0,
      scored_v1: 0,
    };

    // Generate 10,000 synthetic students
    for (let i = 0; i < 10_000; i++) {
      const studentId = `synthetic_${i}`;
      (prisma as any).__store.sessions.set(studentId, [
        { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
      ]);

      const assignment = await service.resolveAssignment({
        studentId,
        experimentKey: "test_allocation_10k",
      });

      assert.ok(assignment, `Assignment should exist for student ${i}`);
      armCounts[assignment.arm] = (armCounts[assignment.arm] || 0) + 1;
    }

    const controlRate = armCounts.control / 10_000;
    const scoredRate = armCounts.scored_v1 / 10_000;

    assert.ok(
      controlRate >= 0.48 && controlRate <= 0.52,
      `Control rate ${controlRate} should be in [0.48, 0.52]`,
    );
    assert.ok(
      scoredRate >= 0.48 && scoredRate <= 0.52,
      `Scored rate ${scoredRate} should be in [0.48, 0.52]`,
    );
  });
});

describe("S16 — Decision snapshot includes experiment fields", () => {
  it("should include experimentId and experimentArmId in decision", async () => {
    const prisma = mockPrisma();
    const experimentsService = new ExperimentsService(prisma as any);
    const decisionService = new DecisionEngineService(experimentsService);

    // Set up eligible student
    (prisma as any).__store.sessions.set("student_s16", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    const definition: ExperimentDefinition = {
      experimentKey: "test_decision_snapshot",
      status: "RUNNING",
      arms: ["control", "scored_v1"],
      allocation: {
        control: 0.5,
        scored_v1: 0.5,
      },
      eligibility: {
        minSessionsCompleted: 1,
        excludeBaselineOnly: true,
      },
      startAt: new Date().toISOString(),
      rulesVersion: EXPERIMENT_RULES_V1,
    };

    await experimentsService.upsertExperimentDefinition(definition);

    // Resolve assignment
    const assignment = await experimentsService.resolveAssignment({
      studentId: "student_s16",
      experimentKey: "test_decision_snapshot",
    });

    assert.ok(assignment, "Assignment should exist");

    // Make decision with experiment context
    const session = {
      studentId: "student_s16",
      sessionMode: "ADAPTIVE_PRACTICE" as const,
      status: "ACTIVE" as const,
      startedAt: new Date(),
      questionCount: 2,
      baselineSlotIndex: 0,
      activeConceptId: "C2_ONE_STEP_SUBTRACTION",
      activeDifficulty: 2,
    } as any;

    const decision = await decisionService.decide({
      session,
      recentCorrectStreak: 1,
      recentIncorrectStreak: 0,
      experimentKey: assignment.experimentKey,
      experimentArm: assignment.arm,
    });

    assert.equal(
      decision.decisionVersion,
      DECISION_RULES_V3,
      "Decision version should be v3",
    );
    assert.equal(
      decision.parameters.experimentId,
      "test_decision_snapshot",
      "experimentId should be in parameters",
    );
    assert.equal(
      decision.parameters.experimentArmId,
      assignment.arm,
      "experimentArmId should be in parameters",
    );
  });
});

describe("S20 — Control arm matches R01 retention path", () => {
  it("should emit RETENTION_REVIEW when eligible (control arm)", async () => {
    const prisma = mockPrisma();
    const experimentsService = new ExperimentsService(prisma as any);
    const decisionService = new DecisionEngineService(experimentsService);

    // Set up eligible student
    (prisma as any).__store.sessions.set("student_s20", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    const definition: ExperimentDefinition = {
      experimentKey: "test_control_retention",
      status: "RUNNING",
      arms: ["control"],
      allocation: {
        control: 1.0,
      },
      eligibility: {
        minSessionsCompleted: 1,
        excludeBaselineOnly: true,
      },
      startAt: new Date().toISOString(),
      rulesVersion: EXPERIMENT_RULES_V1,
    };

    await experimentsService.upsertExperimentDefinition(definition);

    // Force control assignment
    await experimentsService.forceAssignment(
      "student_s20",
      "test_control_retention",
      "control",
    );

    const session = {
      studentId: "student_s20",
      sessionMode: "ADAPTIVE_PRACTICE" as const,
      status: "ACTIVE" as const,
      startedAt: new Date(),
      questionCount: 2,
      baselineSlotIndex: 0,
      activeConceptId: "C2_ONE_STEP_SUBTRACTION",
      activeDifficulty: 2,
    } as any;

    const dueRevision = {
      id: "rev_001",
      studentId: "student_s20",
      conceptId: "C2_ONE_STEP_SUBTRACTION",
      type: "RETENTION_REVIEW",
      priority: 0.8,
      dueAt: new Date(),
      questionCount: 1,
      status: "PENDING" as const,
      reasoning: "Retention review due",
      confidence: 0.7,
      recommendationVersion: "recommendation-rules-v2",
      dedupeKey: "retention_C2_ONE_STEP_SUBTRACTION",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const decision = await decisionService.decide({
      session,
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      dueRevision,
      experimentKey: "test_control_retention",
      experimentArm: "control",
    });

    assert.equal(
      decision.learningIntent,
      "RETENTION_REVIEW",
      "Control arm should emit RETENTION_REVIEW for due revision",
    );
    assert.equal(
      decision.uiAction,
      "SHOW_QUESTION",
      "Control arm should show question",
    );
  });
});
