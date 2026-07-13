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

- [ ] Experiment Registry + sticky assignment
- [ ] Decision Engine experiment hook (`decision-rules-v3`)
- [ ] Assignment admin APIs
- [ ] Golden S01–S03, S16, S20

## Phase 3 — Candidate scoring

- [ ] Candidate Scorer (`candidate-score-rules-v1`)
- [ ] Shadow mode batch job
- [ ] Live apply behind experiment arm only
- [ ] Golden S04–S10

## Phase 4 — Analysis & observability

- [ ] `EXPERIMENT_ANALYSIS_EXPORT` job
- [ ] Pilot dashboard experiment + draft sections
- [ ] Alerts for non-APPROVED serve / hot-path LLM
- [ ] Golden S18–S19

## Phase 5 — Bank growth & pilot

- [ ] Promote ≥ 60 LLM-assisted APPROVED items
- [ ] Reach manifest ~280 APPROVED target (or pilot-agreed floor)
- [ ] Run sticky experiment ≥ 2 weeks
- [ ] Signed review checklist
- [ ] Decision: keep control default vs promote scoring

## Agentic Roadmap Reminder

- MVP 3.0: assisted drafting + scoring under validation
- MVP 4.0: multi-unit curriculum and planning horizon
- MVP 5.0: full multi-modal, multi-subject, learned agentic platform
