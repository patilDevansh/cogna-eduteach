# MVP 2.0 — Data Model

> Additive schema changes over MVP 1.0. Keep raw events append-only and inferences versioned.

## Principles

- Raw evidence is immutable.
- Inferences are versioned and replayable.
- Student-facing content must be APPROVED.
- Reports store structured data and rendered text.
- Pilot metrics must be queryable without reconstructing every event.
- Async work uses a durable `jobs` table (see [Processing & Durability](./README_PROCESSING_DURABILITY.md)).

## New / Extended Tables

### `jobs`

DB-backed async pattern for weekly reports, email delivery, item-statistics refresh, and similar off-hot-path work.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `job_type` | text | e.g. `WEEKLY_REPORT`, `REPORT_EMAIL`, `ITEM_STATS_REFRESH` |
| `idempotency_key` | text | unique per job_type |
| `payload` | jsonb | immutable request snapshot |
| `status` | text | `PENDING` \| `RUNNING` \| `COMPLETED` \| `FAILED_RETRYABLE` \| `FAILED_PERMANENT` |
| `attempt_count` | int | default 0 |
| `last_error` | text null | |
| `locked_at` | timestamptz null | worker lease |
| `locked_by` | text null | worker id |
| `run_after` | timestamptz null | backoff |
| `completed_at` | timestamptz null | |
| `result_ref` | text null | e.g. reportId / deliveryId |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Constraints / indexes:

```text
UNIQUE (job_type, idempotency_key)
INDEX jobs(status, run_after, created_at)
INDEX jobs(job_type, status)
```

State machine:

```text
PENDING -> RUNNING -> COMPLETED
PENDING -> RUNNING -> FAILED_RETRYABLE
FAILED_RETRYABLE -> RUNNING
FAILED_RETRYABLE -> FAILED_PERMANENT
```

Idempotency examples (from durability doc):

| Job | Idempotency key |
|---|---|
| weekly report | `{studentId}:{periodStart}:{periodEnd}` |
| email delivery | `{reportId}:{parentId}:{channel}` |
| item statistics refresh | `{questionId}:{questionVersion}:{day}` |

### `retention_estimates`

| Column | Type | Notes |
|---|---|---|
| `id` | text | primary key |
| `student_id` | text | FK student |
| `concept_id` | text | FK concept |
| `estimate` | float | 0-1 |
| `confidence` | float | 0-1 |
| `days_since_success` | int | source feature |
| `evidence_attempt_ids` | json | append references |
| `model_version` | text | `retention-rules-v2` |
| `valid_until` | datetime | stale after |
| `created_at` | datetime | |

Unique active estimate: `(student_id, concept_id, model_version, valid_until)`.

### `explanation_outcomes`

| Column | Type | Notes |
|---|---|---|
| `id` | text | primary key |
| `student_id` | text | |
| `session_id` | text | |
| `explanation_id` | text | template ID |
| `concept_id` | text | |
| `misconception_id` | text? | |
| `viewed_event_id` | text | EXPLANATION_VIEWED |
| `retest_attempt_id` | text? | next comparable attempt |
| `effective` | boolean? | null until retest |
| `highest_hint_level` | int? | retest hint |
| `model_version` | text | |

### `item_statistics`

| Column | Type | Notes |
|---|---|---|
| `question_id` | text | |
| `question_version` | int | |
| `attempt_count` | int | |
| `correct_rate` | float | |
| `avg_time_ms` | int | |
| `hint_rate` | float | |
| `misconception_hits` | json | by misconception |
| `discrimination_score` | float? | minimum N required |
| `updated_at` | datetime | |

### `report_deliveries`

| Column | Type | Notes |
|---|---|---|
| `id` | text | |
| `report_id` | text | FK report |
| `parent_id` | text | |
| `channel` | enum | EMAIL, IN_APP |
| `status` | enum | PENDING, SENT, FAILED, RETRYING |
| `provider_message_id` | text? | |
| `error` | text? | |
| `attempt_count` | int | |
| `last_attempt_at` | datetime? | |

### `content_reviews`

| Column | Type | Notes |
|---|---|---|
| `id` | text | |
| `content_type` | enum | QUESTION, EXPLANATION |
| `content_id` | text | |
| `content_version` | int | |
| `reviewer` | text | human name/email |
| `status` | enum | APPROVED, CHANGES_REQUESTED, REJECTED |
| `checklist` | json | math, wording, tags |
| `notes` | text? | |
| `reviewed_at` | datetime | |

### `experiment_assignments` — MVP 3.0 optional stub

| Column | Type | Notes |
|---|---|---|
| `id` | text | |
| `student_id` | text | |
| `experiment_key` | text | |
| `variant` | text | |
| `assigned_at` | datetime | |
| `ended_at` | datetime? | |

**Out of MVP 2.0 construction scope.** May exist as a nullable/empty stub table for forward compatibility, but:

- no assignment writes in MVP 2.0 product paths
- no experiment-driven decision branching
- policy experiments belong to MVP 3.0 (see `COGNA 2.0/SKIPPED.md`)

Prefer **not** migrating this table until MVP 3.0 unless a no-op stub is required for shared schema packages.

## Extended Existing Tables

### `learning_decisions`

Add or formalize:

| Column | Type | Notes |
|---|---|---|
| `input_snapshot` | json | required for MVP 2.0 |
| `selection_reasoning` | json | QG explanation |
| `latency_ms` | int? | decision stage |

### `attempts`

Add derived telemetry fields only if needed:

| Column | Type | Notes |
|---|---|---|
| `hesitation_bucket` | text? | derived from time-to-first-response |
| `engagement_flags` | json? | idle spike, answer changed |

Raw telemetry still lives in event payload and attempt columns.

## Enums

```text
JobStatus = PENDING | RUNNING | COMPLETED | FAILED_RETRYABLE | FAILED_PERMANENT
ReportDeliveryStatus = PENDING | SENT | FAILED | RETRYING
ReportDeliveryChannel = EMAIL | IN_APP
ContentReviewStatus = APPROVED | CHANGES_REQUESTED | REJECTED
ContentReviewType = QUESTION | EXPLANATION
```

LearningIntent DB/check constraints must allow MVP 1.0 intents **plus** `RETENTION_REVIEW`, `TRANSFER_CHECK`, `BREAK_FOR_FATIGUE` after shared enum migration.

## Migration Rule

MVP 2.0 may add tables and nullable fields. Do not break MVP 1.0 event replay.

Suggested order:

1. Additive enums / nullable columns on existing tables
2. `jobs`
3. `retention_estimates`, `explanation_outcomes`, `item_statistics`
4. `report_deliveries`, `content_reviews`
5. Defer `experiment_assignments` to MVP 3.0 unless stub explicitly needed
