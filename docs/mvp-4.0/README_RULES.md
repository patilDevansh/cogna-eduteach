# MVP 4.0 — Rules

> **Delta from MVP 3.0:** Add `curriculum-rules-v1` and `planning-rules-v1`. Carry mastery/retention/experiment/scoring unless unit-scoped overrides are versioned.

## Curriculum unlock (`curriculum-rules-v1`)

```text
Unit U unlocks when for every prerequisite unit P:
  ≥ 70% of P.coreConcepts have mastery >= masteryThreshold
  AND minimumEvidence met per those concepts
ELSE if DIAGNOSTIC_PLACEMENT:
  placement baseline for U may unlock with low confidence plan
```

Linear Equations (`linear-equations-one-variable`) remains the default entry unit; IDs unchanged.

## Planning horizon (`planning-rules-v1`)

```text
horizonWeeks = clamp(recommended, 2, 6)
primaryUnit = unlocked unit with highest learningNeed
learningNeed =
  0.4 × (1 - meanMastery(focusConcepts))
+ 0.3 × meanRetentionRisk(focusConcepts)
+ 0.2 × misconceptionBurden
+ 0.1 × curriculumPriorityWeight(unit)

maxNewConcepts per week = 2 (default)
must include ≥ 1 bridgeConcept from prior unit if prior unit retentionRisk high
daily workload caps carry recommendation-rules-v2/v4
```

## Decision priority (`decision-rules-v4`)

```text
1. END_SESSION
2. SUGGEST_BREAK
3. Due revision (any unit) / RETENTION_REVIEW
4. UNIT_BRIDGE_REVIEW when unlock blocked by bridge weakness
5. Remediation machine (concept-scoped)
6. Experiment branch (if any)
7. HORIZON_FOCUS_PRACTICE / standard difficulty intents within primary unit
```

## Carry-forward hard rules

- No mastery calendar decay under v2
- Scorer still cannot override session hard gates
- Only APPROVED content
