# MVP 1.0 — Data Model

> First schema contract for Prisma/SQL. Immutable raw events; versioned inferences.

## Principles

- Raw events and attempts are **append-only** (no overwrite of observation fields)
- `eventId` globally unique
- Profile changes create history rows (versioned)
- Engine version strings snapshotted on every diagnostic/decision
- Soft-delete where legally required (`deletedAt`); never hard-delete audit evidence without retention policy job
- Active revision dedupe key unique

## Enums (DB)

Align with [Shared Contracts](./README_SHARED_CONTRACTS.md): `UiAction`, `LearningIntent`, `Grade`, `ProcessingStatus`, `SessionMode`, `ReviewStatus` (`DRAFT` | `PENDING_REVIEW` | `APPROVED` | `RETIRED`).

## Tables

### users

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| role | enum PARENT \| STUDENT \| ADMIN | |
| email | citext null | student email optional |
| created_at | timestamptz | |

### parents

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid UNIQUE FK users | |
| name | text | |
| trial_ends_at | timestamptz null | |
| subscription_status | text | e.g. trial, active, lapsed |

### students

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid null UNIQUE FK | null until student activates code |
| primary_parent_id | uuid FK parents | creator / billing parent |
| name | text | |
| grade | int | 8 |
| curriculum | text | CBSE |
| access_code_hash | text | |
| deleted_at | timestamptz null | |

### parent_student_links

Many parents ↔ one student (guardians).

| Column | Type |
|---|---|
| parent_id | uuid |
| student_id | uuid |
| relationship | text |
| can_view_reports | boolean |
| PK (parent_id, student_id) | |

### concepts

| Column | Type |
|---|---|
| id | text PK | stable IDs from Content Spec |
| name | text | student-facing |
| kind | enum PREREQ \| CORE | |
| mastery_threshold | numeric | |
| minimum_evidence | int | |
| sort_order | int | |

### concept_prerequisites

| Column | Type |
|---|---|
| concept_id | text FK |
| prerequisite_id | text FK |
| PK (concept_id, prerequisite_id) | |

### questions

| Column | Type |
|---|---|
| id | text PK |
| version | int | |
| concept_id | text FK |
| difficulty | int check 1–5 |
| question_intent | text | |
| type | text | NUMERIC/MCQ/WORD_PROBLEM |
| stem | text | |
| accepted_answers | jsonb | string[] |
| misconceptions_tested | text[] | |
| prerequisite_concept_ids | text[] | |
| solution_steps | jsonb | |
| hint_ladder | jsonb | |
| review_status | enum | |
| item_quality_weight | numeric default 1.0 | |
| UNIQUE (id, version) | serve only APPROVED |

### explanations

| Column | Type |
|---|---|
| id | text PK |
| concept_id | text | |
| misconception_id | text null | |
| style | text | |
| content | text | |
| check_for_understanding | text | |
| review_status | enum | |
| version | int | |

### learning_sessions

| Column | Type |
|---|---|
| id | uuid PK | |
| student_id | uuid FK | |
| session_mode | enum | |
| status | text | active/ended |
| started_at | timestamptz | |
| ended_at | timestamptz null | |
| question_count | int | |
| baseline_slot_index | int null | |

### raw_events

| Column | Type |
|---|---|
| event_id | text PK UNIQUE | |
| event_type | text | |
| student_id | uuid | |
| session_id | uuid null | |
| payload | jsonb | immutable |
| created_at | timestamptz | |

### attempts

| Column | Type |
|---|---|
| id | uuid PK | |
| event_id | text UNIQUE FK raw_events | |
| student_id | uuid | |
| session_id | uuid | |
| question_id | text | |
| question_version | int | |
| submitted_answer | text | |
| grade | enum | |
| is_correct | boolean | |
| time_to_first_response_ms | int | |
| total_time_ms | int | |
| idle_time_ms | int | |
| attempt_number | int | |
| hint_count | int | |
| highest_hint_level | int | |
| self_rated_confidence | int null | |
| answer_changed_before_submit | boolean | |
| processing_status | enum | |
| created_at | timestamptz | |

### mastery_scores

| Column | Type |
|---|---|
| student_id | uuid | |
| concept_id | text | |
| value | numeric | |
| confidence | numeric | |
| evidence_count | int | |
| model_version | text | |
| updated_at | timestamptz | |
| PK (student_id, concept_id) | |

### mastery_history

| Column | Type |
|---|---|
| id | uuid PK | |
| student_id | uuid | |
| concept_id | text | |
| previous_value | numeric | |
| new_value | numeric | |
| attempt_id | uuid | |
| formula_version | text | |
| created_at | timestamptz | |

### diagnostic_factors

| Column | Type |
|---|---|
| id | uuid PK | |
| student_id | uuid | |
| concept_id | text null | |
| factor_type | text | |
| factor_key | text | |
| value | jsonb | |
| confidence | numeric | |
| reasoning | text | |
| evidence_attempt_ids | uuid[] | |
| alternative_explanations | text[] | |
| model_version | text | |
| valid_until | timestamptz null | |
| created_at | timestamptz | |

### misconception_remediation_states

| Column | Type |
|---|---|
| student_id | uuid | |
| misconception_id | text | |
| concept_id | text | |
| state | text | UNCONFIRMED… |
| targeted_attempt_count | int | |
| explanation_cycle_count | int | |
| updated_at | timestamptz | |
| PK (student_id, misconception_id, concept_id) | |

### learner_profiles

| Column | Type |
|---|---|
| student_id | uuid PK | |
| profile_version | int | |
| mastery_summary | jsonb | |
| active_misconceptions | jsonb | |
| confidence_calibration | text | |
| hint_dependence | numeric | |
| revision_need_signals | jsonb | |
| updated_at | timestamptz | |

### learner_profile_history

Snapshot on each Tx2 commit: `student_id`, `profile_version`, `snapshot jsonb`, `attempt_id`, `created_at`.

### learning_decisions

| Column | Type |
|---|---|
| id | uuid PK | |
| student_id | uuid | |
| session_id | uuid | |
| attempt_id | uuid null | |
| ui_action | text | |
| learning_intent | text | |
| content_style | jsonb | |
| parameters | jsonb | |
| confidence | numeric | |
| reasoning | text | |
| decision_version | text | |
| input_snapshot | jsonb | |
| fallback_generated | boolean | |
| created_at | timestamptz | |

### revision_queue_items

| Column | Type |
|---|---|
| id | uuid PK | |
| student_id | uuid | |
| concept_id | text | |
| type | text | |
| target_misconception | text null | |
| priority | numeric | |
| due_at | timestamptz | |
| question_count | int | |
| status | text | |
| reasoning | text | |
| confidence | numeric | |
| recommendation_version | text | |
| dedupe_key | text | |
| UNIQUE (student_id, dedupe_key) WHERE status IN ('PENDING','IN_PROGRESS') | |

`dedupe_key` example: `{type}:{conceptId}:{misconceptionId|none}`.

### reports

| Column | Type |
|---|---|
| id | uuid PK | |
| student_id | uuid | |
| audience | text | |
| trigger | text | |
| period_start | timestamptz | |
| period_end | timestamptz | |
| structured_data | jsonb | |
| rendered_text | text | |
| report_version | text | |
| created_at | timestamptz | |

### consents

| Column | Type |
|---|---|
| id | uuid PK | |
| parent_id | uuid | |
| student_id | uuid | |
| consent_type | text | |
| granted_at | timestamptz | |
| revoked_at | timestamptz null | |

## Required indexes

```text
raw_events(event_id) UNIQUE
attempts(event_id) UNIQUE
attempts(student_id, created_at)
attempts(session_id, created_at)
mastery_scores(student_id, concept_id)
diagnostic_factors(student_id, created_at)
learning_decisions(session_id, created_at)
revision_queue_items(student_id, status, due_at)
questions(concept_id, difficulty, review_status)
questions(id, version) UNIQUE
```

## Migration strategy

1. Migration `0001_init` — all tables above  
2. Seed `concepts`, `concept_prerequisites`, misconception reference data  
3. Seed questions only with `PENDING_REVIEW` until human approval job flips to `APPROVED`  
4. Never mutate `raw_events.payload`  
5. Rule/formula constant changes → new version string + optional reprocess job (offline)
