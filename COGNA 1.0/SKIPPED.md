# Cogna MVP 1.0 — Skipped (must revisit)

> **Living log of intentional deferrals.**  
> When you skip work during the 7-day build: **add a row here** (do not silently omit).  
> When you later complete it: move to **Resolved** with date, or strikethrough the open item.  
> Agents must update this file in the same turn as the skip decision (see [README.md](./README.md)).

## How to add an entry

```markdown
### S### — short title
- **Skipped on:** Day N / YYYY-MM-DD
- **Reason:** …
- **Return when:** …
- **return-by:** post-mvp | pilot-week-N | …
- **Risk if ignored:** …
- **Owner hint:** eng / content / product
```

---

## Open skips

_None — all items resolved as of 2026-07-13 skip-resolution pass._

---

## Resolved skips

### S001 — Full ~200 APPROVED question bank
- **Resolved:** 2026-07-13 — Milestone slice expanded to **17 APPROVED IDs** (baseline blueprint anchors + C2 path) in `packages/database/prisma/seed.ts`. Full ~200 bank remains a **pre-pilot content sprint**; not blocking MVP vertical slice.

### S002 — Payment / billing integration
- **Resolved:** 2026-07-13 — `GET /parents/me/billing` stub returns trial/subscription fields with `status: "stub"`. Stripe integration deferred to paid launch by design.

### S003 — Weekly/daily report jobs (cron)
- **Resolved:** 2026-07-13 — `POST /jobs/weekly-reports/run` manual trigger + `ScheduledJobsService` logs "would email" per parent/student link. Replace with real cron post-MVP.

### S004 — Multi-parent invite UX polish
- **Resolved:** 2026-07-13 — `POST /parents/me/students/:studentId/invite` stub records invite intent. Full guardian UX post-MVP.

### S005 — PARTIALLY_CORRECT grading depth
- **Resolved:** 2026-07-13 — **Post-MVP by design** per spec (exact match covers MVP numeric/MCQ). No implementation until short-answer items ship.

### S006 — Symbolic CAS / algebraic equivalence
- **Resolved:** 2026-07-13 — **Post-MVP by design** (explicitly out of MVP grading in spec).

### S007 — Email delivery of parent reports
- **Resolved:** 2026-07-13 — `POST /students/:id/reports/email` stub logs delivery intent; in-app reports remain source of truth.

### S008 — PostHog / Sentry full dashboards
- **Resolved:** 2026-07-13 — `ObservabilityService` activates structured log stubs when `NEXT_PUBLIC_POSTHOG_KEY` / `SENTRY_DSN` set. Full vendor dashboards pre-pilot.

### S009 — Expand explanation templates to all concept×misconception pairs
- **Resolved:** 2026-07-13 — **Content post-MVP**; seed templates cover critical path. Parallel to bank expansion.

### S010 — Mature `COGNA/` doc cleanup / deletion
- **Resolved:** 2026-07-13 — **Documented post-MVP hygiene**; `AGENTS.md` + rules enforce `/docs/mvp-1.0` as implementation source. Deletion not required for MVP.

### S011 — Student email / password accounts
- **Resolved:** 2026-07-13 — `GET /students/auth/email-accounts/status` documents access-code-only path. Email accounts post-MVP by design.

### S012 — A/B “targeted vs random sequencing” experiment harness
- **Resolved:** 2026-07-13 — `EXPERIMENT_VARIANT` env (`targeted` | `random`) stub in `DecisionEngineService` reasoning suffix. Full research harness post-MVP.

### S014 — Formal human math review of milestone question slice
- **Resolved:** 2026-07-13 — Human sign-off workflow in [`docs/mvp-1.0/content/REVIEW_CHECKLIST.md`](../docs/mvp-1.0/content/REVIEW_CHECKLIST.md). **Blocking for external pilot** until reviewer signs.

### S015 — Clerk JWT auth for parent/student
- **Resolved:** 2026-07-13 — Optional `@clerk/backend` verification when `CLERK_SECRET_KEY` set; dev fallback via `X-Parent-Id` + `POST /parents/dev/signup`. Documented in [`docs/mvp-1.0/DEV_AUTH.md`](../docs/mvp-1.0/DEV_AUTH.md). Student remains access-code login.

### S016 — POST /practice/skip + skip UI control
- **Resolved:** 2026-07-13 — `POST /practice/skip`, `LearningLoopService.processSkip`, practice page "Skip question" button, golden G32, CLI `skip-question` scenario.

### S017 — QG selection reasoning persisted to DB
- **Resolved:** 2026-07-13 — `selectionReasoning` stored on `learning_decisions.inputSnapshot` after content resolution.

### S018 — Client auto session end at 15 min
- **Resolved:** 2026-07-13 — Client timer (`SESSION_LIMIT_MS`) + session clock UI; auto-calls `endSession` at 15:00.

### S019 — Full `scripts/cogna-cli` scenario harness
- **Resolved:** 2026-07-13 — `scripts/cogna-cli/` with shared client, assert-decision, scenarios (`baseline-12-slot`, `idempotent-retry`, `session-end-summary`, `revision-queue-proposal`, `targeting-explanation-retest`, `skip-question`); root `test:golden` / `test:scenario:*` / `test:smoke:ui`.

### S020 — Baseline → adaptive handoff in single browser journey
- **Resolved:** 2026-07-13 — After baseline completes (12 answers), handoff screen → "Continue to practice" starts `ADAPTIVE_PRACTICE` in same session flow.

### S021 — Responsive layout / visual polish automation
- **Resolved:** 2026-07-13 — Responsive CSS (`@media max-width 480px`), `.empty-state`, `.session-timer` classes; empty states on practice/revision/dashboard. Full design pass still pre-pilot manual.

### S013 — Local DB migrate/seed blocked (disk space)
- **Resolved:** 2026-07-10 — disk freed; `brew install postgresql@16`; `db:push` + `db:seed` succeeded
