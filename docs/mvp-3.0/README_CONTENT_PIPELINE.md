# MVP 3.0 — Content Pipeline

> **Delta from MVP 2.0:** LLM-assisted drafting is **in scope** with mandatory validation and human review. Live generation to students remains forbidden.

## Pipeline

```text
Draft request (human prompt / batch job)
  -> Content Draft Service (LLM_ASSISTED or HUMAN)
  -> store ContentDraft (DRAFT)
  -> automated schema validation
  -> answer / solution validation (content-validation-rules-v1)
  -> misconception tag check
  -> status VALIDATED | VALIDATION_FAILED
  -> human math + pedagogy review
  -> APPROVED_PROMOTED → bank item reviewStatus=APPROVED
  -> seed / deploy
```

## Allowed Authoring Sources

| Source | Allowed? | Gate |
|---|---|---|
| Human-written | Yes | review required |
| LLM-assisted draft | **Yes (MVP 3.0)** | validation + human review |
| Programmatic templates | Yes | validation + review (or verified generator + checklist) |
| Generated live to student | **No** | out of scope |
| External textbook adaptation | Maybe | licensing + review |

## LLM constraints

```text
- Off hot path only (jobs / admin APIs)
- Provider keys never in client
- Prompt must pin conceptId + allowed misconception IDs
- Output must be structured JSON matching bank schema
- Temperature low; no free-form chat to students
- Fail closed: provider error → no draft promotion
```

## Review Checklist

See [`content/REVIEW_CHECKLIST.md`](./content/REVIEW_CHECKLIST.md). Every promoted item must pass MVP 2.0 checklist **plus**:

- [ ] Draft origin recorded
- [ ] Validation log attached
- [ ] LLM math rechecked by human (not rubber-stamp)
- [ ] Distractors (MCQ) pedagogically plausible

## Manifest

`content/question-bank/manifest.json` tracks targets and draft funnel:

```json
{
  "unit": "linear-equations-one-variable",
  "targetApproved": 280,
  "approvedCount": 0,
  "draftFunnel": {
    "created": 0,
    "validated": 0,
    "pendingReview": 0,
    "rejected": 0,
    "promoted": 0
  }
}
```

## Automation Checks

Before `PENDING_REVIEW`:

- schema valid
- concept / misconception IDs canonical
- numeric/MCQ answer verification
- deny-list language check
- difficulty present

Before external use:

- `reviewStatus === APPROVED`
- manifest coverage floors met for pilot cohort

## Anti-patterns

- Shipping `VALIDATED` without human review to production students
- Using LLM to grade student answers as source of truth
- Letting Decision Engine call the LLM directly
- Bypassing validation because “reviewer said it looks fine”
