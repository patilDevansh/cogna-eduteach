# Cogna MVP 2.0 — Build Plan

> Use `~~strikethrough~~` when completed.  
> If deferred, log in [`SKIPPED.md`](./SKIPPED.md).  
> Spec source: [`/docs/mvp-2.0/`](../docs/mvp-2.0/README.md).

## Phase 0 — Spec Freeze and Migration Prep

- [x] ~~Review core `docs/mvp-2.0` construction docs (Rules, Contracts, Content, Test, Data Model, README)~~
- [x] ~~Make Rules construction-ready (mastery weights, N=8 calibration, remediation SM, baseline, no silent mastery decay, alt-explanation rule, recommendation terms, END_SESSION vs SUGGEST_BREAK)~~
- [x] ~~Shared Contracts: JSON examples, ContentStyle enums, new intent migration note, REST shapes, additive MVP 1.0 compatibility~~
- [x] ~~Content Spec: KEEP mvp-1.0 concept IDs; document new misconceptions~~
- [x] ~~Test Plan: R## with exact numbers, uiAction+learningIntent, durability notes~~
- [x] ~~Data Model: `jobs` table for async durability; `experiment_assignments` marked MVP 3.0 optional~~
- [x] ~~README: Draft vs freeze, Delta from MVP 1.0, construction gate with doc-ready `[x]` items~~
- [ ] Freeze MVP 2.0 non-goals (human confirm)
- [ ] Confirm pilot owner and content review owner
- [x] ~~Flip README spec status to `Canonical / Frozen`~~
- [x] ~~Compare MVP 1.0 schema to MVP 2.0 data model (implementation migration plan)~~
- [x] ~~Create migration plan for retention, reports, content review, item statistics, `jobs`~~
- [x] ~~`packages/shared` contracts: new intents + `*-v2` version strings + additive events~~
- [x] ~~`packages/database` additive Prisma schema + `db push` (Job, RetentionEstimate, ExplanationOutcome, ItemStatistic, ReportDelivery, ContentReview; LearningDecision fields; ExperimentAssignment stub)~~

## Phase 1 — Content and Review Pipeline

- [ ] Expand Linear Equations bank toward 200 APPROVED questions
- [ ] Add content manifest validation
- [ ] Add content review records / checklist workflow
- [ ] Expand explanation templates for priority misconceptions (incl. new IDs)
- [ ] Enforce no non-APPROVED content outside local dev

## Phase 2 — Diagnostic v2

- [x] ~~Retention estimate~~
- [x] ~~Learning velocity~~
- [x] ~~Error recovery~~
- [x] ~~Explanation effectiveness~~
- [x] ~~Engagement/fatigue pattern~~
- [ ] Item statistics refresh
- [x] ~~Golden tests R01-R06~~

## Phase 3 — Decision and Personalization v2

- [x] ~~Decision priority v2~~
- [x] ~~`packages/shared` enum migration: `RETENTION_REVIEW` | `TRANSFER_CHECK` | `BREAK_FOR_FATIGUE`~~
- [x] ~~`RETENTION_REVIEW`~~
- [x] ~~`TRANSFER_CHECK`~~
- [x] ~~`SUGGEST_BREAK` / fatigue path (soft; never above END_SESSION hard stop)~~
- [x] ~~Web UI handles `SUGGEST_BREAK` (break phase; once per session; child-safe copy)~~
- [ ] Confidence-calibration-aware difficulty
- [x] ~~Weak-evidence abstention tests~~ (R02 retention abstention; misconception `<0.5` gate retained)

## Phase 4 — Recommendation, Revision, Reports

- [x] ~~Daily revision plan v2~~
- [x] ~~Weekly plan~~
- [x] ~~Weekly parent report~~
- [x] ~~Report delivery records (`jobs` + `report_deliveries`)~~
- [x] ~~Email provider integration or staging stub~~
- [x] ~~Parent weekly summary UI~~
- [x] ~~Student revision plan / queue UI (retention-aware copy; plan API 404-tolerant)~~
- [x] ~~Practice `SUGGEST_BREAK` break UI (soft; once per session)~~
- [x] ~~MVP 2.0 UI smoke (`test:smoke:ui:mvp2`)~~

## Phase 5 — Production Ops

- [ ] Clerk production auth
- [ ] Billing status integration or explicit stub
- [ ] Guardian invite flow
- [ ] Observability dashboards
- [ ] Pilot dashboard
- [ ] Error monitoring and alert thresholds

## Phase 6 — Pilot Readiness

- [x] ~~Golden suite green (G## + R01–R10; further R11+ still open)~~
- [x] ~~CLI scenarios green~~ (retention-review-due, weekly-report, fatigue-break, explanation-effectiveness, email-report-delivery, content-approval-gate + prior MVP 1.0 set)
- [ ] UI smoke green
- [x] ~~UI smoke script for MVP 2.0 routes (`scripts/ui-mvp2-smoke.mjs`)~~
- [ ] Content review checklist signed
- [ ] Pilot cohort ready
- [ ] Demo walkthrough updated for MVP 2.0
- [ ] README snapshot updated to pilot-ready

## Agentic Roadmap Reminder

- MVP 2.0: orchestrated engines with richer memory
- MVP 3.0: LLM-assisted drafting and scoring under validation; optional `experiment_assignments`
- MVP 4.0: multi-unit curriculum and planning horizon
- MVP 5.0: full multi-modal, multi-subject, learned agentic platform
