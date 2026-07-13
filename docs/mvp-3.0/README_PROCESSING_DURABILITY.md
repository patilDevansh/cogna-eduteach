# MVP 3.0 — Processing & Durability

> **Delta from MVP 2.0:** Same Tx1–Tx4 staged durability. Adds durable jobs for LLM drafts, validation, and experiment analysis. Hot path never waits on LLM.

## Tx1–Tx4 (carry)

As in MVP 2.0:

```text
Tx1  persist raw event (idempotent eventId)
Tx2  grade / evidence links
Tx3  diagnostic writes (versioned)
Tx4  decision + content selection + response envelope
```

Experiment context is included in Tx4 `inputSnapshot` when assigned. Assignment lookup is read-mostly; first assignment write uses its own short transaction before Tx4 if needed.

## New async jobs

| Job | Hot path? | Retry |
|---|---|---|
| `CONTENT_LLM_DRAFT` | No | Retryable on provider 5xx; permanent on schema reject after N |
| `CONTENT_VALIDATE` | No | Retryable on infra; permanent on deterministic fail |
| `EXPERIMENT_ANALYSIS_EXPORT` | No | Retryable |
| `CANDIDATE_SCORE_SHADOW_BATCH` | No | Retryable |

## Idempotency

- `eventId` still unique for student events.
- Draft jobs key on `draftRequestId`.
- Experiment assignment: unique `(student_id, experiment_key)`.
- Scorer rows may duplicate in shadow batch only with distinct `id`; online path keys on `event_id` + `score_version`.

## Failure modes

| Failure | Behavior |
|---|---|
| LLM provider down | No drafts; student loop unaffected |
| Validation fail | Draft stays VALIDATION_FAILED |
| Scorer error mid-experiment | Fall back to control policy for that decision; log |
| Assignment DB error | Fail closed to control; alert |

## Latency budget

Student answer path must not include LLM RTT. Candidate scoring v1 is local/CPU and must stay within existing Tx4 latency SLOs (see Observability).
