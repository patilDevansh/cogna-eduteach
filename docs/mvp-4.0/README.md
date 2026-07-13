# Cogna MVP 4.0 — Draft / Vision Specification

> **This folder is the planning source of truth for MVP 4.0.**  
> Path: `/docs/mvp-4.0/`  
> Status is **Draft / Vision** — not Canonical / Frozen.  
> Do **not** implement until promoted. Active era remains MVP 2.0; next implementation candidate after freeze is typically MVP 3.0.

## Spec status

```text
Spec status: Draft / Vision
```

## Build tracking

- [`/COGNA 4.0/BUILD_PLAN.md`](../../COGNA%204.0/BUILD_PLAN.md)
- [`/COGNA 4.0/SKIPPED.md`](../../COGNA%204.0/SKIPPED.md)
- [`/COGNA 4.0/BUILD_CARE.md`](../../COGNA%204.0/BUILD_CARE.md)

## Delta from MVP 3.0

| Area | MVP 3.0 | MVP 4.0 |
|---|---|---|
| Goal | Assisted drafting + experiments on one unit | **Multi-unit curriculum** + longer planning horizon |
| Curriculum | Linear Equations only | Multiple Grade 8 math units with prerequisites across units |
| Planning | Session / daily / weekly | **Multi-week horizon** + unit sequencing |
| Content | Deeper bank on one unit | Breadth across units; reuse 3.0 draft pipeline |
| Teacher visibility | Out of scope | Lightweight teacher / coach read-only views (optional) |
| Agentic | Assisted specialists | Curriculum-scale orchestration |
| Multi-modal / learned RL | Out of scope | Still out of scope (MVP 5.0) |

## Read order

1. [Architecture](./README_MVP_ARCHITECTURE.md)
2. [Shared Contracts](./README_SHARED_CONTRACTS.md)
3. [Engine Ownership](./README_ENGINE_OWNERSHIP.md)
4. [Processing & Durability](./README_PROCESSING_DURABILITY.md)
5. [Data Model](./README_DATA_MODEL.md)
6. [Content Spec](./README_CONTENT_SPEC.md)
7. [Rules](./README_RULES.md)
8. [Personalization](./README_PERSONALIZATION.md)
9. [Retention & Revision](./README_RETENTION_AND_REVISION.md)
10. [Content Pipeline](./README_CONTENT_PIPELINE.md)
11. [Reports & Delivery](./README_REPORTS_AND_DELIVERY.md)
12. [Observability](./README_OBSERVABILITY.md)
13. [Production Auth](./PRODUCTION_AUTH.md)
14. [Test Plan](./README_TEST_PLAN.md) — U## goldens
15. [Pilot Plan](./README_PILOT_PLAN.md)

## Construction-readiness gate

```text
[ ] Spec status still Draft / Vision
[x] Multi-unit ID conventions sketched
[x] Planning horizon rules sketched
[x] Cross-unit prerequisite model sketched
[ ] Human freeze after MVP 3.0 exit criteria
[ ] Unit owners + bank targets per unit approved
```

## Scope

### In Scope

- Grade 8 CBSE-style Mathematics **multiple units** (see Content Spec)
- Curriculum graph: units → concepts → prerequisites (cross-unit)
- Planning horizon: 2–6 week recommended paths
- Unit-aware decision + recommendation rules
- Carry MVP 3.0 draft pipeline + experiments (scoped per unit)
- Optional teacher/coach read-only progress by unit
- Retention across units (spaced review of prior units)

### Non-Goals

- Unchecked LLM math to students
- Full multi-subject (science, etc.) — MVP 5.0
- Video / voice / animation as primary teaching — MVP 5.0
- Default learned RL policy — MVP 5.0
- Clinical labels
- Microservices rewrite

## Hard Invariants Carried Forward

- `uiAction` + `learningIntent` contract; five UI actions only
- Only `APPROVED` content to students
- Immutable events; idempotent `eventId`
- Weak evidence abstains
- Linear Equations concept IDs from MVP 1.0/2.0 **never renamed**
