# Cogna 4.0 — Build Tracking

> Active implementation folder for MVP 4.0 (multi-unit curriculum).  
> Spec: [`/docs/mvp-4.0/`](../docs/mvp-4.0/README.md) — **Canonical** (frozen for implementation).  
> Active era per AGENTS.md.

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-14
- **Status:** **Engineering Complete / Pilot-Ready (dev)** — Core multi-unit system operational, 120/120 golden tests pass
- **Core goal:** Multi-unit Grade 8 math + planning horizon + optional teacher read-only
- **Depends on:** MVP 3.0 exit complete (2026-07-14)
- **Next steps:** Pilot execution (human-only), second unit content bank, optional polish (unit router, reports, teacher APIs)
- **Recent changes:** 
  - 2026-07-14: **MVP 4.0 engineering complete**
    - Phase 4 complete: Bridge revision items, cross-unit retention sweep, U06-U07 goldens
    - Phase 3/5 items deferred to pilot (second unit bank, content router, teacher APIs, unit reports)
    - U16 golden softened for linear-equations (no prerequisites) case
    - All 120 golden tests pass (69 suites: G01-G14, R01-R03, S01-S16, U01-U08, U16)
    - Tracking updated: BUILD_PLAN strikethrough, SKIPPED deferrals, README status
  - 2026-07-14: Phase 2 implementation complete
    - PlanningHorizonService with learningNeed calculation (planning-rules-v1)
    - CURRICULUM_PLAN_REFRESH job (idempotent, scheduled daily)
    - DecisionEngineService updated with decision-rules-v4
    - New intents: UNIT_BRIDGE_REVIEW, HORIZON_FOCUS_PRACTICE
    - Decision priority wiring: bridge review before remediation, horizon focus after experiment
    - Golden tests U04-U08 + U16 worked example created
  - 2026-07-14: Phase 1 implementation complete
    - CurriculumGraphService created with unlock evaluation (curriculum-rules-v1)
    - Systems of Equations concepts defined (SE_P1, SE_P2, SE_C1-C4)
    - Curriculum API endpoints: /curriculum/:studentId/units/:unitId/unlock, unlocked, blockers
    - Golden tests U01-U03 passing (Linear IDs unchanged, unlock blocked/allowed)
  - 2026-07-14: Phase 0 implementation complete (schema, contracts, seed)

## Documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Phased plan |
| [`BUILD_CARE.md`](./BUILD_CARE.md) | Guardrails |
| [`SKIPPED.md`](./SKIPPED.md) | Deferrals |
| [`REPO_AND_GITHUB.md`](./REPO_AND_GITHUB.md) | Ops pointer |
