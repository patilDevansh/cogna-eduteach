# MVP 3.0 — Pilot Plan

> **Delta from MVP 2.0:** Pilot proves LLM-assisted content under gates and a single policy-scoring experiment — not multi-unit breadth.

## Prerequisites

- MVP 2.0 external pilot gates green (APPROVED bank, checklist signed, cohort)
- Spec promoted from Draft → Canonical (human freeze)
- `EXPERIMENTS_ENABLED` and draft pipeline feature flags ready

## Goals

1. Promote ≥ 60 LLM-assisted items to APPROVED without math incidents
2. Run one sticky experiment (`control` vs `scored_v1`) for ≥ 2 weeks
3. Show no regression on G## / R##; pass new S## goldens
4. Parent reports remain clear and experiment-jargon-free

## Cohort

| Arm | Target N | Notes |
|---|---|---|
| Control | ~50% of eligible | Sticky |
| scored_v1 | ~50% | Sticky |
| Draft reviewers | 1–2 humans | Math + pedagogy |

## Exit criteria

- [ ] Zero student-visible non-APPROVED incidents
- [ ] Validation catch rate documented
- [ ] Experiment export reproducible
- [ ] Decision: promote scoring to default **or** keep control (data-informed)
- [ ] SKIPPED/BUILD_PLAN updated; MVP 4.0 planning unlocked

## Explicitly out of pilot

- Multi-unit curriculum
- Video / voice modules
- Online RL / bandits
- Teacher dashboards
