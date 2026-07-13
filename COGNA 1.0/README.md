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
| [DEMO_WALKTHROUGH.md](./DEMO_WALKTHROUGH.md) | 5-minute local MVP demo script |

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
- **Build status:** **MVP 1.0 build complete — all skips resolved** — 2026-07-13  
- **Branch:** `feat/mvp-1.0-build` (local repo initialized in `eduTeach/`)  
- **Blocked on:** external pilot only — S014 human math sign-off (checklist ready)  
- **Vertical slice:** parent → student → baseline → practice → diagnostics/decisions → hints/explanations → revision → session + parent summary  
- **Verified (2026-07-13):** `pnpm build` green; golden **36 pass**; CLI scenarios **6** (`baseline-12-slot`, `session-end-summary`, `revision-queue-proposal`, `idempotent-retry`, `targeting-explanation-retest`, `skip-question`); `pnpm test:smoke:ui`  
- **APPROVED bank shipped:** **17** milestone IDs (baseline anchors + C2 sign-handling path) — not full ~200  
- **Dev credentials (after seed):** student access code `demo1234`  
- **Demo:** [DEMO_WALKTHROUGH.md](./DEMO_WALKTHROUGH.md)  
- **UI:** http://localhost:3000 — parent signup, student login, baseline, practice (skip + 15-min timer + baseline handoff), revision queue, parent summary  
- **Auth:** optional Clerk when keys set — see [DEV_AUTH.md](../docs/mvp-1.0/DEV_AUTH.md)
