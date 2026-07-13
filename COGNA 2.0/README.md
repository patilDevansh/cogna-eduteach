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
| [`README.md`](./README.md) | Current snapshot |

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-13
- **MVP 1.0 status:** complete / archive
- **MVP 2.0 status:** **Phase 2–4 in progress** — engines + goldens + Phase 4 reports/revision/jobs API + CLI scenarios green; UI Phase 4 surfaces present
- **Spec status line:** `Canonical / Frozen` in [`docs/mvp-2.0/README.md`](../docs/mvp-2.0/README.md)
- **Core goal:** pilot-ready personalization with full reviewed Linear Equations content, retention/revision v2, weekly reports, observability, and production auth path
- **Foundation done:** shared enum migration (`RETENTION_REVIEW` | `TRANSFER_CHECK` | `BREAK_FOR_FATIGUE`), `*-v2` version strings, Prisma additive tables
- **Engines done:** retention-rules-v2, learning velocity, error recovery, explanation outcomes, fatigue → `SUGGEST_BREAK`/`BREAK_FOR_FATIGUE`, decision priority v2, recommendation term math v2; `pnpm test:golden` **53/53**
- **Phase 4 API done:** daily/weekly revision plan v2, weekly parent report + `report_deliveries` + jobs enqueue/retry, retention GET/fixture, email stub
- **CLI done:** `retention-review-due`, `weekly-report`, `fatigue-break`, `explanation-effectiveness`, `email-report-delivery`, `content-approval-gate`
- **Web UI done:** `/parent/students/[id]/weekly`, session summary empty/404 states, revision queue + optional plan, practice `SUGGEST_BREAK` break phase
- **Next:** item statistics refresh; confidence-calibration-aware difficulty; content bank + review; Clerk/email production path
- **Remaining operational gates:** content-review owner, pilot cohort, Clerk/email production choices, ~200 APPROVED bank for external pilot
- **Agentic roadmap:** fully learned multi-modal agentic platform belongs around MVP 5.0; MVP 2.0 builds safe foundations

## Rule

Whenever MVP 2.0 work is completed, skipped, or a new pitfall is found:

1. Update `BUILD_PLAN.md`
2. Update `SKIPPED.md` when deferring
3. Update `BUILD_CARE.md`
4. Refresh this status snapshot when phase/block changes
