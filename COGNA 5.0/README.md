# Cogna 5.0 — Build Tracking

> Active implementation for the full agentic platform.  
> Spec: [`/docs/mvp-5.0/`](../docs/mvp-5.0/README.md) — **Canonical / Frozen**.  
> Active era per AGENTS.md.

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-14
- **Status:** **Engineering Complete (Infrastructure) / Pilot-Ready** — Core platform built, learned policy training is offline
- **Core goal:** Multi-subject, learned policies, multi-modal teaching, multi-agent orchestrated brain
- **Depends on:** MVP 3.0 (gates/experiments) + MVP 4.0 (curriculum scale) foundations (both complete)
- **Next steps:** Pilot execution (human-only), learned policy training dataset, modality asset review pipeline, API endpoints for policy ops, remaining golden test stubs
- **Recent changes:** 
  - 2026-07-14: **MVP 5.0 engineering complete (infrastructure)**
    - Phase 0-5 infrastructure complete
    - Schema: subjects, modality_assets, modality_outcomes, policy_versions, safety_evals
    - Services: ModalityDirectorService, PolicyEngineService, SafetyEvalService
    - Contracts: MVP 5.0 types (ModalityKind, PolicyStatus, SafetyMetrics)
    - Golden tests: 8/16 created (A01, A02, A05, A07, A11, A12, A15, A16); 8 stubs
    - Learned policy: infrastructure ready, training deferred to pilot (always baseline)
    - Tracking updated: BUILD_PLAN strikethrough, SKIPPED deferrals, BUILD_CARE checks, README status
  - 2026-07-14: **MVP 5.0 promoted to Active era**
    - AGENTS.md updated: 4.0 → Complete, 5.0 → Active
    - Spec status changed: Draft/Vision → Canonical/Frozen
    - Engineering implementation starting

## Documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Phased vision plan |
| [`BUILD_CARE.md`](./BUILD_CARE.md) | Guardrails |
| [`SKIPPED.md`](./SKIPPED.md) | Further deferrals |
| [`REPO_AND_GITHUB.md`](./REPO_AND_GITHUB.md) | Ops pointer |
