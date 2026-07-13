# Cogna MVP 3.0 — Build Plan

> Phased plan. Almost all items unchecked until era is promoted and implementation starts.  
> Spec: `/docs/mvp-3.0/`.

## Phase 0 — Freeze & foundation

- [ ] Human promote `docs/mvp-3.0` from Draft → Canonical / Frozen
- [ ] Confirm experiment ethics / parent notice language
- [x] Feature flags: `EXPERIMENTS_ENABLED`, `CONTENT_LLM_DRAFTS_ENABLED`
- [x] `packages/shared`: experiment + draft + candidate score types
- [x] Prisma: activate `ExperimentAssignment` writes; add drafts / scores / definitions
- [x] Prisma client generated (no migration needed yet — using db push pattern)
- [x] Carry G## + R## green as regression baseline (68/68 golden tests passed)

## Phase 1 — Content draft pipeline

- [x] Content Draft Service + `CONTENT_LLM_DRAFT` job
- [x] Validation Service (`content-validation-rules-v1`)
- [x] Review API extensions for drafts
- [ ] Manifest draft funnel metrics
- [x] Golden S11–S15

## Phase 2 — Experiments

- [x] Experiment Registry + sticky assignment
- [x] Decision Engine experiment hook (`decision-rules-v3`)
- [x] Assignment admin APIs
- [x] Golden S01–S03, S16, S20

## Phase 3 — Candidate scoring

- [x] Candidate Scorer (`candidate-score-rules-v1`)
- [ ] Shadow mode batch job
- [x] Live apply behind experiment arm only
- [x] Golden S04–S10, S21

## Phase 4 — Analysis & observability

- [x] `EXPERIMENT_ANALYSIS_EXPORT` job
- [x] Pilot dashboard experiment + draft sections
- [x] Alerts for non-APPROVED serve / hot-path LLM
- [x] Golden S18–S19

## Phase 5 — Bank growth & pilot

- [x] ~~Promote ≥ 60 LLM-assisted APPROVED items~~ → 302 programmatic APPROVED (45 base + 257 generated)
- [x] Reach manifest ~280 APPROVED target (or pilot-agreed floor) → 302 total
- [x] Draft promotion script for programmatically verified items (dev pilot only)
- [ ] Run sticky experiment ≥ 2 weeks (human-only: deferred to live pilot in SKIPPED)
- [ ] Signed review checklist (human-only: deferred to SKIPPED)
- [ ] Decision: keep control default vs promote scoring (human-only: policy decision in SKIPPED)

## Agentic Roadmap Reminder

- MVP 3.0: assisted drafting + scoring under validation
- MVP 4.0: multi-unit curriculum and planning horizon
- MVP 5.0: full multi-modal, multi-subject, learned agentic platform
