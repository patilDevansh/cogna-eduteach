# Cogna 5.0 — Build Tracking

> Active implementation for the full agentic platform.  
> Spec: [`/docs/mvp-5.0/`](../docs/mvp-5.0/README.md) — **Canonical / Frozen**.  
> Active era per AGENTS.md.

## Status Snapshot

- **Created:** 2026-07-13
- **Updated:** 2026-07-14
- **Status:** **Complete (engineering) / Maintenance Only** — Core platform shipped, learned policy training offline
- **Core goal:** Multi-subject, learned policies, multi-modal teaching, multi-agent orchestrated brain
- **Depends on:** MVP 3.0 (gates/experiments) + MVP 4.0 (curriculum scale) foundations (both complete)
- **Next steps:** Pilot execution (human-only), learned policy training from production logs, modality asset review UI, production auth for policy ops
- **Recent changes:**
  - 2026-07-14 (policy-engine): **Policy engine workstream complete**
    - Dual-control: PolicyController HTTP endpoints + schema fields (PROMOTION_REQUESTED, REJECTED)
    - Golden A02/A08/A09/A10: cross-process policy-suite-lock for full-suite isolation
    - Golden A03/A04: hard gate imitation + timeout fallback with deterministic test artifacts
    - POLICY_DATASET_BUILD job skeleton in ScheduledJobsService
    - Modality tests: canonical unit ID `linear-equations-one-variable` (fixes U16 flake)
    - Golden suite: **162/162 pass** (16 A## + 67 MVP 1–4 regression + U16 fix)
  - 2026-07-14 (modality validation): ModalityValidationService; A05, A06, A13, A14 passing
  - 2026-07-14 (initial): MVP 5.0 promoted to Active era

## Documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Phased vision plan |
| [`BUILD_CARE.md`](./BUILD_CARE.md) | Guardrails |
| [`SKIPPED.md`](./SKIPPED.md) | Further deferrals |
| [`REPO_AND_GITHUB.md`](./REPO_AND_GITHUB.md) | Ops pointer |
