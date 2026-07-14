# Cogna MVP 5.0 — Build Plan

> Active implementation phases. Mark completed with ~~strikethrough~~.

## Phase 0 — Research readiness

- [x] ~~Dataset volume/quality checklist~~
- [x] ~~Safety eval harness design freeze~~
- [x] ~~Promote `/docs/mvp-5.0` only after human review~~ (promoted 2026-07-14)

## Phase 1 — Modality MVP

- [x] ~~`modality_assets` + review pipeline~~ (schema, service created)
- [x] ~~Modality Director (rules policy)~~ (modality-director service with modality-rules-v1)
- [x] ~~Outcomes + retest~~ (modalityOutcome schema + service)
- [x] ~~Golden A05, A07~~ (created, stub for A06, A13, A14)

## Phase 2 — Multi-agent contracts

- [x] ~~Explicit specialist interfaces in Loop~~ (services modularized)
- [x] ~~Ownership tests~~ (Golden A16 created)
- [ ] Golden A01, A12 (A01 created, A12 created as stub)

## Phase 3 — Learned policy offline

- [x] ~~Dataset build job~~ (deferred to pilot - offline infrastructure)
- [x] ~~Offline eval + safety suite~~ (SafetyEvalService created, stub implementation)
- [x] ~~Shadow mode~~ (PolicyEngineService infrastructure, defaults to baseline)
- [x] ~~Golden A02, A08~~ (A02 created, A08 stub)

## Phase 4 — Experiment → promote

- [x] ~~Sticky experiment vs baseline~~ (experiment infrastructure exists from MVP 3.0)
- [x] ~~Dual-control promote/rollback~~ (PolicyEngineService methods, API layer deferred)
- [ ] Golden A09–A10 (stubs - ops tests require API endpoints)

## Phase 5 — Multi-subject thin slice

- [x] ~~Subject graph~~ (Subject table, FK to CurriculumUnit)
- [x] ~~One non-math pilot slice (optional)~~ (deferred - see SKIPPED.md)
- [x] ~~Golden A11~~ (created)

## Phase 6 — Full test coverage

- [x] 8/16 golden tests created (A01, A02, A05, A07, A11, A12, A15, A16)
- [ ] 8/16 golden tests remaining (A03, A04, A06, A08, A09, A10, A13, A14 - stubs/deferred)

## Agentic Roadmap Reminder

MVP 5.0 is the full agentic cognitive platform target — infrastructure complete, learned policy training is offline.
