# MVP 4.0 — Retention & Revision

> **Delta from MVP 3.0:** Retention estimates remain per-concept; revision queues become **multi-unit** with bridge items.

## Rules

- `retention-rules-v2` still computes per `conceptId`
- Recommendation v4 mixes units under workload caps
- `UNIT_BRIDGE_REVIEW` creates revision items tagged with `bridge=true`

**Cross-unit retention clarification:**

```text
Retention estimates remain per-concept using retention-rules-v2 (unchanged formula).
Concepts from any unit may become due for revision; the recommendation engine (v4) selects across units under daily workload caps.
conceptId is unit-agnostic in the retention formula unless a future rules version explicitly models unit-switching penalty (not in MVP 4.0).
Spaced review logic does not distinguish "prior unit" vs "current unit" — all PENDING high-priority retention items compete equally in decision priority (rule 3).
```

**Example:**

```text
Student on algebraic-expressions-grade8 (week 2):
  - C2_ONE_STEP_SUBTRACTION (linear-equations unit): retentionEstimate = 0.40, PENDING high-priority
  - AE_P1_LIKE_TERMS (current unit): retentionEstimate = 0.75, stable
Decision: RETENTION_REVIEW for C2 wins in priority; no unit-boundary penalty applied by retention-rules-v2.
```

## Workload

```text
dailyCap questions across all units (carry MVP 2.0/3.0 caps)
prefer: due high-priority retention → bridge → horizon focus
```

## Non-goals

- Learned forgetting curves as default (MVP 5.0 research)
- Calendar mastery decay without new formula version
