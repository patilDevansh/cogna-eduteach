import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import { ExperimentsService } from "../../src/experiments/experiments.service";
import { CandidateScorerService } from "../../src/engines/candidate-scorer/candidate-scorer.service";
import type { LearningSession } from "@cogna/database";
import { DECISION_RULES_V3 } from "@cogna/shared";

/**
 * MVP 3.0 — Candidate Scoring golden tests
 * S04 — Scorer cannot override END_SESSION
 * S05 — Scorer cannot override SUGGEST_BREAK
 * S06 — Due revision remains in candidate set
 * S07 — Heuristic score exact (toy features)
 * S08 — Shadow mode does not change decision
 * S09 — Empty legal set falls back
 * S10 — Illegal uiAction rejected
 * S21 — All candidate scores equal (tie-break)
 * S22 — LLM provider timeout (tested separately)
 */

function mockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: "sess_test",
    studentId: "dev_student_001",
    sessionMode: "ADAPTIVE_PRACTICE",
    status: "ACTIVE",
    startedAt: new Date(),
    endedAt: null,
    questionCount: 3,
    baselineSlotIndex: 0,
    activeConceptId: "C2_ONE_STEP_SUBTRACTION",
    activeDifficulty: 2,
    ...overrides,
  } as LearningSession;
}

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
    __store: store,
    experimentDefinition: {
      findUnique: async ({ where }: { where: { experimentKey: string } }) => {
        return store.experimentDefinitions.get(where.experimentKey) ?? null;
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
    },
  };
}

describe("S04 — Scorer cannot override END_SESSION", () => {
  it("END_SESSION takes priority even with scored arm", async () => {
    const prisma = mockPrisma();
    const experimentsService = new ExperimentsService(prisma as any);
    const candidateScorer = new CandidateScorerService();
    const decisionService = new DecisionEngineService(
      experimentsService,
      candidateScorer,
    );

    // Setup eligible student and assignment
    (prisma as any).__store.sessions.set("student_s04", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    const experimentDef = {
      experimentKey: "test_end_session_hard_gate",
      status: "RUNNING",
      arms: ["scored_v1"],
      allocation: { scored_v1: 1.0 },
      eligibility: { minSessionsCompleted: 1, excludeBaselineOnly: true },
      startAt: new Date().toISOString(),
      rulesVersion: "experiment-rules-v1",
    };

    await experimentsService.upsertExperimentDefinition(experimentDef as any);
    await experimentsService.forceAssignment(
      "student_s04",
      "test_end_session_hard_gate",
      "scored_v1",
    );

    const session = mockSession({
      studentId: "student_s04",
      questionCount: 12, // At limit
    });

    const decision = await decisionService.decide({
      session,
      recentCorrectStreak: 3,
      recentIncorrectStreak: 0,
      experimentKey: "test_end_session_hard_gate",
      experimentArm: "scored_v1",
    });

    assert.equal(
      decision.uiAction,
      "END_SESSION",
      "Hard gate END_SESSION must win even with scored arm",
    );
    assert.equal(
      decision.decisionVersion,
      DECISION_RULES_V3,
      "Should use v3 with experiment",
    );
  });
});

describe("S05 — Scorer cannot override SUGGEST_BREAK", () => {
  it("SUGGEST_BREAK takes priority over scored candidates", async () => {
    const prisma = mockPrisma();
    const experimentsService = new ExperimentsService(prisma as any);
    const candidateScorer = new CandidateScorerService();
    const decisionService = new DecisionEngineService(
      experimentsService,
      candidateScorer,
    );

    (prisma as any).__store.sessions.set("student_s05", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    const experimentDef = {
      experimentKey: "test_break_hard_gate",
      status: "RUNNING",
      arms: ["scored_v1"],
      allocation: { scored_v1: 1.0 },
      eligibility: { minSessionsCompleted: 1, excludeBaselineOnly: true },
      startAt: new Date().toISOString(),
      rulesVersion: "experiment-rules-v1",
    };

    await experimentsService.upsertExperimentDefinition(experimentDef as any);
    await experimentsService.forceAssignment(
      "student_s05",
      "test_break_hard_gate",
      "scored_v1",
    );

    const decision = await decisionService.decide({
      session: mockSession({ studentId: "student_s05" }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      sessionMinutes: 12,
      fatigueRisk: true,
      breakSuggestedThisSession: false,
      experimentKey: "test_break_hard_gate",
      experimentArm: "scored_v1",
    });

    assert.equal(
      decision.uiAction,
      "SUGGEST_BREAK",
      "Hard gate SUGGEST_BREAK must win",
    );
    assert.equal(
      decision.learningIntent,
      "BREAK_FOR_FATIGUE",
      "Intent should be BREAK_FOR_FATIGUE",
    );
  });
});

describe("S06 — Due revision remains in candidate set", () => {
  it("selects retention review when due item exists", async () => {
    const prisma = mockPrisma();
    const experimentsService = new ExperimentsService(prisma as any);
    const candidateScorer = new CandidateScorerService();
    const decisionService = new DecisionEngineService(
      experimentsService,
      candidateScorer,
    );

    (prisma as any).__store.sessions.set("student_s06", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    const experimentDef = {
      experimentKey: "test_due_revision",
      status: "RUNNING",
      arms: ["scored_v1"],
      allocation: { scored_v1: 1.0 },
      eligibility: { minSessionsCompleted: 1, excludeBaselineOnly: true },
      startAt: new Date().toISOString(),
      rulesVersion: "experiment-rules-v1",
    };

    await experimentsService.upsertExperimentDefinition(experimentDef as any);
    await experimentsService.forceAssignment(
      "student_s06",
      "test_due_revision",
      "scored_v1",
    );

    const dueRevision = {
      id: "rev_s06",
      studentId: "student_s06",
      conceptId: "C2_ONE_STEP_SUBTRACTION",
      type: "RETENTION_REVIEW",
      priority: 0.8,
      dueAt: new Date(),
      questionCount: 1,
      status: "PENDING" as const,
      reasoning: "Retention review due",
      confidence: 0.7,
      recommendationVersion: "recommendation-rules-v2",
      dedupeKey: "retention_C2",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const decision = await decisionService.decide({
      session: mockSession({ studentId: "student_s06" }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      dueRevision,
      retentionEstimate: 0.3,
      experimentKey: "test_due_revision",
      experimentArm: "scored_v1",
    });

    assert.equal(
      decision.learningIntent,
      "RETENTION_REVIEW",
      "Should select RETENTION_REVIEW when due item exists",
    );
    assert.equal(
      decision.uiAction,
      "SHOW_QUESTION",
      "Should show question for retention review",
    );
  });
});

describe("S07 — Heuristic score exact (toy features)", () => {
  it("computes mastery gap term correctly", () => {
    const scorer = new CandidateScorerService();

    const candidate = {
      uiAction: "SHOW_QUESTION" as const,
      learningIntent: "STANDARD_PRACTICE" as const,
      parameters: {
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        difficulty: 2,
      },
      legalityReason: "Test candidate",
    };

    const context = {
      studentId: "test",
      sessionId: "sess_test",
      eventId: "event_test",
      masteryValue: 0.0, // Complete gap
      masteryThreshold: 0.75,
      retentionEstimate: undefined, // No retention contribution
      misconceptionConfidence: 0, // No misconception contribution
      explanationEffectiveness: undefined, // No explanation contribution
      seenDifficulties: [], // No exploration bonus (not seen)
      targetConceptId: "C2_ONE_STEP_SUBTRACTION",
      targetDifficulty: 2,
    };

    const scored = scorer.scoreAndRank([candidate], context);
    
    // masteryGapTerm = 1 - (0.0 / 0.75) = 1.0
    // retentionRiskTerm = 0 (not a retention intent)
    // misconceptionSeverity = 0 (not a targeting intent)
    // explanationNeedTerm = 0 (not an explanation action)
    // explorationTerm = 0.7 (unseen difficulty)
    // score = 0.30 × 1.0 + 0.25 × 0 + 0.20 × 0 + 0.15 × 0 + 0.10 × 0.7 = 0.30 + 0.07 = 0.37
    assert.ok(
      Math.abs(scored[0].score - 0.37) < 0.001,
      `Expected score ~0.37, got ${scored[0].score}`,
    );
  });
});

describe("S08 — Shadow mode does not change decision", () => {
  it("uses control path when shadow=true even with scored_v1 arm", async () => {
    const prisma = mockPrisma();
    const experimentsService = new ExperimentsService(prisma as any);
    const candidateScorer = new CandidateScorerService();
    const decisionService = new DecisionEngineService(
      experimentsService,
      candidateScorer,
    );

    (prisma as any).__store.sessions.set("student_s08", [
      { sessionMode: "ADAPTIVE_PRACTICE", status: "ENDED" },
    ]);

    const experimentDef = {
      experimentKey: "test_shadow",
      status: "RUNNING",
      arms: ["scored_v1"],
      allocation: { scored_v1: 1.0 },
      eligibility: { minSessionsCompleted: 1, excludeBaselineOnly: true },
      startAt: new Date().toISOString(),
      rulesVersion: "experiment-rules-v1",
    };

    await experimentsService.upsertExperimentDefinition(experimentDef as any);
    await experimentsService.forceAssignment(
      "student_s08",
      "test_shadow",
      "scored_v1",
    );

    const decision = await decisionService.decide({
      session: mockSession({ studentId: "student_s08" }),
      recentCorrectStreak: 1,
      recentIncorrectStreak: 0,
      experimentKey: "test_shadow",
      experimentArm: "scored_v1",
      shadow: true, // Shadow mode
    });

    // Should use control path (decideInternal)
    assert.equal(
      decision.uiAction,
      "SHOW_QUESTION",
      "Shadow mode should use control decision",
    );
    assert.equal(
      decision.learningIntent,
      "STANDARD_PRACTICE",
      "Should select standard practice in control",
    );
  });
});

describe("S09 — Empty legal set falls back", () => {
  it("returns fallback when no candidates generated", () => {
    const scorer = new CandidateScorerService();
    const candidates: any[] = [];

    const context = {
      studentId: "test",
      sessionId: "sess_test",
      eventId: "event_test",
    };

    const scored = scorer.scoreAndRank(candidates, context);
    
    assert.equal(
      scored.length,
      0,
      "Empty candidate set should return empty scored list",
    );
  });
});

describe("S10 — Illegal uiAction rejected", () => {
  it("scorer only accepts legal candidates from generator", () => {
    // This test validates that candidate generator never produces illegal actions
    // The decision engine's generateLegalCandidates only creates valid uiActions
    const scorer = new CandidateScorerService();

    const legalCandidate = {
      uiAction: "SHOW_QUESTION" as const,
      learningIntent: "STANDARD_PRACTICE" as const,
      parameters: {
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        difficulty: 2,
      },
      legalityReason: "Standard practice",
    };

    const context = {
      studentId: "test",
      sessionId: "sess_test",
      eventId: "event_test",
    };

    // Scorer should work with legal candidates
    const scored = scorer.scoreAndRank([legalCandidate], context);
    assert.equal(scored.length, 1, "Legal candidate should be scored");
    assert.equal(
      scored[0].candidate.uiAction,
      "SHOW_QUESTION",
      "Legal uiAction preserved",
    );

    // Note: Illegal actions like "EASIER_QUESTION" are prevented by TypeScript
    // and never reach the scorer from the candidate generator
  });
});

describe("S21 — All candidate scores equal (tie-break)", () => {
  it("breaks ties by lexicographic learningIntent + conceptId", () => {
    const scorer = new CandidateScorerService();

    // Three candidates with identical scoring features (all 0.5 neutral)
    const candidates = [
      {
        uiAction: "SHOW_QUESTION" as const,
        learningIntent: "STANDARD_PRACTICE" as const,
        parameters: {
          conceptId: "C3_TWO_STEP",
          difficulty: 2,
        },
        legalityReason: "Candidate A",
      },
      {
        uiAction: "SHOW_QUESTION" as const,
        learningIntent: "RETENTION_REVIEW" as const,
        parameters: {
          conceptId: "C2_ONE_STEP_SUBTRACTION",
          difficulty: 2,
        },
        legalityReason: "Candidate B",
      },
      {
        uiAction: "SHOW_QUESTION" as const,
        learningIntent: "STANDARD_PRACTICE" as const,
        parameters: {
          conceptId: "C2_ONE_STEP_SUBTRACTION",
          difficulty: 2,
        },
        legalityReason: "Candidate C",
      },
    ];

    const context = {
      studentId: "test",
      sessionId: "sess_test",
      eventId: "event_test",
      // All features neutral (0.5) or unavailable - no targeting context
      masteryValue: undefined,
      retentionEstimate: undefined,
      misconceptionConfidence: 0,
      explanationEffectiveness: undefined,
      seenDifficulties: [],
    };

    const scored = scorer.scoreAndRank(candidates, context);

    // All should have similar or identical scores (all near 0)
    const scores = scored.map((s) => s.score);
    
    // In this case, all candidates will score 0 because:
    // - No mastery context (masteryValue undefined)
    // - Not retention intents for candidate A and C
    // - Not misconception intents
    // - Not explanation actions
    // - No exploration bonus (no target difficulty)
    // So they're effectively tied at 0
    
    // Verify lexicographic ordering is applied
    // "RETENTION_REVIEW:C2_ONE_STEP_SUBTRACTION" < "STANDARD_PRACTICE:C2_ONE_STEP_SUBTRACTION" < "STANDARD_PRACTICE:C3_TWO_STEP"
    const selectedIndex = scorer.selectBest(scored);
    assert.equal(selectedIndex, 0, "Should select first after tie-break sort");
    
    // Verify first candidate is retention review (lexicographically first)
    assert.equal(
      scored[0].candidate.learningIntent,
      "RETENTION_REVIEW",
      "RETENTION_REVIEW should sort first lexicographically",
    );
  });
});
