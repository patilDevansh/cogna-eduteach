# MVP 2.0 — Retention and Revision

> MVP 1.0 creates revision items at session end. MVP 2.0 makes revision longitudinal, retention-aware, and parent-visible.

## Goals

- Detect when a concept is likely to be forgotten (`retentionEstimate`, not mastery calendar decay).
- Schedule short revision sets when retention risk rises (`retentionEstimate < 0.55`).
- Measure whether revision actually restores independent performance.
- Keep daily workload child-safe.

**Mastery vs retention:** `masteryScore.value` does not silently decay over calendar time. Forgetting risk is modeled only via `retentionEstimate` (`retention-rules-v2`). See [Rules](./README_RULES.md) §1 and §7.

## Retention Estimate

Each concept gets a retention estimate when evidence exists.

```text
minimumEvidence:
  at least 2 independent attempts
  at least 1 correct attempt

retentionEstimate = clamp(mastery + revisionBoost - forgettingPenalty, 0, 1)
```

See [`README_RULES.md`](./README_RULES.md) for constants.

## Revision Item Types

| Type | Trigger | Default count |
|---|---|---|
| `RETENTION_REVIEW` | retention estimate below threshold | 2 |
| `TARGETED_MISCONCEPTION` | active misconception | 3 |
| `PREREQ_REVIEW` | prerequisite gap | 2 |
| `REINFORCEMENT` | low mastery, enough evidence | 3 |
| `TRANSFER_CHECK` | mastery high enough for application | 1-2 |

## Queue Rules

```text
max pending per student = 20
max questions per day = 10
max concepts per day = 3
dedupe key = {type}:{conceptId}:{misconceptionId|none}
```

Statuses:

```text
PENDING -> IN_PROGRESS -> COMPLETED
PENDING -> EXPIRED
PENDING -> CANCELLED
```

## Daily Plan

Generated after session end and once daily:

1. High confidence active misconceptions
2. Retention items due today
3. Prerequisite gaps blocking active concept
4. Reinforcement on low mastery concepts
5. Transfer check if mastery is stable

## Weekly Plan

Weekly plan is for parent reporting and scheduling, not a rigid student queue.

It includes:

- concepts practiced
- concepts due soon
- active misconceptions
- completed revision outcomes
- one parent support suggestion

## Completion Outcome

On `REVISION_ITEM_COMPLETED`:

```text
if correct independently:
  status = COMPLETED
  retentionEstimate += small boost
  report as "recalled independently"

if incorrect or high hint:
  status = COMPLETED
  create follow-up reinforcement if still below threshold
  report as "needs another short review"
```

## Abstention

Do not create revision if:

- no APPROVED question exists
- evidence is too weak
- daily workload cap is reached
- concept is outside MVP 2.0 content scope

## Tests

- `R01` retention due after delay
- `R02` no retention estimate with weak evidence
- `R03` daily workload cap
- `R04` dedupe active revision
- `R05` successful revision boosts retention
- `R06` failed revision creates follow-up
