# MVP 3.0 — Data Model

> **Delta from MVP 2.0:** Activate and extend `experiment_assignments`; add drafts, validations, candidate scores, and experiment definitions. Carry all MVP 2.0 tables.

## Principles

- Raw evidence immutable; inferences versioned.
- Only APPROVED content reaches students.
- Experiment assignment is sticky and auditable.
- Drafts never join the student content join path until promoted.

## Carry-forward tables

`jobs`, `retention_estimates`, `explanation_outcomes`, `item_statistics`, `report_deliveries`, `content_reviews`, core loop tables — as in [`docs/mvp-2.0/README_DATA_MODEL.md`](../mvp-2.0/README_DATA_MODEL.md).

### `jobs` — new job types

| job_type | Idempotency key |
|---|---|
| `CONTENT_LLM_DRAFT` | `{draftRequestId}` |
| `CONTENT_VALIDATE` | `{draftId}:{payloadHash}` |
| `EXPERIMENT_ANALYSIS_EXPORT` | `{experimentKey}:{periodStart}:{periodEnd}` |
| `CANDIDATE_SCORE_SHADOW_BATCH` | `{day}:{ruleVersion}` |

---

## New / activated tables

### `experiment_definitions`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `experiment_key` | text unique | |
| `status` | text | DRAFT \| RUNNING \| PAUSED \| COMPLETED |
| `arms_json` | jsonb | arm ids + allocations |
| `eligibility_json` | jsonb | |
| `rules_version` | text | experiment-rules-v1 |
| `start_at` | timestamptz | |
| `end_at` | timestamptz null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `experiment_assignments` (product use — was stub in MVP 2.0)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `student_id` | text | |
| `experiment_key` | text | FK logical to definitions |
| `arm` | text | |
| `assigned_at` | timestamptz | |
| `sticky` | boolean | default true |
| `metadata` | jsonb null | |
| `created_at` | timestamptz | |

```text
UNIQUE (student_id, experiment_key)
INDEX experiment_assignments(experiment_key, arm)
```

### `content_drafts`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `draft_type` | text | QUESTION \| EXPLANATION_TEMPLATE \| HINT_LADDER |
| `concept_id` | text | |
| `difficulty` | int null | |
| `target_misconception` | text null | |
| `payload` | jsonb | |
| `source` | text | HUMAN \| LLM_ASSISTED \| PROGRAMMATIC |
| `provider` | text null | |
| `prompt_version` | text null | |
| `status` | text | see contracts |
| `validation_errors` | jsonb null | |
| `review_notes` | text null | |
| `promoted_content_id` | text null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

```text
INDEX content_drafts(status, created_at)
INDEX content_drafts(concept_id, draft_type)
```

### `candidate_action_scores`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `student_id` | text | |
| `session_id` | text | |
| `event_id` | text | |
| `candidates_json` | jsonb | scored candidates |
| `selected_index` | int | |
| `score_version` | text | candidate-score-rules-v1 |
| `experiment_id` | text null | |
| `experiment_arm_id` | text null | |
| `shadow` | boolean | default false |
| `created_at` | timestamptz | |

```text
INDEX candidate_action_scores(student_id, created_at)
INDEX candidate_action_scores(experiment_id, experiment_arm_id)
```

### `experiment_outcome_exports` (optional materialization)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `experiment_key` | text | |
| `period_start` | date | |
| `period_end` | date | |
| `storage_ref` | text | file / blob pointer |
| `row_count` | int | |
| `created_at` | timestamptz | |

---

## LearningDecision row extensions

Additive columns / JSON fields (if not already present):

| Field | Notes |
|---|---|
| `input_snapshot.experimentKey` | optional |
| `input_snapshot.experimentArm` | optional |
| `input_snapshot.candidateScoreId` | optional |
| `selection_reasoning` | may cite scorer features |

---

## Migration notes

1. Promote Prisma `ExperimentAssignment` stub to full product writes under feature flag `EXPERIMENTS_ENABLED`.
2. Add draft + score tables in a single additive migration.
3. No destructive changes to MVP 2.0 tables.
4. Default traffic: no assignments → identical to MVP 2.0 decision path.
