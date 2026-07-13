# Cogna MVP 5.0 — Draft / Vision Specification

> **This folder is the long-range planning source of truth for MVP 5.0.**  
> Path: `/docs/mvp-5.0/`  
> Status is **Draft / Vision** — not Canonical / Frozen.  
> Do **not** implement until prior eras prove safety foundations and this pack is promoted.  
> Active implementation remains MVP 2.0.

## Spec status

```text
Spec status: Draft / Vision
```

## Build tracking

- [`/COGNA 5.0/BUILD_PLAN.md`](../../COGNA%205.0/BUILD_PLAN.md)
- [`/COGNA 5.0/SKIPPED.md`](../../COGNA%205.0/SKIPPED.md)
- [`/COGNA 5.0/BUILD_CARE.md`](../../COGNA%205.0/BUILD_CARE.md)

## Delta from MVP 4.0

| Area | MVP 4.0 | MVP 5.0 |
|---|---|---|
| Goal | Multi-unit math curriculum | **Full agentic cognitive platform** |
| Policy | Heuristic scoring / experiments | **Learned policy** with offline RL + safety eval |
| Modalities | Text questions / explanations | **Animation, video, voice** teaching modules |
| Subjects | Grade 8 math units | **Multi-subject** ontology |
| Brain | Curriculum orchestration | **Multi-agent specialist brain** under orchestrator |
| Content | Unit banks | Modality-aware content providers + review gates |

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
14. [Test Plan](./README_TEST_PLAN.md) — A## goldens
15. [Pilot Plan](./README_PILOT_PLAN.md)

## Scope

### In Scope (vision)

- Multi-subject learner profile and curriculum graphs
- Learned decision policies trained offline; promoted only after safety eval
- Multi-modal teaching: animation, short video, voice narration (reviewed assets)
- Multi-agent specialists coordinated by Learning Loop orchestrator
- Modality outcome measurement (did the module help?)
- Carry all prior safety invariants

### Non-Goals (even in 5.0 vision)

- Unchecked LLM math or unchecked multimodal generation to students
- Open-ended chatbot replacing engines
- Clinical diagnosis
- Autonomous agents with unconstrained tool use
- Replacing human content review for factual/math correctness

## North-star experience

From [`COGNA/PRODUCT_VISION.md`](../../COGNA/PRODUCT_VISION.md): every interaction improves the learner model; every decision is explainable, safe, measurable.

## Hard Invariants Carried Forward

- `LearningDecision` = `uiAction` + `learningIntent` (+ modality parameters)
- Allowed core uiActions remain; modality is **content/style**, not a rogue action alias
- Only `APPROVED` (and modality-reviewed) content reaches students
- Immutable evidence; versioned policies; replayable decisions
- Weak evidence abstains
