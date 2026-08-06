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

- [x] ~~Expand Linear Equations bank toward 200 APPROVED questions~~ (220 APPROVED: 45 base + 175 generated via `pnpm content:generate-bank` → `generated-questions.json`; programmatic math-verified — human checklist sign-off still Phase 6)
- [x] ~~Add content manifest validation~~ (`pnpm test:content` → `scripts/validate-content-manifest.mjs`)
- [x] ~~Add content review records / checklist workflow~~ (`POST /content/review/:questionId` writes `ContentReview` + updates `reviewStatus`; signed checklist remains human Phase 6)
- [ ] Expand explanation templates for priority misconceptions (incl. new IDs)
- [x] ~~Enforce no non-APPROVED content outside local dev~~ (QG gate + `GET /content/approval-gate`; local may use `ALLOW_PENDING_REVIEW_QUESTIONS`)

## Phase 2 — Diagnostic v2

- [x] ~~Retention estimate~~
- [x] ~~Learning velocity~~
- [x] ~~Error recovery~~
- [x] ~~Explanation effectiveness~~
- [x] ~~Engagement/fatigue pattern~~
- [x] ~~Item statistics refresh~~ (`POST /jobs/item-statistics/refresh`)
- [x] ~~Golden tests R01-R06~~
- [x] ~~R14 alternativeExplanationDominant formula + remediation gate~~

## Phase 3 — Decision and Personalization v2

- [x] ~~Decision priority v2~~
- [x] ~~`packages/shared` enum migration: `RETENTION_REVIEW` | `TRANSFER_CHECK` | `BREAK_FOR_FATIGUE`~~
- [x] ~~`RETENTION_REVIEW`~~
- [x] ~~`TRANSFER_CHECK`~~
- [x] ~~`SUGGEST_BREAK` / fatigue path (soft; never above END_SESSION hard stop)~~
- [x] ~~Web UI handles `SUGGEST_BREAK` (break phase; once per session; child-safe copy)~~
- [x] ~~Confidence-calibration-aware difficulty~~ (overconfident → hold/reduce difficulty)
- [x] ~~Weak-evidence abstention tests~~ (R02; misconception `<0.5`; R14 alt-explanation)

## Phase 4 — Recommendation, Revision, Reports

- [x] ~~Daily revision plan v2~~
- [x] ~~Weekly plan~~
- [x] ~~Weekly parent report~~
- [x] ~~Report delivery records (`jobs` + `report_deliveries`)~~
- [x] ~~Email provider integration or staging stub~~
- [x] ~~Parent weekly summary UI~~ (structuredSummary fallback render)
- [x] ~~Student revision plan / queue UI (retention-aware copy; plan API 404-tolerant)~~
- [x] ~~Practice `SUGGEST_BREAK` break UI (soft; once per session)~~
- [x] ~~Web practice: `explanationViewed` / Continue after explanation always sends ISO `clientTimestamp` (also defaulted in `api.ts`; hint aligned)~~
- [x] ~~MVP 2.0 UI smoke (`test:smoke:ui:mvp2`)~~
- [x] ~~UI QA polish (2026-07-14): hint ladder advances via prior HINT_REQUESTED events; child-safe revision/parent copy; parent access-code regenerate; practice validation/confidence/pluralization/Enter-submit/baseline progress; page titles; soft parent-login copy~~

## Phase 5 — Production Ops

- [x] ~~Clerk production auth (web: `parent-auth-headers` Bearer + `ParentAuthProvider`/`useParentAuth`; dev `X-Parent-Id` unchanged when no publishable key; no Clerk middleware)~~ — production keys + end-to-end verify still operational
- [x] ~~Billing status integration or explicit stub~~ (`GET /parents/me/billing`)
- [x] ~~Guardian invite flow~~ (API stub `POST .../invite`)
- [x] ~~Demo parent login~~ (`POST /parents/dev/demo-login` + seeded demo parent; web **Use demo parent**)
- [ ] Observability dashboards (full product/learning dashboards beyond pilot)
- [x] ~~Pilot dashboard~~ (`GET /observability/pilot-dashboard`)
- [x] ~~Alert thresholds endpoint~~ (`GET /observability/alert-thresholds`); Sentry/PostHog remain env-gated stubs
- [x] ~~`pnpm test:fast`~~ (golden + scenario + mvp2 UI smoke) and ~~`pnpm content:generate-bank`~~ scripts

## Phase 6 — Pilot Readiness

- [x] ~~Golden suite green (G## + R01–R20)~~ (`pnpm test:golden` — 68 pass)
- [x] ~~CLI scenarios green~~ (`pnpm test:scenario:all`; baseline uses a fresh student and validates blueprint concepts rather than fixed expanded-bank IDs)
- [x] ~~UI smoke green~~ (`pnpm test:smoke:ui:mvp2` — soft empty weekly/summary 404s only)
- [x] ~~UI smoke script for MVP 2.0 routes (`scripts/ui-mvp2-smoke.mjs`)~~
- [ ] Content review checklist signed (human)
- [ ] Pilot cohort ready (human)
- [x] ~~Demo walkthrough updated for MVP 2.0~~ ([`DEMO_WALKTHROUGH.md`](./DEMO_WALKTHROUGH.md))
- [x] ~~README snapshot updated to pilot-ready~~ (**pilot-ready (dev)**)
- [x] ~~Live agentic Stage 0: visibility docs + testUI-claude UX + C-lite/shadow/ContentVerifier + test gates~~ ([`COGNA/LIVE_AGENTIC_PLAN.md`](../COGNA/LIVE_AGENTIC_PLAN.md))

## Agentic Roadmap Reminder

- MVP 2.0: orchestrated engines with richer memory; **live C-lite shadow-first** under ContentVerifier
- MVP 3.0: LLM-assisted drafting and scoring under validation; optional `experiment_assignments`
- MVP 4.0: multi-unit curriculum and planning horizon
- MVP 5.0: full multi-modal, multi-subject, learned agentic platform
