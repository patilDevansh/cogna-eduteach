# Cogna 4.0 — Build Tracking

> Active implementation folder for MVP 4.0 (multi-unit curriculum).  
> Spec: [`/docs/mvp-4.0/`](../docs/mvp-4.0/README.md) — **Canonical** (frozen for implementation).  
> Active era per AGENTS.md.

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-14
- **Status:** **Phase 1 Complete** — Curriculum graph service operational, U02 concepts defined, unlock evaluation working
- **Core goal:** Multi-unit Grade 8 math + planning horizon + optional teacher read-only
- **Depends on:** MVP 3.0 exit complete (2026-07-14)
- **Recent changes:** 
  - 2026-07-14: Phase 1 implementation complete
    - CurriculumGraphService created with unlock evaluation (curriculum-rules-v1)
    - Systems of Equations concepts defined (SE_P1, SE_P2, SE_C1-C4)
    - Curriculum API endpoints: /curriculum/:studentId/units/:unitId/unlock, unlocked, blockers
    - Golden tests U01-U03 passing (Linear IDs unchanged, unlock blocked/allowed)
    - All G/R/S regression tests pass (104 tests, 0 failures)
  - 2026-07-14: Phase 0 implementation complete (schema, contracts, seed, golden tests pass)
  - 2026-07-13: P0/P1 documentation improvements applied (unit catalog freeze, teacher allowlist, U16 example)

## Documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Phased plan |
| [`BUILD_CARE.md`](./BUILD_CARE.md) | Guardrails |
| [`SKIPPED.md`](./SKIPPED.md) | Deferrals |
| [`REPO_AND_GITHUB.md`](./REPO_AND_GITHUB.md) | Ops pointer |
