# Cogna MVP 2.0 — Canonical Specification

> **This folder is the implementation source of truth for MVP 2.0 once frozen.**  
> Path: `/docs/mvp-2.0/`  
> Do not implement from `COGNA/` mature docs.  
> MVP 1.0 remains archived at [`/docs/mvp-1.0/`](../mvp-1.0/README.md) — do not reopen for feature work.

## Spec status

```text
Spec status: Canonical / Frozen
```

MVP 2.0 docs are the implementation source of truth. Content review owner / pilot cohort / ~200 APPROVED bank remain human operational gates — **not** blockers to start foundation and engine product code (content-review freeze waived for local/staging construction; external pilot still requires APPROVED bank).

## Build tracking (update every session)

Execution plan and living logs:

- [`/COGNA 2.0/BUILD_PLAN.md`](../../COGNA%202.0/BUILD_PLAN.md) — strikethrough / check completed tasks
- [`/COGNA 2.0/SKIPPED.md`](../../COGNA%202.0/SKIPPED.md) — deferred work
- [`/COGNA 2.0/BUILD_CARE.md`](../../COGNA%202.0/BUILD_CARE.md) — build guardrails

**Agents and humans:** after any MVP 2.0 work, update those files in the same turn. See `/AGENTS.md` and `.cursor/rules/cogna-mvp-build.mdc` (MVP 2.0 tracking lives under `/COGNA 2.0/`).

## Delta from MVP 1.0

| Area | MVP 1.0 | MVP 2.0 |
|---|---|---|
| Goal | Prove answer → diagnose → decide → content → report loop | Pilot-ready personalization + retention + ops |
| Mastery formula | `mastery-formula-v1` | Same constants as `mastery-formula-v2` (no silent calendar decay) |
| New diagnostic factors | — | Retention, velocity, error recovery, explanation effectiveness, engagement |
| New `learningIntent` | — | `RETENTION_REVIEW`, `TRANSFER_CHECK`, `BREAK_FOR_FATIGUE` (shared enum migration) |
| Decision priority | END_SESSION then remediation… | END_SESSION **before** SUGGEST_BREAK; retention/transfer slots added |
| Content IDs | Frozen catalog | **Keep** same concept/misconception IDs; additive new misconceptions only |
| Content volume | Seed / partial APPROVED | Target ~200 APPROVED for Linear Equations unit |
| Reports | Session summary | Weekly parent report + email delivery jobs |
| Schema | Core loop tables | Additive: `jobs`, retention, explanation outcomes, deliveries, reviews |
| Auth | Dev-friendly | Production Clerk path documented |
| Experiments | — | Deferred to MVP 3.0 (`experiment_assignments` stub only) |

## Read order

1. [Architecture](./README_MVP_ARCHITECTURE.md)
2. [Shared Contracts](./README_SHARED_CONTRACTS.md) — action schema, events, API, enums
3. [Engine Ownership](./README_ENGINE_OWNERSHIP.md)
4. [Processing & Durability](./README_PROCESSING_DURABILITY.md)
5. [Data Model](./README_DATA_MODEL.md)
6. [Content Spec](./README_CONTENT_SPEC.md) — concepts, misconceptions, bank targets
7. [Rules](./README_RULES.md) — formulas, state machine, baseline, retention
8. [Personalization](./README_PERSONALIZATION.md)
9. [Retention & Revision](./README_RETENTION_AND_REVISION.md)
10. [Content Pipeline](./README_CONTENT_PIPELINE.md)
11. [Reports & Delivery](./README_REPORTS_AND_DELIVERY.md)
12. [Observability](./README_OBSERVABILITY.md)
13. [Production Auth](./PRODUCTION_AUTH.md)
14. [Test Plan](./README_TEST_PLAN.md) — R## goldens + G## regression
15. [Pilot Plan](./README_PILOT_PLAN.md)

## Construction-readiness gate (freeze checklist)

**Draft vs freeze:** documentation below can be `[x]` (construction-ready text). Status is **`Canonical / Frozen`** for implementation. Remaining `[ ]` / `[~]` items are operational / human gates (owners, cohort, bank volume, provider choices) — they do not block foundation or engine work.

```text
[x] Spec status flipped to Canonical / Frozen          → this README
[x] Stable concept IDs aligned to MVP 1.0              → README_CONTENT_SPEC.md
[x] Misconception taxonomy (existing + new) frozen     → README_CONTENT_SPEC.md
[x] Exact diagnostic/decision/retention rules          → README_RULES.md
[x] Shared API/event contracts + new intent migration  → README_SHARED_CONTRACTS.md
[x] Database schema including jobs table               → README_DATA_MODEL.md
[x] Golden cases R## with exact numbers where required → README_TEST_PLAN.md
[x] G## MVP 1.0 regression still required              → docs/mvp-1.0/README_TEST_PLAN.md
[ ] Content review owner assigned                      → COGNA 2.0 / Pilot Plan (human)
[ ] Pilot cohort definition approved                   → README_PILOT_PLAN.md (human)
[~] External integrations scoped (Clerk, email)        → PRODUCTION_AUTH + Reports (docs ready; provider choice TBD)
[~] COGNA 2.0 BUILD_PLAN Phase 0 checked               → COGNA 2.0/BUILD_PLAN.md
[~] Reviewed question bank (~200 APPROVED)             → content/ (human gate; may start with smaller local bank)
```

**Remaining operational gates:** human owners for content review + pilot cohort; email/Clerk production choices; APPROVED bank volume for external pilot. Content-review freeze waived for implementation start.

**Blocked on human math review:** full bank items must move `PENDING_REVIEW` → `APPROVED` before external pilot. Local/staging may use `ALLOW_PENDING_REVIEW_QUESTIONS=true` only in local environments.

## First construction milestone

A pilot student completes **three sessions over seven days**:

1. Baseline or warm-start profile review
2. Adaptive practice with misconception remediation
3. Due revision from a retention-aware queue
4. Weekly parent report with evidence-linked insights
5. All decisions replayable under `*-v2` rules and covered by golden + CLI scenarios

## Scope

### In Scope

- Grade 8 CBSE Mathematics, Linear Equations unit only
- Full reviewed content slice for the unit, target **~200 APPROVED questions**
- Expanded explanation templates for high-priority concept × misconception pairs
- Retention estimate, learning velocity, error recovery, explanation effectiveness
- Daily and weekly revision planning
- Weekly parent reports and email delivery
- Production Clerk auth path, billing status, guardian invite flow
- Observability dashboards and pilot metrics
- Formal content review workflow before external pilot

### Non-Goals

- Unchecked LLM math to students
- LLM grading or LLM decision policy
- Multi-subject expansion
- Video, voice, animation-heavy teaching modules
- Teacher dashboards
- Clinical labels, IQ, ADHD, anxiety, or personality inference
- Contextual bandits or RL in production
- Microservices rewrite
- Mastery calendar decay (use retention estimate instead)
- Experiment assignment policy (MVP 3.0)

## Agentic Roadmap

| Version | Definition | Agentic maturity |
|---|---|---|
| **MVP 1.0** | Prove answer → diagnosis → decision → content → report loop | Rule-based brain stem (**complete / archive**) |
| **MVP 2.0** | Pilot-ready personalization, retention, full reviewed unit, reports, ops | Orchestrated engines with richer memory (**active draft**) |
| **MVP 3.0** | LLM-assisted drafting, validation pipeline, candidate scoring, experiments | Assisted specialists under strict gates |
| **MVP 4.0** | Multi-unit curriculum, planning horizon, teacher visibility | Curriculum-scale orchestration |
| **MVP 5.0** | Multi-subject, learned policies, multi-modal teaching modules | Full agentic cognitive platform |

## Hard Invariants Carried Forward

- `LearningDecision` uses `uiAction` + `learningIntent`; never legacy flat actions.
- Raw events are immutable.
- `eventId` remains idempotent.
- Only `APPROVED` math content reaches students.
- Diagnosis, decision, content generation, and reporting remain separate owners.
- Weak evidence must abstain, not over-personalize.
- v1 stored decisions must still replay.
