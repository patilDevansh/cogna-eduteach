# Cogna 2.0 — Build Tracking

> Execution folder for the MVP 2.0 build.  
> Spec source of truth: [`/docs/mvp-2.0/`](../docs/mvp-2.0/README.md).  
> Mature architecture remains [`/COGNA/`](../COGNA/README.md), future-only unless promoted into the MVP 2.0 spec.

## Documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Day/block build plan |
| [`BUILD_CARE.md`](./BUILD_CARE.md) | Guardrails and pitfalls |
| [`SKIPPED.md`](./SKIPPED.md) | Deferred or post-MVP items |
| [`DEMO_WALKTHROUGH.md`](./DEMO_WALKTHROUGH.md) | Local pilot demo script |
| [`README.md`](./README.md) | Current snapshot |

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-14
- **MVP 1.0 status:** complete / archive
- **MVP 2.0 status:** **pilot-ready (dev)** — engines/APIs/UI + 220 APPROVED bank + demo walkthrough + UI QA polish (hint ladder, child-safe/parent copy, access-code regenerate); human gates (checklist sign-off, pilot cohort, production Clerk keys) remain
- **Spec status line:** `Canonical / Frozen` in [`docs/mvp-2.0/README.md`](../docs/mvp-2.0/README.md)
- **Core goal:** pilot-ready personalization with full reviewed Linear Equations content, retention/revision v2, weekly reports, observability, and production auth path
- **Foundation done:** shared enum migration (`RETENTION_REVIEW` | `TRANSFER_CHECK` | `BREAK_FOR_FATIGUE`), `*-v2` version strings, Prisma `db push` applied locally
- **Engines done:** retention, velocity, error recovery, explanation effectiveness, fatigue, R14 alt-explanation gate, calibration-aware difficulty, item-stats refresh job
- **Content done:** 220 APPROVED Linear Equations bank (`pnpm content:generate-bank`); `POST /content/review/:questionId`; approval gate
- **APIs done:** weekly-summary, revision-plan, retention, weekly report + email jobs, content approval-gate + review, `GET /observability/pilot-dashboard`, `GET /observability/alert-thresholds`, `POST /parents/dev/demo-login`, `POST /parents/me/students/:id/access-code` (regenerate); hint ladder uses prior `HINT_REQUESTED` events
- **Web UI done:** parent weekly (+ structuredSummary fallback + humanized dates/labels), revision queue/plan (hardened child-safe reasoning), practice `SUGGEST_BREAK` break phase; demo parent login; Clerk parent auth; practice polish (hint dedupe, confidence gate, pluralization, Enter-submit, baseline progress); access-code regenerate on dashboard; route page titles
- **Demo:** [`DEMO_WALKTHROUGH.md`](./DEMO_WALKTHROUGH.md)
- **Tests:** engineering verification green on 2026-07-13 — `pnpm test:golden` (68/68), `pnpm test:scenario:all`, `pnpm test:smoke:ui:mvp2`, `pnpm test:content`, and web `tsc --noEmit`
- **Next (human / remaining):** content review checklist signed; pilot cohort; production Clerk keys verify in staging; explanation-template expansion; full vendor observability dashboards
- **Remaining operational gates:** content-review owner sign-off, pilot cohort, Clerk/email production choices
- **Agentic roadmap:** fully learned multi-modal agentic platform belongs around MVP 5.0; MVP 2.0 builds safe foundations

## Parallelization map (conflict-safe)

| Lane | Owns | Parallel? |
|---|---|---|
| **Serial choke** | `packages/shared/**`, `packages/database/prisma/schema.prisma` | Must land first / one owner |
| **A Backend engines/API** | `apps/api/src/**` (except avoid overlapping same file) | Yes vs B/C/D |
| **B Frontend** | `apps/web/**` | Yes |
| **C Goldens/CLI** | `apps/api/test/**`, `scripts/cogna-cli/**` | Yes (after shared contracts stable) |
| **D Content/UI smoke scripts** | `docs/**/content/**`, `scripts/validate-*`, `scripts/ui-*` | Yes |
| **E Tracking** | `COGNA 2.0/**` | After code lands / merge carefully |

## Rule

Whenever MVP 2.0 work is completed, skipped, or a new pitfall is found:

1. Update `BUILD_PLAN.md`
2. Update `SKIPPED.md` when deferring
3. Update `BUILD_CARE.md`
4. Refresh this status snapshot when phase/block changes
