# MVP 4.0 — Test Plan (Golden Cases)

> **U##** = multi-unit / planning cases. G##, R##, S## remain required regression when this era is implemented.

| Series | Scope |
|---|---|
| G## | MVP 1.0 |
| R## | MVP 2.0 |
| S## | MVP 3.0 |
| **U01–U15** | MVP 4.0 (this file) |

### U01 — Linear Equations IDs unchanged

```text
Expected: P2_NEGATIVE_OPS and C6_SIMPLE_WORD_PROBLEMS still canonical
```

### U02 — Unit unlock blocked

```text
Setup: core concepts below threshold on prereq unit
Expected: second unit not unlocked; UNIT_BRIDGE_REVIEW eligible
```

### U03 — Unit unlock allowed

```text
Setup: ≥70% core concepts at threshold with min evidence
Expected: unlock; horizon may set primaryUnit to new unit
```

### U04 — Horizon weeks clamp

```text
Setup: planner requests 9 weeks
Expected: horizonWeeks = 6
```

### U05 — maxNewConcepts per week

```text
Expected: plan week has ≤ 2 new concepts by default
```

### U06 — Cross-unit retention due

```text
Setup: prior unit concept retentionEstimate = 0.30
Expected: bridge/retention item competes in decision priority before new-unit exploration
```

### U07 — Workload cap across units

```text
Expected: daily recommendation does not exceed cap even with 2 units due
```

### U08 — Decision includes unitId

```text
Expected: parameters.unitId set on SHOW_QUESTION decisions
```

### U09 — QG rejects wrong unit bank

```text
Setup: decision unitId A, only B items available
Expected: fallback / abstain path; no cross-unit silent substitute without rule
```

### U10 — Plan refresh idempotent

```text
Expected: same day refresh job completes once per idempotency key
```

### U11 — Teacher read-only

```text
Expected: teacher_coach cannot POST diagnostic mutations
```

### U12 — Experiment unit eligibility

```text
Expected: assignment only when eligibility.unitId matches active unit
```

### U13 — END_SESSION still wins

```text
Expected: multi-unit plan never overrides session end
```

### U14 — Report lists units separately

```text
Expected: weekly structured summary has per-unit sections
```

### U15 — Alias concept ID rejected in new unit validation

```text
Expected: C6_WORD_PROBLEMS still invalid everywhere
```

---

## F. Planning horizon worked example

### U16 — Planning horizon with exact numbers (worked example)

**Setup:**

```text
Student profile (end of week 0):
  - Linear Equations unit: 9/11 core concepts at threshold (mastery ≥ 0.70), min evidence met
  - Unit unlock: algebraic-expressions-grade8 now eligible (≥70% prereq core at threshold)
  - Retention estimates:
      C2_ONE_STEP_SUBTRACTION: 0.65 (due-ish)
      C5_TWO_STEP_EQUATIONS: 0.80 (stable)
  - Active misconception: C5 × EQUALITY_IMBALANCE confidence 0.40
  - Curriculum planner requests 4-week horizon
```

**Planning computation (planning-rules-v1):**

```text
horizonWeeks = clamp(4, 2, 6) = 4

For algebraic-expressions-grade8:
  focusConcepts = [AE_P1_LIKE_TERMS, AE_C1_SIMPLIFY_EXPRESSIONS] (new unit start, 2 concepts)
  meanMastery(focusConcepts) = 0.0 (unseen)
  meanRetentionRisk(focusConcepts) = 0.0 (no history)
  misconceptionBurden = 0.0 (no active AE misconceptions)
  curriculumPriorityWeight = 0.8 (standard next unit)
  learningNeed = 0.4 × (1 - 0.0) + 0.3 × 0.0 + 0.2 × 0.0 + 0.1 × 0.8 = 0.48

For linear-equations-one-variable (remediation scenario):
  focusConcepts = [C2_ONE_STEP_SUBTRACTION, C5_TWO_STEP_EQUATIONS]
  meanMastery(focusConcepts) = (0.75 + 0.72) / 2 = 0.735 (at threshold but with retention risk)
  meanRetentionRisk(focusConcepts) = (1 - 0.65 + 1 - 0.80) / 2 = 0.275
  misconceptionBurden = 0.40 / 1.0 = 0.40 (C5 active)
  curriculumPriorityWeight = 0.5 (remediation, lower than new unit unlock)
  learningNeed = 0.4 × (1 - 0.735) + 0.3 × 0.275 + 0.2 × 0.40 + 0.1 × 0.5 = 0.106 + 0.0825 + 0.08 + 0.05 = 0.3185

primaryUnit = algebraic-expressions-grade8 (higher learningNeed 0.48 > 0.3185)
```

**Horizon plan output:**

```json
{
  "horizonWeeks": 4,
  "weeks": [
    {
      "weekIndex": 0,
      "primaryUnitId": "algebraic-expressions-grade8",
      "focusConceptIds": ["AE_P1_LIKE_TERMS", "AE_C1_SIMPLIFY_EXPRESSIONS"],
      "bridgeConceptIds": ["C2_ONE_STEP_SUBTRACTION"],
      "maxNewConcepts": 2
    },
    {
      "weekIndex": 1,
      "primaryUnitId": "algebraic-expressions-grade8",
      "focusConceptIds": ["AE_C2_DISTRIBUTE_SIMPLE"],
      "bridgeConceptIds": [],
      "maxNewConcepts": 2
    },
    {
      "weekIndex": 2,
      "primaryUnitId": "algebraic-expressions-grade8",
      "focusConceptIds": ["AE_C3_FACTOR_COMMON"],
      "bridgeConceptIds": ["C5_TWO_STEP_EQUATIONS"],
      "maxNewConcepts": 2
    },
    {
      "weekIndex": 3,
      "primaryUnitId": "algebraic-expressions-grade8",
      "focusConceptIds": ["AE_C4_EVALUATE_EXPRESSIONS"],
      "bridgeConceptIds": [],
      "maxNewConcepts": 2
    }
  ]
}
```

**Decision priority interaction:**

```text
Week 0, Day 2 decision:
  1. Session gates → no END_SESSION/SUGGEST_BREAK
  2. Due revision → C2_ONE_STEP_SUBTRACTION qualifies (retentionEstimate 0.65, PENDING high priority)
  3. Selected: uiAction SHOW_QUESTION, learningIntent RETENTION_REVIEW, unitId linear-equations-one-variable, conceptId C2_ONE_STEP_SUBTRACTION
  4. Bridge concept from plan satisfied; next decision may proceed to AE focus

Week 0, Day 3 decision (after bridge):
  5. Selected: uiAction SHOW_QUESTION, learningIntent HORIZON_FOCUS_PRACTICE, unitId algebraic-expressions-grade8, conceptId AE_P1_LIKE_TERMS (first new-unit concept)
```

**Assertions (U16 golden):**

```text
- horizonWeeks exactly 4 (not 9, clamped)
- primaryUnit = algebraic-expressions-grade8 based on learningNeed calculation
- Week 0 includes bridgeConceptId C2_ONE_STEP_SUBTRACTION (retention risk triggered inclusion)
- maxNewConcepts per week = 2 (default)
- Decision engine respects bridge priority before new-unit exploration
```
