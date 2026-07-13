# Cogna MVP 1.0 — Canonical Specification

> **This folder is the only implementation source of truth for MVP 1.0.**  
> Path: `/docs/mvp-1.0/`  
> Do not implement from `COGNA/` mature docs or the older `COGNA/COGNA MVP- 1.0/` drafts.

## Build tracking (update every session)

7-day execution plan and living logs:

- [`/COGNA 1.0/BUILD_PLAN_7_DAY.md`](../COGNA%201.0/BUILD_PLAN_7_DAY.md) — strikethrough completed tasks
- [`/COGNA 1.0/SKIPPED.md`](../COGNA%201.0/SKIPPED.md) — deferred work to revisit
- [`/COGNA 1.0/BUILD_CARE.md`](../COGNA%201.0/BUILD_CARE.md) — build guardrails

**Agents and humans:** after any MVP work, update those three files in the same turn. See also `/AGENTS.md` and `.cursor/rules/cogna-mvp-build.mdc`.

## Read order

1. [Architecture](./README_MVP_ARCHITECTURE.md)
2. [Shared Contracts](./README_SHARED_CONTRACTS.md) — action schema, events, API, enums
3. [Engine Ownership](./README_ENGINE_OWNERSHIP.md)
4. [Processing & Durability](./README_PROCESSING_DURABILITY.md)
5. [Data Model](./README_DATA_MODEL.md)
6. [Content Spec](./README_CONTENT_SPEC.md) — concepts, misconceptions, question bank targets
7. [Rules](./README_RULES.md) — diagnostic formulas, decision state machine, baseline
8. [Test Plan](./README_TEST_PLAN.md) — golden cases
9. [Pilot Plan](./README_PILOT_PLAN.md) — student flow, parent model, analytics, privacy, pilot

## Construction-readiness gate

You may start production code only when these are frozen:

```text
[x] Canonical MVP documentation folder          → this folder
[x] Stable concept and prerequisite IDs         → README_CONTENT_SPEC.md
[ ] Initial reviewed question bank (~200)       → content/question-bank/ (DRAFT; human review required)
[x] Misconception taxonomy                      → README_CONTENT_SPEC.md
[x] Exact diagnostic and decision rules         → README_RULES.md
[x] Shared API and event contracts              → README_SHARED_CONTRACTS.md
[x] Database schema                             → README_DATA_MODEL.md
[x] Golden test cases                           → README_TEST_PLAN.md
```

**Blocked on human math review:** question bank items must move from `PENDING_REVIEW` → `APPROVED` before serving to students.

## First construction milestone

> A single simulated student can start a session, answer five reviewed questions, generate evidence-backed profile updates, receive reproducible decisions, see one explanation, complete one re-test, and end with a deterministic summary.

## Explicit non-goals before construction

Do not wait for: custom ML, video/animation, multi-subject, full CBSE, teacher dashboards, microservices, perfect mastery formulas, sophisticated recommenders.
