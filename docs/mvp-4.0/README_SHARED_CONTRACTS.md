# MVP 4.0 — Shared Contracts

> **Delta from MVP 3.0:** Additive `unitId`, curriculum plan objects, and planning intents. UI actions unchanged.

## Version strings (proposed)

```ts
export const CURRICULUM_RULES_V1 = "curriculum-rules-v1";
export const PLANNING_RULES_V1 = "planning-rules-v1";
export const DECISION_RULES_V4 = "decision-rules-v4"; // unit-aware
export const RECOMMENDATION_RULES_V4 = "recommendation-rules-v4";
// Carry: mastery-formula-v2, diagnostic-rules-v2, retention-rules-v2,
// experiment-rules-v1, candidate-score-rules-v1, content-*-v1
```

## LearningIntent (additive)

Carry all MVP 2.0/3.0 intents. Proposed new:

| Intent | Typical uiAction | Purpose |
|---|---|---|
| `UNIT_BRIDGE_REVIEW` | `SHOW_QUESTION` | Prior-unit concept before unlocking next unit |
| `HORIZON_FOCUS_PRACTICE` | `SHOW_QUESTION` | Align with active planning horizon focus |

Do not invent flat UI actions.

## DecisionParameters extensions

```ts
interface DecisionParameters {
  // ... MVP 3.0 fields
  unitId?: string;
  curriculumPlanId?: string;
  horizonWeekIndex?: number; // 0-based within plan
  bridgeConceptId?: string;
}
```

## CurriculumPlan

```ts
interface CurriculumPlan {
  id: string;
  studentId: string;
  horizonWeeks: number; // 2..6
  weeks: Array<{
    weekIndex: number;
    primaryUnitId: string;
    focusConceptIds: string[];
    bridgeConceptIds: string[];
    maxNewConcepts: number;
  }>;
  rulesVersion: string; // planning-rules-v1
  createdAt: string;
  validUntil: string;
}
```

## UnitCatalog entry

```ts
interface UnitDefinition {
  unitId: string;
  title: string;
  conceptIds: string[];
  prerequisiteUnitIds: string[];
  unlockRule: "ALL_PREREQ_UNITS_AT_THRESHOLD" | "MANUAL" | "DIAGNOSTIC_PLACEMENT";
}
```

---

## Teacher / Coach API (optional read-only visibility)

**Allowlist (GET-only endpoints):**

If lightweight teacher/coach read-only views are implemented in MVP 4.0, the following GET endpoints are allowed under `teacher_coach` role:

```text
GET /api/students/:studentId/profile (read-only learner state)
GET /api/students/:studentId/sessions (session history)
GET /api/students/:studentId/progress/:unitId (mastery summary by unit)
GET /api/units (unit catalog)
GET /api/curriculum-plan/:studentId (current horizon plan, read-only)
```

**Forbidden for teacher_coach:**

```text
POST /api/diagnostic/* (no writes to diagnostic state)
POST /api/sessions/* (no session mutations)
PUT /api/mastery/* (no direct mastery overrides)
POST /api/experiments/* (no experiment ops)
POST /api/content/* (no content authoring)
DELETE /* (no deletions)
```

**Rationale:** Teacher visibility is optional in MVP 4.0 and restricted to GET-only to prevent accidental diagnostic pollution or mastery tampering. If teacher dashboards are deferred, this section serves as design constraint for future implementation.
