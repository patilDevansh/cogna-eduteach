# MVP 2.0 — Content Pipeline

> Content can be assisted by tools, but student-visible math must be human reviewed.

## Pipeline

```text
Author draft
  -> automated schema validation
  -> answer/solution validation
  -> misconception tag check
  -> human math review
  -> APPROVED
  -> seed / deploy
```

## Allowed Authoring Sources

| Source | Allowed? | Gate |
|---|---|---|
| Human-written | Yes | review required |
| LLM-assisted draft | Yes, MVP 3.0 target | review + validation required |
| Generated live to student | No | out of scope |
| External textbook adaptation | Maybe | licensing + review |

## Review Checklist

Every item must pass:

- stem is unambiguous
- accepted answers are complete
- solution is mathematically correct
- difficulty matches rubric
- concept tag is correct
- misconception tags match wrong-answer patterns
- explanation template exists when required
- no unsafe or discouraging copy

## Manifest

`content/question-bank/manifest.json` should track:

```json
{
  "unit": "linear-equations-one-variable",
  "targetApproved": 200,
  "approvedCount": 0,
  "coverage": {
    "C2_ONE_STEP_SUBTRACTION": {
      "target": 25,
      "approved": 0
    }
  }
}
```

## Automation Checks

Before marking `APPROVED`:

- question ID uniqueness
- version monotonicity
- accepted answer parse check
- no missing hint ladder
- no missing `questionIntent`
- referenced concepts/misconceptions exist
- no `PENDING_REVIEW` in staging/prod seed

## Human Sign-Off

Human review remains required for:

- math correctness
- ambiguity
- grade appropriateness
- misconception tagging judgment
- parent/student wording

## Pilot Freeze

Before external pilot:

```text
content freeze date set
all pilot questions APPROVED
review checklist complete
seed reproducible
manifest counts match database counts
```
