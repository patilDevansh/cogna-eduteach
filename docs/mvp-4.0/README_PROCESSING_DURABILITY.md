# MVP 4.0 — Processing & Durability

> **Delta from MVP 3.0:** Plan refresh and cross-unit retention sweeps are async jobs. Tx1–Tx4 unchanged; plans read in Tx4.

## Jobs

| Job | Notes |
|---|---|
| `CURRICULUM_PLAN_REFRESH` | Idempotency `{studentId}:{planVersionDay}` |
| `CROSS_UNIT_RETENTION_SWEEP` | Off hot path; creates PENDING bridge revision items |

## Failure modes

| Failure | Behavior |
|---|---|
| Missing plan | Fall back to primary unlocked unit = Linear Equations or last active unit |
| Unknown unitId on question | Reject serve; alert |
| Unlock race | Re-evaluate unlock in Tx4 from mastery snapshot |

LLM draft jobs remain off hot path.
