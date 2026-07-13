# Cogna 1.0 — Build Tracking

> **Working folder for the 7-day MVP 1.0 build.**  
> Spec source of truth remains [`/docs/mvp-1.0/`](../docs/mvp-1.0/README.md).  
> This folder tracks **execution**, not architecture.

## Documents (keep current every session)

| File | Purpose |
|---|---|
| [BUILD_PLAN_7_DAY.md](./BUILD_PLAN_7_DAY.md) | Day-by-day tasks — **strikethrough** each item when done |
| [SKIPPED.md](./SKIPPED.md) | Intentionally deferred work — must revisit later |
| [BUILD_CARE.md](./BUILD_CARE.md) | Guardrails and pitfalls while building |

## Agent / human rule (mandatory)

Whenever you complete, skip, or discover work on Cogna MVP 1.0:

1. Update `BUILD_PLAN_7_DAY.md` — strikethrough finished tasks; note date if useful  
2. Update `SKIPPED.md` — add anything deferred with reason + return condition  
3. Update `BUILD_CARE.md` — add new pitfalls or check off resolved care items  
4. Do this **in the same turn** as the code/doc change — do not leave tracking stale  

Canonical instruction also lives in:

- `/AGENTS.md`
- `/.cursor/rules/cogna-mvp-build.mdc`
- `/docs/mvp-1.0/README.md`

## Status snapshot

- **Plan start:** 2026-07-10  
- **Current day:** Day 5 **substantially complete** — Day 6 revision/reports UI next  
- **Branch:** `feat/mvp-1.0-build` (local repo initialized in `eduTeach/`)  
- **Blocked on:** nothing critical  
- **First construction milestone:** backend + **usable practice UI** (session → answer → hint → explanation → summary)  
- **Verified (2026-07-10):** `pnpm build` green; golden tests **28 pass** (incl. G30b baseline slot); API :3001 + Web :3000 loadable; student login accepts `demo1234` (any case); full 12-slot baseline completes without API crash; `Q_P1_D1_001` grades `18`→INCORRECT / `21`→CORRECT per bank  
- **Code landed:** diagnostic calibration/hint dependence, baseline blueprint, QG ranking/fallback, parent/student dev auth API, `apps/web` practice flow  
- **Human-only:** formal math review of milestone ~9 APPROVED questions (S001 / S014)  
- **Dev credentials (after seed):** student `dev_student_001`, access code `demo1234`  
- **UI:** http://localhost:3000 — parent signup, student login, baseline intro, practice screens  
- **Deferred:** Clerk auth (S015), skip control (S016), client 15-min auto-end (S018)
