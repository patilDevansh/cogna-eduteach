# MVP 5.0 — Content Spec

> **Delta from MVP 4.0:** Multi-subject + modality assets. Math concept IDs from earlier MVPs remain frozen where overlapping.

## Subjects (draft)

| subjectId | Notes |
|---|---|
| `mathematics` | Includes all prior Grade 8 math units |
| `science` | **Out of MVP 5.0 pilot scope** — Phase 6 research; not scheduled until mathematics multi-unit proven across MVP 4.0 |

**Science status:** Science is marked as **future research / Phase 6** and is **explicitly out of MVP 5.0 pilot scope**. Multi-subject architecture is designed to support science, but pilot launch focuses exclusively on mathematics units. Science content, subject graph, and cross-subject transfer intents remain deferred until mathematics curriculum proves stable and scalable in production. See [`COGNA 5.0/SKIPPED.md`](../../COGNA%205.0/SKIPPED.md) for science deferral tracking.

## Modality asset requirements

Every APPROVED animation/video/voice asset must have:

- stable ID + version
- `conceptId` / optional misconception
- transcript or frame-accurate claims list for math
- review checklist signed
- retest question mapping (APPROVED text item)

## Text bank

Inherits MVP 4.0 multi-unit targets; modality does not reduce APPROVED text floor.

## ID conventions

- Keep Linear Equations IDs
- Keep unit namespaces from MVP 4.0
- Modality assets: `MOD_{UNIT_SHORT}_{CONCEPT}_{NNN}`
