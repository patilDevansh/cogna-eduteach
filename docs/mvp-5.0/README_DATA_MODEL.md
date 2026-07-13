# MVP 5.0 — Data Model

> **Delta from MVP 4.0:** Subjects, modality assets, policy versions, modality outcomes, safety eval records.

## New tables (sketch)

### `subjects`

| Column | Type | Notes |
|---|---|---|
| `subject_id` | text PK | e.g. `mathematics` |
| `title` | text | |

### `modality_assets`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `modality` | text | ANIMATION \| VIDEO \| VOICE |
| `concept_id` | text | |
| `misconception_id` | text null | |
| `unit_id` | text | |
| `subject_id` | text | |
| `storage_ref` | text | |
| `transcript_ref` | text null | required for VOICE/VIDEO math claims |
| `review_status` | text | PENDING_REVIEW \| APPROVED \| REJECTED |
| `duration_ms` | int null | |
| `created_at` | timestamptz | |

### `modality_outcomes`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `student_id` | text | |
| `asset_id` | text | |
| `session_id` | text | |
| `completed` | boolean | |
| `dwell_ms` | int | |
| `retest_correct` | boolean null | |
| `model_version` | text | |
| `created_at` | timestamptz | |

### `policy_versions`

| Column | Type | Notes |
|---|---|---|
| `policy_version` | text PK | |
| `status` | text | CANDIDATE \| SHADOW \| EXPERIMENT \| PROMOTED \| ROLLED_BACK |
| `artifact_ref` | text | model blob |
| `safety_eval_id` | text null | |
| `created_at` | timestamptz | |

### `safety_evals`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `policy_version` | text | |
| `metrics_json` | jsonb | |
| `passed` | boolean | |
| `rules_version` | text | safety-eval-rules-v1 |
| `created_at` | timestamptz | |

## Carry-forward

Curriculum, experiments, drafts, retention, jobs, core loop.

---

## Subject-to-concept join (sketch)

To support multi-subject queries and curriculum planning:

**Option A: Direct FK in concepts table (if concepts table exists):**

```sql
ALTER TABLE concepts
  ADD COLUMN subject_id text REFERENCES subjects(subject_id);
```

**Option B: Join table for flexible many-to-many (if concepts span subjects):**

```sql
CREATE TABLE subject_concepts (
  subject_id text REFERENCES subjects(subject_id),
  concept_id text, -- canonical concept ID
  unit_id text,    -- which unit within subject
  PRIMARY KEY (subject_id, concept_id)
);
```

**Recommended:** Option A (direct FK) if each concept belongs to exactly one subject. Use Option B if concepts are ever shared across subjects (rare; unlikely in MVP 5.0).

**Units-to-subjects FK (existing in units table):**

```sql
ALTER TABLE units
  ADD COLUMN subject_id text REFERENCES subjects(subject_id);
```

Linear Equations and other math units: `subject_id = 'mathematics'`.

**Query example:**

```sql
-- All concepts in a subject via units join
SELECT c.concept_id, u.unit_id, s.subject_id
FROM concepts c
  JOIN units u ON c.unit_id = u.unit_id
  JOIN subjects s ON u.subject_id = s.subject_id
WHERE s.subject_id = 'mathematics';
```
