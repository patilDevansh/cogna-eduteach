# Cogna MVP 3.0 — Draft Specification

> **This folder is the planning source of truth for MVP 3.0.**  
> Path: `/docs/mvp-3.0/`  
> Do **not** implement from this folder until status is promoted to Canonical / Frozen.  
> Active implementation remains [`/docs/mvp-2.0/`](../mvp-2.0/README.md).  
> Do not implement from `COGNA/` mature docs.

## Spec status

```text
Spec status: Draft / Planning
```

MVP 3.0 docs are **construction-ready drafts** for planning and design review. They are **not** frozen. Agents must not treat this folder as the active implementation era. See `/AGENTS.md`.

## Build tracking (update when this era is active)

Execution plan and living logs (planning only until promotion):

- [`/COGNA 3.0/BUILD_PLAN.md`](../../COGNA%203.0/BUILD_PLAN.md)
- [`/COGNA 3.0/SKIPPED.md`](../../COGNA%203.0/SKIPPED.md)
- [`/COGNA 3.0/BUILD_CARE.md`](../../COGNA%203.0/BUILD_CARE.md)

## Delta from MVP 2.0

| Area | MVP 2.0 | MVP 3.0 |
|---|---|---|
| Goal | Pilot-ready personalization + retention + ops | Assisted content + policy experiments under gates |
| Content authoring | Human + programmatic verified bank | **LLM-assisted drafts** with validation + human review |
| Experiments | `experiment_assignments` stub only | Full assignment, variant branching, analysis harness |
| Decision policy | Deterministic `decision-rules-v2` | Deterministic **baseline** + optional **candidate scoring** in experiments |
| Scoring | Item statistics for QG ranking | Candidate action scores + offline analysis (not free-form RL) |
| Content pipeline | Review API + checklist | Draft → validate → review → APPROVED pipeline with LLM stages |
| Learned policy | Out of scope | Out of scope (MVP 5.0) |
| Curriculum | Linear Equations unit only | Same unit depth; richer bank / templates, not multi-unit |
| Multi-modal | Out of scope | Out of scope (MVP 5.0) |

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
14. [Test Plan](./README_TEST_PLAN.md) — S## goldens + R## / G## regression
15. [Pilot Plan](./README_PILOT_PLAN.md)

## Construction-readiness gate (draft checklist)

**Freeze policy:** Items marked with `[ ]` below are **human/pilot gates** — they are operational prerequisites for **pilot launch** but do not block this README's promotion to Canonical / Frozen. Items marked `[x]` are **doc-ready** items that must be complete before Canonical promotion.

```text
[~] Spec status still Draft / Planning              → this README (do not flip without human freeze)
[x] Stable concept IDs carried from MVP 2.0        → README_CONTENT_SPEC.md
[x] LLM draft gates defined                        → README_CONTENT_PIPELINE.md
[x] experiment_assignments product use defined     → README_DATA_MODEL.md + README_RULES.md
[x] Candidate scoring contract defined             → README_SHARED_CONTRACTS.md + README_RULES.md
[x] Shared contracts additive over MVP 2.0         → README_SHARED_CONTRACTS.md
[x] Golden cases S## sketched                      → README_TEST_PLAN.md
[ ] Human freeze: promote to Canonical             → product owner (blocks doc freeze)
[ ] Content review owner for LLM-assisted bank     → Pilot Plan (pilot gate, not doc blocker)
[ ] Experiment ethics / parent consent language    → Pilot Plan (pilot gate, not doc blocker)
[ ] Pilot cohort selection                         → Pilot Plan (pilot gate, not doc blocker)
```

**Promotion policy:** The spec may be frozen to Canonical / Frozen when all `[x]` items are checked and human review approves. The `[ ]` pilot gates remain open until pilot launch but do not prevent Canonical status.

## First construction milestone (when promoted)

1. LLM draft job produces `PENDING_REVIEW` items only
2. Validation rejects invalid math before human review
3. Experiment registry assigns students to control vs scored-policy variant
4. Analysis harness exports outcomes without affecting non-experiment traffic
5. All student-visible math remains `APPROVED`; no unchecked LLM to students

## Scope

### In Scope

- Grade 8 CBSE Mathematics, **Linear Equations unit** (same concept IDs as MVP 2.0)
- LLM-assisted **drafting** of questions and explanation templates under gates
- Automated validation (schema, answer check, misconception tag sanity)
- Human math/pedagogy review → `APPROVED`
- `experiment_assignments` writes + decision branching for registered experiments
- Candidate action scoring (offline + optional online experiment arm)
- Richer coverage of concept × misconception × style templates
- Experiment analysis jobs and observability metrics
- Carry-forward: retention, weekly reports, Clerk auth, durability Tx1–Tx4

### Non-Goals

- Unchecked LLM math or explanations to students
- LLM as the production decision policy outside registered experiments
- Contextual bandits / online RL in default traffic
- Multi-unit curriculum expansion (MVP 4.0)
- Video, voice, animation teaching modules (MVP 5.0)
- Multi-subject (MVP 5.0)
- Clinical labels, IQ, ADHD, anxiety, or personality inference
- Microservices rewrite
- Mastery calendar decay without a new formula version

## Agentic Roadmap

| Version | Definition | Agentic maturity |
|---|---|---|
| **MVP 1.0** | Rule-based loop | Brain stem (**archive**) |
| **MVP 2.0** | Pilot personalization | Orchestrated engines (**active**) |
| **MVP 3.0** | LLM drafting + scoring + experiments | Assisted specialists under strict gates (**this draft**) |
| **MVP 4.0** | Multi-unit curriculum | Curriculum-scale orchestration |
| **MVP 5.0** | Learned policy + multi-modal | Full agentic platform |

## Hard Invariants Carried Forward

- `LearningDecision` uses `uiAction` + `learningIntent`; never legacy flat actions.
- Allowed `uiAction`: `SHOW_QUESTION` | `SHOW_EXPLANATION` | `SHOW_HINT` | `END_SESSION` | `SUGGEST_BREAK`.
- Raw events are immutable; `eventId` idempotent.
- Only `APPROVED` math content reaches students.
- Weak evidence must abstain.
- Diagnosis, decision, content, and reporting remain separate owners.
- MVP 2.0 `*-v2` decisions must still replay.
