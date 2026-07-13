# MVP 4.0 — Content Pipeline

> **Delta from MVP 3.0:** Same draft → validate → review → APPROVED gates; **unit-scoped** banks and manifests. LLM assistance allowed under the same no-unchecked-math rule.

## Pipeline

```text
Per unitId:
  draft → validate (unit + concept IDs) → human review → APPROVED → unit bank
```

## Manifests

One manifest per unit under `content/question-bank/<unitId>/manifest.json` (or single manifest with `units{}` map). Stub root manifest lists unit targets.

## Cross-unit rules

- Bridge review items must be APPROVED in the **source** unit bank
- Promotion cannot change `unitId` silently
- Experiments may be unit-scoped (`eligibility.unitId`)

## Non-goals

- Live multi-modal asset generation (MVP 5.0)
- Auto-unlock content without review
