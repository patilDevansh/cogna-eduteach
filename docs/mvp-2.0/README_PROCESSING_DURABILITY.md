# MVP 2.0 — Processing Durability

> Durability extends MVP 1.0 Tx1-Tx4. New async work must be retryable, idempotent, and observable.

## Answer Hot Path

Unchanged:

```text
Tx1 raw event + attempt + grade
Tx2 diagnostic profile update
Tx3 decision
Tx4 content resolution + stored response
```

Reports, email, weekly plans, and analytics must not block `POST /practice/answer`.

## Idempotency

| Operation | Idempotency key |
|---|---|
| answer submit | `eventId` |
| skip question | `eventId` |
| explanation viewed | `eventId` |
| session end | `session-ended-{sessionId}` |
| weekly report | `{studentId}:{periodStart}:{periodEnd}` |
| email delivery | `{reportId}:{parentId}:{channel}` |
| revision proposal | `{type}:{conceptId}:{misconceptionId|none}` |

## Async Job Pattern

Use the durable `jobs` table defined in [Data Model](./README_DATA_MODEL.md). Weekly reports, email delivery, and item-statistics refresh must enqueue here — not run inline on the answer hot path.

```text
PENDING -> RUNNING -> COMPLETED
PENDING -> RUNNING -> FAILED_RETRYABLE
FAILED_RETRYABLE -> RUNNING
FAILED_RETRYABLE -> FAILED_PERMANENT
```

Required columns (see Data Model for full schema):

- `job_type`, `idempotency_key` (unique per type), `payload`
- `status`, `attempt_count`, `last_error`
- `locked_at`, `locked_by`, `run_after`
- `completed_at`, `result_ref`

## Retry Rules

| Job | Retry |
|---|---|
| weekly report generation | 3 attempts |
| email delivery | 5 attempts with backoff |
| item statistics refresh | retry daily |
| observability export | best effort |

## Failure Safety

- If reports fail, practice still works.
- If email fails, in-app report remains available.
- If QG has no APPROVED content, decision should end session safely or choose another valid path.
- If analytics fails, no user-facing flow breaks.

## Replay

Any decision must be reconstructable from:

- raw event
- attempt
- learner profile snapshot
- diagnostic factors
- decision `input_snapshot`
- rule version strings
- content version

## Tests

- duplicate weekly report returns same report
- duplicate email delivery does not send twice
- failed email can retry
- answer hot path does not call report delivery
- no APPROVED content returns safe failure path
