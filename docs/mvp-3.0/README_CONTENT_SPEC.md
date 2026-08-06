# MVP 3.0 — Content Spec

> **Delta from MVP 2.0:** Same frozen Linear Equations concept and misconception IDs. Raises template coverage targets and tracks draft-origin metadata. No new concept IDs required for core MVP 3.0.

---

## 1. Learning unit

**Name:** Linear Equations Learning Unit (Grade 8 CBSE)  
**ID:** `linear-equations-one-variable`

Unchanged from MVP 2.0. Multi-unit expansion is MVP 4.0.

---

## 2. Stable concept catalog

**Carry MVP 1.0 / 2.0 IDs.** Do not rename.

| ID | Kind | Target APPROVED (MVP 2.0) | Target APPROVED (MVP 3.0) |
|---|---|---:|---:|
| `P1_INTEGER_ADD_SUB` | PREREQ | 20 | 25 |
| `P2_NEGATIVE_OPS` | PREREQ | 15 | 20 |
| `P3_VARIABLES_CONSTANTS` | PREREQ | 15 | 20 |
| `P4_SIMPLE_EXPRESSIONS` | PREREQ | 20 | 25 |
| `P5_EQUALITY_BALANCE` | PREREQ | 20 | 25 |
| `C1_ONE_STEP_ADDITION` | CORE | 20 | 25 |
| `C2_ONE_STEP_SUBTRACTION` | CORE | 25 | 30 |
| `C3_ONE_STEP_MULTIPLICATION` | CORE | 20 | 25 |
| `C4_ONE_STEP_DIVISION` | CORE | 20 | 25 |
| `C5_TWO_STEP_EQUATIONS` | CORE | 25 | 30 |
| `C6_SIMPLE_WORD_PROBLEMS` | CORE | 20 | 30 |

MVP 3.0 bank target: **≥ 280 APPROVED** (growth via LLM-assisted drafts under review).

**Target policy:** 280 is the **pilot-ready floor** for Canonical promotion, not an aspirational stretch. Pilot launch requires meeting this minimum coverage with human-reviewed APPROVED items. Growth beyond 280 via LLM-assisted drafts is encouraged post-launch but not required for spec freeze. See [`content/question-bank/manifest.json`](./content/question-bank/manifest.json) for detailed tracking.

### ID alignment (KEEP)

| Draft alias (do not use) | Canonical ID |
|---|---|
| `P2_INTEGER_MUL_DIV` | `P2_NEGATIVE_OPS` |
| `C6_WORD_PROBLEMS` | `C6_SIMPLE_WORD_PROBLEMS` |

---

## 3. Misconception taxonomy

Carry all MVP 2.0 IDs (existing + additive). No runtime invention.

| ID | Status |
|---|---|
| `SIGN_HANDLING` | Existing |
| `EQUALITY_IMBALANCE` | Existing |
| `INVERSE_OPERATION` | Existing |
| `ARITHMETIC_SLIP` | Existing |
| `WORD_TO_EQUATION` | Existing |
| `VARIABLE_AS_OBJECT` | MVP 2.0 |
| `DISTRIBUTION_ERROR` | MVP 2.0 |
| `COMBINE_UNLIKE_TERMS` | MVP 2.0 |

### Template coverage target (NEW)

For each high-priority pair `(conceptId, misconceptionId)`:

```text
≥ 1 STEP_BY_STEP explanation APPROVED
≥ 1 HINT ladder (3 levels) APPROVED
≥ 1 ANALOGY optional where pedagogically useful
≥ 2 RETEST_AFTER_EXPLANATION questions APPROVED
```

Priority pairs: C2×SIGN_HANDLING, C2×INVERSE_OPERATION, C5×EQUALITY_IMBALANCE, C5×DISTRIBUTION_ERROR, C6×WORD_TO_EQUATION, P5×EQUALITY_IMBALANCE.

---

## 4. Draft metadata (analytics only)

Questions may store:

```json
{
  "draftOriginId": "draft_…",
  "source": "LLM_ASSISTED",
  "promptVersion": "content-draft-rules-v1:prompt-linear-eq-q1"
}
```

Students never see these fields. Experiment analysis may compare LLM-origin vs human-origin item statistics **after** APPROVED.

---

## 5. Difficulty rubric

Unchanged from MVP 2.0 (1–5 within concept; decision ±1 per step).

---

## 6. Out of scope for this content pack

- New math units / subjects
- Video / animation assets
- Voice scripts as primary instruction
- Dynamic stem generation at answer time
