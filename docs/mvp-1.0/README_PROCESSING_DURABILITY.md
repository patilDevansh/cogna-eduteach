# MVP 1.0 — Processing & Durability

> No single giant transaction for attempt + profile + decision + content.

## Processing states

```text
RECEIVED → VALIDATED → GRADED → PROFILE_UPDATED → DECIDED → CONTENT_RESOLVED → COMPLETED
                                                                    ↘ FAILED_RETRYABLE / FAILED_PERMANENT
```

Each stage is **idempotent** on `eventId`.

## Staged transactions

### Tx1 — Preserve evidence (always if valid)

Commits:

- raw event (immutable)
- attempt
- grade
- `processingStatus = GRADED`

If later stages fail, the attempt **remains**.

### Tx2 — Learner state

Commits:

- diagnostic output (versioned)
- mastery changes + history row
- learner profile version
- `processingStatus = PROFILE_UPDATED`

On failure: keep Tx1; `FAILED_RETRYABLE`; retry diagnosis; never invent diagnosis.

### Tx3 — Decision

Commits:

- decision input snapshot
- `LearningDecision`
- `processingStatus = DECIDED`

On failure: keep profile; emit safe fallback decision (`SHOW_QUESTION` + `STANDARD_PRACTICE`, same or lower difficulty); `fallbackGenerated: true`.

### Tx4 — Content

Commits:

- selected question / explanation / hint ids
- response payload
- `QUESTION_SHOWN` / `EXPLANATION_SHOWN` / `HINT_SHOWN` as applicable
- `processingStatus = CONTENT_RESOLVED` then `COMPLETED`

On failure: reviewed fallback content or `END_SESSION` if none.

## Failure matrix

| Stage fails | Durable so far | Next |
|---|---|---|
| Validation | nothing | 400 |
| Tx1 DB | nothing claimed | 503 retry same eventId |
| Tx2 | attempt+grade | retry diagnosis |
| Tx3 | attempt+profile | fallback decision |
| Tx4 | attempt+profile+decision | fallback content or end |

## Idempotency

```text
If eventId already COMPLETED:
  return stored result
  do not re-grade
  do not re-update mastery
  do not mint new decision

If eventId partially complete:
  resume from first incomplete stage
```

## Report triggers (not per answer)

```text
SESSION_ENDED
DAILY_REPORT_JOB
WEEKLY_REPORT_JOB
PARENT_REQUESTED_REPORT
```
