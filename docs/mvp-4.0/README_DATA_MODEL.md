# MVP 4.0 — Data Model

> **Delta from MVP 3.0:** Curriculum units, concept–unit membership, curriculum plans, optional teacher links.

## New tables

### `curriculum_units`

| Column | Type | Notes |
|---|---|---|
| `unit_id` | text PK | e.g. `linear-equations-one-variable` |
| `title` | text | |
| `prerequisite_unit_ids` | jsonb | |
| `unlock_rule` | text | |
| `priority_weight` | float | planning |
| `created_at` | timestamptz | |

### `unit_concepts`

| Column | Type | Notes |
|---|---|---|
| `unit_id` | text | |
| `concept_id` | text | |
| `kind` | text | PREREQ \| CORE |
| PRIMARY KEY (`unit_id`, `concept_id`) | | |

### `curriculum_plans`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `student_id` | text | |
| `horizon_weeks` | int | |
| `plan_json` | jsonb | weeks[] |
| `rules_version` | text | planning-rules-v1 |
| `valid_until` | timestamptz | |
| `created_at` | timestamptz | |

```text
INDEX curriculum_plans(student_id, valid_until)
```

### `teacher_student_links` (optional)

| Column | Type | Notes |
|---|---|---|
| `teacher_id` | text | |
| `student_id` | text | |
| `role` | text | COACH \| TEACHER |
| UNIQUE (`teacher_id`, `student_id`) | | |

## Carry-forward

All MVP 2.0/3.0 tables. Questions gain required `unit_id` (backfill Linear Equations).

## Jobs

| job_type | Purpose |
|---|---|
| `CURRICULUM_PLAN_REFRESH` | Rebuild horizon plan |
| `CROSS_UNIT_RETENTION_SWEEP` | Flag bridge reviews |
